"""
Build site/assets/img/og-card.png — the image link unfurlers show.

    python site/tools/build_og_card.py

Why this is not a screenshot. A card renders at roughly 524px wide in Slack, X
and LinkedIn. The hero screenshot is 1800px of dense dashboard; at 524px every
label, agent name and table row collapses into grey mush, and nothing in the
image says what the product is called. So the card is drawn instead: the mark,
the name, the promise, and the category bar — the same four things a person
would take from the page in one second.

It is 1200x630 because that is the box every platform crops to (1.91:1). The
hero is 2.01:1, so platforms were shaving a strip off it as well.

PNG, not WebP: several unfurlers still will not render a WebP card, and this is
the one image on the site whose whole job is to be rendered by someone else's
server. It is flat colour and text, so PNG is also the right format on merit —
about 40 KB, well under every platform's limit.

Colours and proportions are the Paper & Ink tokens (the light theme, which is
the default and the brand's face since Task 0010), copied from
assets/css/site.css. This script is the one place on the site that cannot read
them, for the same reason favicon.svg carries two hexes: it has no stylesheet.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from _paths import SITE

OUT = SITE / "assets" / "img" / "og-card.png"

W, H = 1200, 630
PAD = 84

# --- Paper & Ink tokens, from assets/css/site.css (Task 0010) ----------------
# The card is paper with ink type and the red as the only saturated color —
# the landing's light theme, which is now the default and the brand's face.
BG = (243, 242, 242)       # --bg (paper)
TEXT = (32, 30, 29)        # --ink
DIM = (111, 106, 103)      # --muted
ACCENT = (236, 48, 19)     # --accent (the red)
ACCENT_DEEP = (179, 36, 16)  # --accent-deep: red readable as text on paper
BORDER = (32, 30, 29)      # rules are ink

# The five categories in the landing's red-family dialect (the brief's §2),
# in the product's stacking order: activity -> issue/decision pair ->
# neutral -> GitHub/mid -> idle. Idle is hatched, never solid — absence must
# not read as another kind of work.
ACTIVITY, ISSUE, DECISION, GITHUB = (236, 48, 19), (122, 26, 12), (58, 55, 53), (138, 133, 130)
IDLE_HATCH = (138, 133, 130)   # the hatch line color; the ground shows through

# Font stack, in preference order. DejaVu ships with Pillow and is the floor, so
# the card always builds — on a machine with none of the others it simply looks
# plainer. Never fall back to load_default(): it is a 10px bitmap and would
# silently produce an unreadable card.
FACES = {
    "bold": ["segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf",
             "/System/Library/Fonts/Helvetica.ttc",
             "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
    "regular": ["segoeui.ttf", "arial.ttf", "DejaVuSans.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"],
}


def font(kind: str, size: int) -> ImageFont.FreeTypeFont:
    for name in FACES[kind]:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    raise SystemExit(
        f"no {kind} font found — install DejaVu, or add a face to FACES in {Path(__file__).name}"
    )


def hatch_seg(w, h, line, spacing=8, width=3):
    """A w-by-h tile of 45-degree hatch lines — the idle texture. Drawn on
    its own layer so the diagonals can overshoot and be clipped by the tile
    edge instead of erasing neighbouring segments."""
    seg = Image.new("RGBA", (max(w, 1), max(h, 1)), (0, 0, 0, 0))
    sd = ImageDraw.Draw(seg)
    x = -h
    while x < w + h:
        sd.line([(x, h), (x + h, 0)], fill=line, width=width)
        x += spacing
    return seg


def flat_bar(d, x, y, w, h, segments):
    """The category bar: hard-edged segments; "HATCH" draws the idle texture."""
    strip = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(strip)
    cursor = 0
    for frac, colour in segments:
        seg_w = round(w * frac)
        if colour == "HATCH":
            seg = hatch_seg(seg_w, h, IDLE_HATCH)
            strip.paste(seg, (cursor, 0), seg)
        else:
            sd.rectangle([cursor, 0, cursor + seg_w, h], fill=colour)
        cursor += seg_w
    if segments[-1][1] != "HATCH":
        sd.rectangle([cursor, 0, w, h], fill=segments[-1][1])
    d._image.paste(strip, (x, y), strip)


def mark(img, x, y, size):
    """The letter L whose foot is a stacked category bar — the app's own mark.

    Redrawn here rather than rasterised from log-header.js, because that SVG
    fills itself from CSS variables this script cannot reach. The proportions
    are the SVG's, scaled: a 32-unit box, a 5.6-unit stroke, square corners.
    """
    u = size / 32
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    stem_w, foot_h = 5.6 * u, 5.6 * u
    left, top = 5 * u, 4 * u
    foot_top, foot_right = 22.4 * u, 29 * u

    # The foot, red-family: brand red -> pair -> neutral -> mid -> hatched idle.
    foot_w = foot_right - left
    segs = [(0.29, ACCENT), (0.27, ISSUE), (0.19, DECISION), (0.15, GITHUB), (0.10, "HATCH")]
    strip = Image.new("RGBA", (round(foot_w), round(foot_h)), (0, 0, 0, 0))
    sd = ImageDraw.Draw(strip)
    cur = 0
    for frac, colour in segs:
        w = round(foot_w * frac)
        if colour == "HATCH":
            seg = hatch_seg(w, round(foot_h), IDLE_HATCH, spacing=5, width=2)
            strip.paste(seg, (cur, 0), seg)
        else:
            sd.rectangle([cur, 0, cur + w, foot_h], fill=colour)
        cur += w
    layer.paste(strip, (round(left), round(foot_top)), strip)

    # The stem, drawn over the foot's left end so the corner reads as one
    # shape. Square, like every other corner in Paper & Ink.
    d.rectangle([left, top, left + stem_w, foot_top + foot_h], fill=ACCENT)

    img.paste(layer, (x, y), layer)


def build() -> Path:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # A hairline frame. Cards are shown on white and on near-black chat grounds;
    # without an edge the dark card bleeds into a dark client.
    d.rectangle([0, 0, W - 1, H - 1], outline=BORDER, width=2)

    # Laid out from the bottom up. The category bar anchors the foot of the card
    # and everything above is measured back from it — placing the bar last, as
    # whatever space was left over, is what let the qualifier line collide with
    # it in the first draft.
    bar_h = 16
    bar_y = H - 56 - bar_h

    # --- the category bar, across the foot ---
    flat_bar(d, PAD, bar_y, W - PAD * 2, bar_h,
             [(0.34, ACTIVITY), (0.11, ISSUE), (0.24, DECISION), (0.17, GITHUB), (0.14, "HATCH")])

    # --- the qualifier line ---
    d.text((PAD, bar_y - 62), "Local  ·  one SQLite file  ·  no account  ·  MIT",
           font=font("regular", 27), fill=DIM)

    # --- the tagline ---
    d.text((PAD, bar_y - 190), "Most tools watch your agents work.",
           font=font("regular", 34), fill=ACCENT_DEEP)
    d.text((PAD, bar_y - 144), "This one just asks them.",
           font=font("regular", 34), fill=ACCENT_DEEP)

    # --- the promise ---
    d.text((PAD, bar_y - 358), "See what your subagents", font=font("bold", 62), fill=TEXT)
    d.text((PAD, bar_y - 282), "actually did — and what it cost", font=font("bold", 62), fill=TEXT)

    # --- mark + wordmark ---
    mark(img, PAD, bar_y - 494, 96)
    d.text((PAD + 96 + 28, bar_y - 472), "LogReporter", font=font("bold", 54), fill=TEXT)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    return OUT


if __name__ == "__main__":
    p = build()
    print(f"  {p.name:<34} {p.stat().st_size:>9,} bytes  {W}x{H}")
