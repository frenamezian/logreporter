"""
Export the dashboard into _build/app/, for the live demo.

    python site/tools/export_app.py

Exports from this repository's HEAD — never its working tree. A published demo
should be a commit someone can point at, not whatever happened to be saved when
the build ran.

Two things are added on the way out:

  window.LR_HOME     turns the header brand into a link back to the landing page.
                     The app leaves the brand as a plain <div> when this is
                     unset, which is every local checkout — serve.py serves the
                     app at the root of its own clone, with nothing above it.

  activity_logs.db   a sanitized copy of the root activity_logs.db (falling back
                     to seed/activity_logs.db when no root database is present).

The usage sibling is exported separately by make_demo_usage.py, which filters
the root token_usage.db to task-attributed rows and strips machine-local
watermarks and session metadata.
"""

import re
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

from _paths import BUILD, REPO

APP = BUILD / "app"

# Everything the dashboard loads. Kept explicit so a stray file in the repo — a
# parser, a task doc, a live database — cannot wander into the published site.
# "fonts" carries the vendored Archivo the light theme's chrome titles use
# (Task 0010) — without it the published demo silently falls back to system-ui.
PATHS = ["index.html", "style.css", "favicon.svg", "fonts", "script", "components", "docs"]

MARKER = "window.LR_HOME"
INJECT = """  <!-- ===== Added by site/tools/export_app.py. Publication-only. ===== -->

  <!-- The dashboard is published under /app/, beneath a landing page; this is
       what turns the header brand into a link back to it. Unset in a local
       checkout, where there is no page above. -->
  <script>window.LR_HOME = '../';</script>

  <!-- The rest of this block is SEO, and it belongs here rather than in the
       tracked index.html for one reason: every URL in it is absolute, and an
       absolute URL is only true of the published copy. The same file served by
       serve.py lives at 127.0.0.1:8250, where a canonical pointing at github.io
       would be a lie that tells a crawler to index someone's laptop.

       The description and the <noscript> fallback are NOT here — they are true
       everywhere, so they live in the tracked document with the rest of it. -->
  <link rel="canonical" href="https://frenamezian.github.io/logreporter/app/index.html">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="LogReporter">
  <meta property="og:url" content="https://frenamezian.github.io/logreporter/app/index.html">
  <meta property="og:title" content="LogReporter — live demo">
  <meta property="og:description" content="The real dashboard, over 148 sample rows. Six views of one agent activity log: hierarchy, chronology, where time goes, metrics, model pricing, maintenance.">
  <meta property="og:image" content="https://frenamezian.github.io/logreporter/assets/img/og-card.png">
  <meta name="twitter:card" content="summary_large_image">
"""

# Ordered replacements applied to every text column of activity_logs.db when
# exporting the live database into _build/app/. Specific path prefixes run
# before broader username/email patterns so path structure stays readable.
REDACTIONS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"C:[/\\]Users[/\\]lotra[/\\]\.gemini[/\\]antigravity-ide", re.I), "~/.gemini/antigravity-ide"),
    (re.compile(r"C:[/\\]Users[/\\]lotra[/\\]\.gemini[/\\]antigravity", re.I), "~/.gemini/antigravity"),
    (re.compile(r"C:[/\\]Users[/\\]lotra[/\\]Documents[/\\]github[/\\]", re.I), "/workspace/"),
    (re.compile(r"C:[/\\]Users[/\\]lotra[/\\]Documents[/\\]", re.I), "/workspace/"),
    (re.compile(r"C:[/\\]Users[/\\]lotra[/\\]Documents\b", re.I), "/workspace"),
    (re.compile(r"(?:[A-Za-z]:[/\\]Users|/Users)[/\\]lotra\b", re.I), "/home/user"),
    (re.compile(r"pytest-of-lotra", re.I), "pytest-of-user"),
    (re.compile(r"laurent\.tran@gmail\.com", re.I), "owner@example.com"),
    (re.compile(r"'seed',\s*'laurent\.tran'", re.I), "'seed','owner'"),
    (re.compile(r"\bLaurent\s+Tran\b", re.I), "the owner"),
    (re.compile(r"\blaurent\.tran\b", re.I), "owner"),
    (re.compile(r"coolify\.lespirant\.com", re.I), "coolify.example.com"),
    (re.compile(r"\+49\s*152\s*26729110"), "+49 000 00000000"),
    (re.compile(r"\+4915226729110"), "+490000000000"),
    (re.compile(r"info@lespirant\.com", re.I), "info@example.com"),
    (re.compile(r"\bHRB\s*77926\b", re.I), "HRB 00000"),
    (re.compile(r"\blotra\b", re.I), "user"),
]


def sanitize_text(val: str) -> str:
    out = val
    for pat, repl in REDACTIONS:
        out = pat.sub(repl, out)
    return out


def export() -> None:
    head = subprocess.run(
        ["git", "-C", str(REPO), "rev-parse", "--short", "HEAD"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()

    if APP.exists():
        shutil.rmtree(APP)
    APP.mkdir(parents=True)

    with tempfile.TemporaryDirectory() as tmp:
        tar = Path(tmp) / "app.tar"
        with tar.open("wb") as fh:
            subprocess.run(
                ["git", "-C", str(REPO), "archive", "HEAD", *PATHS],
                stdout=fh, check=True,
            )
        with tarfile.open(tar) as t:
            t.extractall(APP)

    print(f"exported {REPO.name}@{head} -> {APP.relative_to(REPO)}")


def inject_home() -> None:
    p = APP / "index.html"
    html = p.read_text(encoding="utf-8")
    if MARKER in html:
        print("  LR_HOME already present, leaving it alone")
        return
    needle = "</head>"
    if needle not in html:
        sys.exit("app/index.html has no </head> to inject before")
    p.write_text(html.replace(needle, INJECT + needle, 1), encoding="utf-8", newline="\n")
    print("  injected LR_HOME")


def copy_seed() -> None:
    live = REPO / "activity_logs.db"
    seed = REPO / "seed" / "activity_logs.db"
    src = live if live.exists() and live.stat().st_size > 0 else seed
    if not src.exists():
        sys.exit(f"missing {src} — run seed/init_db.sh first")

    dst = APP / "activity_logs.db"
    if dst.exists():
        dst.unlink()

    # Use SQLite's online backup API from a read-only connection so a live WAL
    # database is snapshotted cleanly without touching the root file.
    src_con = sqlite3.connect(f"file:{src.as_posix()}?mode=ro", uri=True)
    dst_con = sqlite3.connect(dst)
    with dst_con:
        src_con.backup(dst_con)
    src_con.close()

    # Ensure standard journal mode (no -wal/-shm sidecars in _build/app/) and
    # scrub all text columns in place, then VACUUM so no prior strings linger
    # in unallocated page slack.
    dst_con.execute("PRAGMA journal_mode=DELETE")
    cols = [r[1] for r in dst_con.execute("PRAGMA table_info(logs)") if r[1] != "id"]
    select_sql = f"SELECT id, {', '.join(cols)} FROM logs"
    updates = []
    for row in dst_con.execute(select_sql):
        rid = row[0]
        vals = list(row[1:])
        new_vals = [sanitize_text(v) if isinstance(v, str) else v for v in vals]
        if new_vals != vals:
            updates.append((*new_vals, rid))

    if updates:
        set_clause = ", ".join(f"{c} = ?" for c in cols)
        dst_con.executemany(f"UPDATE logs SET {set_clause} WHERE id = ?", updates)
        dst_con.commit()

    dst_con.execute("VACUUM")
    total_rows = dst_con.execute("SELECT COUNT(*) FROM logs").fetchone()[0]
    dst_con.close()
    print(f"  activity_logs.db  {dst.stat().st_size:,} bytes ({total_rows:,} rows, {len(updates)} rows sanitized)")


def main() -> None:
    export()
    inject_home()
    copy_seed()


if __name__ == "__main__":
    main()
