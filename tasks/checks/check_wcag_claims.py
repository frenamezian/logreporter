"""Every contrast ratio style.css's light block claims is recomputed here.

    python tasks/checks/check_wcag_claims.py

WHY THIS EXISTS (Task 0010, Stage B rounds 2 and 3)
---------------------------------------------------
Round 2 of review found the light block's comments asserting contrast ratios
that were inherited from the previous palette — numbers that had been true of
"high summer" and were quietly false of Paper & Ink. Round 3 changed
--accent-hover to #08568f and wrote a fresh set of claims, which nobody
independent has read.

A comment that states a measurement is a test with no runner. This file is the
runner. It does NOT hard-code the expected numbers: it PARSES them out of the
comments and recomputes each one from the token values with WCAG 2.x relative
luminance (stdlib arithmetic, no dependencies). The comment is the assertion;
this script is the oracle. Either side drifting makes it red.

The closure guard at the end is the part that makes this more than a spot
check: every `N.NN` inside the three WCAG comments must have been consumed by
a pattern. Adding a new claim in prose without adding its verifier here fails
the check, rather than being silently unverified.

WHAT WOULD MAKE THIS RED
  - retuning --text-dim / --accent / --accent-hover without redoing the numbers
  - changing --bg / --surface / --surface-2 (the grounds the numbers are of)
  - --accent-hover ceasing to be darker than --accent (the direction the
    comment claims: "hover DARKENS on paper")
  - white on --accent-hover falling under AA 4.5
  - writing a new ratio into those comments with no verifier
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _lib import (  # noqa: E402
    DARK_HEADER, LIGHT_HEADER, Check, block_span, contrast, luminance,
    parse_token_block, read, strip_css_comments,
)

TOL = 0.02          # the claims are written to 2dp; this is a rounding window
AA = 4.5            # WCAG 2.x AA for normal-size text
WHITE = "#ffffff"

# The three tokens whose comments carry measured ratios. Restricting the
# closure guard to these keeps it away from the palette-validator transcripts
# in the same block, which check_palette_validator.py re-runs instead.
WCAG_TOKENS = ("--text-dim", "--accent", "--accent-hover")


def comments_by_token(css: str, header: str) -> dict[str, str]:
    """Map each declaration in a block to the comment block above it."""
    raw = css.split("\n")
    lo, hi = block_span(strip_css_comments(css).split("\n"), header)
    out, buf = {}, []
    for ln in raw[lo:hi + 1]:
        buf.append(ln)
        m = re.match(r"^\s*(--[a-z0-9-]+)\s*:", ln)
        if m:
            out[m.group(1)] = "\n".join(buf)
            buf = []
    return out


class Claims:
    """Tracks which numbers in a comment have been verified."""

    def __init__(self, text: str) -> None:
        self.text = text
        self.consumed: set[int] = set()

    def take(self, pattern: str) -> re.Match | None:
        m = re.search(pattern, self.text, re.S)
        if m:
            for i in range(1, (m.re.groups or 0) + 1):
                if m.group(i) and re.fullmatch(r"\d+\.\d\d", m.group(i)):
                    self.consumed.add(m.start(i))
        return m

    def unverified(self) -> list[str]:
        return [
            m.group(0) for m in re.finditer(r"\d+\.\d\d", self.text)
            if m.start() not in self.consumed
        ]


def main() -> None:
    c = Check("style.css light-block contrast claims recomputed from the tokens")

    css = read("style.css")
    light = parse_token_block(css, LIGHT_HEADER)
    dark = parse_token_block(css, DARK_HEADER)
    notes = comments_by_token(css, LIGHT_HEADER)

    grounds = {
        "surface-2": light["--surface-2"],
        "bg": light["--bg"],
        "surface": light["--surface"],
    }
    c.note(f"grounds: surface-2 {grounds['surface-2']} · bg {grounds['bg']} · surface {grounds['surface']}")

    def close(actual: float, stated: str, label: str) -> None:
        c.expect(abs(actual - float(stated)) <= TOL,
                 f"{label}: comment says {stated}, computed {actual:.3f} (tol +/-{TOL})")

    # ---- --text-dim ------------------------------------------------------
    cl = Claims(notes["--text-dim"])
    m = cl.take(r"(\d+\.\d\d)\s*/\s*(\d+\.\d\d)\s*/\s*(\d+\.\d\d)\s+across\s+surface-2\s*/\s*bg\s*/\s*surface")
    if c.expect(m is not None, "--text-dim comment states a surface-2/bg/surface triple"):
        for stated, (name, ground) in zip(m.groups(), grounds.items()):
            close(contrast(light["--text-dim"], ground), stated, f"--text-dim vs --{name}")
            c.expect(contrast(light["--text-dim"], ground) >= AA,
                     f"--text-dim vs --{name} clears AA {AA}")
    # "The first candidate (#6f6a67) sat at 4.37 on surface-2, under AA 4.5"
    m = cl.take(r"\((#[0-9a-fA-F]{6})\)\s*sat at\s*(\d+\.\d\d)\s*on surface-2")
    if c.expect(m is not None, "--text-dim comment states why the first candidate was rejected"):
        close(contrast(m.group(1), grounds["surface-2"]), m.group(2),
              f"rejected candidate {m.group(1)} vs surface-2")
        c.expect(contrast(m.group(1), grounds["surface-2"]) < AA,
                 f"rejected candidate {m.group(1)} really does fail AA (the reason given)")
    c.expect(not cl.unverified(), f"--text-dim comment has no unverified ratio {cl.unverified()}")

    # ---- --accent --------------------------------------------------------
    cl = Claims(notes["--accent"])
    # "Darkened one step from high summer's #0a72c4, which measured 4.08:1"
    m = cl.take(r"(#[0-9a-fA-F]{6}),\s*which measured\s*(\d+\.\d\d):1\s*\n?\s*on the new --surface-2")
    if c.expect(m is not None, "--accent comment states the superseded value and its ratio"):
        close(contrast(m.group(1), grounds["surface-2"]), m.group(2),
              f"superseded accent {m.group(1)} vs surface-2")
        c.expect(contrast(m.group(1), grounds["surface-2"]) < AA,
                 f"superseded accent {m.group(1)} really did fail AA (the reason for the retune)")
    m = cl.take(r"(\d+\.\d\d)\s*/\s*(\d+\.\d\d)\s*/\s*(\d+\.\d\d)\s+across\s*\n?\s*surface-2\s*/\s*bg\s*/\s*surface")
    if c.expect(m is not None, "--accent comment states a surface-2/bg/surface triple"):
        for stated, (name, ground) in zip(m.groups(), grounds.items()):
            close(contrast(light["--accent"], ground), stated, f"--accent vs --{name}")
            # The accent renders as 12px breadcrumb text, so AA applies to it
            # as text, not merely as a UI component.
            c.expect(contrast(light["--accent"], ground) >= AA,
                     f"--accent vs --{name} clears AA {AA}")
    m = cl.take(r"white-on-accent rises to\s*(\d+\.\d\d):1")
    if c.expect(m is not None, "--accent comment states white-on-accent"):
        close(contrast(WHITE, light["--accent"]), m.group(1), "white on --accent")
        c.expect(contrast(WHITE, light["--accent"]) >= AA, f"white on --accent clears AA {AA}")
    c.expect(not cl.unverified(), f"--accent comment has no unverified ratio {cl.unverified()}")

    # ---- --accent-hover (Stage C's first explicit target) ----------------
    hover = light["--accent-hover"]
    c.expect(hover.lower() == "#08568f",
             f"--accent-hover is the round-3 value #08568f (found {hover})")

    cl = Claims(notes["--accent-hover"])
    m = cl.take(r"The old\s*(#[0-9a-fA-F]{6})\b.*?(\d+\.\d\d):1\s*ground")
    if c.expect(m is not None, "--accent-hover comment states the superseded value and its ratio"):
        close(contrast(WHITE, m.group(1)), m.group(2), f"white on superseded hover {m.group(1)}")
        c.expect(contrast(WHITE, m.group(1)) < AA,
                 f"superseded hover {m.group(1)} really did fail AA for white text")
    m = cl.take(r"white on\s*\n?\s*(#[0-9a-fA-F]{6})\s*measures\s*(\d+\.\d\d):1")
    if c.expect(m is not None, "--accent-hover comment states white-on-hover"):
        c.expect(m.group(1).lower() == hover.lower(),
                 f"the hex the comment measures ({m.group(1)}) is the token's own value ({hover})")
        close(contrast(WHITE, hover), m.group(2), "white on --accent-hover")
    c.expect(not cl.unverified(), f"--accent-hover comment has no unverified ratio {cl.unverified()}")

    # The two claims stated in words rather than numbers, asserted directly:
    c.expect(contrast(WHITE, hover) >= AA,
             f"white on --accent-hover clears AA {AA} (computed {contrast(WHITE, hover):.3f})")
    lh, la = luminance(hover), luminance(light["--accent"])
    c.expect(lh < la,
             f"--accent-hover is DARKER than --accent by relative luminance "
             f"({lh:.5f} < {la:.5f}) — the 'hover darkens on paper' rule")

    # The same rule inverted in dark, which is the contrast the comment draws.
    dh, da = luminance(dark["--accent-hover"]), luminance(dark["--accent"])
    c.expect(dh > da,
             f"dark --accent-hover is LIGHTER than dark --accent ({dh:.5f} > {da:.5f}) — "
             f"the direction light deliberately inverts")

    # ---- the two new dark objects on the paper page ----------------------
    # Task 0010 introduces an ink top bar and near-black stat tiles into the
    # LIGHT theme. Nothing else measures them: they are surfaces that did not
    # exist before, carrying text tokens that did not exist before, and the
    # light block's comments make no numeric claim about them. Text on both
    # has to clear AA or the header is unreadable in the theme this task
    # exists to add.
    for surface, fg, dim in (("--topbar-bg", "--topbar-text", "--topbar-dim"),
                             ("--tile-bg", "--tile-text", "--tile-dim")):
        for token in (fg, dim):
            ratio = contrast(light[token], light[surface])
            c.expect(ratio >= AA,
                     f"light {token} on {surface} clears AA {AA} (computed {ratio:.3f})")

    c.done()


if __name__ == "__main__":
    main()
