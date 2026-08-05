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

  activity_logs.db   seed/activity_logs.db (synthetic sample rows).

The usage sibling is NOT copied from the repository root: see make_demo_usage.py,
which generates a synthetic one. Publishing the real token_usage.db would expose
actual repository names, branch names and working patterns.
"""

import shutil
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
    src = REPO / "seed" / "activity_logs.db"
    if not src.exists():
        sys.exit(f"missing {src} — run seed/init_db.sh first")
    shutil.copy2(src, APP / "activity_logs.db")
    print(f"  activity_logs.db  {src.stat().st_size:,} bytes")


def main() -> None:
    export()
    inject_home()
    copy_seed()


if __name__ == "__main__":
    main()
