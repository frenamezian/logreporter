#!/usr/bin/env python3
"""Append one activity-log row to activity_logs.db.

Agents (lead architect + subagents) call this to record their work so the
LogReporter dashboard can be tested on real agent activity. Implements the
contract from the prototype's "Agent logging prompts" developer-guide topic:
  - exact column order the dashboard expects
  - WAL mode + busy_timeout so concurrent agents and dashboard polling coexist
  - UTC timestamp 'YYYY-MM-DD HH:MM:SS' auto-filled if omitted
  - SYNCHRONOUS by default: the INSERT completes before this exits, and the new
    row id is printed. --async restores the old fire-and-forget behaviour.
  - --repo and --branch auto-derive from git in the CALLER's working directory
    when omitted, so an agent in any repo logs under the right node without
    being told which repo it is in. One git call, not two — see
    detect_repo_and_branch() for the worktree rule and the cost reasoning.

Why the default is synchronous
------------------------------
It was asynchronous, and that default lost rows silently.

The failure, observed 2026-08-04: an agent logged five steps as it worked, each
call spawning a detached child to do the INSERT. Its terminal ran the shell
inside a Windows job object, so every child was killed with the subshell before
SQLite committed. Each call had already exited 0. The agent noticed only because
it later queried the table and found it empty, then re-logged all five rows in
one command — landing them in an 8-second window hours after the work.

The cost was not the missing rows, which were re-created, but their timestamps:
the task's span became 8 seconds wide, and 129 of the 132 token-usage requests
belonging to it fell outside that span and are attributable to nothing. Spans
are also what durations and idle time are derived from, so that task cannot be
reported on at all. None of it is recoverable — the real event times were never
written anywhere.

What makes this the wrong default rather than bad luck is the silence. The
docstring below used to promise that background failures are appended to
log_activity_errors.log. That promise cannot be kept for the most likely failure
there is: a killed process does not get to write its own epitaph, and no error
file was ever created. An agent following the documentation had every reason to
believe its rows had landed.

So the safe path is the one you get by default. Async remains available for a
caller that has measured the cost and wants it back — and it is hardened (see
spawn_detached_child) — but it is now opt-in, because the failure it risks is
invisible and permanent while the cost it avoids is a few milliseconds on a WAL
database.

This script lives beside activity_logs.db on purpose: it is the database's
access layer, it versions with the schema it writes, and agents in every repo
invoke this one canonical copy by absolute path rather than keeping their own.

Usage (one line; --repo and --branch omitted so git fills them in):
  python C:/Users/you/dev/logreporter/log_activity.py --log-type start
      --task "task_0042 - Account service" --agent lead_architect
      --agent-path lead_architect --trace-id 9f2c41a8
      --log-title "Started task 0042" --log-level info --status in_progress

  # Mint a trace_id (orchestrator only — use the dedicated tool):
  python C:/Users/you/dev/logreporter/mint_trace.py

Exit codes (default, synchronous):
  0 — row inserted, new row id printed on stdout.
  1 — database error (nothing written).
  2 — argument/usage error.
Exit codes (--async):
  0 — args valid, write dispatched to background (row id NOT printed).
  2 — argument/usage error (nothing written).

--sync is still accepted and does nothing: it is what every existing agent
prompt passes to get the behaviour that is now the default, and breaking those
would be a strange way to make logging more reliable.

Under --async, write errors are appended to log_activity_errors.log next to the
database — but only errors the child survives to report. If the child is killed
outright, nothing is written and nothing is logged, which is the whole reason
async is no longer the default.

Trace_id is NEVER minted here. The orchestrator generates one per task with
mint_trace.py and passes it to every log_activity.py call and every subagent.
The calling contract lives with each repo's harness, in its
.ai_commands/orchestrator_logging_instructions.md and
.ai_commands/subagent_logging_instructions.md.
"""
import argparse
import json
import os
import re
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


# --- naming the repository --------------------------------------------------
#
# Duplicated, deliberately, from parsers/_gitname.py. This script is the
# ground-truth writer for activity_logs.db and agents in every repo invoke it
# by absolute path; giving it an import from the parser package would mean a
# broken parser can stop logging, which is the one failure this file may not
# have. The rule is small and stable — if you change it, change both.

_CREDS = re.compile(r"^([a-z][a-z0-9+.\-]*://)[^/@]*@", re.I)
_SECTION_RE = re.compile(r"^\[([^\]]+)\]$")
_REMOTE_RE = re.compile(r'^remote\s+"?([^"]+)"?$', re.I)


def repo_name_from_url(url):
    """The repository name from a remote URL, or None. Credentials stripped."""
    if not isinstance(url, str) or not url.strip():
        return None
    u = _CREDS.sub(r"\1", url.strip()).replace("\\", "/").rstrip("/")
    if u.lower().endswith(".git"):
        u = u[:-4].rstrip("/")
    name = u.rsplit("/", 1)[-1]
    if ":" in name:
        name = name.rsplit(":", 1)[-1]     # scp-like: git@host:name
    return name[:64] or None


def repo_from_git_dir(git_dir):
    """The origin remote's repository name for a resolved git directory.

    `git rev-parse --git-common-dir` has already followed a worktree or
    submodule pointer, so `config` is simply inside it — which is why worktrees
    report their MAIN repo (they share its config) and submodules report their
    own, with no special case here.
    """
    try:
        with open(os.path.join(git_dir, "config"), encoding="utf-8", errors="replace") as f:
            text = f.read()
    except OSError:
        return None
    urls, section = {}, None
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line[0] in "#;":
            continue
        m = _SECTION_RE.match(line)
        if m:
            section = m.group(1).strip()
            continue
        if not section or "=" not in line:
            continue
        key, _, value = line.partition("=")
        if key.strip().lower() != "url":
            continue
        rm = _REMOTE_RE.match(section)
        if rm:
            urls.setdefault(rm.group(1), value.strip())
    url = urls.get("origin")
    if url is None and len(urls) == 1:
        url = next(iter(urls.values()))    # sole remote, whatever it is called
    return repo_name_from_url(url)


def detect_repo_and_branch():
    """Both grouping keys from ONE git call. Returns (repo, branch).

    Deliberately one invocation rather than two: this runs on every logged row,
    and on Windows a git process costs ~70ms, which is most of the cost of a
    log call. `rev-parse` accepts both queries at once and prints them on
    separate lines.

    The repo name is the ORIGIN REMOTE's name, not the folder's. Those differ
    more often than they look like they should — this repository lives in a
    directory called `log_reporter` and is `github.com/frenamezian/logreporter`
    — and the folder name is the local accident: chosen at clone time, never
    resynchronised, and different again for every worktree and every per-task
    clone. Usage attribution (§7) joins on this name, so a parser reading a
    transcript's cwd has to arrive at the same string this writes; the remote
    is the only identity both sides can see. See parsers/_gitname.py.

    --git-common-dir points at the shared .git of every worktree of a repo: the
    literal '.git' in a main worktree, an absolute path in a linked one — hence
    the abspath(). It is where `config`, and therefore the remote, lives. It is
    also what makes a linked worktree log under its MAIN repo rather than under
    its own directory, so a repo with several worktrees stays one node on the
    dashboard.

    Falling back to the folder when there is no usable remote, three shapes of
    common dir resolve to the right repo name:

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
        # (None, None) means "git could not answer", not "this repo has no
        # name". The distinction is load-bearing: resolve_scope only lets an
        # explicit --repo through on this path, and a directory-name guess
        # returned from here would outrank it and silently win instead.
        return None, None
    lines = out.splitlines()
    common = lines[0].strip()
    branch = lines[1].strip() if len(lines) > 1 else ""

    abs_common = os.path.abspath(common)

    # The remote is the repository's real identity; everything below is the
    # fallback for a checkout that has none (a freshly `git init`-ed harness, a
    # local-only scratch repo).
    repo = repo_from_git_dir(abs_common)
    if repo:
        return repo, ("detached" if branch == "HEAD" else (branch or None))

    # Resolve the repo name from the common dir, handling the three shapes.
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


def resolve_scope(args):
    """Settle repo_name and branch_name, in the order that keeps them joinable.

        1. --_resolved-* from the async parent, which already did the git call
        2. git, whenever git can answer
        3. --repo / --branch, for a directory git knows nothing about
        4. the directory's own name, so a row is still filed rather than refused

    Git outranks the flags rather than deferring to them, which is the whole
    point of the ordering. The two names are a join key shared with a reader
    that never sees this database: it derives the repo from the remote of the
    checkout a transcript recorded, so the only value that can match is the one
    git reports. A declared name does not relabel the work, it disconnects it,
    and the resulting task shows a confident zero rather than an error.

    Rung 3 is why git returning None has to mean "could not answer" rather than
    "no name available". If it guessed a directory name instead, that guess
    would outrank the caller and the escape hatch would never be reachable.

    A disagreement is a caller worth fixing — an old prompt with the repo
    hardcoded — so it goes to the error log. It is not fatal and does not touch
    the row: the row is already correct, and refusing to write it would trade a
    stale argument for a hole in the ground truth.
    """
    if args.resolved_repo or args.resolved_branch:
        args.repo = args.resolved_repo or args.repo
        args.branch = args.resolved_branch or args.branch
        return

    declared_repo, declared_branch = args.repo, args.branch
    repo, branch = detect_repo_and_branch()
    args.repo = repo or declared_repo or os.path.basename(os.getcwd()) or None
    args.branch = branch or declared_branch

    # Only when git actually answered: overriding a value git never produced is
    # the flag doing its job, not a caller contradicting it.
    for flag, declared, derived in (("--repo", declared_repo, repo),
                                    ("--branch", declared_branch, branch)):
        if declared and derived and declared != derived:
            log_error(f"ignored {flag} {declared!r}: git reports {derived!r} for "
                      f"{os.getcwd()!r}. The grouping keys come from git; remove "
                      f"{flag} from the caller.")


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
    # The grouping keys travel as --_resolved-*, carrying the PARENT's already
    # settled values rather than leaving the child to derive them again. The
    # child inherits the parent's cwd so it would reach the same answer; it
    # would just pay for another git call per log row. They cannot be re-sent
    # as --repo/--branch: those are now outranked by git (see resolve_scope),
    # so the child would ignore them and make exactly the call this avoids.
    child_args = [sys.executable, __file__, "--_child"] + sys.argv[1:] + [
        "--_resolved-repo", args.repo or "", "--_resolved-branch", args.branch or "",
    ]
    # DETACHED_PROCESS | CREATE_NO_WINDOW: no console, survives parent exit.
    # CREATE_BREAKAWAY_FROM_JOB: also survives the parent's *job object*, which
    # detaching alone does not. A terminal that runs its shell in a job with
    # KILL_ON_JOB_CLOSE — several agent harnesses do — kills every descendant
    # when the subshell ends, however detached, and that is exactly how five
    # rows were lost on 2026-08-04. Breakaway is refused (WinError 5) by a job
    # that does not permit it, so it is attempted first and dropped if denied:
    # a child inside the job is still better than no child.
    attempts = [0]
    if os.name == "nt":
        attempts = [0x00000008 | 0x08000000 | 0x01000000,
                    0x00000008 | 0x08000000]

    last = None
    for flags in attempts:
        try:
            subprocess.Popen(
                child_args,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                close_fds=True,
                creationflags=flags,
            )
            return
        except OSError as e:
            last = e

    # Could not spawn at all: write it here rather than lose the row. This is
    # the one failure the async path can still report, because we are alive.
    try:
        do_insert(args)
    except Exception as write_err:
        log_error(f"fallback sync write failed after spawn error ({last}): {write_err}")


def main():
    p = argparse.ArgumentParser(description="Append a row to activity_logs.db")
    p.add_argument("--async", dest="async_", action="store_true",
                   help="fire-and-forget: spawn a detached child to do the INSERT and "
                        "exit immediately without the row id. Faster, and can lose the "
                        "row silently if the child is killed — see the module docstring")
    # Accepted and ignored. Every agent prompt in circulation passes --sync to
    # ask for exactly what now happens anyway; rejecting it would break them all
    # in the name of reliability. Explicit --sync also wins over --async, so a
    # caller passing both gets the safe one.
    p.add_argument("--sync", action="store_true",
                   help="no-op: the INSERT is synchronous by default. Overrides --async")
    p.add_argument("--timestamp", help="UTC 'YYYY-MM-DD HH:MM:SS'; auto-filled if omitted")
    # Hidden, accepted, and outranked by git. Not part of this tool's surface:
    # they are absent from --help and from every agent prompt, because the
    # grouping keys are not an agent's to choose. Usage attribution joins on
    # repo_name, and the token reader derives that name independently from the
    # remote of the checkout a transcript recorded — it cannot see anything an
    # agent declared. A caller that names the repo differently therefore does
    # not shift the reporting, it detaches from it: the tokens file under a
    # repository that exists on one side of the join only, and the task renders
    # as having cost nothing.
    #
    # Still ACCEPTED rather than rejected, for two reasons. Prompts hardcoding
    # `--repo <name>` are in circulation in other repositories, and argparse
    # would exit 2 on them — turning a wrong repo name into no logging at all,
    # against the one database in this system that nothing can reconstruct.
    # And they remain the only way to name a directory that was never
    # `git init`-ed, which is what resolve_scope() falls back to.
    p.add_argument("--repo", "--repo-name", dest="repo", help=argparse.SUPPRESS)
    p.add_argument("--branch", "--branch-name", dest="branch", help=argparse.SUPPRESS)
    # Written by spawn_detached_child() only, and trusted verbatim: the parent
    # has already paid for the git call and the child inherits its cwd, so
    # re-deriving would agree and cost two more subprocesses per row. A caller
    # cannot reach this path without impersonating the async dispatcher.
    p.add_argument("--_resolved-repo", dest="resolved_repo", help=argparse.SUPPRESS)
    p.add_argument("--_resolved-branch", dest="resolved_branch", help=argparse.SUPPRESS)
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

    resolve_scope(args)

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

    if args.async_ and not args.sync:
        # Opt-in fire-and-forget: spawn the detached child and exit immediately.
        spawn_detached_child(args)
        return

    # Default: do the INSERT here, print the row id, exit 1 on database error.
    # The caller waits the milliseconds this takes and learns whether it worked.
    try:
        print(do_insert(args))
    except Exception as e:
        sys.exit(f"database error: {e}")


if __name__ == "__main__":
    main()
