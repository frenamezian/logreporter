"""
Build site/assets/img/ for the landing page, from the screenshots in docs/.

    python site/tools/build_assets.py

Its output is generated, but it is *tracked* rather than gitignored: it is the
landing page's content, and site/index.html has to open from a fresh clone by
double-clicking it, images and all. Re-run this and commit the result whenever a
screenshot in docs/img changes.

Produces, from docs/img and docs/lespirant:
  <name>.png/.webp          1800px wide  — hero / split figures
  <name>-thumb.png/.webp     560px wide  — page cards
  sponsor-lespirant-{800,1200}.{jpg,webp} — the sponsor ad (it is photography)
  favicon.svg                            — copied verbatim

Every raster is written twice, in its original format and in WebP, and the page
serves them through <picture>. The WebP is what essentially every visitor gets;
the PNG/JPEG is the fallback that keeps the page working in a browser that
cannot decode WebP, and — for the PNGs — the format the og:image must stay in,
because several link unfurlers still do not render a WebP card.

On format choice. Screenshots stay PNG rather than JPEG on purpose: JPEG
artifacts around small UI type are exactly what makes a product screenshot look
cheap. That argument does not carry over to WebP, which was measured rather than
assumed — at 1:1 on the densest crop of the hero (the agent tree, its badges and
its numeric columns) q90 is indistinguishable from the PNG, at 74% less weight.
The sponsor image is the opposite case: a photo collage, where PNG costs ~2.3 MB
and JPEG q90 costs ~190 KB for no visible difference.
"""

import shutil

from PIL import Image

from _paths import REPO, SITE

OUT = SITE / "assets" / "img"

# Screenshots the landing page uses. Any name not listed here is simply not copied.
SHOTS = [
    "timegoes-usage",   # the hero
    "metrics-usage",    # the tokens & cost split
    "hierarchy",
    "chronology",
    "timegoes",
    "metrics",
    "models",
    "maintenance",
]

SPONSOR = "post_lcut_problem_solutionn_1650x1141px.png"

HERO_W, THUMB_W = 1800, 560

# Card thumbnails are cropped to one aspect, not just scaled. Source screenshots
# range from 1.39 (the Models page, which is portrait-ish) to 2.02, and a grid of
# cards whose images disagree by that much reads as broken rather than varied.
# The crop is anchored top-left: on a UI screenshot that keeps the header and the
# left rail, which is what makes a page recognisable at 560px wide.
THUMB_ASPECT = 16 / 9
SPONSOR_WIDTHS = (800, 1200)

# One quality for every WebP, deliberately. q82 is another 20% smaller and also
# looked clean in the comparison, but the difference across the whole site is
# ~200 KB — not worth a second knob, or a later argument about which asset got
# which number. method=6 is the slowest, densest encoder setting; this script
# runs by hand a few times a year, so the seconds do not matter.
WEBP_QUALITY = 90
WEBP_METHOD = 6


def resize(img, width):
    if width >= img.width:
        return img.copy()
    height = round(img.height * width / img.width)
    return img.resize((width, height), Image.LANCZOS)


def write_pair(img, dst, fmt, **kw):
    """Write `img` as `dst` in its own format, and again as a sibling .webp.

    Both come from the same in-memory image, so the WebP is never a re-encode of
    an already-lossy file — encoding a JPEG to WebP would stack one codec's
    artifacts on the other's.
    """
    img.save(dst, fmt, **kw)
    web = dst.with_suffix(".webp")
    img.save(web, "WEBP", quality=WEBP_QUALITY, method=WEBP_METHOD)
    saved = 100 - 100 * web.stat().st_size / dst.stat().st_size
    print(f"  {dst.name:<34} {dst.stat().st_size:>9,} bytes"
          f"   {web.name:<35} {web.stat().st_size:>9,}  (-{saved:.0f}%)")


def thumb(img, width, aspect):
    """Scale to `width`, then crop from the top-left to `aspect`."""
    target_h = round(width / aspect)
    # Scale so the crop never has to upscale: cover the target box.
    scale = max(width / img.width, target_h / img.height)
    scaled = img.resize(
        (max(width, round(img.width * scale)), max(target_h, round(img.height * scale))),
        Image.LANCZOS,
    )
    return scaled.crop((0, 0, width, target_h))


def main():
    src = REPO

    OUT.mkdir(parents=True, exist_ok=True)

    for name in SHOTS:
        p = src / "docs" / "img" / f"{name}.png"
        if not p.exists():
            print(f"  skip (missing)  {name}.png")
            continue
        img = Image.open(p).convert("RGB")

        write_pair(resize(img, HERO_W), OUT / f"{name}.png", "PNG", optimize=True)
        write_pair(thumb(img, THUMB_W, THUMB_ASPECT), OUT / f"{name}-thumb.png",
                   "PNG", optimize=True)

    sponsor = src / "docs" / "lespirant" / SPONSOR
    if sponsor.exists():
        img = Image.open(sponsor).convert("RGB")
        for width in SPONSOR_WIDTHS:
            write_pair(resize(img, width), OUT / f"sponsor-lespirant-{width}.jpg",
                       "JPEG", quality=90, optimize=True, progressive=True)
    else:
        print(f"  skip (missing)  {SPONSOR}")

    favicon = src / "favicon.svg"
    if favicon.exists():
        shutil.copy2(favicon, OUT / "favicon.svg")
        print(f"  {'favicon.svg':<34} copied")


if __name__ == "__main__":
    main()
