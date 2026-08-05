"""The hero animation has a reduced-motion fallback, and it comes last.

    python tasks/checks/check_reduced_motion.py

WHY THIS EXISTS
---------------
Task 0010 acceptance criterion: "Hero log panel types its 7-row script on loop
per the brief; prefers-reduced-motion renders all rows statically with no
ticker and no caret blink." The brief says the same. This is an accessibility
promise, and it is the kind that breaks silently — a visitor who needs it sees
a broken hero, and nobody who does not need it will ever notice.

The SOURCE ORDER assertion is the part worth having. The panel hides its rows
with `.logpanel.js .logrow { opacity: 0 }` and the fallback un-hides them with
a selector of EQUAL specificity, so which one wins is decided purely by which
comes last in the file. site.css says so in a comment — "Equal specificity with
the .js rules above: it wins on source order, so keep this @media block BELOW
them" — and a comment is not enforcement. Move the block up while tidying and
the fallback stops working, with nothing to show for it: same rules, same
specificity, same file, silently inverted outcome.

The script's own early return is checked too, because the CSS fallback and the
JS guard are two halves of one behaviour: CSS alone would leave the rows
visible but the ticker still running.

WHAT WOULD MAKE THIS RED
  - deleting or emptying the @media (prefers-reduced-motion: reduce) block
  - moving it above the .logpanel.js rules it has to override
  - dropping the caret's animation: none
  - removing the script's matchMedia early return
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _lib import Check, read  # noqa: E402

CSS = "site/assets/css/site.css"
HTML = "site/index.html"

QUERY = "@media (prefers-reduced-motion: reduce)"


def block_at(css: str, start: int) -> tuple[str, int, int]:
    """The balanced { ... } body beginning at or after `start`, and its span."""
    i = css.index("{", start)
    depth, j = 1, i + 1
    while j < len(css) and depth:
        depth += (css[j] == "{") - (css[j] == "}")
        j += 1
    return css[i + 1:j - 1], i, j


def main() -> None:
    c = Check("hero animation has a reduced-motion fallback that actually wins")

    css = read(CSS)

    # The rules that HIDE rows until the ticker reveals them.
    hides = [m.start() for m in re.finditer(r"\.logpanel\.js\s+\.logrow\b", css)]
    if not c.expect(len(hides) >= 2,
                    f"found {len(hides)} `.logpanel.js .logrow` rules (the ones needing an override)"):
        c.done()

    # The fallback block. There is more than one reduced-motion query in the
    # file (scroll-behavior has its own), so find the one that mentions the
    # panel rather than assuming there is only one.
    blocks = [(m.start(), *block_at(css, m.start())) for m in re.finditer(re.escape(QUERY), css)]
    c.expect(blocks, f"{CSS} has a {QUERY} block")
    panel_blocks = [b for b in blocks if ".logpanel" in b[1]]
    if not c.expect(len(panel_blocks) == 1,
                    f"exactly one reduced-motion block governs the log panel ({len(panel_blocks)})"):
        c.done()
    pos, body, body_start, body_end = panel_blocks[0]

    # Content: rows shown, no transform, no transition, caret not blinking.
    c.expect(re.search(r"\.logpanel\.js\s+\.logrow\b", body) is not None,
             "fallback targets `.logpanel.js .logrow`")
    c.expect(re.search(r"\.logpanel\.js\s+\.logrow\.shown\b", body) is not None,
             "fallback also targets the `.shown` state, so both rules are neutralised")
    c.expect(re.search(r"opacity:\s*1", body) is not None, "fallback renders every row (opacity: 1)")
    c.expect(re.search(r"transform:\s*none", body) is not None, "fallback removes the slide")
    c.expect(re.search(r"transition:\s*none", body) is not None, "fallback removes the transition")
    c.expect(re.search(r"\.logcaret\b[^}]*animation:\s*none", body) is not None,
             "fallback stops the caret blinking")

    # Source order: the override must come after every rule it overrides.
    # The fallback block contains a `.logpanel.js .logrow` selector of its own
    # (that is what it overrides WITH), so those occurrences are excluded —
    # otherwise the block would be compared against itself and could never pass.
    overridden = [h for h in hides if not body_start <= h < body_end]
    if c.expect(overridden,
                f"{len(overridden)} `.logpanel.js .logrow` rules sit outside the fallback block"):
        last_hide = max(overridden)
        c.expect(pos > last_hide,
                 f"the fallback block (offset {pos}) comes AFTER the last "
                 f"`.logpanel.js .logrow` rule it overrides (offset {last_hide}) — equal "
                 f"specificity, so source order is what decides")

    # The JS half of the same guard.
    html = read(HTML)
    c.expect(re.search(r"prefers-reduced-motion", html) is not None,
             "the hero script consults prefers-reduced-motion")
    c.expect(re.search(r"matchMedia\s*\(\s*['\"]\(prefers-reduced-motion:\s*reduce\)['\"]\s*\)", html)
             is not None,
             "it queries the reduce case specifically")

    # And the panel it animates really has the 7 rows the brief specifies, or
    # the static fallback would render an empty frame.
    rows = re.findall(r'<div class="logrow">', html)
    c.expect(len(rows) == 7, f"the hero panel carries the brief's 7 scripted rows (found {len(rows)})")

    c.done()


if __name__ == "__main__":
    main()
