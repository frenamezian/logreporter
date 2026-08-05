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

Colours and proportions are the dark theme's tokens, copied from
assets/css/site.css. This script is the one place on the site that cannot read
them, for the same reason favicon.svg carries two hexes: it has no stylesheet.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from _paths import SITE

OUT = SITE / "assets" / "img" / "og-card.png"

W, H = 1200, 630
PAD = 84

# --- dark theme tokens, from assets/css/site.css -----------------------------
BG = (15, 17, 21)          # --bg
TEXT = (236, 237, 240)     # --text, lifted slightly: it sits on a card, not a page
DIM = (154, 160, 178)      # --text-dim
ACCENT = (91, 141, 239)    # --accent
ACCENT_2 = (142, 182, 255) # --accent-2
BORDER = (42, 45, 58)      # --border

# The five categories, in the stacking order used on every bar in the product:
# activity -> issue -> decision -> GitHub -> idle. Issue red is deliberately
# absent from the MARK (a logo carrying it would read as a permanent alarm), but
# the full bar across the foot of the card is a chart, not the logo, so it keeps
# the honest order and all five.
ACTIVITY, ISSUE, DECISION, GITHUB = (76, 175, 80), (244, 67, 54), (33, 150, 243), (79, 195, 247)
IDLE = (72, 78, 96)
# Idle inside the 96px mark needs to be lighter than idle inside the 1030px bar,
# for the reason --hatch-strong exists in the stylesheet: at mark scale the real
# idle value is so close to --bg that the segment reads as a smudge on the end
# of the foot rather than as a fifth category.
IDLE_MARK = (108, 115, 138)

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


def rounded_bar(d, x, y, w, h, segments, radius):
    """The category bar: segments in a rounded pill, drawn by clipping."""
    strip = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(strip)
    cursor = 0
    for frac, colour in segments:
        seg_w = round(w * frac)
        sd.rectangle([cursor, 0, cursor + seg_w, h], fill=colour)
        cursor += seg_w
    sd.rectangle([cursor, 0, w, h], fill=segments[-1][1])

    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=255)
    strip.putalpha(mask)
    d._image.paste(strip, (x, y), strip)


def mark(img, x, y, size):
    """The letter L whose foot is a stacked category bar — the app's own mark.

    Redrawn here rather than rasterised from log-header.js, because that SVG
    fills itself from CSS variables this script cannot reach. The proportions
    are the SVG's, scaled: a 32-unit box, a 5.6-unit stroke, a 2.8 radius.
    """
    u = size / 32
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    stem_w, foot_h = 5.6 * u, 5.6 * u
    left, top = 5 * u, 4 * u
    foot_top, foot_right = 22.4 * u, 29 * u
    r = 2.8 * u

    # The foot: activity -> decision -> GitHub -> idle, skipping issue red.
    foot_w = foot_right - left
    segs = [(0.29, ACCENT), (0.27, ACTIVITY), (0.19, DECISION), (0.15, GITHUB), (0.10, IDLE_MARK)]
    strip = Image.new("RGBA", (round(foot_w), round(foot_h)), (0, 0, 0, 0))
    sd = ImageDraw.Draw(strip)
    cur = 0
    for frac, colour in segs:
        w = round(foot_w * frac)
        sd.rectangle([cur, 0, cur + w, foot_h], fill=colour)
        cur += w
    sd.rectangle([cur, 0, foot_w, foot_h], fill=segs[-1][1])
    m = Image.new("L", strip.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, strip.width - 1, strip.height - 1],
                                        radius=r, fill=255)
    strip.putalpha(m)
    layer.paste(strip, (round(left), round(foot_top)), strip)

    # The stem, drawn over the foot's left end so the corner reads as one shape.
    d.rounded_rectangle([left, top, left + stem_w, foot_top + foot_h], radius=r, fill=ACCENT)

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
    rounded_bar(d, PAD, bar_y, W - PAD * 2, bar_h,
                [(0.34, ACTIVITY), (0.11, ISSUE), (0.24, DECISION), (0.17, GITHUB), (0.14, IDLE)],
                radius=bar_h // 2)

    # --- the qualifier line ---
    d.text((PAD, bar_y - 62), "Local  ·  one SQLite file  ·  no account  ·  MIT",
           font=font("regular", 27), fill=DIM)

    # --- the tagline ---
    d.text((PAD, bar_y - 190), "Most tools watch your agents work.",
           font=font("regular", 34), fill=ACCENT_2)
    d.text((PAD, bar_y - 144), "This one just asks them.",
           font=font("regular", 34), fill=ACCENT_2)

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
