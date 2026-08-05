"""Shared helpers for the Task 0010 check scripts.

Every check in this directory is runnable standalone with the plain `python`
on PATH, from any working directory:

    python tasks/checks/check_copy_verbatim.py

They import this module by inserting their own directory on sys.path, so
"standalone" survives being run from anywhere; nothing here needs installing
and nothing outside the standard library is imported.

Why a shared module at all: five of the checks have to parse the two `:root`
token blocks of style.css, and three have to compute WCAG contrast. A copy of
either in each script is a copy that can drift from the others, and a check
that measures something subtly different from its neighbour is worse than one
check.
"""

from __future__ import annotations

import html
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

# The commit immediately before Task 0010's implementation. Every "did this
# survive the restyle?" check diffs against this tree rather than against a
# hand-copied snapshot, so the baseline cannot rot.
BASELINE = "7169935"

REPO = Path(__file__).resolve().parents[2]


def utf8_stdout() -> None:
    """Make the arrow, the em dash and the emoji printable on a cp1252 console.

    Not cosmetic: without this, a check that finds a real failure dies with
    UnicodeEncodeError while printing it, and the operator sees a traceback
    instead of the finding.
    """
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except AttributeError:  # pragma: no cover - Python < 3.7
        pass


def read(rel: str) -> str:
    return (REPO / rel).read_text(encoding="utf-8")


def git_show(rel: str, rev: str = BASELINE) -> str:
    """Read a file as it was at `rev`. Raises if the path is not in that tree."""
    out = subprocess.run(
        ["git", "-C", str(REPO), "show", f"{rev}:{rel}"],
        capture_output=True, check=True,
    ).stdout
    return out.decode("utf-8")


# --------------------------------------------------------------------------
# CSS
# --------------------------------------------------------------------------

def strip_css_comments(css: str) -> str:
    """Blank out /* ... */ while preserving line numbering.

    Line numbers are preserved because the literal-colour check reports them,
    and a report that points at the wrong line sends the reader to the wrong
    place. Comment bodies are replaced with spaces rather than deleted so that
    hexes *documented* in prose (there are several, deliberately) are not
    mistaken for hexes *used*.
    """
    out = []
    i = 0
    while i < len(css):
        start = css.find("/*", i)
        if start == -1:
            out.append(css[i:])
            break
        out.append(css[i:start])
        end = css.find("*/", start + 2)
        if end == -1:
            body = css[start:]
            i = len(css)
        else:
            body = css[start:end + 2]
            i = end + 2
        out.append("".join("\n" if c == "\n" else " " for c in body))
    return "".join(out)


def block_span(lines: list[str], header: str) -> tuple[int, int]:
    """0-based inclusive line span of the rule whose selector line is `header`.

    Found by brace matching from the header, not by a fixed length or a
    trailing-comment marker, so inserting declarations cannot silently move
    the end of the block outside the span and let a literal in.
    """
    try:
        start = next(i for i, ln in enumerate(lines) if ln.strip() == header)
    except StopIteration:
        raise SystemExit(f"FATAL: style.css has no line `{header}` — the parser is stale")
    depth = 0
    for i in range(start, len(lines)):
        depth += lines[i].count("{") - lines[i].count("}")
        if depth == 0 and i > start:
            return start, i
    raise SystemExit(f"FATAL: unbalanced braces after `{header}`")


DARK_HEADER = ":root {"
LIGHT_HEADER = ':root[data-theme="light"] {'

_DECL = re.compile(r"^\s*(--[a-z0-9-]+)\s*:\s*(.+?)\s*;\s*(?:/\*(.*?)\*/)?\s*$")


def parse_token_block(css: str, header: str) -> dict[str, str]:
    """{token: value} for one :root block. Comments are ignored, not parsed."""
    lines = strip_css_comments(css).split("\n")
    lo, hi = block_span(lines, header)
    out: dict[str, str] = {}
    for ln in lines[lo:hi + 1]:
        m = _DECL.match(ln)
        if m:
            out[m.group(1)] = m.group(2).strip()
    if not out:
        raise SystemExit(f"FATAL: parsed 0 tokens from `{header}` — the parser is stale")
    return out


def parse_token_comments(css: str, header: str) -> dict[str, str]:
    """{token: trailing comment text} for declarations that carry one.

    Uses the RAW css (comments intact) — this is the one place the comment is
    the subject rather than the noise.
    """
    lines = css.split("\n")
    stripped = strip_css_comments(css).split("\n")
    lo, hi = block_span(stripped, header)
    out: dict[str, str] = {}
    for ln in lines[lo:hi + 1]:
        m = re.match(r"^\s*(--[a-z0-9-]+)\s*:.*?;\s*/\*(.*?)\*/\s*$", ln)
        if m:
            out[m.group(1)] = m.group(2).strip()
    return out


# --------------------------------------------------------------------------
# HTML
# --------------------------------------------------------------------------

def _blank_noise(doc: str) -> str:
    """Remove <script>/<style> bodies and comments — none of it is rendered."""
    doc = re.sub(r"(?is)<script\b.*?</script>", "\x00", doc)
    doc = re.sub(r"(?is)<style\b.*?</style>", "\x00", doc)
    doc = re.sub(r"(?s)<!--.*?-->", "\x00", doc)
    return doc


def text_runs(doc: str) -> list[str]:
    """The document's text nodes, entity-decoded, in source order.

    Splitting on tags is what makes the copy check robust to re-nesting: a run
    is bounded by markup, so wrapping a sentence in a new <div> cannot glue it
    to an unrelated one, and unwrapping cannot either.
    """
    parts = re.split(r"(?s)<[^>]+>", _blank_noise(doc))
    return [html.unescape(p).replace("\x00", " ") for p in parts]


def visible_text(doc: str) -> str:
    """All rendered text, whitespace-collapsed. Tags become a single space."""
    return re.sub(r"\s+", " ", " ".join(text_runs(doc))).strip()


def squash(text: str) -> str:
    """Drop every whitespace character. Case and punctuation are preserved.

    Whitespace is the one thing the acceptance criterion explicitly excuses
    ("identical pre/post, whitespace aside"), and it is also the only thing a
    re-layout is allowed to change. Removing it entirely is therefore both
    exactly the licence granted and the end of a whole class of false alarms
    (`cost</b>.` renders as `cost.` but extracts as `cost .`).
    """
    return re.sub(r"\s+", "", text)


def copy_tokens(text: str) -> Counter:
    """Case-sensitive multiset of words AND of individual symbol characters.

    Two vocabularies in one Counter because they fail differently: a reworded
    sentence changes words, while a dropped emoji, a lost arrow or a missing
    currency sign changes only symbols. Words are alphanumeric runs (so
    punctuation drifting on and off a word boundary is not a difference);
    symbols are counted per character (so the six feature emoji are six
    countable losses).
    """
    words = re.findall(r"[0-9A-Za-z]+(?:['’][0-9A-Za-z]+)*", text)
    syms = [c for c in text if not c.isspace() and not c.isalnum()]
    return Counter(words) + Counter("SYM:" + c for c in syms)


def attr_values(doc: str, name: str) -> list[str]:
    """Every double-quoted value of attribute `name`, including in comments.

    Deliberately includes commented-out markup for the link inventory: a link
    that survives only inside an HTML comment has not survived.
    """
    return re.findall(r'\b%s\s*=\s*"([^"]*)"' % name, doc)


# --------------------------------------------------------------------------
# WCAG relative luminance / contrast (stdlib maths, no dependencies)
# --------------------------------------------------------------------------

def _channel(v: int) -> float:
    c = v / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(hex_color: str) -> float:
    """WCAG 2.x relative luminance of #rgb / #rrggbb."""
    h = hex_color.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) != 6 or not re.fullmatch(r"[0-9a-fA-F]{6}", h):
        raise ValueError(f"not an opaque hex colour: {hex_color!r}")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * _channel(r) + 0.7152 * _channel(g) + 0.0722 * _channel(b)


def contrast(a: str, b: str) -> float:
    """WCAG 2.x contrast ratio between two opaque hex colours."""
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


# --------------------------------------------------------------------------
# Reporting
# --------------------------------------------------------------------------

class Check:
    """Collects PASS/FAIL lines and exits non-zero if anything failed."""

    def __init__(self, title: str) -> None:
        utf8_stdout()
        self.title = title
        self.failures: list[str] = []
        self.notes: list[str] = []
        print(f"== {title}")

    def ok(self, msg: str) -> None:
        print(f"  [PASS] {msg}")

    def note(self, msg: str) -> None:
        """Recorded for the reader; never fails the run."""
        self.notes.append(msg)
        print(f"  [note] {msg}")

    def expect(self, condition: bool, msg: str) -> bool:
        if condition:
            self.ok(msg)
        else:
            self.failures.append(msg)
            print(f"  [FAIL] {msg}")
        return bool(condition)

    def skip(self, msg: str) -> None:
        print(f"  [SKIP] {msg}")

    def done(self) -> None:
        if self.failures:
            print(f"\n  -> FAIL ({len(self.failures)} of this check's assertions)")
            for f in self.failures:
                print(f"       - {f}")
            sys.exit(1)
        print("\n  -> ALL CHECKS PASS")
        sys.exit(0)
