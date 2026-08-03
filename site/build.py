"""
Assemble the published site into site/_build/.

    python site/build.py              assemble _build/
    python site/build.py --images     regenerate site/assets/img/ first
    python site/build.py --og-card    redraw the link-preview card first

_build/ is gitignored: it is output, and it is rebuilt from scratch every run.
Publish it with `python site/publish.py`.

The two optional steps write into *tracked* files under site/assets/img/, which
is why they are opt-in rather than part of every build. Run them when a
screenshot in docs/img changes (--images), or when the mark, the headline or the
tagline changes (--og-card), and commit what they produce.

No bundler, no static-site generator, no npm. This copies files and shells out
to two other stdlib scripts; Pillow is needed only for the two opt-in steps.
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "tools"))
from _paths import BUILD, REPO, SITE, TOOLS  # noqa: E402

# The authored site, copied verbatim. `app` is deliberately absent: the tracked
# site/app/index.html is a placeholder for people browsing a clone, and
# export_app.py replaces the whole directory with the real dashboard.
COPY = [
    "index.html",
    "404.html",
    "robots.txt",
    "sitemap.xml",
    "llms.txt",
    ".nojekyll",
    "assets",
]


def run(script: str) -> None:
    # flush: our stdout is block-buffered when piped, the child's is not, so
    # without this the child's output overtakes the heading that introduces it.
    print(f"\n$ python site/tools/{script}", flush=True)
    subprocess.run([sys.executable, str(TOOLS / script)], check=True)


def copy_authored() -> None:
    if BUILD.exists():
        shutil.rmtree(BUILD)
    BUILD.mkdir(parents=True)

    for name in COPY:
        src, dst = SITE / name, BUILD / name
        if not src.exists():
            sys.exit(f"missing {src.relative_to(REPO)}")
        if src.is_dir():
            shutil.copytree(src, dst)
            n = sum(1 for _ in src.rglob("*") if _.is_file())
            print(f"  {name + '/':<16} {n:>3} files")
        else:
            shutil.copy2(src, dst)
            print(f"  {name:<16} {src.stat().st_size:>9,} bytes")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--images", action="store_true",
                    help="regenerate site/assets/img/ from docs/ (tracked output)")
    ap.add_argument("--og-card", action="store_true",
                    help="redraw site/assets/img/og-card.png (tracked output)")
    args = ap.parse_args()

    if args.images:
        run("build_assets.py")
    if args.og_card:
        run("build_og_card.py")

    print("\ncopying the authored site")
    copy_authored()

    run("export_app.py")
    run("make_demo_usage.py")

    files = sum(1 for p in BUILD.rglob("*") if p.is_file())
    size = sum(p.stat().st_size for p in BUILD.rglob("*") if p.is_file())
    print(f"\n{BUILD.relative_to(REPO)}: {files} files, {size:,} bytes")
    print("publish with: python site/publish.py")


if __name__ == "__main__":
    main()
