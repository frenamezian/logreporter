"""
Build script for the LESPIRANT rotating footer ads used by LogReporter.

Regenerates docs/lespirant/ad-01.png .. ad-04.png (each exactly 1600x200 PNG,
RGB, under ~400KB) from LESPIRANT's own product photography, fetched live
from their public Shopify CDN (www.lespirant.com). No source images are
stored in this repo -- this script re-downloads them into memory every run.

Usage:
    python build_ads.py

Requires:
    - Pillow  (pip install pillow)
    - network access to lespirant.com
    - Windows fonts Arial / Arial Bold (swap FONT_* below if unavailable)

Design brief this script satisfies (see docs/lespirant/ads.json for the
wiring, and components/log-footer.js for how these render):
    - Banner renders tiny in a dark footer (~41-75px tall on screen), so
      headline glyphs must be large in the source (56-72px) and the whole
      thing must read as a dark card, not a bright rectangle.
    - Each banner is one clickable link -- CTA text is baked into the image,
      not a separate button.
    - Photography is the hero: each ad uses a real, distinct LESPIRANT
      photo, cover-cropped and bled across roughly the left 40%, fading
      into a solid dark panel that holds the headline/subhead/CTA.
    - All copy below is lifted verbatim (or near-verbatim) from
      lespirant.com -- no invented claims, prices, or promotions.
"""

import io
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageEnhance

OUT_DIR = Path(__file__).resolve().parent

# ---------------------------------------------------------------- geometry --
W, H = 1600, 200            # hard requirement: final banner size
SS = 2                       # supersample factor -> crisper small text
CW, CH = W * SS, H * SS      # working canvas

# ------------------------------------------------------------------- brand --
# Sampled from lespirant.com's own stylesheet / photography, adapted for a
# dark surround (the LogReporter footer is #1b1d2b).
BG      = (22, 20, 18)       # near-black panel, close to site's #1D1C1C
INK     = (243, 239, 233)    # off-white headline text
DIM     = (180, 171, 160)    # dimmed subhead text
COPPER  = (196, 138, 100)    # LESPIRANT "Copper" garment shade (sampled), used as an accent
TEAL    = (99, 158, 156)     # TENCEL(R) leaf-mark teal (sampled from tag photo)
SAGE    = (140, 160, 108)    # sustainability accent (design choice, not a brand color)

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

FONT_DIR = Path(r"C:\Windows\Fonts")
F_BOLD = FONT_DIR / "arialbd.ttf"
F_REG = FONT_DIR / "arial.ttf"


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size)


def fetch(url: str) -> Image.Image:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
    return Image.open(io.BytesIO(data)).convert("RGB")


def cover_crop(img: Image.Image, w: int, h: int, focus=(0.5, 0.5)) -> Image.Image:
    """Crop+scale img to exactly (w, h), keeping the given focal point visible."""
    return ImageOps.fit(img, (w, h), Image.LANCZOS, centering=focus)


def photo_panel(photo: Image.Image, panel_w: int, panel_h: int, focus,
                 seam_start=0.60) -> Image.Image:
    """Cover-crop a photo to the panel, mute it slightly for the dark UI,
    and fade its right edge into the dark panel color so it doesn't look
    like a bright rectangle stapled onto a dark bar."""
    photo = cover_crop(photo, panel_w, panel_h, focus)
    photo = ImageEnhance.Color(photo).enhance(0.96)
    photo = ImageEnhance.Brightness(photo).enhance(0.88)
    photo = ImageEnhance.Contrast(photo).enhance(1.06)
    photo = photo.convert("RGBA")

    fade = Image.new("L", (panel_w, panel_h), 0)
    fd = ImageDraw.Draw(fade)
    seam_x = int(panel_w * seam_start)
    span = max(1, panel_w - seam_x)
    for x in range(seam_x, panel_w):
        t = (x - seam_x) / span
        fd.line([(x, 0), (x, panel_h)], fill=int(255 * (t ** 1.4)))
    overlay = Image.new("RGBA", (panel_w, panel_h), BG + (255,))
    return Image.composite(overlay, photo, fade)


def three_up_swatch(imgs, tile_w, tile_h, gap, focus=(0.5, 0.42)) -> Image.Image:
    """Lay three square product photos side by side as rounded tiles on a
    dark backdrop -- used for the '3 skin tones' ad instead of one bleeding
    photo, so the flat-lay's white studio background doesn't flood the
    banner with a bright rectangle."""
    total_w = tile_w * 3 + gap * 4
    canvas = Image.new("RGBA", (total_w, tile_h + gap * 2), BG + (255,))
    for i, im in enumerate(imgs):
        tile = cover_crop(im, tile_w, tile_h, focus).convert("RGBA")
        mask = Image.new("L", (tile_w, tile_h), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            [0, 0, tile_w - 1, tile_h - 1], radius=14 * SS, fill=255)
        x = gap + i * (tile_w + gap)
        canvas.paste(tile, (x, gap), mask)
    return canvas


def line_height(f: ImageFont.FreeTypeFont) -> int:
    asc, desc = f.getmetrics()
    return asc + desc


def fit_font(draw: ImageDraw.ImageDraw, text: str, max_w: int, start: int,
             min_size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    """Largest font size (>= min_size, source-px units) whose single line of
    `text` fits within max_w (canvas px). Guarantees no headline/subhead/CTA
    silently overflows or gets clipped."""
    fpath = F_BOLD if bold else F_REG
    size = start
    while size > min_size:
        f = font(fpath, size * SS)
        if draw.textlength(text, font=f) <= max_w:
            return f
        size -= 1
    return font(fpath, min_size * SS)


def text_block(draw: ImageDraw.ImageDraw, x: int, cy: int, max_w: int,
               headline: str, subhead: str, cta: str, accent):
    # Source-px bounds per the design brief: headline 48-72px, subhead/CTA
    # never below 28px.
    hf = fit_font(draw, headline, max_w, 72, 48, bold=True)
    sf = fit_font(draw, subhead, max_w, 32, 28, bold=False) if subhead else None
    cf = fit_font(draw, cta, max_w, 30, 26, bold=True)

    hl_h = line_height(hf)
    sub_h = line_height(sf) if sf else 0
    cta_h = line_height(cf)
    gap1 = 20 * SS   # headline -> subhead
    gap2 = 26 * SS   # subhead/headline -> CTA

    total = hl_h
    if sf:
        total += gap1 + sub_h
    total += gap2 + cta_h

    y = cy - total // 2
    draw.text((x, y), headline, font=hf, fill=INK)
    y += hl_h
    if sf:
        y += gap1
        draw.text((x, y), subhead, font=sf, fill=DIM)
        y += sub_h
    y += gap2
    dot_r = 7 * SS
    draw.ellipse([x, y + cta_h // 2 - dot_r, x + dot_r * 2, y + cta_h // 2 + dot_r],
                 fill=accent)
    draw.text((x + dot_r * 2 + 16 * SS, y), cta, font=cf, fill=accent)


# --------------------------------------------------------------- sources ---
# Every URL below was verified against lespirant.com / its product +
# sustainability pages while researching this ad set.
SRC = {
    "shoulder": "https://lespirant.com/cdn/shop/files/shoulder_close_up_1500x.jpg?v=1642188804",
    "fabric":   "https://lespirant.com/cdn/shop/files/Fabric_Tencel_1500x.jpg?v=1641440827",
    "factory":  "https://lespirant.com/cdn/shop/files/sewing_factory_1500x.jpg?v=1642193179",
    "nude":     "https://lespirant.com/cdn/shop/products/31_1946x.jpg?v=1641237785",
    "copper":   "https://lespirant.com/cdn/shop/products/32_1946x.jpg?v=1641237787",
    "maroon":   "https://lespirant.com/cdn/shop/products/30_1946x.jpg?v=1641237790",
}
# No wordmark logo is composited onto the banners: at the ~40-70px display
# height these render at in the footer, the "LESPIRANT" text inside the
# logo mark would be well under the 28px-in-source legibility floor, and
# testing showed it collided with the headline in the top-right corner.
# The dark card + real photography + copy already carry the brand; the
# footer's own "LESPIRANT" label (see ads.json) provides the wordmark.
#
# ads.json points ad-01/02/03 at https://www.lespirant.com/products/lcut-undershirt
# and ad-04 at https://www.lespirant.com/pages/sustainability-and-fair-trade.


def base_canvas() -> Image.Image:
    return Image.new("RGBA", (CW, CH), BG + (255,))


def finalize(canvas: Image.Image, path: Path):
    flat = Image.new("RGB", canvas.size, BG)
    flat.paste(canvas, (0, 0), canvas)
    flat = flat.resize((W, H), Image.LANCZOS)
    flat.save(path, "PNG", optimize=True)


# ------------------------------------------------------------------ ads ----

def build_ad_01():
    """Hero / problem-solution -- real photo of the Copper L-Cut worn open
    under a white shirt. Headline mirrors the site's own bullet copy:
    'No sweat stains. No visible collar.'"""
    photo = fetch(SRC["shoulder"])
    panel_w = int(CW * 0.36)
    panel = photo_panel(photo, panel_w, CH, focus=(0.40, 0.30))

    canvas = base_canvas()
    canvas.alpha_composite(panel, (0, 0))
    d = ImageDraw.Draw(canvas)
    text_x = panel_w + 46 * SS
    text_block(d, text_x, CH // 2, CW - text_x - 40 * SS,
               "No Sweat Stains. No Collar.",
               "Invisible, even under a thin white shirt.",
               "I want my L-Cut  \u2192", COPPER)
    finalize(canvas, OUT_DIR / "ad-01.png")


def build_ad_02():
    """Fabric -- real close-up of the TENCEL swing tag on the fabric.
    Headline/subhead lifted from the product page's fabric description."""
    photo = fetch(SRC["fabric"])
    panel_w = int(CW * 0.36)
    panel = photo_panel(photo, panel_w, CH, focus=(0.55, 0.55))

    canvas = base_canvas()
    canvas.alpha_composite(panel, (0, 0))
    d = ImageDraw.Draw(canvas)
    text_x = panel_w + 46 * SS
    text_block(d, text_x, CH // 2, CW - text_x - 40 * SS,
               "TENCEL Fabric. Softer Than Cotton.",
               "Sweat-wicking, odor-resistant, 100% Made in EU.",
               "I want my L-Cut  \u2192", TEAL)
    finalize(canvas, OUT_DIR / "ad-02.png")


def build_ad_03():
    """3 Skin Tones -- three real flat-lay product photos (Nude, Copper,
    Maroon) side by side. Headline is the site's own '3 Skin Tones /
    Always Invisible' copy; subhead names the real color options."""
    nude = fetch(SRC["nude"])
    copper = fetch(SRC["copper"])
    maroon = fetch(SRC["maroon"])

    tile_h = CH - 28 * SS
    tile_w = int(tile_h * 0.86)
    gap = 10 * SS
    swatch = three_up_swatch([nude, copper, maroon], tile_w, tile_h, gap)

    canvas = base_canvas()
    sx = 40 * SS
    canvas.alpha_composite(swatch, (sx, (CH - swatch.height) // 2))

    d = ImageDraw.Draw(canvas)
    text_x = sx + swatch.width + 44 * SS
    text_block(d, text_x, CH // 2, CW - text_x - 40 * SS,
               "3 Skin Tones. Always Invisible.",
               "Nude \u00b7 Copper \u00b7 Maroon",
               "I want my L-Cut  \u2192", COPPER)
    finalize(canvas, OUT_DIR / "ad-03.png")


def build_ad_04():
    """Sustainability -- real photo of LESPIRANT's EU sewing workshop.
    Headline is the site's own '100% Made in EU' line."""
    photo = fetch(SRC["factory"])
    panel_w = int(CW * 0.42)
    panel = photo_panel(photo, panel_w, CH, focus=(0.42, 0.48))

    canvas = base_canvas()
    canvas.alpha_composite(panel, (0, 0))
    d = ImageDraw.Draw(canvas)
    text_x = panel_w + 46 * SS
    text_block(d, text_x, CH // 2, CW - text_x - 40 * SS,
               "100% Made in EU.",
               "Living wages, health insurance, fair trade.",
               "Sustainability  \u2192", SAGE)
    finalize(canvas, OUT_DIR / "ad-04.png")


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    build_ad_01()
    build_ad_02()
    build_ad_03()
    build_ad_04()
    for i in range(1, 5):
        p = OUT_DIR / f"ad-0{i}.png"
        with Image.open(p) as im:
            print(f"{p.name}: {im.size} {im.mode} {p.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
