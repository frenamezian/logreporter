"""
Generate _build/app/token_usage.db and its run report for the public demo.

When the repository root has a live token_usage.db (and _build/app/activity_logs.db
was exported from the real activity_logs.db), this script filters token_usage.db
to the rows that fall inside the [start, end] span of a logged task in
_build/app/activity_logs.db, strips watermark file paths and unused session
metadata, and compacts the database with VACUUM.

When no root token_usage.db is present (for example on a fresh clone using the
148-row seed/activity_logs.db), it falls back to generating deterministic
synthetic usage rows keyed to the sample logs.

    python site/tools/make_demo_usage.py

Runs after export_app.py, which is what puts _build/app/activity_logs.db in
place. site/build.py runs the two in that order for you.
"""

import json
import random
import sqlite3
from datetime import datetime, timedelta, timezone

from _paths import BUILD, REPO

LOGS = BUILD / "app" / "activity_logs.db"
LIVE_USAGE = REPO / "token_usage.db"
OUT = BUILD / "app" / "token_usage.db"
REPORT = BUILD / "app" / "token_usage.report.json"

SEED = 20260803          # fixed: rebuilds must be reproducible
MODELS = [
    ("claude-opus-5", 0.55),
    ("claude-sonnet-5", 0.35),
    ("claude-haiku-4-5", 0.10),
]

DDL = """
CREATE TABLE IF NOT EXISTS token_usage (
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
);
CREATE TABLE IF NOT EXISTS watermark (
  parser_id   TEXT NOT NULL,
  source_path TEXT NOT NULL,
  cursor      TEXT,
  size_bytes  INTEGER,
  mtime_ns    INTEGER,
  last_run    TEXT,
  PRIMARY KEY (parser_id, source_path)
);
"""

TS = "%Y-%m-%d %H:%M:%S"

# Only these extra_json keys are read by the dashboard UI:
# - agent_type: script/time-model.js (usageAgent subagent attribution)
# - model_id_source: components/log-usage.js (derived model marker)
KEEP_EXTRA_KEYS = ("agent_type", "model_id_source")


def parse(t):
    for f in (TS, "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(t[:19], f)
        except ValueError:
            pass
    return None


def log_ts_ms(s: str) -> int | None:
    """Match script/time-model.js `at(s)`: UTC or ISO-8601 timestamp -> epoch ms."""
    return usage_ts_ms(s)


def usage_ts_ms(s: str) -> int | None:
    """Match script/time-model.js `usageAt(s)`: ISO-8601 UTC string -> epoch ms."""
    if not s:
        return None
    try:
        txt = str(s).strip()
        if txt.endswith("Z"):
            txt = txt[:-1] + "+00:00"
        elif " " in txt and "+" not in txt:
            txt = txt.replace(" ", "T") + "+00:00"
        dt = datetime.fromisoformat(txt)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    except ValueError:
        return None


def slim_extra_json(raw: str | None) -> str | None:
    if not raw:
        return None
    try:
        d = json.loads(raw)
    except (TypeError, ValueError):
        return None
    if not isinstance(d, dict):
        return None
    slim = {k: d[k] for k in KEEP_EXTRA_KEYS if d.get(k) is not None}
    return json.dumps(slim, separators=(",", ":")) if slim else None


def export_real_usage(src_logs: sqlite3.Connection) -> bool:
    """Filter LIVE_USAGE to task-attributed rows matching src_logs. Returns True if used."""
    if not LIVE_USAGE.exists() or LIVE_USAGE.stat().st_size == 0:
        return False

    # Build task spans per (repo_name, branch_name), matching time-model.js taskSpans()
    spans: dict[tuple[str, str, str], tuple[int, int]] = {}
    for repo, branch, task, ts in src_logs.execute(
        "SELECT repo_name, branch_name, task_title, timestamp FROM logs "
        "WHERE timestamp IS NOT NULL"
    ):
        ms = log_ts_ms(ts)
        if ms is None:
            continue
        k = (repo or "", branch or "", task or "Untitled task")
        lo, hi = spans.get(k, (ms, ms))
        spans[k] = (min(lo, ms), max(hi, ms))

    by_scope: dict[tuple[str, str], list[tuple[int, int]]] = {}
    for (repo, branch, _task), span in spans.items():
        by_scope.setdefault((repo, branch), []).append(span)

    repos = sorted({r for r, _b in by_scope})
    if not repos:
        return False

    live_con = sqlite3.connect(f"file:{LIVE_USAGE.as_posix()}?mode=ro", uri=True)
    placeholders = ",".join("?" for _ in repos)
    cur = live_con.execute(
        f"SELECT request_id, timestamp, model_id, repo_name, branch_name, "
        f"       input_tokens, cache_read_tokens, cache_write_5m, cache_write_1h, "
        f"       output_tokens, service_tier, speed, source, extra_json "
        f"FROM token_usage WHERE repo_name IN ({placeholders}) ORDER BY timestamp",
        repos,
    )

    matched_rows = []
    idx = 0
    for (
        _req_id, ts, model_id, repo, branch,
        in_tok, cr_tok, cw5_tok, cw1h_tok, out_tok,
        tier, speed, source, extra_json,
    ) in cur:
        scope_spans = by_scope.get((repo or "", branch or ""))
        if not scope_spans:
            continue
        t_ms = usage_ts_ms(ts)
        if t_ms is None:
            continue
        if any(lo <= t_ms <= hi for lo, hi in scope_spans):
            idx += 1
            matched_rows.append((
                f"r{idx}",  # compact sequential ID instead of raw server UUID
                None,       # strip session_id
                ts,
                model_id,
                repo,
                branch,
                in_tok,
                cr_tok,
                cw5_tok,
                cw1h_tok,
                out_tok,
                tier,
                speed,
                source,
                slim_extra_json(extra_json),
            ))
    live_con.close()

    if not matched_rows:
        return False

    if OUT.exists():
        OUT.unlink()
    out = sqlite3.connect(OUT)
    out.execute("PRAGMA journal_mode=DELETE")
    out.executescript(DDL)
    out.executemany(
        "INSERT INTO token_usage VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        matched_rows,
    )
    out.commit()
    out.execute("VACUUM")

    tot = out.execute(
        "SELECT COALESCE(SUM(COALESCE(input_tokens,0)+COALESCE(cache_read_tokens,0)"
        "                    +COALESCE(cache_write_5m,0)+COALESCE(cache_write_1h,0)), 0),"
        "       COALESCE(SUM(COALESCE(output_tokens,0)), 0) FROM token_usage"
    ).fetchone()
    out.close()

    print(
        f"{OUT.relative_to(REPO)}: {len(matched_rows):,} task-attributed requests "
        f"across {len(spans):,} tasks ({OUT.stat().st_size:,} bytes)"
    )
    print(f"  input {tot[0]:,} tokens · output {tot[1]:,} tokens")
    write_real_report(len(matched_rows), len(spans))
    return True


def write_real_report(rows_total: int, tasks_total: int) -> None:
    report = {
        "started": datetime.now(timezone.utc).strftime(TS),
        "agents": [],
        "failures": [],
        "loaded": ["antigravity", "claude_code"],
        "inactive": [],
        "rows_total": rows_total,
        "elapsed_s": 0,
        "note": (
            f"Sanitized public demo snapshot ({rows_total:,} task-attributed "
            f"requests across {tasks_total:,} logged tasks). Local watermark "
            f"paths and session identifiers have been stripped for publication."
        ),
    }
    REPORT.write_text(json.dumps(report, indent=1), encoding="utf-8", newline="\n")
    print(f"  {REPORT.name}  {REPORT.stat().st_size:,} bytes")


def main():
    if not LOGS.exists():
        raise SystemExit(f"missing {LOGS} — run site/tools/export_app.py first")

    src = sqlite3.connect(f"file:{LOGS.as_posix()}?mode=ro", uri=True)
    if export_real_usage(src):
        src.close()
        return

    rng = random.Random(SEED)

    # One span per task: earliest and latest log entry in it.
    spans = {}
    for repo, branch, task, ts in src.execute(
        "SELECT repo_name, branch_name, task_title, timestamp FROM logs "
        "WHERE task_title IS NOT NULL AND timestamp IS NOT NULL"
    ):
        d = parse(ts)
        if not d:
            continue
        k = (repo, branch, task)
        lo, hi = spans.get(k, (d, d))
        spans[k] = (min(lo, d), max(hi, d))
    src.close()

    if OUT.exists():
        OUT.unlink()
    out = sqlite3.connect(OUT)
    out.executescript(DDL)

    rows, n = [], 0
    for (repo, branch, task), (lo, hi) in sorted(spans.items(), key=lambda x: str(x[0])):
        secs = max(60, int((hi - lo).total_seconds()))
        # Busier tasks get more requests; keep the demo file small.
        requests = max(3, min(28, secs // 90))
        session = f"demo-{abs(hash((repo, branch, task))) % 10**8:08d}"
        model = rng.choices([m for m, _ in MODELS], [w for _, w in MODELS])[0]

        # Cache grows through a session: early requests write it, later ones read
        # it. That is what makes the Tokens/Cost toggle tell different stories.
        for i in range(requests):
            at = lo + timedelta(seconds=int(secs * (i + 0.5) / requests))
            warm = i / max(1, requests - 1)
            cache_read = int(rng.uniform(6_000, 90_000) * warm)
            writes = int(rng.uniform(4_000, 26_000) * (1 - warm * 0.7))
            long_ttl = rng.random() < 0.75
            n += 1
            rows.append((
                f"req_demo_{n:05d}",
                session,
                at.strftime(TS),
                model,
                repo,
                branch,
                rng.randint(1, 40),                     # uncached remainder
                cache_read,
                0 if long_ttl else writes,
                writes if long_ttl else 0,
                rng.randint(180, 2_600),
                "standard",
                "standard",
                "claude_code",
                None,
            ))

    out.executemany(
        "INSERT INTO token_usage VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows
    )
    out.execute(
        "INSERT INTO watermark VALUES (?,?,?,?,?,?)",
        ("claude_code", "<demo fixture>", None, 0, 0,
         datetime.now(timezone.utc).strftime(TS)),
    )
    out.commit()

    tot = out.execute(
        "SELECT SUM(input_tokens+cache_read_tokens+cache_write_5m+cache_write_1h),"
        "       SUM(output_tokens) FROM token_usage"
    ).fetchone()
    out.close()
    print(f"{OUT.relative_to(REPO)}: {len(rows)} requests across {len(spans)} tasks")
    print(f"  input {tot[0]:,} tokens · output {tot[1]:,} tokens")

    write_report(len(rows))


def write_report(rows_total: int) -> None:
    """Write the reader's run report beside the usage database.

    The dashboard fetches this on every load to draw the source-transparency
    panel. Nothing writes one here — usage_reader.py does that, and it does not
    run for the demo — so without this the published site answers 404 on every
    page load, which is a red line in the console of anyone who opens dev tools
    on it and a panel that says no report was found.

    What it must not do is imitate a reader run. The panel exists to say where
    the numbers came from, so a fixture claiming to have scanned somebody's
    session files would be the one lie the panel is there to prevent. Hence no
    agents, no parsers, and a note saying plainly what these rows are.
    """
    report = {
        "started": datetime.now(timezone.utc).strftime(TS),
        "agents": [],
        "failures": [],
        "loaded": [],
        "inactive": [],
        "rows_total": rows_total,
        "elapsed_s": 0,
        "note": ("Demo fixture. These usage rows were generated from a fixed "
                 "seed to match the sample logs — no session transcripts were "
                 "read, and no parser ran. On your own install the reader fills "
                 "this panel with what it actually scanned."),
    }
    REPORT.write_text(json.dumps(report, indent=1), encoding="utf-8", newline="\n")
    print(f"  {REPORT.name}  {REPORT.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
