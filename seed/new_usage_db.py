#!/usr/bin/env python3
"""Create token_usage.db — the schema usage_reader.py writes and the dashboard reads.

The counterpart to new_db.py, for the *other* database. Two files, on purpose,
and they have opposite natures:

  activity_logs.db   append-only ground truth. Several agents write to it
                     continuously and nothing can reconstruct it. Back this up.
  token_usage.db     a cache. Every row is re-derivable by re-reading the
                     agents' own session files. Delete it, re-run the reader,
                     and you are exactly where you started.

That difference is why usage does not live inside activity_logs.db: the reader
never has to open a database whose schema the README calls a contract, and
"Rebuild usage" is safe precisely because this file is disposable.

Usage:
  python seed/new_usage_db.py             # create token_usage.db if absent
  python seed/new_usage_db.py --force     # recreate it, discarding the cache

This module owns the DDL; usage_reader.py imports it rather than repeating it,
so there is one place where the columns are declared.
"""
import argparse
import os
import sqlite3
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT, "token_usage.db")

# request_id as PRIMARY KEY is the dedupe, enforced by the schema rather than
# by the writer remembering to check. With INSERT OR IGNORE it makes re-import
# idempotent by construction: a wrong watermark costs time, never correctness.
#
# There is no cost column. Cost is derived in the browser from the price
# registry at render time, the same way durations are derived from timestamps —
# a stored cost silently becomes a lie the day prices change.
SCHEMA = [
    """CREATE TABLE IF NOT EXISTS token_usage (
  request_id        TEXT PRIMARY KEY,
  session_id        TEXT,
  timestamp         TEXT NOT NULL,
  model_id          TEXT,
  repo_name         TEXT,
  branch_name       TEXT,
  input_tokens      INTEGER,
  cache_read_tokens INTEGER,
  cache_write_5m    INTEGER,
  cache_write_1h    INTEGER,
  output_tokens     INTEGER,
  service_tier      TEXT,
  speed             TEXT,
  source            TEXT NOT NULL,
  extra_json        TEXT
);""",
    "CREATE INDEX IF NOT EXISTS ix_usage_scope ON token_usage(repo_name, branch_name, timestamp);",
    # size_bytes and mtime_ns are the staleness check: both unchanged means the
    # file is skipped without being opened, which is what keeps a refresh over
    # ~700 MB of transcripts cheap. cursor is opaque — the parser defines it,
    # because a byte offset suits JSONL and would exclude every agent that
    # stores usage in SQLite or protobuf.
    """CREATE TABLE IF NOT EXISTS watermark (
  parser_id   TEXT NOT NULL,
  source_path TEXT NOT NULL,
  cursor      TEXT,
  size_bytes  INTEGER,
  mtime_ns    INTEGER,
  last_run    TEXT,
  PRIMARY KEY (parser_id, source_path)
);""",
]


def ensure_schema(con):
    """Apply the DDL. Safe to call on every run — every statement is IF NOT EXISTS."""
    for stmt in SCHEMA:
        con.execute(stmt)
    con.commit()


def create(db_path=DB_PATH, force=False):
    if os.path.exists(db_path):
        if not force:
            return False
        for suffix in ("", "-wal", "-shm"):
            try:
                os.remove(db_path + suffix)
            except FileNotFoundError:
                pass
    con = sqlite3.connect(db_path)
    try:
        ensure_schema(con)
        con.execute("PRAGMA journal_mode=WAL")
        con.commit()
    finally:
        con.close()
    return True


def main():
    p = argparse.ArgumentParser(description="Create an empty token_usage.db")
    p.add_argument("--force", action="store_true",
                   help="delete an existing usage cache first (it is rebuildable)")
    args = p.parse_args()

    if not create(force=args.force):
        sys.exit(f"{DB_PATH} already exists (use --force to recreate it; the "
                 f"rows are a cache and can be rebuilt from the agents' own "
                 f"session files).")
    print(f"created {DB_PATH}")


if __name__ == "__main__":
    main()
