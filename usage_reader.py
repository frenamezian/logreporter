#!/usr/bin/env python3
"""Read token usage out of the agents' own session files into token_usage.db.

Nothing here asks anything of the agents. Usage is *observed* — every coding
agent already writes what it spent, somewhere, in its own format — so this
works retroactively on history that predates the feature and log_activity.py is
untouched. It also never writes to activity_logs.db, and never reads it: the
two databases meet in the browser, in memory, not in SQL.

What it does
------------
  1. Loads every parser in parsers/ (auto-discovered, no registration list).
  2. Asks each one that claims this machine for its source files.
  3. Skips the files whose size and mtime are unchanged since last time.
  4. Parses the rest from their watermark, and INSERT OR IGNOREs the records.

Why a wrong watermark is not a correctness problem
---------------------------------------------------
request_id is the primary key. Re-reading a file that was already read inserts
nothing; a cursor that resumed too early inserts nothing new. The watermark is
purely a speed optimisation, which is what makes it safe to be aggressive about
skipping — and what makes "Rebuild usage" a complete escape hatch.

What is deliberately not stored
-------------------------------
Transcripts contain source code, prompts, and whatever secrets passed through
them. Only the numeric counters and the §4 envelope reach this database, and
extra_json is filtered against a whitelist here as well as in the parser — the
second gate exists so a future community parser cannot widen it by accident.

Usage:
  python usage_reader.py                 # incremental refresh
  python usage_reader.py --refresh       # re-derive stored rows in place
  python usage_reader.py --rebuild       # drop the cache and re-read everything
  python usage_reader.py --stats         # totals, no reading
  python usage_reader.py --dry-run       # parse and report, write nothing
  python usage_reader.py --only claude_code --limit 5 --verbose
  python usage_reader.py --refresh --only antigravity   # re-derive ONE source
  python usage_reader.py --rebuild --dry-run            # what WOULD a rebuild give?

`--rebuild` on its own deletes the database and starts over. Scoped with
`--only`, it deletes just that parser's rows and watermarks and leaves every
other source in place — which is what you want when a parser changes what it
emits, since INSERT OR IGNORE will not update rows that already exist.

`--refresh` is the same correction without the delete, and it is usually the
one you want. It re-reads every source from the start like a rebuild, but
UPDATEs the rows it finds instead of inserting them: nothing is created,
nothing is removed, and a row whose derived columns are unchanged is not
written at all. Use it after a PARSE_VERSION bump.

The distinction is not stylistic. This database is documented as "a cache and
nothing else", and that has quietly stopped being true: agent transcripts are
deleted or rotated by the agents themselves, so rows here routinely outlive
the file they were read from. On the machine this was written on, 6 Claude
Code sessions — 316 rows — had no surviving `.jsonl`, and `--rebuild` would
have destroyed them to fix 11,348 others. Prefer `--refresh`; reach for
`--rebuild` only when rows must actually be *removed*, and back up first.

Adding `--dry-run` makes it a preview: every source is read from the start, the
result is reported, and nothing is deleted or written. That combination used to
be the most destructive command here — it emptied the cache and then declined
to refill it, while printing "nothing was written" — because the full re-read
was obtained by deleting the watermarks rather than asked for outright.
"""

import argparse
import importlib.util
import json
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone

from parsers import (UsageRecord, COUNTER_FIELDS, EXTRA_ALLOWED, EXTRA_MAX_LEN)
from parsers import loader as parser_loader

ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(ROOT, "token_usage.db")

# The run report, written beside the database so the browser can show it. The
# source-transparency panel needs to say which parser ran, how many files it
# saw and what failed to load — and the page cannot run Python to find out.
# Without this the dashboard could only ever show a total, with no way to tell
# a complete one from a quietly partial one.
REPORT_PATH = os.path.join(ROOT, "token_usage.report.json")


def _load_schema_module():
    """Import seed/new_usage_db.py by path.

    seed/ is a directory of loose scripts, not a package, and turning it into
    one would change how new_db.py and init_db.sh are run. Loading the one
    module by path keeps the DDL in the single file that owns it without
    reorganising the directory around this feature.
    """
    path = os.path.join(ROOT, "seed", "new_usage_db.py")
    spec = importlib.util.spec_from_file_location("_new_usage_db", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


schema = _load_schema_module()

COLUMNS = (
    "request_id", "session_id", "timestamp", "model_id", "repo_name",
    "branch_name", "input_tokens", "cache_read_tokens", "cache_write_5m",
    "cache_write_1h", "output_tokens", "service_tier", "speed", "source",
    "extra_json",
)

INSERT = (f"INSERT OR IGNORE INTO token_usage ({','.join(COLUMNS)}) "
          f"VALUES ({','.join('?' * len(COLUMNS))})")

# Everything a parser derives, which is every column but the key it derives them
# against. `--refresh` writes these onto a row that already exists; see _refresh.
UPDATE_COLS = tuple(c for c in COLUMNS if c != "request_id")
UPDATE = (f"UPDATE token_usage SET {','.join(c + ' = ?' for c in UPDATE_COLS)} "
          f"WHERE request_id = ?")
SELECT_ONE = f"SELECT {','.join(UPDATE_COLS)} FROM token_usage WHERE request_id = ?"

# EXTRA_ALLOWED is defined in parsers/__init__.py and enforced here. A parser
# that puts a prompt, a file path or a stack trace in extra_json has it
# dropped: "nothing resembling message content may reach token_usage.db" is a
# property of the writer, not a rule parsers are trusted to follow.
BATCH = 500


def utc_now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def connect(db_path=DB_PATH):
    con = sqlite3.connect(db_path, timeout=10)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA busy_timeout=10000")
    schema.ensure_schema(con)
    return con


def _checkpoint(con):
    """Fold the WAL back into the main file before we let go of it.

    The dashboard fetches this database as raw bytes over HTTP and sql.js
    parses them; sql.js cannot see a -wal sidecar. Rows still sitting in the
    WAL would simply not exist as far as the page is concerned, which looks
    exactly like the reader having found nothing. serve.py checkpoints for the
    same reason after a delete.
    """
    try:
        con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    except sqlite3.Error as e:
        print(f"wal_checkpoint(TRUNCATE) failed, trying PASSIVE: {e}", file=sys.stderr)
        try:
            con.execute("PRAGMA wal_checkpoint(PASSIVE)")
        except sqlite3.Error as e2:
            print(f"wal_checkpoint(PASSIVE) also failed: {e2}", file=sys.stderr)


def _clean_extra(raw):
    """Filter extra_json down to the whitelist. Returns a JSON string or None."""
    if raw is None:
        return None
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(data, dict):
        return None
    out = {}
    for k, v in data.items():
        if k not in EXTRA_ALLOWED:
            continue
        if isinstance(v, bool) or isinstance(v, int) or isinstance(v, float):
            out[k] = v
        elif isinstance(v, str):
            out[k] = v[:EXTRA_MAX_LEN]
    return json.dumps(out, separators=(",", ":")) if out else None


def _row(rec: UsageRecord):
    d = rec.as_dict()
    d["extra_json"] = _clean_extra(d.get("extra_json"))
    return tuple(d[c] for c in COLUMNS)


# --- watermarks -------------------------------------------------------------

def drop_source(db_path, agent_id):
    """Delete one parser's rows and watermarks, leaving every other source alone.

    What `--rebuild --only X` has to mean. The unscoped rebuild deletes the
    database file, so combining the two used to destroy every other parser's
    rows on the way to re-reading one — a caller asking to rebuild Antigravity
    would lose 48,000 Claude Code rows and be told only that the rebuild
    succeeded. Recoverable, because the file is a cache, but silently wrong
    until somebody noticed the totals had halved.

    The `source LIKE 'X:%'` half is for aggregate adapters: ccusage writes
    `ccusage:codex`, `ccusage:gemini` and so on under the one AGENT_ID, and the
    same pattern is what the run loop already uses to clear a command-kind
    parser's namespace.
    """
    con = connect(db_path)
    try:
        n = con.execute(
            "DELETE FROM token_usage WHERE source = ? OR source LIKE ?",
            (agent_id, agent_id + ":%")).rowcount
        w = con.execute(
            "DELETE FROM watermark WHERE parser_id = ?", (agent_id,)).rowcount
        con.commit()
    finally:
        con.close()
    return n, w


def _watermarks(con, parser_id):
    rows = con.execute(
        "SELECT source_path, cursor, size_bytes, mtime_ns FROM watermark "
        "WHERE parser_id = ?", (parser_id,)
    ).fetchall()
    return {r[0]: {"cursor": r[1], "size_bytes": r[2], "mtime_ns": r[3]} for r in rows}


def _decide(mark, stat):
    """(action, cursor) for one file. action is skip | resume | full.

    A file whose size *and* mtime are unchanged is not opened at all — the
    common case, and the one that makes refresh cheap over hundreds of
    megabytes. The two invalidations are the ones that mean the cursor now
    points somewhere meaningless: a file smaller than recorded was truncated or
    rotated, and an mtime that moved backwards was replaced or restored from a
    backup.
    """
    if mark is None:
        return "full", None
    if mark["size_bytes"] == stat.st_size and mark["mtime_ns"] == stat.st_mtime_ns:
        return "skip", mark["cursor"]
    if (mark["size_bytes"] is not None and stat.st_size < mark["size_bytes"]):
        return "full", None
    if (mark["mtime_ns"] is not None and stat.st_mtime_ns < mark["mtime_ns"]):
        return "full", None
    return "resume", mark["cursor"]


def _save_watermark(con, parser_id, path, cursor, stat):
    con.execute(
        "INSERT INTO watermark (parser_id, source_path, cursor, size_bytes, "
        "mtime_ns, last_run) VALUES (?,?,?,?,?,?) "
        "ON CONFLICT(parser_id, source_path) DO UPDATE SET "
        "cursor=excluded.cursor, size_bytes=excluded.size_bytes, "
        "mtime_ns=excluded.mtime_ns, last_run=excluded.last_run",
        (parser_id, str(path), cursor, stat.st_size, stat.st_mtime_ns, utc_now()),
    )


# --- the run ----------------------------------------------------------------

def run(db_path=DB_PATH, only=None, limit=None, dry_run=False, verbose=False,
        parsers_dir=None, full=False, refresh=False):
    """Refresh the usage cache. Returns a report dict (the §8.6 source panel).

    `full` re-reads every source from the start, ignoring watermarks and
    cursors. It is a *read* mode and says nothing about deleting: the caller
    decides separately whether to clear what is already stored. Keeping those
    two apart is what makes a rebuild previewable — see main().

    `refresh` is the third of those separable things — a *write* mode. Records
    are UPDATEd onto the rows that already hold their request_id instead of
    being inserted, and nothing is deleted anywhere in the run. It implies a
    full read (there is no point re-deriving from a watermark), but main()
    passes that through `full` rather than assuming it here.
    """
    t0 = time.time()
    result = parser_loader.load(parsers_dir)
    active = parser_loader.resolve(result)

    report = {
        "started": utc_now(),
        "agents": [],
        "failures": [
            {"parser": f.module_name, "stage": f.stage, "error": f.error}
            for f in result.failures
        ],
        "loaded": [p.module_name for p in result.parsers],
        # Parsers that loaded fine but whose agent is not on this machine.
        # Reported rather than dropped: "ccusage is not installed, so these 16
        # agents are unsupported" is a fact the reader of a total needs, and
        # the alternative is a number that is quietly missing a source.
        "inactive": [
            {"agent_id": p.agent_id, "agent_name": p.agent_name,
             "parser": p.module_name, "homepage": p.homepage,
             "hint": str(getattr(p.module, "UNAVAILABLE_HINT", "") or "")}
            for p in result.parsers if p not in active
        ],
    }

    con = connect(db_path)
    try:
        # A command-source parser's rows are only ever as good as its last run,
        # so they must exist if and only if it just produced them. Without this,
        # uninstalling ccusage would leave its last totals sitting in the
        # database indefinitely, and the source panel would report the agent as
        # unsupported while the charts still counted it.
        for p in result.parsers:
            if p in active or getattr(p.module, "SOURCE_KIND", "files") != "command":
                continue
            if not dry_run and not refresh:
                con.execute(
                    "DELETE FROM token_usage WHERE source = ? OR source LIKE ?",
                    (p.agent_id, p.agent_id + ":%"))

        for p in active:
            if only and p.agent_id != only:
                continue
            report["agents"].append(
                _run_parser(con, p, claimed=active, limit=limit,
                            dry_run=dry_run, verbose=verbose, full=full,
                            refresh=refresh)
            )
        if not dry_run:
            con.commit()
            _checkpoint(con)
        report["rows_total"] = con.execute(
            "SELECT COUNT(*) FROM token_usage").fetchone()[0]
    finally:
        con.close()

    report["elapsed_s"] = round(time.time() - t0, 2)
    if not dry_run:
        _write_report(report, db_path)
    return report


def _write_report(report, db_path=DB_PATH):
    """Persist the run report next to its database.

    Failing to write it must not fail the run: the numbers are already in the
    database, and losing the provenance note is a smaller problem than losing
    the import. It is logged rather than raised.
    """
    path = (REPORT_PATH if db_path == DB_PATH
            else os.path.splitext(db_path)[0] + ".report.json")
    try:
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(report, f, indent=1)
            f.write("\n")
    except OSError as e:
        print(f"could not write {path}: {e}", file=sys.stderr)


def _run_parser(con, p, claimed=(), limit=None, dry_run=False, verbose=False, refresh=False,
                full=False):
    mod = p.module
    stats = getattr(mod, "PARSE_STATS", None)
    if isinstance(stats, dict):
        stats.clear()

    # "files"   sources are files on disk: stat them, watermark them, skip the
    #           unchanged ones, and append what is new.
    # "command" sources are a CLI that reports *aggregates*. There is nothing to
    #           stat, the numbers for a given key change as the day goes on, and
    #           the tool re-reads everything itself on every invocation. So the
    #           parser's whole `source` namespace is replaced each run. See the
    #           "Aggregate sources" section of parsers/CONTRIBUTING.md.
    kind = getattr(mod, "SOURCE_KIND", "files")

    agent = {
        "agent_id": p.agent_id, "agent_name": p.agent_name,
        "parser": p.module_name, "homepage": p.homepage,
        "kind": "fallback" if kind == "command" else "native",
        "files_seen": 0, "files_skipped": 0, "files_read": 0,
        "files_full_reread": 0, "files_failed": 0,
        "records": 0, "inserted": 0, "updated": 0, "rejected": 0, "replaced": 0,
        "last_watermark": None, "errors": [],
    }

    # A fallback adapter must not report an agent that has a native parser: the
    # native one is exact and sees counters the fallback cannot. The parser
    # cannot work this out for itself (it does not get to see the loader), so
    # the reader tells it.
    if hasattr(mod, "exclude_agents"):
        try:
            mod.exclude_agents({q.agent_id for q in claimed if q.agent_id != p.agent_id})
        except BaseException as e:  # noqa: BLE001
            agent["errors"].append(f"exclude_agents failed: {type(e).__name__}: {e}")

    try:
        sources = list(mod.discover())
    except BaseException as e:  # noqa: BLE001
        agent["errors"].append(f"discover failed: {type(e).__name__}: {e}")
        return agent

    agent["files_seen"] = len(sources)
    if limit:
        sources = sources[:limit]

    # A full read is "pretend we have never seen any of these files", which is
    # exactly an empty watermark set: _decide() answers "full", cursor None, for
    # a path it has no mark for. Saying it this way rather than by deleting the
    # watermark rows is what lets --rebuild --dry-run exist — the read is driven
    # by an argument, not by a side effect of a write.
    marks = {} if full else _watermarks(con, p.agent_id)
    pending = []

    # `and not refresh`: a refresh corrects rows in place and is promised never
    # to remove one. An aggregate source has nothing to correct anyway — its
    # rows are replaced wholesale on every ordinary run.
    if kind == "command" and not dry_run and not refresh:
        # Drop the whole namespace before re-inserting it. This is also what
        # cleans up after a fallback that has been superseded: once a native
        # parser claims codex, the adapter stops emitting ccusage:codex rows
        # and the stale ones go with this delete instead of quietly
        # double-counting alongside the native ones forever.
        before = con.total_changes
        con.execute("DELETE FROM token_usage WHERE source = ? OR source LIKE ?",
                    (p.agent_id, p.agent_id + ":%"))
        agent["replaced"] = con.total_changes - before

    for path in sources:
        if kind == "command":
            st, action, cursor = None, "full", None
        else:
            try:
                st = os.stat(path)
            except OSError as e:
                agent["files_failed"] += 1
                agent["errors"].append(f"{os.path.basename(str(path))}: {e}")
                continue
            action, cursor = _decide(marks.get(str(path)), st)

        if action == "skip":
            agent["files_skipped"] += 1
            continue
        if action == "full" and kind != "command":
            agent["files_full_reread"] += 1
            cursor = None
        agent["files_read"] += 1

        try:
            records, new_cursor = mod.parse(path, cursor)
            records = list(records)
        except BaseException as e:  # noqa: BLE001
            # One unreadable transcript must not stop the other 774.
            agent["files_failed"] += 1
            agent["errors"].append(f"{os.path.basename(str(path))}: "
                                   f"parse failed: {type(e).__name__}: {e}")
            continue

        good = []
        for rec in records:
            problems = rec.problems()
            if problems:
                agent["rejected"] += 1
                if len(agent["errors"]) < 20:
                    agent["errors"].append(
                        f"{os.path.basename(str(path))}: invalid record: {problems[0]}")
                continue
            good.append(_row(rec))

        agent["records"] += len(good)
        pending.extend(good)
        if verbose and good:
            print(f"  {os.path.basename(str(path))}: {len(good)} record(s)",
                  file=sys.stderr)

        if not dry_run and st is not None:
            # The stat was taken *before* the parse. If the agent appended
            # while we were reading, the recorded size is behind the cursor and
            # the file is read again next time — which costs a little time and
            # inserts nothing. The other direction would lose the appended rows.
            _save_watermark(con, p.agent_id, path, new_cursor, st)

        if len(pending) >= BATCH:
            _store(con, agent, pending, dry_run, refresh)
            pending = []

    _store(con, agent, pending, dry_run, refresh)

    if isinstance(stats, dict) and stats:
        agent["parse_stats"] = dict(stats)

    row = con.execute("SELECT MAX(last_run) FROM watermark WHERE parser_id = ?",
                      (p.agent_id,)).fetchone()
    agent["last_watermark"] = row[0] if row else None
    return agent


def _store(con, agent, rows, dry_run, refresh):
    """Write a batch the way this run was asked to: correcting, or importing."""
    if refresh:
        agent["updated"] += _refresh(con, rows, dry_run)
    else:
        agent["inserted"] += _flush(con, rows, dry_run)


def _refresh(con, rows, dry_run):
    """UPDATE rows that already exist. Inserts nothing, deletes nothing.

    Returns the number of rows whose derived columns actually *changed*, which
    is the number worth printing: a refresh that corrects 11,348 model ids and
    one that rewrites 64,049 identical rows are very different events, and
    SQLite's own change count cannot tell them apart — an UPDATE counts every
    row its WHERE matched, whether or not the values moved. So the comparison
    happens here, and an unchanged row is never written.

    A request_id with no stored row is skipped rather than inserted. That is
    what keeps this a *correction* and not a second import path: --refresh can
    never change how many rows exist, so it cannot go wrong in the direction
    that would need a backup to undo.

    Under --dry-run the comparison still runs and only the write is skipped, so
    the count is a real preview of what a refresh would move. Returning 0 there
    would have been the same lie --rebuild --dry-run used to tell.
    """
    if not rows:
        return 0
    changed = 0
    for r in rows:
        rid, new = r[0], tuple(r[1:])
        cur = con.execute(SELECT_ONE, (rid,)).fetchone()
        if cur is None or tuple(cur) == new:
            continue
        if not dry_run:
            con.execute(UPDATE, new + (rid,))
        changed += 1
    return changed


def _flush(con, rows, dry_run):
    if not rows:
        return 0
    if dry_run:
        return 0
    before = con.total_changes
    con.executemany(INSERT, rows)
    # executemany's rowcount is unreliable with OR IGNORE; total_changes counts
    # the rows that actually landed, which is what "inserted" has to mean for
    # "run it twice, the second run inserts 0" to be a meaningful check.
    return con.total_changes - before


# --- reporting --------------------------------------------------------------

def totals(db_path=DB_PATH):
    con = connect(db_path)
    try:
        cols = ", ".join(f"SUM({c})" for c in COUNTER_FIELDS)
        row = con.execute(
            f"SELECT COUNT(*), {cols} FROM token_usage").fetchone()
        out = {"rows": row[0]}
        out.update(dict(zip(COUNTER_FIELDS, row[1:])))
        out["by_model"] = con.execute(
            "SELECT model_id, COUNT(*) FROM token_usage GROUP BY 1 ORDER BY 2 DESC"
        ).fetchall()
        out["by_source"] = con.execute(
            "SELECT source, COUNT(*) FROM token_usage GROUP BY 1 ORDER BY 2 DESC"
        ).fetchall()
        return out
    finally:
        con.close()


def print_report(report):
    print(f"parsers loaded: {', '.join(report['loaded']) or 'none'}")
    for f in report["failures"]:
        print(f"  ! {f['parser']} failed at {f['stage']}: {f['error']}")
    for i in report.get("inactive", []):
        print(f"  - {i['agent_name']} not available"
              + (f": {i['hint']}" if i["hint"] else ""))
    for a in report["agents"]:
        print(f"{a['agent_name']} ({a['parser']}, {a['kind']})")
        print(f"  files: {a['files_seen']} seen, {a['files_read']} read, "
              f"{a['files_skipped']} skipped, {a['files_full_reread']} re-read in full, "
              f"{a['files_failed']} failed")
        print(f"  records: {a['records']} parsed, {a['inserted']} inserted, "
              f"{a.get('updated', 0)} updated, {a['rejected']} rejected")
        if a.get("parse_stats"):
            print(f"  parser: {a['parse_stats']}")
        for e in a["errors"][:5]:
            print(f"  ! {e}")
    print(f"rows in token_usage.db: {report.get('rows_total')}   "
          f"({report['elapsed_s']}s)")


def print_totals(t):
    print(f"rows: {t['rows']}")
    for c in COUNTER_FIELDS:
        v = t[c]
        # NULL prints as "NULL", not 0 and not an em-dash: this is a cp1252
        # console on Windows, and the em-dash is the UI's job.
        print(f"  {c:<18} {'NULL' if v is None else format(v, ',')}")
    print("  models: " + ", ".join(f"{m or '?'}={n}" for m, n in t["by_model"]))
    print("  sources: " + ", ".join(f"{s}={n}" for s, n in t["by_source"]))


def main():
    ap = argparse.ArgumentParser(description="Read agent token usage into token_usage.db")
    ap.add_argument("--rebuild", action="store_true",
                    help="discard the cache and every watermark, then re-read "
                         "everything. Scoped by --only to one AGENT_ID; with "
                         "--dry-run it previews the result and deletes nothing")
    ap.add_argument("--refresh", action="store_true",
                    help="re-read every source and UPDATE the rows already "
                         "stored, inserting nothing and deleting nothing. The "
                         "non-destructive way to apply a PARSE_VERSION bump")
    ap.add_argument("--stats", action="store_true", help="print totals and exit")
    ap.add_argument("--dry-run", action="store_true", help="parse but write nothing")
    ap.add_argument("--only", help="restrict to one AGENT_ID")
    ap.add_argument("--limit", type=int, help="read at most N files per parser")
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--db", default=DB_PATH)
    args = ap.parse_args()

    if args.stats:
        print_totals(totals(args.db))
        return

    # A misspelled --only used to be a quiet no-op: nothing matched, nothing was
    # read, and the run reported success. Combined with --rebuild it was worse
    # than quiet. Checked here, before anything is deleted, because the parsers
    # are only loaded inside run() — by which point a rebuild has happened.
    if args.only:
        known = {p.agent_id for p in parser_loader.load().parsers}
        if args.only not in known:
            sys.exit(f"--only {args.only}: no parser declares that AGENT_ID. "
                     f"Known: {', '.join(sorted(known)) or '(none)'}")

    # --rebuild is two separable things, and conflating them is what made
    # --rebuild --dry-run delete the cache while printing "nothing was written":
    #
    #   clear   drop what is already stored          — a write
    #   full    read every source from the start     — a read
    #
    # It used to get the read by deleting the watermark rows, so the read could
    # not happen without the write. Now `full` is passed to run() directly, and
    # --dry-run simply skips the clear, exactly as it already skips the inserts.
    # Both are corrections for the same situation — a parser now emits something
    # different for rows it has already imported — and they differ only in
    # whether the old rows are deleted first. Asking for both is not a
    # combination, it is a contradiction about which one you meant.
    if args.rebuild and args.refresh:
        sys.exit("--rebuild and --refresh are alternatives: --refresh corrects "
                 "the stored rows in place, --rebuild deletes them and reads "
                 "again. Pick one (--refresh loses nothing).")

    if args.rebuild and not args.dry_run:
        if args.only:
            rows, marks = drop_source(args.db, args.only)
            print(f"dropped {rows:,} row(s) and {marks} watermark(s) for "
                  f"{args.only}; every other source left untouched")
        else:
            schema.create(args.db, force=True)
            print(f"rebuilt empty {args.db}")

    report = run(args.db, only=args.only, limit=args.limit,
                 dry_run=args.dry_run, verbose=args.verbose,
                 full=args.rebuild or args.refresh, refresh=args.refresh)
    print_report(report)
    if args.dry_run and args.rebuild:
        # Say what a real rebuild would produce, because the row count printed
        # above is what is *currently* stored — a rebuild would replace it.
        would = sum(a.get("records", 0) for a in report["agents"])
        scope = args.only or "every source"
        print(f"(dry run - nothing was written and nothing was deleted. "
              f"A real --rebuild of {scope} would store {would:,} record(s))")
    elif args.dry_run and args.refresh:
        would = sum(a.get("updated", 0) for a in report["agents"])
        scope = args.only or "every source"
        print(f"(dry run - nothing was written. A real --refresh of {scope} "
              f"would correct {would:,} stored row(s))")
    elif args.dry_run:
        print("(dry run - nothing was written)")


if __name__ == "__main__":
    main()
