"""Re-runs seed/validate_palette.js on every palette whose surface changed.

    python tasks/checks/check_palette_validator.py

WHY THIS EXISTS
---------------
Task 0010 acceptance criterion: "node seed/validate_palette.js passes for:
(a) light log-type set vs #ffffff and #f3f2f2; (b) usage ramp vs the stat-tile
surface; (c) rank ramp vs the stat-tile surface." The palettes themselves did
not change in this task — the GROUNDS under them did, from cream to paper and
white, and every one of the validator's gates (lightness band, contrast vs
surface) is measured against the ground. A palette that passed on #fffaf2 has
not been shown to pass on #f3f2f2.

The colours are not hard-coded here. They are READ OUT of style.css's light
block, so this cannot drift into validating a palette the app no longer ships —
which is the failure mode the whole file exists to prevent one level down.

ON THE STAT-TILE SURFACE, (b) and (c). The tiles (.metric-card) rebind only
--text and --text-dim; the usage and rank ramps render in the charts on white
cards, not on the tiles, so #ffffff is the ground those two are validated
against here and in style.css's own recorded transcript. Legibility of the
tiles themselves is text contrast, not a categorical-palette question — the
validator says so in its own footer — and is asserted in check_wcag_claims.py.

WHAT WOULD MAKE THIS RED
  - retuning a log-type, usage or rank token so a gate fails
  - re-ordering a set (the CVD gate is measured on ADJACENT pairs only)
  - changing --bg or --surface out from under a validated palette
"""

import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _lib import LIGHT_HEADER, REPO, Check, parse_token_block, read  # noqa: E402

VALIDATOR = "seed/validate_palette.js"

# (label, token names in the order the validator was run with, surface token,
#  extra flags). Order matters: the CVD gate only compares adjacent pairs.
RUNS = [
    ("light log types vs paper",
     ["--activity", "--issue", "--decision", "--github"], "--bg", []),
    ("light log types vs white cards",
     ["--activity", "--issue", "--decision", "--github"], "--surface", []),
    ("light usage ramp vs white cards",
     ["--usage-cache-read", "--usage-cache-write", "--usage-input", "--usage-output"],
     "--surface", []),
    ("light rank ramp vs white cards",
     ["--usage-rank-1", "--usage-rank-2", "--usage-rank-3", "--usage-rank-4", "--usage-rank-5"],
     "--surface", ["--ordinal"]),
]


def main() -> None:
    c = Check("seed/validate_palette.js passes for every light palette")

    node = shutil.which("node")
    if node is None:
        c.skip("node is not on PATH — palette validation not run here. "
               "Install Node or run: node seed/validate_palette.js <colors> --mode light "
               "--surface <hex> [--ordinal]")
        print("\n  -> SKIPPED (node unavailable); this check makes no claim")
        sys.exit(0)

    light = parse_token_block(read("style.css"), LIGHT_HEADER)

    for label, tokens, surface_token, flags in RUNS:
        colours = ",".join(light[t] for t in tokens)
        surface = light[surface_token]
        cmd = [node, VALIDATOR, colours, "--mode", "light", "--surface", surface, *flags]
        print(f"\n  $ node {VALIDATOR} \"{colours}\" --mode light --surface \"{surface}\""
              + ("".join(f" {f}" for f in flags)))
        proc = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, encoding="utf-8")
        out = (proc.stdout or "") + (proc.returncode and (proc.stderr or "") or "")
        for line in (proc.stdout or "").splitlines():
            if "[PASS]" in line or "[FAIL]" in line:
                print(f"      {line.strip()}")
        gates = len(re.findall(r"\[PASS\]", out))
        c.expect(proc.returncode == 0, f"{label}: validator exited 0 (got {proc.returncode})")
        c.expect("ALL CHECKS PASS" in out, f"{label}: validator reports ALL CHECKS PASS")
        # Guards the assertion above against a validator that prints its banner
        # without running anything.
        c.expect(gates >= 3, f"{label}: validator actually ran its gates ({gates} passed)")
        c.expect("[FAIL]" not in out, f"{label}: no gate reported FAIL")

    c.done()


if __name__ == "__main__":
    main()
