# LogReporter landing redesign — implementation brief

> Source: Claude Design prototype (`LogReporter-LandingPage/logreporter/project/`, "Landing v2"),
> brief finalized 2026-08-05. This copy includes the dark-mode section, which the prototype
> folder's own `landing-redesign-brief.md` predates. **This file is the authoritative version.**
>
> Two deliberate deviations, decided by the owner (2026-08-05):
> 1. **Archivo is self-hosted, never loaded from Google Fonts** — see Task 0010. Where this
>    brief says "Google Fonts", read "vendored woff2 files in `site/assets/fonts/`".
> 2. **The brand is the app's existing L mark, not a plain red square.** Wherever this brief
>    says "14px solid red square" (nav, footer), use the L glyph from
>    `components/log-header.js`'s `BRAND_MARK` (an L whose foot is the stacked category bar),
>    recolored in the landing's red-family dialect: stem `#ec3013`, foot segments
>    `#ec3013` / `#7a1a0c` / `#3a3735` / `#8a8582` / hatched idle. One logo across landing
>    and app; each surface colors it from its own palette.

Restyle the existing landing page (https://frenamezian.github.io/logreporter/) to a flat, brutalist "modernist" direction: red ink on paper, hard rules, zero radius, oversized numerals, one animated hero panel. **Keep all existing copy verbatim** — this is a visual redesign, not a rewrite. Keep the existing anchors (`#how`, `#cost`, `#disclaimer`) and all links.

## 1. Design tokens

Define as CSS variables and use nothing else:

```css
:root {
  --bg: #f3f2f2;          /* paper ground */
  --ink: #201e1d;          /* near-black text */
  --accent: #ec3013;       /* the red — the only saturated color */
  --accent-dark: #7a1a0c;  /* deep red for secondary marks */
  --accent-tint: #fdE4df;  /* pale red fill for highlighted panels */
  --accent-deep: #b32410;  /* red readable as text on paper */
  --muted: #6f6a67;        /* secondary text */
  --rule: #201e1d;         /* rules are ink, 2px */
  --code-bg: #262322;      /* near-black code/dark panels */
  --code-fg: #eceae9;
  --code-red: #ff8a75;     /* accent readable on dark */
}
```

Dark mode — same roles, same red family, hotter where it needs to read. Not an inversion of grays: the ground is warm near-black (charred paper), tints become embers, and the code panel flips to a *light* paper card so it stays the page's contrast object:

```css
:root[data-theme="dark"] {
  --bg: #171312;           /* charred paper — warm near-black, never #000 */
  --ink: #f0ebe8;          /* warm off-white text */
  --accent: #ff4123;       /* the red, one notch hotter so it glows on dark */
  --accent-dark: #ffb3a3;  /* role flips: "secondary mark" is now a pale ember */
  --accent-tint: #3c1610;  /* ember fill for highlighted panels */
  --accent-deep: #ff8a75;  /* red readable as text on dark */
  --muted: #a39b96;        /* secondary text */
  --rule: #f0ebe8;         /* rules stay full-contrast ink, still 2px */
  --code-bg: #f3f2f2;      /* code/quickstart panels flip to paper */
  --code-fg: #201e1d;
  --code-red: #b32410;     /* accent readable on paper */
}
```

Dark-mode adjustments that keep it fun rather than dim:
- **The poster band stays solid `#ec3013`** (the light-mode red) with white text — a red flood glows plenty on a dark page; don't darken it.
- **The Tokens & cost band flips to paper** (light band on dark page) — it was the dark band in light mode; keeping it dark-on-dark would kill the page's rhythm. Its stats use `--code-red` (#b32410).
- Hero log panel: keep it dark (`#221c1a`, one step above `--bg`) with a 2px `--ink` border so it still reads as a framed object; row-type colors stay as specified (they were tuned for dark).
- Category marks/stripes: activity `--accent`, secondary `#ffb3a3`, neutral `#d8d2ce`, mid `#7d7672`, idle hatched from `#7d7672`. Same rule: idle is hatched, never solid.
- Buttons: primary keeps the solid red fill; secondary/ghost borders use `--ink`. Hover tints from `--accent-tint`.
- Grayscale images: add `filter: grayscale(1) brightness(.9)` and swap the border to `--ink` so screenshots don't blow out against the dark ground.
- Focus ring, link underlines: `--accent` — it's brighter now on purpose.

Rules of the style:
- **border-radius: 0 everywhere.** No rounded corners, no pill buttons, no soft shadows. Elevation = a 2px ink border, nothing else.
- Content column: `max-width: 1200px`, 40px side padding. Full-bleed color bands break out of it.
- Strong 2px ink horizontal rules (`<hr>` equivalent) between major sections.
- Everything flush left: headings, copy, button labels. Never center hero copy.
- Photography/screenshots: `filter: grayscale(1)` with a 2px ink border.
- Font: **Archivo** (vendored — see header note), weights 500/700/800. Headings 800, tight letter-spacing (-0.02em). Body ~15–16px, line-height 1.6. Code: system monospace.
- Interaction: every link/button gets a hover tint from the red; keyboard focus is `outline: 2px solid var(--accent); outline-offset: 2px`.

## 2. Category color code (used as the brand motif)

The app's five log types become a recurring stripe/mark language:

| Category | Color |
|---|---|
| activity | `--accent` (#ec3013) |
| issue / decision pair | `--accent-dark` (#7a1a0c) |
| task/neutral | `#3a3735` (dark ink) |
| github/secondary | `#8a8582` (mid neutral) |
| idle | hatched: `repeating-linear-gradient(135deg, #8a8582 0 4px, transparent 4px 8px)` |

Use these as: the striped bar above the hero headline, the 6px top borders on the "three steps" and "What it gives you" cards, and the small 28×6px marks on the six view cards. Idle is **always hatched, never solid** — absence shouldn't read as another kind of work.

## 3. Section-by-section

### Nav
Single row, 2px ink bottom border. Brand = 14px solid red square + "LogReporter" in 700. Links right-aligned: How it works, Tokens & cost, Live demo, GitHub. No background, no shadow.

### Hero — two columns (1.2fr / 1fr)
Left:
- A striped rule (8px tall, the 5 category colors as flex segments, idle segment hatched).
- H1 `clamp(40px, 5vw, 64px)`, weight 800, line-height 1.02: "See what your subagents **actually did** — and what it cost", with "actually did" in `--accent`.
- Tagline 22px/600, body copy, then three buttons: primary = solid red fill/white text, secondary = 2px ink border, ghost = plain. Square corners, labels flush left.
- Meta line 13px muted: "Python 3.8+ · no pip install · no account · the file never leaves your laptop".

Right — **the live log panel** (the one animated element):
- Dark panel (`--code-bg`), 2px ink border, monospace 12.5px.
- Title bar: small red square + "ACTIVITY_LOGS.DB — LIVE" uppercase, letter-spaced, bottom hairline.
- JS types in one log row every ~1.8s, looping through this script, each row fading/sliding in (`opacity 0→1, translateY(6px)→0, .3s`):
  1. `start` — Task accepted: Add rate limiting
  2. `activity` — Implemented POST /v1/ingest — batches up to 500 rows
  3. `decision` — Token bucket over sliding window: bucket is O(1) at our QPS
  4. `issue` — Retry 2/5 — SQLITE_BUSY, writer held the lock
  5. `github` — #push feat/rate-limit — 3 commits
  6. `idle` — 18m with no agent logging
  7. `end` — completed · 14.44M tokens · $10.68
- Row layout: type keyword left (70px min, bold, colored: activity #ff8a75, decision #ffd166, issue #ff5f45, github #7ec8e3, start/end/idle grey), text in `--code-fg` (idle text grey).
- A blinking red block caret (8×15px, 1s step-end) under the last row.
- Respect `prefers-reduced-motion`: render all rows statically, no ticker, no caret blink.

### "One screen, annotated"
2px rule, H2 34px/800. The timegoes screenshot grayscaled in a 2px ink border, italic caption below. Then the four annotations as a 4-column grid separated by 1px vertical hairlines, each led by a **56px red numeral** (1–4), body 14px. Keep annotation copy verbatim.

### Red poster band ("What makes it different")
**Full-bleed `--accent` background, white text.** Kicker uppercase 12px letter-spaced, H2 `clamp(30px, 3.6vw, 48px)` max-width 22ch, then the paragraph at 17px. This is the page's one big color flood — don't add another red flood elsewhere.

### Observed vs Declared
One box, 2px ink border, split into two equal columns by a 2px ink divider:
- Left "Observed from outside": plain, heading in muted grey.
- Right "Declared by the agent": background `--accent-tint`, heading in `--accent-deep`.
- Keep all eight point pairs verbatim; the decision example stays in monospace.

Below it, the trade callout: 2px **red** border box, `transform: rotate(-0.4deg)` (the deliberate "author's voice" tilt), lead-in "The trade, stated plainly." in `--accent-deep` bold.

### How it works (`#how`)
- Three steps as columns with a 6px colored top border (red / dark red / ink) and a **giant 80px numeral** in the matching color; titles 19px/700; copy verbatim.
- Below, a two-column grid: `grid-template-columns: repeat(auto-fit, minmax(min(440px, 100%), 1fr)); gap: 28px` so the code block wraps under the info box on narrow screens. Both children `min-width: 0`.
  - Left, "Before you wire this in": 2px ink border box; "!" mark in red 24px before the title; the hierarchy diagram as chips — `repository` (red fill, white) → `branch` (dark-red fill, white) → `task` (ink fill, white) → `agent` (ink outline) → `sub-agents…` (1.5px **dashed** grey outline, grey text) — joined by red "→" separators, monospace 13px, wrapping allowed.
  - Right, the quickstart code block: dark panel, one line per block-level element (don't rely on pre whitespace if your pipeline collapses it), `overflow-x: auto; white-space: nowrap`, comments in grey, the `→ http://127.0.0.1:8250` in `--code-red`. Keep the three commands verbatim. Blank-line spacers between steps.

### Six views
2px rule + red uppercase kicker "SIX VIEWS", H2 "Each answers one question", sub-line "Every card opens the live demo on that page."
- 3×2 grid of link cards inside one 2px ink border, 1px hairline internal grid lines.
- Each card: a 28×6px category mark (Hierarchy red, Chronology dark red, Where time goes ink, Metrics mid-red, Models grey, **Maintenance hatched**), title 18px/700, the question line, and "Open in demo →" in `--accent-deep` 13px/700.
- Hover: whole card fills `--accent-tint`. Cards link to the existing `app/index.html#…` anchors.
- Keep the "seventh page carries the documentation" line below.

### Tokens & cost (`#cost`) — dark band
Full-bleed `--code-bg` background, light text; kicker in `--code-red`.
- Two columns: grayscale metrics screenshot (2px grey border) left; copy right.
- The cache stats as a paired stat box (1px grey border, split in two): **"73% → 11%"** and **"26% → 79%"** at 40px/800 in `--code-red`, with 12.5px captions "Cache reads/writes: share of tokens vs share of cost". Surrounding copy verbatim, including the "modelled, not billed" note.
- "Built on ccusage" as a 1px-bordered box inside the band, links in `--code-red`.

### What it gives you
Six columns → 3×2 grid. **Drop the emoji icons**; each card is a 4px colored top border (same category rotation, last one hatched) + 18px/700 title + copy verbatim.

### Is it for you?
Two boxes side by side: "Good fit" with 2px ink border on `--accent-tint`, heading `--accent-deep`; "Look elsewhere" with 2px grey border, muted. Lists verbatim.

Then "Use at your own risk" (`#disclaimer`): light grey panel with a **6px solid red left border**, all three warning bullets and the closing paragraph verbatim.

### Sponsor
Rule + red kicker "SPONSOR", H2, copy verbatim, then the LESPIRANT banner **grayscaled** in a 2px ink border, wrapped in the existing UTM link.

### Footer
2px ink top border, single row: red square + "LogReporter · MIT · sponsored by LESPIRANT" left; Live demo / GitHub / Issues / ccusage / Disclaimer / llms.txt right. 13.5px.

## 4. Global details

- Links: ink text, red underline (2px thickness, 3px offset); hover shifts text to `--accent-deep`. On dark bands links are `--code-red`.
- Only two color floods on the whole page: the red poster band and the dark cost band. Everything else is ink on paper.
- Responsive: the hero and cost sections stack to one column under ~900px; annotation and card grids drop to 2 then 1 column; the how-it-works pair already wraps via auto-fit.
- Dark mode: use the `data-theme="dark"` token set defined in section 1 and its adjustment notes — hotter red, ember tints, the two color bands trade places (poster stays red, cost band flips to paper). Never a plain gray inversion.
