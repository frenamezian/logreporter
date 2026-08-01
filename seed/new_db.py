#!/usr/bin/env python3
"""Create an empty activity_logs.db with the schema the dashboard expects.

The counterpart to init_db.sh: that one copies the curated sample database, this
one gives you a database with no rows in it, which is what you want for real
use. Kept as a script rather than a snippet in the README because the README's
heredoc form does not run in cmd.exe or PowerShell, and Windows is a first-class
target here.

Usage:
  python seed/new_db.py             # create activity_logs.db if absent
  python seed/new_db.py --force     # recreate it, destroying every row

The column list is the same one log_activity.py writes and script/db.js expects.
If you add a column, see "Adding a column" in the README — four places have to
agree.
"""
import argparse
import os
import sqlite3
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT, "activity_logs.db")

SCHEMA = """CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY, timestamp TEXT, repo_name TEXT, branch_name TEXT,
  trace_id TEXT, parent_trace_id TEXT, task_title TEXT, agent_name TEXT, agent_path TEXT,
  log_title TEXT, log_description TEXT, log_type TEXT, log_level TEXT, status TEXT,
  priority TEXT, user_id TEXT, tags TEXT, error_details TEXT, resolved_by TEXT,
  resolution_time TEXT, performance_metrics TEXT, input_output_hash TEXT,
  commit_reference TEXT
);"""


def main():
    p = argparse.ArgumentParser(description="Create an empty activity_logs.db")
    p.add_argument("--force", action="store_true",
                   help="delete an existing database first (destroys every row)")
    args = p.parse_args()

    if os.path.exists(DB_PATH):
        if not args.force:
            sys.exit(f"{DB_PATH} already exists (use --force to recreate it, "
                     f"which destroys every row).")
        # Remove the sidecars too: leaving a -wal behind from the old database
        # would be replayed into the new one.
        for suffix in ("", "-wal", "-shm"):
            try:
                os.remove(DB_PATH + suffix)
            except FileNotFoundError:
                pass

    con = sqlite3.connect(DB_PATH)
    try:
        con.execute(SCHEMA)
        # WAL is what lets several agents write while the dashboard reads.
        con.execute("PRAGMA journal_mode=WAL")
        con.commit()
    finally:
        con.close()
    print(f"created {DB_PATH}")


if __name__ == "__main__":
    main()
