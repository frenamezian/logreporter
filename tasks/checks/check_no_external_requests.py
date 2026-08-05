"""The landing fetches nothing from the network. Not one font, not one script.

    python tasks/checks/check_no_external_requests.py

WHY THIS EXISTS
---------------
This is the landing's oldest documented invariant (site/README.md) and a Task
0010 acceptance criterion: "Zero external requests from file://: no
fonts.googleapis.com, no CDN, no fetch." It is also the criterion this task was
most likely to break, because the brief it implements literally says to load
Archivo from Google Fonts; the owner's overriding decision was to vendor the
woff2 instead. One `<link href="https://fonts.googleapis.com/…">` copied out of
the brief would have satisfied every visual criterion and broken this one.

WHAT IS AND IS NOT A REQUEST — the distinction this check turns on
------------------------------------------------------------------
A browser FETCHES the target of src, srcset, and of href on <link>. It does not
fetch the target of href on <a> until a human clicks it, and it never fetches a
<meta content> URL at all — those are strings handed to crawlers and unfurlers,
and they are REQUIRED to be absolute (a relative og:image resolves against
nothing on someone else's server). So outbound <a> links and the documented
metadata are allowed by name; everything else absolute is a failure.

WHAT WOULD MAKE THIS RED
  - any src / srcset pointing off-origin
  - a <link> (stylesheet, preload, font, icon) pointing off-origin
  - an @import or a url() in CSS pointing off-origin
  - fetch() / XMLHttpRequest anywhere in the page's scripts
"""

import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _lib import REPO, Check, read  # noqa: E402

HTML = "site/index.html"
CSS = "site/assets/css/site.css"

# <meta> names/properties whose content is documented as an absolute URL.
METADATA_ATTRS = ("property", "name", "itemprop")
ABSOLUTE = re.compile(r'^\s*(?:https?:)?//', re.I)
TAG = re.compile(r"<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>")
ATTR = re.compile(r'\b(src|srcset|href|action|data-src)\s*=\s*"([^"]*)"')


def main() -> None:
    c = Check("landing makes zero external requests (html + css)")

    html = read(HTML)
    css = read(CSS)

    # ---- markup ----------------------------------------------------------
    checked = 0
    for m in TAG.finditer(html):
        tag, attrs = m.group(1).lower(), m.group(2)
        line = html.count("\n", 0, m.start()) + 1
        for attr, value in ATTR.findall(attrs):
            for part in (value.split(",") if attr == "srcset" else [value]):
                url = part.strip().split(" ")[0]
                if not ABSOLUTE.match(url):
                    continue
                checked += 1
                if tag == "a" and attr == "href":
                    continue                     # outbound link, not a request
                if tag == "link" and re.search(r'rel\s*=\s*"canonical"', attrs, re.I):
                    continue                     # documented SEO metadata
                c.expect(False, f"{HTML}:{line} <{tag} {attr}=\"{url}\"> is an external request")
    c.expect(checked > 0, f"scanner saw {checked} absolute URLs to adjudicate (guards the scanner)")

    # <meta content="https://…"> is metadata, never fetched — but only when it
    # really is a <meta>. Assert that, rather than assuming it.
    for m in re.finditer(r'<meta\b([^>]*)>', html, re.I):
        attrs = m.group(1)
        content = re.search(r'\bcontent\s*=\s*"([^"]*)"', attrs)
        if content and ABSOLUTE.match(content.group(1)):
            c.expect(any(re.search(r'\b%s\s*=' % a, attrs) for a in METADATA_ATTRS),
                     f"absolute <meta content> is a named metadata property: {attrs.strip()[:70]}")

    # ---- the specific things the criterion names -------------------------
    for banned in ("fonts.googleapis.com", "fonts.gstatic.com", "cdn.", "unpkg.com",
                   "jsdelivr", "cdnjs", "ajax.googleapis.com", "googletagmanager"):
        c.expect(banned not in html and banned not in css,
                 f"no reference to {banned} anywhere in the landing")

    # No runtime fetching either — the hero animation is local arithmetic.
    for pattern, label in ((r"\bfetch\s*\(", "fetch("),
                           (r"XMLHttpRequest", "XMLHttpRequest"),
                           (r"new\s+EventSource", "EventSource"),
                           (r"new\s+WebSocket", "WebSocket"),
                           (r"import\s*\(\s*['\"]https?:", "dynamic import of a URL")):
        c.expect(not re.search(pattern, html), f"no {label} in the page's scripts")

    # ---- stylesheet ------------------------------------------------------
    urls = re.findall(r"url\(\s*['\"]?([^'\")]+)", css)
    c.expect(urls, f"stylesheet scanner found {len(urls)} url() references (guards the scanner)")
    for u in urls:
        c.expect(not ABSOLUTE.match(u), f"{CSS} url({u}) is local")
    c.expect(not re.search(r"@import\s+(?:url\()?\s*['\"]?https?:", css),
             f"{CSS} has no external @import")

    # The vendored font really is on disk — "local" is only true if it exists.
    # A url() pointing at a missing file is not a network request, but it is
    # the same failure to the reader: the page renders without its font.
    for u in urls:
        if ABSOLUTE.match(u) or u.startswith("data:"):
            continue
        target = Path(os.path.normpath(str(REPO / Path(CSS).parent / u)))
        c.expect(target.exists(), f"local asset {u} resolves to a file that exists")

    c.done()


if __name__ == "__main__":
    main()
