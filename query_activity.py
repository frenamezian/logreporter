#!/usr/bin/env python3
"""Read activity_logs.db — the counterpart to log_activity.py.

Agents write with log_activity.py and are NOT expected to read the database as
part of their normal loop; this tool exists for a human (or an agent that has
been asked a direct question) to answer "what happened" and "how long did it
take" without opening the dashboard.

The connection is opened READ-ONLY. That is what makes --filter safe to expose
as a raw WHERE fragment: a malformed or hostile clause can produce an error or
a strange result set, but it cannot modify the database.

Security note for any future change to --filter's exposure: today --filter is
only reachable by a caller that already has filesystem access to this repo, so
the read-only connection is sufficient. sqlite3.execute() runs exactly one
statement, so --filter cannot itself ATTACH another database — but a read-only
connection CAN ATTACH other readable databases, and a WHERE fragment can then
reference them. If --filter is ever exposed to a less-privileged caller, that
ATTACH-via-where-reference path becomes an exfiltration vector and must be
revisited. Do not "simplify" the connection to a normal (read-write) one.

Usage:
  # everything about one task (partial, case-insensitive)
  python query_activity.py --task "0042"

  # one agent's rows across a branch, newest first
  python query_activity.py --agent code_reviewer --branch harness --desc

  # where did the time go on this task
  python query_activity.py --task "Account service" --summary

  # anything the named filters cannot express
  python query_activity.py --filter "log_type IN ('issue','decision') AND tags LIKE '%round-3%'"

Named filters are ANDed together, and ANDed with --filter. Exit 0 on success,
1 on a database or SQL error, 2 on a usage error.
"""
import argparse
import json
import os
import re
import sqlite3
import sys
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "activity_logs.db")

COLUMNS = [
    "id", "timestamp", "repo_name", "branch_name", "task_title",
    "log_type", "log_title", "log_description", "log_level",
    "status", "priority", "agent_name", "agent_path",
    "trace_id", "parent_trace_id", "user_id", "tags",
    "error_details", "resolved_by", "resolution_time",
    "performance_metrics", "input_output_hash", "commit_reference",
]

# Columns shown by the default table view. The rest are in --json and --fields.
DEFAULT_FIELDS = ["timestamp", "repo_name", "branch_name", "task_title",
                  "agent_path", "log_type", "log_title"]

TS_FMT = "%Y-%m-%d %H:%M:%S"

# A bare 'YYYY-MM-DD' upper bound would compare 'YYYY-MM-DD HH:MM:SS' <= 'YYYY-MM-DD',
# which is false for every row on that day (the longer string sorts after the prefix),
# silently dropping the entire day the user asked for. Normalise a date-only --until to
# end-of-day so the day is included. --since needs no normalisation: a date-only lower
# bound already includes the whole day because the prefix sorts before any timestamp
# on it.
_DATE_ONLY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def normalise_bound(value, upper):
    """Extend a date-only bound to the end (upper) of that day."""
    if value and upper and _DATE_ONLY.match(value):
        return value + " 23:59:59"
    return value


def connect(db_path):
    """Open the database read-only. Fails loudly — unlike the writer, a reader
    that silently returns nothing is worse than one that stops."""
    if not os.path.exists(db_path):
        sys.exit(f"activity_logs.db not found at {db_path}")
    uri = "file:" + db_path.replace("?", "%3f").replace("#", "%23") + "?mode=ro"
    return sqlite3.connect(uri, uri=True)


# Every LIKE below carries this. Without it, an underscore in the search term is
# a single-character WILDCARD, not a literal — and the values being searched here
# are full of them ('code_reviewer', 'task_0042'). Unescaped, --agent code_reviewer
# also matches 'code-reviewer' and --task task_0042 also matches 'task-0042',
# which are exactly the near-miss spellings that occur in this project.
ESCAPE = r" ESCAPE '\'"


def esc_like(value):
    """Escape LIKE metacharacters so the term matches literally."""
    return value.replace("\\", r"\\").replace("%", r"\%").replace("_", r"\_")


def build_where(args):
    """Assemble the WHERE clause from the named filters plus --filter.

    Returns (sql_fragment, params). Every named filter is parameterised; only
    --filter is interpolated, which is why the connection is read-only.
    """
    clauses, params = [], []

    if args.task:
        # SQLite's LIKE is case-insensitive for ASCII, which is the whole
        # requirement for task titles and free-text search.
        clauses.append(f"task_title LIKE ?{ESCAPE}")
        params.append(f"%{esc_like(args.task)}%")
    if args.text:
        clauses.append(f"(log_title LIKE ?{ESCAPE} OR log_description LIKE ?{ESCAPE})")
        params.extend([f"%{esc_like(args.text)}%"] * 2)
    if args.agent:
        # Match agent_name, or agent_path as an exact SEGMENT — the same
        # semantics the dashboard's drill-down uses, so 'code_reviewer' finds
        # 'lead_architect/task_executor/code_reviewer' but not 'code_reviewer_v2'.
        a = esc_like(args.agent)
        clauses.append(f"(agent_name = ? OR agent_path = ? OR agent_path LIKE ?{ESCAPE}"
                       f" OR agent_path LIKE ?{ESCAPE} OR agent_path LIKE ?{ESCAPE})")
        params.extend([args.agent, args.agent, f"{a}/%", f"%/{a}", f"%/{a}/%"])
    for col, value in (("trace_id", args.trace),
                       ("parent_trace_id", args.parent_trace),
                       ("repo_name", args.repo),
                       ("branch_name", args.branch),
                       ("log_type", args.log_type),
                       ("log_level", args.log_level),
                       ("status", args.status)):
        if value:
            clauses.append(f"{col} = ?")
            params.append(value)
    if args.since:
        clauses.append("timestamp >= ?")
        params.append(args.since)
    if args.until:
        clauses.append("timestamp <= ?")
        params.append(normalise_bound(args.until, upper=True))
    if args.filter:
        clauses.append(f"({args.filter})")

    return (" AND ".join(clauses) if clauses else "1=1"), params


def fetch(con, args):
    where, params = build_where(args)
    order = "DESC" if args.desc else "ASC"
    sql = (f"SELECT {','.join(COLUMNS)} FROM logs WHERE {where}"
           f" ORDER BY timestamp {order}, id {order}")
    if args.limit:
        sql += f" LIMIT {int(args.limit)}"
    if args.show_sql:
        print(f"-- {sql}\n-- params: {params}", file=sys.stderr)
    rows = con.execute(sql, params).fetchall()
    return [dict(zip(COLUMNS, r)) for r in rows]


def parse_ts(value):
    try:
        return datetime.strptime(value, TS_FMT)
    except (TypeError, ValueError):
        return None


def fmt_duration(seconds):
    if seconds is None:
        return "—"
    seconds = int(seconds)
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h}h{m:02d}m" if h else (f"{m}m{s:02d}s" if m else f"{s}s")


def summarise(rows):
    """Collapse rows into one line per (task, agent_path) — the 'where did the
    time go' view.

    OPEN counts invocations that logged a start and never logged an end. With
    the dispatcher-writes-the-brackets rule those should always be zero; a
    non-zero value means an agent died, or a bracket was skipped, and every
    duration for that group is therefore a floor rather than a measurement.

    BRACKET_MISMATCH is the signed difference (starts - ends): positive is a
    missing end, negative is an extra end. Both are bracket bugs under the
    dispatcher-writes-the-brackets rule, and the clamped OPEN column hides the
    extra-end case, so the signed value is surfaced separately.
    """
    groups = {}
    for r in rows:
        key = (r["repo_name"], r["branch_name"], r["task_title"], r["agent_path"])
        g = groups.setdefault(key, {"rows": 0, "starts": 0, "ends": 0, "ts": []})
        g["rows"] += 1
        if r["log_type"] == "start":
            g["starts"] += 1
        elif r["log_type"] == "end":
            g["ends"] += 1
        ts = parse_ts(r["timestamp"])
        if ts:
            g["ts"].append(ts)

    out = []
    for (repo, branch, task, path), g in groups.items():
        first, last = (min(g["ts"]), max(g["ts"])) if g["ts"] else (None, None)
        mismatch = g["starts"] - g["ends"]
        out.append({
            "repo_name": repo, "branch_name": branch, "task_title": task,
            "agent_path": path, "rows": g["rows"],
            "first": first.strftime(TS_FMT) if first else "",
            "last": last.strftime(TS_FMT) if last else "",
            "wall": fmt_duration((last - first).total_seconds() if first and last else None),
            "open": max(0, mismatch),
            "bracket_mismatch": mismatch,
        })
    out.sort(key=lambda r: (r["repo_name"], r["branch_name"], r["task_title"], r["first"]))
    return out


def print_table(rows, fields):
    if not rows:
        print("(no matching rows)")
        return
    widths = {f: len(f) for f in fields}
    cells = []
    for r in rows:
        row = {}
        for f in fields:
            v = "" if r.get(f) is None else str(r[f]).replace("\n", " ")
            if len(v) > 60:
                v = v[:57] + "..."
            row[f] = v
            widths[f] = max(widths[f], len(v))
        cells.append(row)
    line = "  ".join(f.upper().ljust(widths[f]) for f in fields)
    print(line)
    print("  ".join("-" * widths[f] for f in fields))
    for row in cells:
        print("  ".join(row[f].ljust(widths[f]) for f in fields))
    print(f"\n{len(rows)} row(s)")


def main():
    p = argparse.ArgumentParser(
        description="Query activity_logs.db (read-only)",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--db", default=DB_PATH, help="override the database path")
    p.add_argument("--task", help="partial, case-insensitive match on task_title")
    p.add_argument("--text", help="partial match on log_title or log_description")
    p.add_argument("--agent", help="agent_name, or an exact segment of agent_path")
    p.add_argument("--trace", help="exact trace_id")
    p.add_argument("--parent-trace", dest="parent_trace", help="exact parent_trace_id")
    p.add_argument("--repo", help="exact repo_name")
    p.add_argument("--branch", help="exact branch_name")
    p.add_argument("--log-type", dest="log_type",
                   help="start | end | activity | issue | decision | github")
    p.add_argument("--log-level", dest="log_level", help="debug | info | warning | error")
    p.add_argument("--status", help="pending | in_progress | failed | completed")
    p.add_argument("--since", help="timestamp lower bound, 'YYYY-MM-DD' or full UTC")
    p.add_argument("--until", help="timestamp upper bound, 'YYYY-MM-DD' or full UTC")
    p.add_argument("--filter", help="raw SQL WHERE fragment, ANDed with the filters above")
    p.add_argument("--fields", help="comma-separated columns for the table view")
    p.add_argument("--limit", type=int, default=200, help="max rows (0 = unlimited)")
    p.add_argument("--desc", action="store_true", help="newest first")
    p.add_argument("--summary", action="store_true",
                   help="one line per task+agent: row count, first, last, wall clock, open brackets")
    p.add_argument("--json", action="store_true", dest="as_json", help="JSON instead of a table")
    p.add_argument("--show-sql", action="store_true", dest="show_sql",
                   help="print the generated SQL to stderr")
    args = p.parse_args()

    if args.fields:
        unknown = [f for f in args.fields.split(",") if f.strip() not in COLUMNS]
        if unknown:
            p.error(f"unknown column(s): {', '.join(unknown)}")

    con = connect(args.db)
    try:
        rows = fetch(con, args)
    except sqlite3.Error as e:
        # Almost always a malformed --filter; show it rather than the traceback.
        sys.exit(f"query error: {e}" + (f"\n--filter was: {args.filter}" if args.filter else ""))
    finally:
        con.close()

    if args.summary:
        rows = summarise(rows)
        fields = ["task_title", "agent_path", "rows", "first", "last", "wall", "open", "bracket_mismatch"]
    elif args.fields:
        fields = [f.strip() for f in args.fields.split(",")]
    else:
        fields = DEFAULT_FIELDS

    if args.as_json:
        print(json.dumps(rows, indent=2))
    else:
        print_table(rows, fields)


if __name__ == "__main__":
    main()
