"""The dark theme's token values are byte-identical to before Task 0010.

    python tasks/checks/check_dark_identity.py

WHY THIS EXISTS
---------------
Task 0010's hardest constraint is not a colour, it is a NON-change: "The dark
theme, all layouts, all content, and all logic stay untouched", and the
acceptance criterion asks for it to be shown on a before/after screenshot pair.
A screenshot pair covers two views. This covers every pixel that is drawn from
a token, in every view, which is nearly all of them — it is the mechanical form
of "dark renders identical", and the cheap tier that should fail first when it
does not.

Additions are allowed and are REPORTED, not failed: the whole design of the
restyle is that the light theme needed new chrome tokens, and those had to be
declared in the dark block too. What must not happen is a PRE-EXISTING token
changing value or disappearing — either one repaints dark mode.

The three sanctioned dark-theme changes (the category stripe, the brand mark's
red stem, the mark's square corners) are all ADDITIONS in token terms, so they
show up in the notes below rather than as failures. --brand is checked against
its sanctioned value by check_chrome_token_shadowing.py rather than here.

WHAT WOULD MAKE THIS RED
  - editing any value in the `:root {` block
  - deleting a token from it
  - "tidying" a dark token to match a light one
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _lib import (  # noqa: E402
    BASELINE, DARK_HEADER, Check, git_show, parse_token_block, read,
)

CSS = "style.css"


def main() -> None:
    c = Check(f"dark theme tokens unchanged since {BASELINE}")

    before = parse_token_block(git_show(CSS), DARK_HEADER)
    after = parse_token_block(read(CSS), DARK_HEADER)
    c.note(f"{len(before)} tokens before, {len(after)} after")
    if not c.expect(len(before) > 30, "baseline parse found a full dark block (guards the parser)"):
        c.done()

    removed = sorted(set(before) - set(after))
    c.expect(not removed, f"no pre-existing dark token was removed {removed}")

    changed = [
        f"{k}: {before[k]!r} -> {after.get(k)!r}"
        for k in sorted(before)
        if k in after and after[k] != before[k]
    ]
    c.expect(not changed, f"no pre-existing dark token changed value ({len(changed)} did)")
    for line in changed:
        print(f"       {line}")

    added = sorted(set(after) - set(before))
    for k in added:
        c.note(f"new dark token (allowed): {k}: {after[k]}")
    c.expect(added, "the restyle did add dark tokens — confirms we are comparing the right revisions")

    c.done()


if __name__ == "__main__":
    main()
