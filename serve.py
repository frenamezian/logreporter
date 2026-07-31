#!/usr/bin/env python3
"""Serve the dashboard and execute its writes against activity_logs.db.

Why this exists instead of `python -m http.server`
--------------------------------------------------
The dashboard reads the database by fetching its raw bytes; sql.js parses those
bytes into an in-memory SQLite image. That image is a *copy*. A browser page has
no way to write back to a file it fetched over HTTP, so a DELETE issued in the
Maintenance panel only ever mutated RAM and was silently discarded by the next
read. Persisting a delete therefore has to be done by a process that owns the
file, which is this one.

Why row-level DELETE rather than letting the page save the whole file back
-------------------------------------------------------------------------
Agents in several repos append to this database continuously. Writing a whole
mutated image back over the file is last-writer-wins: every row inserted between
the page's load and its save is destroyed. A DELETE ... WHERE id IN (...) issued
through SQLite touches only the named rows and respects the same WAL and
busy_timeout discipline as log_activity.py, so a concurrent insert is never lost.

Security
--------
Bound to 127.0.0.1 only, and deliberately so: /api/delete removes rows from the
live activity log, so it must not be reachable from the network. Note that, like
`python -m http.server`, this serves every file under the repo root to localhost.
"""

import json
import os
import sqlite3
import sys
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(ROOT, "activity_logs.db")

PORT = 8250
HOST = "127.0.0.1"

# SQLite's default parameter cap is 999 on older builds; chunk well under it so
# a large delete cannot fail on the number of placeholders.
CHUNK = 500

# Mirrors log_activity.py: the busy_timeout absorbs most contention inside
# SQLite, and this loop is the second layer for when it expires.
MAX_RETRIES = 5
INITIAL_BACKOFF = 0.25

MAX_BODY = 1 << 20  # 1 MiB of ids is far more than any real delete needs


def connect():
    if not os.path.exists(DB_PATH):
        raise RuntimeError(f"activity_logs.db not found at {DB_PATH}")
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA busy_timeout=10000")
    return con


def is_lock_error(e):
    return isinstance(e, sqlite3.OperationalError) and "locked" in str(e).lower()


def _checkpoint(con):
    """Checkpoint TRUNCATE, falling back to PASSIVE.

    Unlike the insert path in log_activity.py, this one cannot settle for a
    best-effort PASSIVE checkpoint. The dashboard re-reads the *main* database
    file over HTTP and sql.js cannot see a -wal sidecar, so a delete still
    sitting in the WAL would come back on the very next read and look like the
    delete had failed. TRUNCATE may block up to the busy_timeout, which is
    acceptable for a rare, user-initiated action.
    """
    try:
        con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    except sqlite3.Error as e:
        print(f"wal_checkpoint(TRUNCATE) failed, trying PASSIVE: {e}", file=sys.stderr)
        try:
            con.execute("PRAGMA wal_checkpoint(PASSIVE)")
        except sqlite3.Error as e2:
            print(f"wal_checkpoint(PASSIVE) also failed: {e2}", file=sys.stderr)


def delete_ids(ids):
    """Delete the given ids in one transaction. Returns (deleted, remaining)."""
    backoff = INITIAL_BACKOFF
    for attempt in range(1, MAX_RETRIES + 1):
        con = None
        try:
            con = connect()
            deleted = 0
            for i in range(0, len(ids), CHUNK):
                chunk = ids[i:i + CHUNK]
                placeholders = ",".join("?" * len(chunk))
                cur = con.execute(
                    f"DELETE FROM logs WHERE id IN ({placeholders})", chunk
                )
                deleted += cur.rowcount
            con.commit()
            remaining = con.execute("SELECT COUNT(*) FROM logs").fetchone()[0]
            _checkpoint(con)
            return deleted, remaining
        except sqlite3.Error as e:
            if con:
                try:
                    con.rollback()
                except sqlite3.Error:
                    pass
            if is_lock_error(e) and attempt < MAX_RETRIES:
                print(f"delete locked, retry {attempt}/{MAX_RETRIES}: {e}", file=sys.stderr)
                time.sleep(backoff)
                backoff *= 2
                continue
            raise
        finally:
            if con:
                con.close()


class Handler(SimpleHTTPRequestHandler):
    def _json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        # The database changes under the page constantly, and http.server sends
        # no Cache-Control, which lets Chrome apply heuristic freshness and
        # serve a stale copy. Never cache the database itself.
        if self.path.split("?")[0].endswith(".db"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        if self.path.split("?")[0] != "/api/delete":
            self._json(404, {"error": "no such endpoint"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self._json(400, {"error": "bad Content-Length"})
            return
        if length <= 0 or length > MAX_BODY:
            self._json(400, {"error": "missing or oversized body"})
            return
        try:
            payload = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            self._json(400, {"error": f"invalid JSON: {e}"})
            return

        raw = payload.get("ids") if isinstance(payload, dict) else None
        if not isinstance(raw, list) or not raw:
            self._json(400, {"error": "expected a non-empty 'ids' array"})
            return
        # Coerce and validate before the ids reach SQLite. They are bound as
        # parameters regardless, so this is about rejecting nonsense early.
        ids = []
        for v in raw:
            if isinstance(v, bool) or not isinstance(v, int):
                self._json(400, {"error": f"ids must be integers, got {v!r}"})
                return
            if v <= 0:
                self._json(400, {"error": f"ids must be positive, got {v}"})
                return
            ids.append(v)
        ids = sorted(set(ids))

        try:
            deleted, remaining = delete_ids(ids)
        except Exception as e:
            print(f"delete failed: {e}", file=sys.stderr)
            self._json(500, {"error": str(e)})
            return
        print(f"deleted {deleted} row(s), {remaining} remaining", file=sys.stderr)
        self._json(200, {"deleted": deleted, "remaining": remaining})


def main():
    port = PORT
    if len(sys.argv) > 1:
        port = int(sys.argv[1])
    handler = partial(Handler, directory=ROOT)
    with ThreadingHTTPServer((HOST, port), handler) as httpd:
        print(f"LogReporter serving {ROOT}")
        print(f"  http://{HOST}:{port}/index.html")
        print(f"  database: {DB_PATH}")
        print("Close this window (or press Ctrl+C) to stop the server.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")


if __name__ == "__main__":
    main()
