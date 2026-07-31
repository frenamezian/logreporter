#!/usr/bin/env python3
"""Append one activity-log row to activity_logs.db — asynchronously.

Agents (lead architect + subagents) call this to record their work so the
LogReporter dashboard can be tested on real agent activity. Implements the
contract from the prototype's "Agent logging prompts" developer-guide topic:
  - exact column order the dashboard expects
  - WAL mode + busy_timeout so concurrent agents and dashboard polling coexist
  - UTC timestamp 'YYYY-MM-DD HH:MM:SS' auto-filled if omitted
  - ASYNCHRONOUS by default: the parent validates args and exits immediately;
    a detached child process performs the INSERT in the background so the
    caller is never blocked on SQLite. Use --sync to wait for the row id.

Usage:
  python log_activity.py --log-type start --repo log_reporter --branch main \
      --task "Implement update plan" --agent lead_architect \
      --agent-path lead_architect --trace-id 9f2c41a8 \
      --log-title "Started phase 0" --log-level info --status in_progress

  # Mint a trace_id (lead architect only — use the dedicated tool):
  python mint_trace.py

Exit codes (default async mode):
  0 — args valid, write dispatched to background (row id NOT printed).
  2 — argument/usage error (nothing written).
Exit codes (--sync):
  0 — row inserted, new row id printed on stdout.
  1 — database error (nothing written).
  2 — argument/usage error.

Background write errors are appended to log_activity_errors.log next to the
database. The lead architect should check that file occasionally.

Trace_id is NEVER minted here. The lead architect generates one per task
with mint_trace.py and passes it to every log_activity.py call and every
subagent. See UPDATE_PLAN.md §16.
"""
import argparse
import json
import os
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "activity_logs.db")
ERR_LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "log_activity_errors.log")

LOG_TYPES = {"start", "end", "activity", "issue", "decision", "github"}
LEVELS = {"debug", "info", "warning", "error", ""}
STATUSES = {"pending", "in_progress", "failed", "completed", ""}
PRIORITIES = {"low", "medium", "high", "critical", ""}

# Column order matches the prototype's INSERT statement verbatim.
COLUMNS = [
    "timestamp", "repo_name", "branch_name", "task_title",
    "log_type", "log_title", "log_description", "log_level",
    "status", "priority", "agent_name", "agent_path",
    "trace_id", "parent_trace_id", "user_id", "tags",
    "error_details", "resolved_by", "resolution_time",
    "performance_metrics", "input_output_hash", "commit_reference",
]


def utc_now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def validate(args):
    """Validate args. Returns an error string or None if OK."""
    if args.log_type not in LOG_TYPES:
        return f"invalid --log-type {args.log_type!r}; must be one of {sorted(LOG_TYPES)}"
    if args.log_level not in LEVELS:
        return f"invalid --log-level {args.log_level!r}; must be one of {sorted(LEVELS)}"
    if args.status not in STATUSES:
        return f"invalid --status {args.status!r}; must be one of {sorted(STATUSES)}"
    if args.priority not in PRIORITIES:
        return f"invalid --priority {args.priority!r}; must be one of {sorted(PRIORITIES)}"
    perf = args.performance_metrics
    if perf:
        try:
            args.performance_metrics = json.dumps(json.loads(perf))
        except json.JSONDecodeError as e:
            return f"invalid --performance-metrics JSON: {e}"
    return None


def row_values(args):
    return {
        "timestamp": args.timestamp or utc_now(),
        "repo_name": args.repo,
        "branch_name": args.branch,
        "task_title": args.task,
        "log_type": args.log_type,
        "log_title": args.log_title,
        "log_description": args.log_description,
        "log_level": args.log_level,
        "status": args.status,
        "priority": args.priority,
        "agent_name": args.agent,
        "agent_path": args.agent_path or args.agent,
        "trace_id": args.trace_id,
        "parent_trace_id": args.parent_trace_id,
        "user_id": args.user_id,
        "tags": args.tags,
        "error_details": args.error_details,
        "resolved_by": args.resolved_by,
        "resolution_time": args.resolution_time,
        "performance_metrics": args.performance_metrics,
        "input_output_hash": args.input_output_hash,
        "commit_reference": args.commit_reference,
    }


def connect():
    if not os.path.exists(DB_PATH):
        raise RuntimeError(f"activity_logs.db not found at {DB_PATH}")
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA busy_timeout=10000")
    return con


# Retry configuration for lock contention that escapes the busy_timeout.
# Exponential backoff: 0.25s, 0.5s, 1s, 2s, 4s — first retry is quick (most
# locks clear in milliseconds), later ones longer. Only lock-related errors
# are retried; schema/validation errors fail fast.
MAX_RETRIES = 5
INITIAL_BACKOFF = 0.25  # seconds


def is_lock_error(e):
    """True if the error is lock contention (worth retrying), not a schema bug."""
    return isinstance(e, sqlite3.OperationalError) and "locked" in str(e).lower()


def do_insert(args):
    """Perform the INSERT with retry on lock contention. Used by child + --sync.

    The busy_timeout (10s) handles most contention inside SQLite. This retry
    loop is a second layer for the rare case where the busy_timeout expires
    (e.g. many concurrent writers, OS-level file contention). Each retry is
    logged to log_activity_errors.log so contention is observable.
    """
    values = row_values(args)
    placeholders = ",".join("?" * len(COLUMNS))
    sql = f"INSERT INTO logs ({','.join(COLUMNS)}) VALUES ({placeholders})"
    params = [values[c] for c in COLUMNS]
    backoff = INITIAL_BACKOFF

    for attempt in range(1, MAX_RETRIES + 1):
        con = None
        try:
            con = connect()
            cur = con.execute(sql, params)
            con.commit()
            return cur.lastrowid
        except sqlite3.Error as e:
            if con:
                try:
                    con.rollback()
                except sqlite3.Error:
                    pass
            if not is_lock_error(e) or attempt == MAX_RETRIES:
                raise  # non-lock error, or out of retries — let caller handle
            # Lock error with retries remaining: log and back off.
            log_error(f"retry {attempt}/{MAX_RETRIES} after {backoff}s: {e}")
            time.sleep(backoff)
            backoff *= 2
        finally:
            if con:
                try:
                    con.close()
                except sqlite3.Error:
                    pass
    # Should not reach here (loop raises on last attempt), but be safe.
    raise sqlite3.OperationalError("database is locked: retries exhausted")


def log_error(msg):
    try:
        with open(ERR_LOG, "a", encoding="utf-8") as f:
            f.write(f"{utc_now()} {msg}\n")
    except OSError:
        pass  # never let error-logging itself fail the caller


def spawn_detached_child():
    """Re-invoke this script with --_child to do the INSERT in the background."""
    # Pass the original args through verbatim, plus the --_child marker so the
    # child takes the synchronous insert path instead of respawning.
    child_args = [sys.executable, __file__, "--_child"] + sys.argv[1:]
    creationflags = 0
    if os.name == "nt":
        # DETACHED_PROCESS | CREATE_NO_WINDOW: no console, survives parent exit.
        creationflags = 0x00000008 | 0x08000000
    try:
        subprocess.Popen(
            child_args,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            close_fds=True,
            creationflags=creationflags,
        )
    except OSError as e:
        # If we can't spawn, fall back to a synchronous write so the row isn't lost.
        try:
            do_insert(_args)
        except Exception as write_err:
            log_error(f"fallback sync write failed after spawn error ({e}): {write_err}")


# Populated by main() so spawn_detached_child's fallback can reuse the parsed args.
_args = None


def main():
    global _args
    p = argparse.ArgumentParser(description="Append a row to activity_logs.db (async by default)")
    p.add_argument("--sync", action="store_true",
                   help="wait for the INSERT and print the new row id (default: fire-and-forget)")
    p.add_argument("--timestamp", help="UTC 'YYYY-MM-DD HH:MM:SS'; auto-filled if omitted")
    p.add_argument("--repo", "--repo-name", dest="repo")
    p.add_argument("--branch", "--branch-name", dest="branch")
    p.add_argument("--task", "--task-title", dest="task")
    p.add_argument("--log-type", required=False, help="one of: start end activity issue decision github")
    p.add_argument("--log-title")
    p.add_argument("--log-description", default="")
    p.add_argument("--log-level", default="info")
    p.add_argument("--status", default="")
    p.add_argument("--priority", default="")
    p.add_argument("--agent", "--agent-name", dest="agent")
    p.add_argument("--agent-path", dest="agent_path")
    p.add_argument("--trace-id", dest="trace_id")
    p.add_argument("--parent-trace-id", dest="parent_trace_id")
    p.add_argument("--user-id", dest="user_id", default="admin")
    p.add_argument("--tags", default="")
    p.add_argument("--error-details", dest="error_details")
    p.add_argument("--resolved-by", dest="resolved_by")
    p.add_argument("--resolution-time", dest="resolution_time")
    p.add_argument("--performance-metrics", dest="performance_metrics",
                   help="JSON object: execution_ms, tokens, cpu_pct, memory_mb")
    p.add_argument("--input-output-hash", dest="input_output_hash")
    p.add_argument("--commit-reference", dest="commit_reference",
                   help="git commit SHA/reference for github commit logs "
                        "(full 40-char SHA preferred; short SHA accepted). "
                        "Used with --log-type github for commit actions.")
    p.add_argument("--_child", action="store_true", help=argparse.SUPPRESS)
    args = p.parse_args()
    _args = args

    # Required fields.
    missing = [n for n in ("repo", "log_type", "log_title", "agent") if not getattr(args, n)]
    if missing:
        p.error(f"missing required argument(s): {', '.join('--' + n.replace('_','-') for n in missing)}")

    err = validate(args)
    if err:
        p.error(err)

    if args._child:
        # Background path: do the INSERT, swallow errors into the error log.
        try:
            do_insert(args)
        except Exception as e:
            log_error(f"child insert failed: {e}")
        return

    if args.sync:
        # Synchronous path: print the row id, exit 1 on DB error.
        try:
            print(do_insert(args))
        except Exception as e:
            sys.exit(f"database error: {e}")
        return

    # Default async path: validate (done), spawn detached child, exit immediately.
    spawn_detached_child()


if __name__ == "__main__":
    main()
