"""The exported demo ships the vendored font and the new favicon.

    python tasks/checks/check_demo_export.py

WHY THIS EXISTS
---------------
export_app.py copies an explicit allow-list of paths out of git HEAD — "kept
explicit so a stray file in the repo cannot wander into the published site".
The cost of that design is the failure it makes possible: a NEW directory the
app now needs is not copied, and nothing complains. Task 0010 added exactly
such a directory, `fonts/`, holding the Archivo the light theme's chrome titles
load. Omit it and the demo still builds, still opens, still looks broadly
right — it silently falls back to system-ui, which is the restyle's most
visible single decision quietly not shipping.

The favicon assertion is the same shape one level over: favicon.svg is the
SOURCE (its own comment says so) and the demo ships a copy. Two files that must
be identical and are edited in one place are two files that drift.

The _build/ half is skipped, not failed, when there is no build present:
_build/ is gitignored and absent from a fresh clone, and a check that failed on
that would be reporting the absence of an artifact rather than a defect.

WHAT WOULD MAKE THIS RED
  - dropping "fonts" from export_app.py's PATHS
  - editing the generated favicon copy instead of the source
  - a build that predates the font vendoring
"""

import hashlib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _lib import REPO, Check, read  # noqa: E402

EXPORTER = "site/tools/export_app.py"
BUILD_APP = REPO / "site" / "_build" / "app"
FONT = "fonts/archivo-latin-var.woff2"


def sha(path: Path) -> str:
    """Content hash of a binary file, byte for byte."""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def text_sha(path: Path) -> str:
    """Content hash of a TEXT file with line endings normalised to LF.

    export_app.py ships the demo via `git archive HEAD`, and on a checkout with
    core.autocrlf=true git rewrites every text file it archives to CRLF —
    style.css, docs/*.html and favicon.svg in the build all carry CRLF while
    their sources carry LF. That conversion is the export pipeline working as
    designed, it predates Task 0010, and it is invisible to a browser. Binary
    assets are NOT converted, which is why the woff2 above is compared byte for
    byte and this is not: comparing an SVG's raw bytes across `git archive`
    measures the checkout's autocrlf setting, not whether the demo shipped the
    right drawing.
    """
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def main() -> None:
    c = Check("the exported demo carries the Task 0010 assets")

    src = read(EXPORTER)
    m = re.search(r"^PATHS\s*=\s*\[(.*?)\]", src, re.S | re.M)
    if not c.expect(m is not None, f"{EXPORTER} declares a PATHS allow-list"):
        c.done()
    paths = re.findall(r'"([^"]+)"', m.group(1))
    c.note(f"PATHS = {paths}")
    c.expect("fonts" in paths,
             "PATHS includes \"fonts\" — without it the demo falls back to system-ui")
    for required in ("index.html", "style.css", "favicon.svg", "components", "docs"):
        c.expect(required in paths, f"PATHS still includes {required!r}")

    # The font the exporter is asked to ship exists in the tracked tree.
    c.expect((REPO / FONT).exists(), f"{FONT} is present in the repo (the app's copy)")
    c.expect((REPO / "site/assets/fonts/archivo-latin-var.woff2").exists(),
             "site/assets/fonts/archivo-latin-var.woff2 is present (the landing's copy)")
    c.expect(sha(REPO / FONT) == sha(REPO / "site/assets/fonts/archivo-latin-var.woff2"),
             "both vendored copies of Archivo are the same file")

    # ---- the built demo, when one exists ---------------------------------
    if not BUILD_APP.exists():
        c.skip(f"{BUILD_APP.relative_to(REPO)} does not exist — run `python site/build.py` "
               f"to check the built demo too")
        c.done()

    built_font = BUILD_APP / FONT
    c.expect(built_font.exists(), f"_build/app/{FONT} was exported")
    if built_font.exists():
        c.expect(sha(built_font) == sha(REPO / FONT),
                 f"_build/app/{FONT} is identical to the repo copy")

    built_icon = BUILD_APP / "favicon.svg"
    c.expect(built_icon.exists(), "_build/app/favicon.svg was exported")
    if built_icon.exists():
        c.expect(text_sha(built_icon) == text_sha(REPO / "favicon.svg"),
                 "_build/app/favicon.svg is identical to the root favicon.svg "
                 "(the source), line endings aside")
        # The thing the identity is actually protecting: the demo's tab icon
        # carries the Paper & Ink brand red, not the pre-restyle drawing.
        c.expect("#ec3013" in built_icon.read_text(encoding="utf-8"),
                 "_build/app/favicon.svg carries the brand red — the build is not pre-restyle")

    c.done()


if __name__ == "__main__":
    main()
