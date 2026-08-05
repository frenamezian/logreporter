"""docs/design.html must not lie about a single token value in style.css.

    python tasks/checks/check_design_doc_tokens.py

WHY THIS EXISTS (Task 0010, Stage B round 3 — applied inline, never cold-read)
-----------------------------------------------------------------------------
The in-app design doc prints the token vocabulary as a two-column table, dark
beside light, and then repeats several of the same values in prose. Round 3 of
review found two cells still showing the pre-retune values (--text-dim and
--accent). Nothing mechanical would have caught that: prose is not compiled,
and the page it documents renders correctly while the documentation of it is
wrong — the most durable kind of wrong, because every later reader trusts it.

So this check does not special-case those two cells. It parses BOTH files and
compares EVERY value the doc states against the stylesheet it claims to
describe, in four passes, so the whole class is closed rather than the two
instances that were caught by eye.

WHAT WOULD MAKE THIS RED
  - editing any hex in the design.html table without editing style.css
  - editing any token in either :root block without editing design.html
  - a category legend swatch drifting from its log-type token
  - a hex surviving in the doc's prose after being deleted from the stylesheet
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _lib import (  # noqa: E402
    DARK_HEADER, LIGHT_HEADER, Check, parse_token_block, read,
)

# Hexes the doc is allowed to name that are NOT token values. Empty today, and
# it should stay that way: every colour the app renders comes from a token, so
# a hex in the prose that matches no token is either stale or a new literal.
PROSE_HEX_EXCEPTIONS: set[str] = set()

# The doc's category legend: display name -> token, in the doc's own order.
LEGEND = {
    "Activity": "--activity",
    "Issue": "--issue",
    "Decision": "--decision",
    "GitHub": "--github",
}


def main() -> None:
    c = Check("docs/design.html agrees with style.css for every token it states")

    doc = read("docs/design.html")
    css = read("style.css")
    dark = parse_token_block(css, DARK_HEADER)
    light = parse_token_block(css, LIGHT_HEADER)

    # -- pass 1: the `token / dark / light` table ---------------------------
    rows = re.findall(
        r"^(--[a-z0-9-]+)\s+(#[0-9a-fA-F]{3,8})\s+(#[0-9a-fA-F]{3,8})",
        doc, re.MULTILINE,
    )
    # Rule 0 on the check's own input: a scan that silently matched nothing
    # would report a clean table forever.
    if not c.expect(len(rows) >= 8, f"table parser found {len(rows)} token rows (expected >= 8)"):
        c.done()

    for token, doc_dark, doc_light in rows:
        for theme, block, stated in (("dark", dark, doc_dark), ("light", light, doc_light)):
            actual = block.get(token)
            c.expect(
                actual is not None and actual.lower() == stated.lower(),
                f"{token} {theme}: doc says {stated}, style.css says {actual}",
            )

    # -- pass 2: the five-category legend ----------------------------------
    # Rendered as `Activity <code>#4caf50</code> / <code>#0d8442</code>` — the
    # dark value first, then the light one, same order as the table above.
    found_legend = 0
    for name, token in LEGEND.items():
        m = re.search(
            re.escape(name) + r"\s*<code>(#[0-9a-fA-F]{3,8})</code>\s*/\s*<code>(#[0-9a-fA-F]{3,8})</code>",
            doc,
        )
        if not c.expect(m is not None, f"legend entry for {name} is present and parseable"):
            continue
        found_legend += 1
        c.expect(dark[token].lower() == m.group(1).lower(),
                 f"{token} dark: legend says {m.group(1)}, style.css says {dark[token]}")
        c.expect(light[token].lower() == m.group(2).lower(),
                 f"{token} light: legend says {m.group(2)}, style.css says {light[token]}")
    c.expect(found_legend == len(LEGEND), f"all {len(LEGEND)} legend entries parsed ({found_legend})")

    # -- pass 3: prose claims about specific tokens -------------------------
    # `--brand`, `#ec3013` — the one colour introduced into BOTH themes.
    m = re.search(r"<code>--brand</code>, <code>(#[0-9a-fA-F]{3,8})</code>", doc)
    if c.expect(m is not None, "prose names --brand with a hex"):
        for theme, block in (("dark", dark), ("light", light)):
            c.expect(block.get("--brand", "").lower() == m.group(1).lower(),
                     f"--brand {theme}: doc says {m.group(1)}, style.css says {block.get('--brand')}")

    # `--radius  8px dark · 0 light`
    m = re.search(r"--radius\s+(\S+)\s+dark\s*·\s*(\S+)\s+light", doc)
    if c.expect(m is not None, "prose states the radius per theme"):
        c.expect(dark.get("--radius") == m.group(1),
                 f"--radius dark: doc says {m.group(1)}, style.css says {dark.get('--radius')}")
        # Light zeroes radius with a scoped universal rule rather than a token,
        # which is exactly what "0 light" has to mean for it to be true.
        c.expect(
            m.group(2) == "0"
            and re.search(r':root\[data-theme="light"\]\s*\*\s*{\s*border-radius:\s*0\s*!important;\s*}', css)
            is not None,
            "light theme really is radius 0 (scoped universal rule present)",
        )

    # -- pass 4: no stale hex anywhere in the doc ---------------------------
    known = {v.lower() for v in list(dark.values()) + list(light.values())}
    for hexval in sorted(set(re.findall(r"#[0-9a-fA-F]{3,8}\b", doc))):
        if hexval.lower() in PROSE_HEX_EXCEPTIONS:
            c.note(f"{hexval} is a documented non-token exception")
            continue
        c.expect(hexval.lower() in known,
                 f"{hexval} named in design.html is still a live token value")

    # -- pass 5: the favicon cross-file claim -------------------------------
    # The doc says favicon.svg carries the brand red as a literal because it
    # cannot reach style.css. If the brand ever moves, that sentence and that
    # file have to move together.
    if c.expect("favicon.svg" in doc, "doc documents the favicon literal exception"):
        c.expect(dark["--brand"].lower() in read("favicon.svg").lower(),
                 f"favicon.svg carries the brand red {dark['--brand']} as a literal")

    c.done()


if __name__ == "__main__":
    main()
