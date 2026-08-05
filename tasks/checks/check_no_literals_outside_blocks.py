"""style.css obeys its own rule: no colour literal outside the two token blocks.

    python tasks/checks/check_no_literals_outside_blocks.py

WHY THIS EXISTS
---------------
The rule is written at the top of style.css itself and restated in
docs/design.html: "no literal colour may appear outside these two blocks. A hex
or rgba() in a rule body is a value that only works in one theme, and it will
silently be wrong in the other one." Task 0010 makes that rule load-bearing
rather than tidy — it added a whole light palette and a chrome-scoped token set,
and any literal that slipped into a rule body would render correctly in the
theme it was written for and wrongly in the other, which is the failure mode
nobody sees until they toggle.

The task's acceptance criterion says "verified by grep". A grep is not quite
enough: the file's own header comment contains hexes (as prose), and so do the
palette-validator transcripts, so a naive grep is noisy in a way that trains
people to ignore it. This strips comments first — preserving line numbers so
the report points at the right line — and finds the block spans by BRACE
MATCHING from the two selectors, so adding declarations cannot move the end of
a block out from under the scan.

WHAT WOULD MAKE THIS RED
  - a #hex, rgb(), rgba(), hsl(), hsla() or oklch() in any rule body
  - a new colour added to a component rule instead of to both token blocks
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _lib import (  # noqa: E402
    DARK_HEADER, LIGHT_HEADER, Check, block_span, read, strip_css_comments,
)

CSS = "style.css"

LITERAL = re.compile(
    r"#[0-9a-fA-F]{3,8}\b"          # hex
    r"|\brgba?\s*\("                # rgb()/rgba()
    r"|\bhsla?\s*\("                # hsl()/hsla()
    r"|\boklch\s*\("                # oklch()
)

# color-mix() is deliberately NOT in the pattern above. The file uses it 40
# times outside the blocks — all of the form
# `color-mix(in srgb, var(--accent) 18%, transparent)` — and none of those is a
# literal: the value is derived from a token, so it re-themes on the toggle,
# which is the entire point of the rule. What WOULD violate the rule is a
# color-mix whose colour argument is a literal or a named colour, so those are
# checked separately below rather than by banning the function.
MIX_ALLOWED_KEYWORDS = {"transparent", "currentcolor", "currentColor"}
COLORSPACE = re.compile(r"^\s*in\s+[a-z0-9-]+(\s+(shorter|longer|increasing|decreasing)\s+hue)?\s*$", re.I)

# Documented, in the task's own acceptance criterion: "allowing only the
# documented exceptions (og-card, favicon)". Both live in OTHER files
# (favicon.svg, site/tools/build_og_card.py) precisely because they cannot
# reach a stylesheet — so inside style.css the exception list is empty, and
# that is the point.
EXCEPTIONS: list[str] = []


def main() -> None:
    c = Check(f"{CSS} has no colour literal outside its two token blocks")

    css = read(CSS)
    stripped = strip_css_comments(css)
    lines = stripped.split("\n")
    raw = css.split("\n")

    dark = block_span(lines, DARK_HEADER)
    light = block_span(lines, LIGHT_HEADER)
    c.note(f"dark block lines {dark[0] + 1}-{dark[1] + 1}, "
           f"light block lines {light[0] + 1}-{light[1] + 1}")

    inside = outside = 0
    for i, line in enumerate(lines):
        in_block = dark[0] <= i <= dark[1] or light[0] <= i <= light[1]
        for m in LITERAL.finditer(line):
            if in_block:
                inside += 1
                continue
            if any(x in raw[i] for x in EXCEPTIONS):
                c.note(f"{CSS}:{i + 1} documented exception: {raw[i].strip()[:70]}")
                continue
            outside += 1
            c.expect(False, f"{CSS}:{i + 1} literal {m.group(0)!r} in `{raw[i].strip()[:70]}`")

    # Rule 0 on the scanner itself: if the pattern matched nothing anywhere,
    # "no literals outside" would be true for the wrong reason forever.
    c.expect(inside > 50, f"scanner found {inside} literals INSIDE the token blocks (pattern works)")
    c.expect(outside == 0, f"{outside} literals outside the token blocks")

    # The blocks are where they should be relative to each other, and the
    # light-scoped radius rule that the design doc promises comes after them.
    c.expect(dark[1] < light[0], "the dark block precedes the light override block")

    # ---- color-mix() arguments are tokens, never colours -----------------
    mixes = list(iter_color_mix(stripped))
    c.expect(len(mixes) >= 30, f"found {len(mixes)} color-mix() calls to inspect (guards the scan)")
    for line_no, call in mixes:
        args = split_top_level(call)
        if not c.expect(len(args) >= 3 and COLORSPACE.match(args[0]) is not None,
                        f"{CSS}:{line_no} color-mix names a colour space: {call[:60]}"):
            continue
        for arg in args[1:]:
            colour = re.sub(r"\s+[\d.]+%\s*$", "", arg.strip())
            c.expect(
                colour.startswith("var(") or colour in MIX_ALLOWED_KEYWORDS,
                f"{CSS}:{line_no} color-mix argument {colour!r} is a token or a keyword, "
                f"not a colour value",
            )

    c.done()


def iter_color_mix(css: str):
    """Yield (1-based line, inner text) for every balanced color-mix( ... )."""
    for m in re.finditer(r"\bcolor-mix\s*\(", css):
        depth, i = 1, m.end()
        while i < len(css) and depth:
            depth += (css[i] == "(") - (css[i] == ")")
            i += 1
        yield css.count("\n", 0, m.start()) + 1, css[m.end():i - 1]


def split_top_level(text: str) -> list[str]:
    """Split on commas that are not inside parentheses."""
    out, depth, buf = [], 0, []
    for ch in text:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            out.append("".join(buf).strip())
            buf = []
        else:
            buf.append(ch)
    out.append("".join(buf).strip())
    return out


if __name__ == "__main__":
    main()
