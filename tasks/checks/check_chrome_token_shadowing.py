"""In dark, every chrome-scoped token equals the token it shadows.

    python tasks/checks/check_chrome_token_shadowing.py

WHY THIS EXISTS
---------------
check_dark_identity.py proves no OLD dark token changed. That is only half of
"dark renders identically", because Task 0010 also re-pointed real rules at the
NEW --topbar-* / --tile-* / --mark-* / --stripe-* tokens. If one of those
carries a different value in the dark block than the token it replaced at the
point of use, dark mode repaints — and no comparison against the baseline can
see it, because the token is new.

The dark block states the construction in prose: "In THIS block every value
equals the token it shadows, so the dark theme renders exactly as it did before
these tokens existed." This check is that sentence, executed. Most declarations
name their shadow in a trailing comment (`/* = --surface-2 */`) and are read
straight from it; the handful that do not are listed in EXPECTED_SHADOW below,
because the naming convention is NOT reliable here (--topbar-bg shadows
--surface-2, not --bg, and --stripe-hatch shadows --hatch-strong, not --hatch)
and a check that guessed would be checking its own guess.

The closing assertion is the one that keeps this honest: --brand must be the
ONLY chrome token whose value appears nowhere in the pre-Task-0010 dark palette.
That is what makes "one deliberate new colour in dark" a fact rather than a
claim — a second new colour cannot be slipped in as an exemption.

WHAT WOULD MAKE THIS RED
  - retuning a --topbar-*/--tile-*/--mark-*/--stripe-* value in the dark block
  - changing a base token without changing the chrome token that shadows it
  - a shadow comment that names a different token than the value implements
  - introducing a second new colour into dark
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _lib import (  # noqa: E402
    BASELINE, DARK_HEADER, Check, git_show, parse_token_block,
    parse_token_comments, read,
)

CSS = "style.css"
PREFIXES = ("--topbar-", "--tile-", "--mark-", "--stripe-")

# Declarations that carry no `/* = --x */` comment. Spelled out rather than
# derived, for the reason in the docstring.
EXPECTED_SHADOW = {
    "--topbar-accent-hover": "--accent-hover",
    "--stripe-activity": "--activity",
    "--stripe-issue": "--issue",
    "--stripe-decision": "--decision",
    "--stripe-github": "--github",
    "--stripe-hatch": "--hatch-strong",
}

# The single sanctioned new colour in dark (owner decision 2026-08-05).
EXEMPT = {"--brand"}


def main() -> None:
    c = Check("dark chrome tokens shadow their base tokens exactly")

    css = read(CSS)
    dark = parse_token_block(css, DARK_HEADER)
    comments = parse_token_comments(css, DARK_HEADER)

    chrome = [t for t in dark if t.startswith(PREFIXES)]
    c.expect(len(chrome) >= 20, f"found {len(chrome)} chrome-scoped dark tokens (guards the scan)")

    unmapped = []
    for token in sorted(chrome):
        m = re.match(r"^=\s*(--[a-z0-9-]+)$", comments.get(token, "").strip())
        shadow = m.group(1) if m else EXPECTED_SHADOW.get(token)
        if shadow is None:
            unmapped.append(token)
            continue
        base = dark.get(shadow)
        c.expect(base is not None, f"{token} shadows {shadow}, which exists")
        if base is not None:
            c.expect(dark[token] == base,
                     f"{token} = {dark[token]} equals {shadow} = {base}")
    c.expect(not unmapped,
             f"every chrome token declares or has a known shadow {unmapped}")

    # --brand is the one exemption, and it must be the only one. Everything
    # else must reuse a colour that dark ALREADY had before Task 0010.
    baseline_values = {v.lower() for v in parse_token_block(git_show(CSS), DARK_HEADER).values()}
    novel = sorted(t for t in chrome + ["--brand"] if dark[t].lower() not in baseline_values)
    c.expect(set(novel) == EXEMPT,
             f"exactly {sorted(EXEMPT)} introduces a colour dark did not already have "
             f"(found {novel})")
    c.expect(dark.get("--brand", "").lower() == "#ec3013",
             f"--brand is the Paper & Ink brand red (found {dark.get('--brand')})")

    c.done()


if __name__ == "__main__":
    main()
