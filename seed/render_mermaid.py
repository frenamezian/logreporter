#!/usr/bin/env python3
"""Render the guide's mermaid sources to checked-in SVG.

Why the SVG is pre-rendered instead of drawn in the browser
------------------------------------------------------------
The dashboard has exactly one remote dependency — sql.js — and the Installation
topic it illustrates tells the reader how to remove even that one and run fully
offline. Loading a ~3 MB diagramming library to draw a picture would contradict
both, so mermaid runs here, once, at authoring time. The shipped page gets a
self-contained SVG and no new script tag.

This is a development tool, not part of the app. It is the only thing in the
repository that needs the network and a browser, and nothing breaks if it is
never run: the SVGs it produces are checked in.

Requires:  pip install playwright && playwright install chromium

Usage:
  python seed/render_mermaid.py            # render every docs/img/*.mmd
  python seed/render_mermaid.py install-flow
"""
import re
import sys
from pathlib import Path

MERMAID_CDN = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs"
IMG_DIR = Path(__file__).resolve().parent.parent / "docs" / "img"

# The dashboard's own tokens, so a diagram cannot drift from the page around it.
THEME = {
    "background": "#12141c",
    "primaryColor": "#161821",
    "primaryTextColor": "#e6e6e6",
    "primaryBorderColor": "#2a2d3a",
    "lineColor": "#5b8def",
    "secondaryColor": "#1b1d2b",
    "tertiaryColor": "#1b1d2b",
    "fontFamily": "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    "fontSize": "14px",
}

# htmlLabels:false is not cosmetic. Mermaid's default wraps every label in a
# <foreignObject> containing HTML — including bare <br> tags — which is not
# well-formed XML. An <img> decodes an SVG as XML, so the default output fails
# to decode entirely: naturalWidth 0, and the figure renders as a 16px sliver.
# Native <text>/<tspan> labels keep the file parseable and self-contained.
PAGE = """<!doctype html><html><body><div id="out"></div><script type="module">
import mermaid from '%s';
mermaid.initialize({ startOnLoad: false, theme: 'base', themeVariables: %s,
                     htmlLabels: false,
                     flowchart: { htmlLabels: false, curve: 'basis',
                                  nodeSpacing: 40, rankSpacing: 46,
                                  wrappingWidth: 320 } });
const { svg } = await mermaid.render('d', %s);
document.getElementById('out').innerHTML = svg;
window.__done = true;
</script></body></html>"""


def render(src: Path) -> Path:
    import json
    from playwright.sync_api import sync_playwright

    definition = "\n".join(l for l in src.read_text(encoding="utf-8").splitlines()
                           if not l.startswith("%%"))
    html = PAGE % (MERMAID_CDN, json.dumps(THEME), json.dumps(definition))

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.set_content(html)
        try:
            page.wait_for_function("window.__done === true", timeout=30000)
        except Exception:
            raise SystemExit("mermaid did not render: " + ("; ".join(errors) or "timeout"))
        svg = page.eval_on_selector("#out svg", "el => el.outerHTML")
        browser.close()

    # Give the root a real intrinsic size, in pixels, taken from the viewBox.
    #
    # The guide embeds these with <img>, which has to get an intrinsic size out
    # of the file itself — CSS cannot supply one. Mermaid emits width="100%"
    # plus an inline max-width, and a percentage is meaningless in an image
    # context: the browser reports naturalWidth 0 and the figure collapses to a
    # 16px sliver. viewBox alone is not reliably enough either. Concrete
    # width/height plus the viewBox is, and `width:100%; height:auto` in the
    # stylesheet then scales it to the article column.
    head = re.match(r"<svg[^>]*>", svg).group()
    # The origin is not always 0 0 — mermaid pads the box when labels overhang.
    box = re.search(r'viewBox="\s*(-?[\d.]+)[ ,]+(-?[\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)\s*"', head)
    if not box:
        raise SystemExit("rendered SVG has no viewBox; cannot size it")
    w, h = round(float(box.group(3))), round(float(box.group(4)))
    clean = re.sub(r'\s(?:width|height)="[^"]*"', "", head)
    clean = re.sub(r'\sstyle="[^"]*"', "", clean)
    svg = clean.replace("<svg", f'<svg width="{w}" height="{h}"', 1) + svg[len(head):]

    out = src.with_suffix(".svg")
    out.write_text(svg, encoding="utf-8")
    return out


def main():
    wanted = sys.argv[1:]
    sources = [IMG_DIR / f"{n.removesuffix('.mmd')}.mmd" for n in wanted] \
        if wanted else sorted(IMG_DIR.glob("*.mmd"))
    if not sources:
        raise SystemExit(f"no .mmd files in {IMG_DIR}")
    for src in sources:
        if not src.exists():
            raise SystemExit(f"not found: {src}")
        out = render(src)
        print(f"{src.name} -> {out.name}  ({out.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
