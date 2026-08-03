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
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(ROOT, "activity_logs.db")
USAGE_DB_PATH = os.path.join(ROOT, "token_usage.db")

# Snapshots of both databases, taken on startup and before either destructive
# operation this server performs.
#
# The two files differ in how expensive a loss is — activity_logs.db cannot be
# reconstructed at all, token_usage.db can be rebuilt from the agents'
# transcripts in seconds — but they are protected identically anyway. A backup
# policy with a per-file exception is one that gets applied wrong, and "this
# one is only a cache" is exactly the reasoning that leaves you without a copy
# on the day the cache turns out to have been the only record of something.
#
# The name records which database, when (UTC), and what prompted it, so a
# directory listing reads as a history rather than a pile of files.
BACKUP_DIR = os.path.join(ROOT, "backups")
BACKUP_KEEP = 10          # per database, so worst case is 2 x this many files
BACKUP_TARGETS = {
    "activity_logs": (DB_PATH, "logs"),
    "token_usage": (USAGE_DB_PATH, "token_usage"),
}

# Only one usage import may run at a time. ThreadingHTTPServer means two clicks
# on Refresh, or a click arriving during the startup scan, would otherwise have
# two readers writing the same SQLite file at once. Nothing would be corrupted
# — the watermarks and INSERT OR IGNORE see to that — but one would block on
# the other's lock for no reason.
_usage_lock = threading.Lock()
_usage_state = {"running": False, "last": None}

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


def snapshot(reason, which="activity_logs"):
    """Copy one database into backups/, keeping the most recent few of its own.

    Uses SQLite's online backup API rather than shutil.copy: both databases run
    in WAL mode and may be mid-write, so a byte copy of the main file can miss
    committed transactions still sitting in the -wal sidecar, or catch a torn
    page. The backup API takes a consistent image of a live database.

    Never raises. A failed snapshot must not stop the server from serving, a
    delete from proceeding or an import from running — it is insurance, not a
    precondition.
    """
    db_path, table = BACKUP_TARGETS[which]
    try:
        if not os.path.exists(db_path):
            return None
        src = sqlite3.connect(db_path, timeout=10)
        try:
            # An empty database is not worth a file. This keeps backups/ from
            # filling with copies of nothing while a fresh install is being set
            # up, and makes "the oldest snapshot" mean something.
            if src.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] == 0:
                return None
            os.makedirs(BACKUP_DIR, exist_ok=True)
            stamp = time.strftime("%Y%m%dT%H%M%S", time.gmtime())
            path = os.path.join(BACKUP_DIR, f"{which}.{stamp}.{reason}.db")
            dst = sqlite3.connect(path)
            try:
                src.backup(dst)
            finally:
                dst.close()
        finally:
            src.close()

        # Retention is per database: a burst of usage imports must not evict
        # every snapshot of the log database, which is the irreplaceable one.
        kept = sorted(
            (f for f in os.listdir(BACKUP_DIR)
             if f.startswith(which + ".") and f.endswith(".db")),
            reverse=True,
        )
        for stale in kept[BACKUP_KEEP:]:
            try:
                os.remove(os.path.join(BACKUP_DIR, stale))
            except OSError:
                pass
        return path
    except Exception as e:                      # noqa: BLE001 - insurance only
        print(f"backup failed ({which}/{reason}): {e}", file=sys.stderr)
        return None


def delete_ids(ids):
    """Delete the given ids in one transaction. Returns (deleted, remaining)."""
    # Snapshot first: a delete is irreversible against the live file, and the
    # scope is chosen in a browser where an over-broad filter is one click away.
    snapshot("predelete", "activity_logs")
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


def run_usage(rebuild=False):
    """Import token usage. Returns the reader's report, or an error dict.

    usage_reader is imported here rather than at module scope on purpose. It
    pulls in every parser in parsers/, including third-party ones; if one of
    them is broken badly enough to break the import itself, that must cost the
    usage feature and not the whole server. The dashboard, the log database and
    the delete endpoint all keep working without it.
    """
    if not _usage_lock.acquire(blocking=False):
        return {"error": "a usage import is already running", "busy": True}
    _usage_state["running"] = True
    try:
        import usage_reader
        if rebuild:
            # Rebuild discards the whole file and re-reads every transcript.
            # It is the usage database's counterpart to a delete, so it gets
            # the same treatment: snapshot first. The rows are re-derivable,
            # but the watermarks are not — losing them turns the next import
            # into a full re-read of every session file on the machine.
            snapshot("prerebuild", "token_usage")
            usage_reader.schema.create(USAGE_DB_PATH, force=True)
        report = usage_reader.run(USAGE_DB_PATH)
        _usage_state["last"] = report
        return report
    except Exception as e:
        print(f"usage import failed: {type(e).__name__}: {e}", file=sys.stderr)
        return {"error": f"{type(e).__name__}: {e}"}
    finally:
        _usage_state["running"] = False
        _usage_lock.release()


def usage_scan_at_startup():
    """Import usage in the background while the server is already answering.

    A cold scan of ~700 MB of transcripts measured 4.0 s here; a warm one, where
    every file is skipped on size and mtime, measured 0.06 s. Doing it inline
    would delay the first page load by that much for no benefit, so it runs on a
    daemon thread: the dashboard opens immediately and the usage rows appear on
    the first refresh or poll after the scan lands.
    """
    def go():
        t0 = time.time()
        report = run_usage()
        if "error" in report:
            print(f"startup usage scan failed: {report['error']}", file=sys.stderr)
        else:
            print(f"usage: {report.get('rows_total', 0)} rows "
                  f"({time.time() - t0:.1f}s)", file=sys.stderr)
    threading.Thread(target=go, daemon=True, name="usage-scan").start()


class Handler(SimpleHTTPRequestHandler):
    def _json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    # The database changes under the page constantly, and the dashboard's own
    # sources change whenever it is edited. http.server sends no Cache-Control,
    # which lets Chrome apply heuristic freshness and serve a stale copy — for
    # the sources that means the browser quietly runs an old build.
    NO_STORE_SUFFIXES = (".db", ".html", ".js", ".css")

    def end_headers(self):
        path = self.path.split("?")[0]
        if path.endswith(self.NO_STORE_SUFFIXES) or path.endswith("/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        route = self.path.split("?")[0]

        # Both take no body: the reader works out for itself what is stale.
        # Rebuild differs only in dropping the cache and every watermark first,
        # which is the escape hatch for a desynchronised cursor.
        if route in ("/api/refresh-usage", "/api/rebuild-usage"):
            report = run_usage(rebuild=route.endswith("rebuild-usage"))
            if report.get("busy"):
                self._json(409, report)
            elif "error" in report:
                self._json(500, report)
            else:
                self._json(200, report)
            return

        if route != "/api/delete":
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
    scan = True
    for arg in sys.argv[1:]:
        if arg == "--no-usage-scan":
            scan = False
        else:
            port = int(arg)
    handler = partial(Handler, directory=ROOT)
    with ThreadingHTTPServer((HOST, port), handler) as httpd:
        print(f"LogReporter serving {ROOT}")
        print(f"  http://{HOST}:{port}/index.html")
        print(f"  database: {DB_PATH}")
        print(f"  usage:    {USAGE_DB_PATH}"
              + ("" if scan else " (startup scan disabled)"))
        for which in BACKUP_TARGETS:
            snap = snapshot("startup", which)
            if snap:
                print(f"  backup:   {os.path.basename(snap)}")
        print(f"  keeping {BACKUP_KEEP} snapshots per database in backups/")
        print("Close this window (or press Ctrl+C) to stop the server.")
        if scan:
            usage_scan_at_startup()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")


if __name__ == "__main__":
    main()
