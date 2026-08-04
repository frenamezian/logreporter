"""
Generate _build/app/token_usage.db and its run report for the public demo.

The demo ships seed/activity_logs.db (synthetic sample logs). Its usage sibling
has to be synthetic too — publishing a real token_usage.db would expose actual
repository names, branch names and working patterns.

Rows are keyed to the sample logs so the join in the dashboard is real: every
generated request falls inside a task's start/end span, in that task's repo and
branch. Only the token counts are invented, and they are drawn from a fixed
seed so the demo is byte-identical on every rebuild.

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
CREATE INDEX IF NOT EXISTS ix_usage_scope
  ON token_usage(repo_name, branch_name, timestamp);
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


def parse(t):
    for f in (TS, "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(t[:19], f)
        except ValueError:
            pass
    return None


def main():
    if not LOGS.exists():
        raise SystemExit(f"missing {LOGS} — run site/tools/export_app.py first")

    rng = random.Random(SEED)
    src = sqlite3.connect(f"file:{LOGS}?mode=ro", uri=True)

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
