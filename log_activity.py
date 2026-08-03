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
  - --repo and --branch auto-derive from git in the CALLER's working directory
    when omitted, so an agent in any repo logs under the right node without
    being told which repo it is in. One git call, not two — see
    detect_repo_and_branch() for the worktree rule and the cost reasoning.

This script lives beside activity_logs.db on purpose: it is the database's
access layer, it versions with the schema it writes, and agents in every repo
invoke this one canonical copy by absolute path rather than keeping their own.

Usage (one line; --repo and --branch omitted so git fills them in):
  python C:/Users/lotra/Documents/github/logreporter/log_activity.py --log-type start
      --task "task_0042 - Account service" --agent lead_architect
      --agent-path lead_architect --trace-id 9f2c41a8
      --log-title "Started task 0042" --log-level info --status in_progress

  # Mint a trace_id (orchestrator only — use the dedicated tool):
  python C:/Users/lotra/Documents/github/logreporter/mint_trace.py

Exit codes (default async mode):
  0 — args valid, write dispatched to background (row id NOT printed).
  2 — argument/usage error (nothing written).
Exit codes (--sync):
  0 — row inserted, new row id printed on stdout.
  1 — database error (nothing written).
  2 — argument/usage error.

Background write errors are appended to log_activity_errors.log next to the
database. The lead architect should check that file occasionally.

Trace_id is NEVER minted here. The orchestrator generates one per task with
mint_trace.py and passes it to every log_activity.py call and every subagent.
The calling contract lives with each repo's harness, in its
.ai_commands/orchestrator_logging_instructions.md and
.ai_commands/subagent_logging_instructions.md.
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


def _git(*args):
    """Run a git command in the caller's cwd. Returns stripped stdout, or None
    if git is absent, the directory is not a repo, or the output is empty."""
    try:
        r = subprocess.run(("git",) + args, capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.SubprocessError):
        return None
    if r.returncode != 0:
        return None
    return r.stdout.strip() or None


def detect_repo_and_branch():
    """Both grouping keys from ONE git call. Returns (repo, branch).

    Deliberately one invocation rather than two: this runs on every logged row,
    and on Windows a git process costs ~70ms, which is most of the cost of a
    log call. `rev-parse` accepts both queries at once and prints them on
    separate lines.

    --git-common-dir points at the shared .git of every worktree of a repo: the
    literal '.git' in a main worktree, an absolute path in a linked one — hence
    the abspath() before taking the containing directory's name. That is what
    makes a linked worktree log under its MAIN repo rather than under its own
    directory, so a repo with several worktrees stays one node on the dashboard.

    Three shapes of common dir resolve to the right repo name:

      - linked worktree: an absolute path ending in <main>/.git -> parent is
        <main>, basename is the main repo name (the case above).
      - submodule: an absolute path ending in <super>/.git/modules/<name> ->
        take <name>, NOT 'modules' (which basename(dirname(...)) would give and
        which would file every submodule of every superproject under one node).
      - bare repo: the common dir is the repo itself (often '.', or a path
        ending in '<name>.git') -> take its OWN basename, not its parent's.

    --abbrev-ref HEAD prints the literal 'HEAD' on a detached checkout; name it
    rather than leaving a blank branch node.

    Falls back to the directory name when this is not a git repo at all, so a
    freshly copied harness that has not been `git init`-ed yet still logs.
    """
    out = _git("rev-parse", "--git-common-dir", "--abbrev-ref", "HEAD")
    if not out:
        return (os.path.basename(os.getcwd()) or None), None
    lines = out.splitlines()
    common = lines[0].strip()
    branch = lines[1].strip() if len(lines) > 1 else ""

    # Resolve the repo name from the common dir, handling the three shapes.
    abs_common = os.path.abspath(common)
    head, tail = os.path.split(abs_common)
    if tail == ".git":
        # Main worktree or linked worktree: <main>/.git -> repo is <main>.
        repo = os.path.basename(head)
    elif tail == "modules":
        # Should not happen directly, but guard: a path ending in .../modules
        # with no name below it is malformed; fall back to the parent dir name.
        repo = os.path.basename(head) or "modules"
    else:
        # Either <super>/.git/modules/<name> (tail is <name>, parent is
        # 'modules') or a bare repo whose common dir IS the repo (tail is
        # '<name>.git' or similar, parent is the containing dir).
        parent = os.path.basename(head)
        if parent == "modules":
            # <super>/.git/modules/<name> -> submodule name is <tail>.
            repo = tail
        else:
            # Bare repo (or anything else): take the common dir's own name.
            repo = tail or os.path.basename(head)
    repo = repo or os.path.basename(os.getcwd()) or None

    return repo, ("detached" if branch == "HEAD" else (branch or None))


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


def _checkpoint(con):
    """Best-effort PASSIVE wal_checkpoint. Never raises — by the time this runs
    the row is committed, so a checkpoint failure only means a stale dashboard,
    not a lost row. See do_insert() for why PASSIVE over TRUNCATE."""
    try:
        con.execute("PRAGMA wal_checkpoint(PASSIVE)")
    except sqlite3.Error as e:
        log_error(f"wal_checkpoint(PASSIVE) failed (row already committed): {e}")


def do_insert(args):
    """Perform the INSERT with retry on lock contention. Used by child + --sync.

    The busy_timeout (10s) handles most contention inside SQLite. This retry
    loop is a second layer for the rare case where the busy_timeout expires
    (e.g. many concurrent writers, OS-level file contention). Each retry is
    logged to log_activity_errors.log so contention is observable.

    After a successful commit, a PASSIVE wal_checkpoint is attempted. This
    copies committed frames into the main DB file so a dashboard that fetches
    the raw .db bytes (sql.js over HTTP, which bypasses SQLite's locks) sees
    the new row on its next poll. PASSIVE never blocks: it does the frame copy
    only when nothing is in the way, which in this workload is almost always,
    since the only contenders are other agents' brief writes. A checkpoint
    failure or timeout is logged and swallowed — the row is already committed,
    so a missed checkpoint only means a stale dashboard, not a lost row.
    Reaching for TRUNCATE instead would buy a tidier -wal at the cost of
    blocking under busy_timeout; start PASSIVE and only escalate if -wal
    growth is observed.
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
            _checkpoint(con)
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


def spawn_detached_child(args):
    """Re-invoke this script with --_child to do the INSERT in the background."""
    # Pass the original args through verbatim, plus the --_child marker so the
    # child takes the synchronous insert path instead of respawning.
    #
    # --repo/--branch are re-appended from the PARENT's already-resolved values
    # rather than left to the child to re-derive: argparse takes the last
    # occurrence, so this is idempotent when they were passed explicitly, and it
    # keeps the git detection to one call in one process. The child inherits the
    # parent's cwd, so re-deriving would agree — it would just cost two more
    # subprocesses per log row.
    child_args = [sys.executable, __file__, "--_child"] + sys.argv[1:] + [
        "--repo", args.repo or "", "--branch", args.branch or "",
    ]
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
            do_insert(args)
        except Exception as write_err:
            log_error(f"fallback sync write failed after spawn error ({e}): {write_err}")


def main():
    p = argparse.ArgumentParser(description="Append a row to activity_logs.db (async by default)")
    p.add_argument("--sync", action="store_true",
                   help="wait for the INSERT and print the new row id (default: fire-and-forget)")
    p.add_argument("--timestamp", help="UTC 'YYYY-MM-DD HH:MM:SS'; auto-filled if omitted")
    p.add_argument("--repo", "--repo-name", dest="repo",
                   help="defaults to the main repo's name, derived from git in the caller's cwd")
    p.add_argument("--branch", "--branch-name", dest="branch",
                   help="defaults to the current branch, derived from git in the caller's cwd")
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

    # Grouping keys, resolved before the required-field check so an omitted
    # --repo is only an error when git cannot answer for it either. Skipped
    # entirely — no git call at all — when both were passed explicitly.
    if not args.repo or not args.branch:
        repo, branch = detect_repo_and_branch()
        args.repo = args.repo or repo
        args.branch = args.branch or branch

    # Required fields.
    missing = [n for n in ("repo", "log_type", "log_title", "agent") if not getattr(args, n)]
    if missing:
        p.error(f"missing required argument(s): {', '.join('--' + n.replace('_','-') for n in missing)}")

    # Database must exist BEFORE we spawn a child. Without this, a missing DB
    # raises inside the child (after the parent has already exited 0), so every
    # log call reports success and writes nothing, with the only evidence in an
    # error file nobody watches. Gitignoring the live DB makes a fresh clone hit
    # this routinely until the init script runs, so check here, in the parent,
    # and name the fix. One stat per call.
    if not os.path.exists(DB_PATH):
        init_script = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                   "seed", "init_db.sh")
        sys.exit(f"activity_logs.db not found at {DB_PATH}. "
                 f"Run {init_script} to create it from the seed copy.")

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
    spawn_detached_child(args)


if __name__ == "__main__":
    main()
