"""The landing's rendered copy survived the redesign, word for word.

    python tasks/checks/check_copy_verbatim.py

WHY THIS EXISTS
---------------
Task 0010 acceptance criterion, verbatim: "Rendered text content of
site/index.html is identical pre/post (whitespace aside) — this is checkable by
diffing extracted text, and Stage C must check it that way, not by eyeball."
The brief says the same thing twice ("Keep all existing copy verbatim — this is
a visual redesign, not a rewrite"), and the redesign re-nested nearly every
element on the page, which is exactly the situation where a sentence goes
missing without anyone noticing.

HOW IT IS CHECKED — two levels, because each is blind to what the other sees
---------------------------------------------------------------------------
Level 1, EXACT DELTA. Extract the rendered text of both revisions, reduce each
to a multiset of words and of individual symbol characters, and assert

    new + sanctioned_removals  ==  old + sanctioned_additions

as multisets. The sanctioned lists below are therefore not a waiver — they are
the expected value. An unlisted word appearing anywhere on the page fails, and
so does a listed one appearing twice.

Level 2, ORDER AND CONTIGUITY. A multiset cannot see a sentence whose words
were reordered. So every text run of the OLD document with four or more words
must still appear, whitespace-squashed and contiguous, in the new one. Runs are
bounded by tags, so re-nesting cannot glue two unrelated fragments together and
call it a match.

WHAT WOULD MAKE THIS RED
  - deleting, rewording, retitling or reordering any sentence on the page
  - a change of case (an uppercase kicker typed into the markup instead of
    being done with text-transform, which would be a copy change)
  - adding any copy that is not one of the sanctioned additions
  - losing the CTA glyphs, the arrows, the currency or the middots
"""

import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _lib import (  # noqa: E402
    BASELINE, Check, copy_tokens, git_show, read, squash, text_runs,
    visible_text,
)

PAGE = "site/index.html"

# --- approved copy rewrites, post-0010 -------------------------------------
# Task 0010 froze the copy. Anything here is a LATER, owner-approved rewrite,
# recorded as an exact old->new pair so the rest of the page stays under the
# verbatim contract and each rewrite stays reviewable long after the fact.
#
# 2026-08-06 — the "What makes it different" poster. The owner supplied the
# replacement copy verbatim: a plainer statement-and-punchline headline, and
# the three outside-in approaches pulled out of the paragraph into a list.
REWRITE_OLD = [
    "There are 3 common ways to watch an agent, but here is a 4th odd one",
    "Most observability tools watch from the outside — an SDK, a proxy, an "
    "OpenTelemetry collector — and they are very good at it. What none of them "
    "can see is the option your agent considered and threw away, because that "
    "never leaves the model. So this one just asks the agent to write it down. "
    "A different approach, not a better one — and honestly, the strong setup "
    "is probably both.",
]
REWRITE_NEW = [
    "The simplest way to know what your agents are doing …is just to ask them 😉",
    "Most observability tools watch from the outside with 3 common approaches:",
    "an SDK", "a proxy", "an OpenTelemetry collector",
    "and they are very good at it. What none of them can see is the option your "
    "agents considered and threw away, because that never leaves the model.",
    "But our way is just to ask agents to write it down. A different approach, "
    "not a better one…",
]

# 2026-08-06 — the hero's closing aside, and the prior-art callout's new
# check mark. The aside's terminal period goes with it: the emoji ends the
# sentence now.
REWRITE_OLD += [
    "partly on purpose, partly because it is all I know how to build.",
]
REWRITE_NEW += [
    "partly on purpose, partly because I am too busy dancing tango for anything else 😄",
    "✅",   # the oversize mark leading the "We checked" callout
]
# Level 2 works on contiguous runs, which a rewrite necessarily breaks. These
# are the old runs the rewrite above is allowed to have consumed — matched by
# squashed prefix, and each one asserted to be genuinely absent so this list
# cannot quietly outlive the change it documents.
REWRITTEN_RUNS = [
    "There are 3 common ways to watch an agent,",
    "a 4th odd one",
    "Most observability tools watch from the outside — an SDK, a proxy, an OpenTelemetry",
    "partly on purpose, partly because it is all I know how to build",
]

# --- sanctioned removals ---------------------------------------------------
# The brief, §"What it gives you": "Drop the emoji icons". The punchline
# magnifier goes with the section that stopped being an icon-led callout.
SANCTIONED_REMOVED = [
    "🌲", "⏱️", "💰", "📁", "🔒", "🧩",   # the six feature-card icons
    "🔍",                                  # the punchline icon
    "☀",                                   # see THEME_GLYPH_NOTE below
]

# --- sanctioned additions --------------------------------------------------
# The brief's one behavioural addition (§Hero, "the live log panel"), its
# 7-row script quoted from the brief; the six-view cards' "Open in demo →"
# label (§Six views); and the paired cache stat box (§Tokens & cost).
SANCTIONED_ADDED = [
    # hero log panel — title bar + the 7 scripted rows
    "ACTIVITY_LOGS.DB — LIVE",
    "start", "Task accepted: Add rate limiting",
    "activity", "Implemented POST /v1/ingest — batches up to 500 rows",
    "decision", "Token bucket over sliding window: bucket is O(1) at our QPS",
    "issue", "Retry 2/5 — SQLITE_BUSY, writer held the lock",
    "github", "#push feat/rate-limit — 3 commits",
    "idle", "18m with no agent logging",
    "end", "completed · 14.44M tokens · $10.68",
    # six view cards
    *["Open in demo →"] * 6,
    # the paired stat box in the cost band
    "73% → 11%", "Cache reads: share of tokens vs share of cost",
    "26% → 79%", "Cache writes: share of tokens vs share of cost",
    # the theme toggle's state glyph
    "☾",
]

THEME_GLYPH_NOTE = (
    "theme-toggle glyph ☀ -> ☾: NOT copy. The button shows the theme you would "
    "GET, not the one you are in, and Paper & Ink makes the landing default to "
    "paper instead of dark — so the initial glyph flips. Both glyphs exist in "
    "the toggle's script in both revisions; only the server-rendered initial "
    "state changed. Recorded here rather than waved through, because it is the "
    "one delta the task brief did not name in advance."
)

# Confirmed pre-existing at the baseline, not introduced by the restyle. Round
# 1 of review asked for this specifically; asserting it here means the answer
# stays true rather than being a note in a report someone has to find again.
PREEXISTING_GLYPHS = {"▶": "Try the live demo", "★": "View on GitHub"}

MIN_RUN_WORDS = 4


def main() -> None:
    c = Check(f"{PAGE} copy is verbatim vs {BASELINE}, modulo the sanctioned deltas")

    old_doc = git_show(PAGE)
    new_doc = read(PAGE)
    old_text = visible_text(old_doc)
    new_text = visible_text(new_doc)
    c.note(f"extracted {len(old_text):,} chars of old copy, {len(new_text):,} of new")
    if not c.expect(len(old_text) > 5000 and len(new_text) > 5000,
                    "both extractions produced a full page of text (guards the extractor itself)"):
        c.done()

    # ---- level 1: exact multiset equation ---------------------------------
    old_t, new_t = copy_tokens(old_text), copy_tokens(new_text)
    expect_removed = copy_tokens(" ".join(SANCTIONED_REMOVED + REWRITE_OLD))
    expect_added = copy_tokens(" ".join(SANCTIONED_ADDED + REWRITE_NEW))

    lhs = new_t + expect_removed
    rhs = old_t + expect_added
    unexplained_new = lhs - rhs      # in the page but not sanctioned
    unexplained_old = rhs - lhs      # sanctioned or old, but missing from the page

    def show(counter: Counter) -> str:
        return ", ".join(f"{k.removeprefix('SYM:')}x{v}" for k, v in sorted(counter.items()))

    for k, v in sorted((new_t - old_t).items()):
        c.note(f"added: {k.removeprefix('SYM:')} x{v}")
    for k, v in sorted((old_t - new_t).items()):
        c.note(f"removed: {k.removeprefix('SYM:')} x{v}")

    c.expect(not unexplained_new,
             f"no unsanctioned copy was ADDED [{show(unexplained_new)}]")
    c.expect(not unexplained_old,
             f"no copy was LOST and every sanctioned addition is present [{show(unexplained_old)}]")

    # The removals have to be real: a list of things that were never there
    # would pass the equation above and prove nothing.
    for glyph in SANCTIONED_REMOVED:
        c.expect(glyph in old_text, f"sanctioned removal {glyph} really was on the old page")
    for glyph in SANCTIONED_REMOVED:
        if glyph == "☀":
            continue  # see THEME_GLYPH_NOTE — replaced, not dropped
        c.expect(glyph not in new_text, f"sanctioned removal {glyph} is gone from the new page")
    c.note(THEME_GLYPH_NOTE)

    # ---- the two CTA glyphs are pre-existing ------------------------------
    for glyph, label in PREEXISTING_GLYPHS.items():
        c.expect(glyph in old_text,
                 f"CTA glyph {glyph} ({label}) is PRE-EXISTING — present at {BASELINE}")
        c.expect(old_text.count(glyph) == new_text.count(glyph),
                 f"CTA glyph {glyph} count unchanged ({old_text.count(glyph)})")

    # ---- level 2: order and contiguity ------------------------------------
    # The rewrite's old text must really be gone — otherwise REWRITTEN_RUNS
    # would be a permanent waiver for runs that are still on the page.
    old_haystack = squash(old_text)
    for run in REWRITTEN_RUNS:
        c.expect(squash(run) in old_haystack,
                 f"rewritten run really was on the old page: {run[:60]!r}")
        c.expect(squash(run) not in squash(new_text),
                 f"rewritten run is gone from the new page: {run[:60]!r}")

    haystack = squash(new_text)
    rewritten = [squash(r) for r in REWRITTEN_RUNS]
    checked, missing, skipped = 0, [], 0
    for run in text_runs(old_doc):
        for glyph in SANCTIONED_REMOVED:
            run = run.replace(glyph, " ")
        run = run.strip()
        if len(run.split()) < MIN_RUN_WORDS:
            continue
        if any(squash(run).startswith(r) for r in rewritten):
            skipped += 1
            continue
        checked += 1
        if squash(run) not in haystack:
            missing.append(run)
    c.note(f"{skipped} old run(s) skipped as owner-approved rewrites")
    if c.expect(checked >= 100, f"level-2 scan found {checked} old text runs to verify (expected >= 100)"):
        c.expect(not missing,
                 f"all {checked} old text runs survive contiguous and in order "
                 f"({len(missing)} missing)")
        for run in missing[:20]:
            print(f"       missing run: {run[:160]!r}")

    c.done()


if __name__ == "__main__":
    main()
