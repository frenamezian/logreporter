# Task 0010: Paper & Ink restyle — landing redesign + app light theme

## Metadata
- **Task ID:** 0010
- **Task Type:** Feature (visual restyle)
- **Task Trigger:** Manual — owner request, 2026-08-05
- **Title:** Paper & Ink restyle — landing redesign + app light theme
- **Use Cases:** None — LogReporter has no functional spec; this is a visual restyle of existing, working pages. Skip the use-case loading steps of `exec_task.md`.
- **Phase:** Standalone (this repo has no phase plan)
- **Priority:** Medium
- **Estimated Time:** 6–10 hours
- **Dependencies:** None
- **Related Docs:**
  - [Landing redesign brief](references/landing_redesign_brief.md) — **normative for the landing.** Section-by-section spec, both theme token sets, the hero animation script. The copy in the prototype's Downloads folder is stale; this one is authoritative.
  - [site/README.md](../site/README.md) — the build/publish contract for the landing + demo. Read in full before touching `site/`. Non-negotiable invariants live here (zero network calls, demo exported from HEAD, database hygiene).
  - [style.css](../style.css) — the app's token sheet. The header comments of the two `:root` blocks are normative for how the app handles theming ("no literal colour outside these two blocks").
  - `seed/validate_palette.js` — the contrast/CVD validator the app's palettes were shipped with. Stage A re-runs it; Stage B checks it was run.

### Repo context — read before anything else

This task lives in **`C:\Users\lotra\Documents\github\log_reporter`**, its own git repository, **outside** the Playground workspace. Consequences:

- `exec_task.md`'s context resolution (`ai_context.md`, `DOCS_ROOT`, `GUIDELINES_ROOT`) does not apply. All relative paths in this file resolve against the **log_reporter repo root**. The four-stage Build → Review → Test → Close loop, the branch-safety rule, the retry caps, and the mandatory Stage B/C dispatches apply unchanged.
- **Branch safety:** create `restyle/task-0010-paper-ink` off the default branch before any edit. Never commit to the default branch directly.
- **Never in the diff:** `activity_logs.db`, `token_usage.db`, `site/_build/`, `__pycache__/`. The repo's `.gitignore` documents why at length; `site/publish.py` independently refuses real databases.
- **Publishing is out of scope.** This task ends at a green `python site/build.py` and a locally inspected `_build/`. Running `site/publish.py --push` (which updates the public site) is the owner's decision, after review of the branch.

---

## ⚠️ Activity logging — MANDATORY for every agent in this run

Every agent that participates in this task — the Lead Architect / task-executor, `code-reviewer`, and `test-writer` — **must log its activity to `activity_logs.db`** (this repo's root; gitignored) via the three scripts at the repo root, run with the plain `python` on PATH and **absolute paths**:

- `C:/Users/lotra/Documents/github/log_reporter/mint_trace.py`
- `C:/Users/lotra/Documents/github/log_reporter/log_activity.py`
- `C:/Users/lotra/Documents/github/log_reporter/query_activity.py`

**Normative instructions** (read before Stage A, follow to the letter):
- Dispatchers: `C:\Users\lotra\Documents\github\Playground-Harness\.ai_commands\orchestrator_logging_instructions.md`
- Dispatched agents: `C:\Users\lotra\Documents\github\Playground-Harness\.ai_commands\subagent_logging_instructions.md`
- (If running from the main worktree, the same files exist under `C:\Users\lotra\Documents\github\Playground\.ai_commands\`.)

Key invariants, restated for emphasis (the instruction files above remain the source of truth):

1. **One trace ↔ one task title.** The lead mints exactly one trace for `Task 0010: Paper & Ink restyle — landing redesign + app light theme`. Subagents never call `mint_trace.py`.
2. **`--agent-path` is agent lineage, never a filesystem path** — e.g. `lead_architect/code_reviewer`. `--agent` must equal the last path segment.
3. **The dispatcher writes `start` and `end` brackets for every agent it dispatches** (`--status in_progress` / `completed` or `failed`), verifying via `query_activity.py` that the `start` row exists before writing `end`. Floor of **3–8 interior rows** (`activity`, `decision`, `issue`, `github`) across the run.
4. **Synchronous writes** (never `--async`); every subagent row carries `--tags "#subagent:<type>"`; tokens are never logged directly.

Note the pleasant recursion: this run's rows land in the very database the app under restyle displays. When the task is done, opening the app shows the restyle happening — in the new theme. Do not commit the database.

---

## Description

Two coordinated restyles, one brand: the "Paper & Ink" direction from the Claude Design prototype (paper ground `#f3f2f2`, near-black ink `#201e1d`, red `#ec3013` as the single brand accent).

**Workstream A — Landing page (`site/`): full visual redesign.** Implement [references/landing_redesign_brief.md](references/landing_redesign_brief.md) on `site/index.html` + `site/assets/css/site.css`. Layout and color change freely; **all copy stays verbatim**; anchors (`#how`, `#cost`, `#disclaimer`) and every link survive. The one behavioral addition is the animated hero log panel specified in the brief. Both landing themes (Paper light / charred dark) are in scope.

**Workstream B — App (`style.css`): light theme only, colors only.** Replace the "high summer" light theme with a Paper & Ink light theme (direction approved by the owner on a mockup, 2026-08-05). **The dark theme, all layouts, all content, and all logic stay untouched.** The full scope contract is in Objectives below.

**Shared: vendored Archivo.** Owner decision: the Archivo font (weights 500/700/800) is **self-hosted** — woff2 files committed to the repo, loaded via `@font-face`. Never a Google Fonts (or any external) link: the landing's documented invariant is *zero network calls*, and the app's promise is *the file never leaves your laptop*. This is the one deliberate deviation from the brief's original wording. In the app, Archivo applies to **chrome/headings only** (`--font` stays system for data-dense content is acceptable; use judgment, but data tables stay system/mono for density).

## Scope contract (what "colors only" means for the app)

Approved changes to the app, exhaustively:

1. **Token values** inside the `:root[data-theme="light"]` block of `style.css` (and any *new* tokens both blocks must then define).
2. **`--radius: 0` and shadow → border**, scoped so the **dark theme renders pixel-identical** (override within the light block; do not touch the shared values in a way that changes dark).
3. **One small markup addition in the header only:** the 5px category-color stripe under the top bar (five segments: activity/issue/decision/github + hatched idle, from the existing log-type tokens). This is the *only* DOM change permitted anywhere in the app. The existing L brand mark in `components/log-header.js` **stays** — it is recolored via tokens/CSS, never replaced (see the brand-mark row below).
4. **The `@font-face` declarations + font file additions** per the shared decision above.
5. **Comment updates** in `style.css` where the "high summer" header comment becomes false.

Everything else — layout, spacing structure, component markup, JS logic, the dark theme's rendered output, view content — is **out of scope**. A finding that something else "should" change is escalated to the owner, not implemented.

> **Escalations resolved by the owner during execution (2026-08-05):** (a) `docs/design.html` — the in-app design doc contradicted the restyle after Stage B round 1; owner approved updating it within this task. (b) The brand mark's corners are squared in both themes (third sanctioned dark exception, recorded in the acceptance criteria above).

### App light theme — target palette ("Paper & Ink")

| Role | Current (high summer) | Target | Note |
|---|---|---|---|
| Page ground `--bg` | `#fffaf2` sand | `#f3f2f2` paper | |
| Cards `--surface` | `#ffffff` | `#ffffff` | pops as an object on paper |
| Chrome `--surface-2` | `#fdeedb` | split — see below | |
| Top bar | (was `--surface-2`) | near-black ink `#262322`, text `#eceae9` | needs a **new token** (e.g. `--topbar-bg`/`--topbar-fg`) defined in both theme blocks; in dark it keeps today's rendered look |
| Sidebar / inputs / table heads | (was `--surface-2`) | paper-family, e.g. `#eae8e7` | subtle, not dark |
| Brand mark (existing L in `log-header.js`) | blue stem + category foot | stem brand-red `#ec3013` in **both** themes (owner decision 2026-08-05 — the one sanctioned dark-theme change); foot keeps its category colors, using the dark-tuned set on the ink bar so it stays bright | **red appears nowhere else in the app** — in-app red otherwise means `--issue`. The "no red" comment above `BRAND_MARK` records the superseded decision; update it |
| Active nav tab | blue pill | paper-on-ink block (square) | interaction accent stays blue elsewhere |
| Text `--text` / `--text-dim` | `#33261c` / `#785c45` | `#201e1d` / `#6f6a67` | |
| Borders `--border` | `#f0dcc2` | structural borders ink-leaning (e.g. `#c9c5c3`); keep hairlines subtle | dense tables must not shout |
| Accent `--accent` | `#0a72c4` blue | keep blue; retune only if contrast vs. the new grounds fails | never red |
| Log types | validated set `#0d8442 #e02d1b #3a5fe0 #0099b0` + hatch | **unchanged** | re-validate vs. new surfaces (Step 7) |
| Stat tiles | light cards | near-black tiles `#262322` even in light mode | new tokens (e.g. `--tile-bg`/`--tile-fg`); numerals may use the dark-tuned usage colors, which were validated for dark surfaces |
| Category stripe | — | 5px band under the top bar from the log-type tokens; idle segment **hatched, never solid** | |
| Zebra / washes | barely visible | one step stronger so rows have rhythm on white | |
| Radius / shadow | 8px / soft shadow | 0 / 1px border (2px panels) — **light theme only** | |

---

## Objectives

1. Landing implements the brief on both of its themes, copy-verbatim, anchors and links intact, hero animation working with a reduced-motion fallback, at zero external network requests.
2. App light theme becomes Paper & Ink per the table above, within the scope contract; app dark theme renders identically to before.
3. Archivo 500/700/800 vendored once, used by both surfaces, no external font request anywhere.
4. Palette validator re-run and passing for every palette whose surface changed.
5. `python site/build.py` green; `_build/` inspected locally; discoverability files kept true (sitemap `<lastmod>`, og-card).

---

## Acceptance Criteria

### Landing
- [ ] Rendered text content of `site/index.html` is identical pre/post (whitespace aside) — this is checkable by diffing extracted text, and Stage C must check it that way, not by eyeball.
- [ ] `#how`, `#cost`, `#disclaimer` anchors resolve; every pre-existing link (incl. the sponsor UTM link and all `app/index.html#…` demo links) survives.
- [ ] Zero external requests from `file://`: no `fonts.googleapis.com`, no CDN, no `fetch`. (Vendored fonts are local files and comply.)
- [ ] Hero log panel types its 7-row script on loop per the brief; `prefers-reduced-motion` renders all rows statically with no ticker and no caret blink.
- [ ] Both themes match the brief's token sets; exactly two color floods per theme, with the dark-mode band swap (poster stays red, cost band flips to paper).
- [ ] Screenshots grayscale in 2px ink borders; `border-radius: 0` everywhere; headings/copy/buttons flush left.
- [ ] Responsive per the brief (~900px stack points, no horizontal scroll at 375px).
- [ ] `sitemap.xml` `<lastmod>` bumped; og-card redrawn to the new brand (`build.py --og-card`, after updating `tools/build_og_card.py`'s copied colors — a documented literal-color exception); `llms.txt` untouched unless a claim changed (none should).
- [ ] `site/README.md` updated where this task makes it false (the "no fonts" line becomes "self-hosted fonts, zero external requests"; `assets/fonts/` added to the layout listing).
- [ ] The nav and footer brand is the shared **L mark** (inline SVG, geometry copied from `components/log-header.js`'s `BRAND_MARK`), in the landing's red-family dialect: stem `#ec3013`, foot `#ec3013`/`#7a1a0c`/`#3a3735`/`#8a8582`/hatch. This is an owner-approved deviation from the brief's plain red square, recorded in the reference brief's header.

### App
- [ ] Dark theme is **render-identical**, with exactly three permitted exceptions (the third added by owner decision during execution, 2026-08-05): the new category stripe, the brand mark's stem turning brand-red, and the brand mark's corners squared (rx 2.8 → 0) — all styled in dark from tokens. Everything else in dark: no visible difference on a before/after screenshot pair of at least Hierarchy + Metrics.
- [ ] Light theme shows: paper ground, white cards with visible borders, ink top bar with red brand square and paper-on-ink active tab, 5-segment category stripe (idle hatched), dark stat tiles, square corners, no soft shadows, stronger zebra.
- [ ] Diff limited to: `style.css`, the header markup file (stripe only), `components/log-header.js` (`BRAND_MARK` colors + its comment, nothing else), font files + their `@font-face`, and any `?v=` cache-bust bumps. All other `components/*.js` untouched.
- [ ] No color literal outside the two token blocks of `style.css` (the file's own rule) — verified by grep, allowing only the documented exceptions (`og-card`, `favicon`).
- [ ] Red (`#ec3013` family) appears in the app **only** as the brand mark's stem. It is never a hover, focus, link, or selection color — in-app red is otherwise reserved for `--issue`.
- [ ] `node seed/validate_palette.js` passes for: (a) light log-type set vs `#ffffff` and `#f3f2f2`; (b) usage ramp vs the stat-tile surface; (c) rank ramp vs the stat-tile surface. Outputs recorded in the completion note. Any FAIL → adjust values minimally (keep hues recognizable) and re-run.
- [ ] All six views + Help render legibly in the new light theme (screenshot each: Hierarchy, Chronology, Where time goes, Metrics, Models, Maintenance).

### Build & hygiene
- [ ] `python site/build.py` completes green; `_build/index.html` and `_build/app/` open correctly from `file://` — remember the demo exports from **HEAD**, so commit before building.
- [ ] No database files, no `_build/`, no `__pycache__` in the diff.
- [ ] Every participating agent's rows exist in `activity_logs.db` with correct brackets, lineage, and tags (spot-check with `query_activity.py` at Stage D).

---

## Implementation Steps

### Step 0: Branch + logging bootstrap
Create `restyle/task-0010-paper-ink`. Mint the trace (title above, exactly once), write the task `start` row, then proceed.

### Step 1: Vendor Archivo
Obtain Archivo woff2 for weights 500/700/800 (latin subset is sufficient), place under `site/assets/fonts/` (landing) and `fonts/` (app root — the app cannot reach into `site/` when served by `serve.py`; duplicating ~3 small files in two places is acceptable and keeps each surface self-contained). Declare `@font-face` with `font-display: swap` in each stylesheet. Verify zero external requests remain.

### Step 2: Landing — tokens and structure
Rebuild `site/assets/css/site.css` around the brief's two token sets. Work top-to-bottom through the brief's section order (nav → hero → annotated screen → poster band → observed/declared → how → six views → cost band → gives-you → fit → sponsor → footer). Copy stays verbatim; re-nesting markup for the new layout is allowed, deleting or rewording content is not.

### Step 3: Landing — hero animation
Inline `<script>` (no external file needed if it stays small; a local `site/assets/js/` file is also fine): the 7-row typing loop, ~1.8s cadence, fade/slide per row, blinking caret, `prefers-reduced-motion` static fallback. No network, no dependencies.

### Step 4: Landing — dark mode
Apply the `data-theme="dark"` token set and the brief's dark-mode adjustment list. Reuse the page's existing localStorage theme mechanism — do not invent a second one.

### Step 5: App — light theme tokens
Rewrite the `:root[data-theme="light"]` block per the palette table. Introduce the new tokens (`--topbar-*`, `--tile-*`, stripe needs none — use log-type tokens) **in both blocks** so dark keeps rendering as today. Update the block's header comment (it currently describes "high summer" and would become false). Scope radius/shadow overrides to light.

### Step 6: App — stripe + brand-mark recolor
Add the 5px category stripe under the top bar — the only DOM addition. Recolor the existing `BRAND_MARK` L in `components/log-header.js`: stem to brand red `#ec3013` in **both** themes; foot segments keep their category colors, taking the dark-tuned values while on the ink bar (scope token overrides on the bar/brand container rather than hardcoding values in the SVG). Update the code comment above `BRAND_MARK` — it records the superseded "no red in the mark" decision and would otherwise become false. Confirm stripe + mark look intentional in dark mode (dark log-type colors there).

### Step 7: Palette validation
Run the three `validate_palette.js` checks from the acceptance criteria. Record command lines + verdicts for the completion note. Adjust minimally on failure.

### Step 8: Discoverability + README
`sitemap.xml` lastmod; update `tools/build_og_card.py` colors and run `python site/build.py --og-card`; update `site/README.md` (fonts line, layout listing). Commit.

### Step 9: Build + verify
`python site/build.py`; open `_build/index.html` and `_build/app/index.html` from `file://`; run the Manual Verification list. Do **not** publish.

---

## Manual Verification Steps
- [ ] Open `site/index.html` via `file://` — page renders fully styled, DevTools network tab shows zero external requests.
- [ ] Toggle landing theme both ways; check the two floods swap correctly in dark.
- [ ] Emulate `prefers-reduced-motion` (DevTools → Rendering) — hero is static, complete, caret not blinking.
- [ ] Start the app (`start_LogReporter.bat` or `python serve.py`, then `http://127.0.0.1:8250`) — walk all six views + Help in light mode; screenshot each.
- [ ] Switch the app to dark — confirm it looks exactly as before (compare against pre-change screenshots taken at Step 0).
- [ ] Narrow the landing to 375px width — no horizontal scroll, sections stack per the brief.
- [ ] `python site/build.py` then open `_build/index.html` — demo links work, demo app carries the restyle.
- [ ] Tear down any server started for verification and confirm the port is free (`Get-NetTCPConnection -LocalPort 8250 -State Listen`) — per `exec_task.md` dev-server hygiene.

---

## Testing Requirements

This repo has no JS test framework and gets none from this task. Stage C's tests are **plain-python check scripts** (suggested home: `tasks/checks/`), runnable standalone, plus the screenshot checklist above. Suggested checks — Stage C owns the final plan:

### Automated (scriptable) checks
- Text-verbatim check: extract visible text from the pre-change `site/index.html` (from git history) and the new one; diff must be empty modulo whitespace.
- Anchor/link inventory: every `href`/`id` present before is present after.
- External-request guard: grep the built `_build/index.html` + CSS for `https?://` in `src`/`href`/`url()` asset references; allow only the documented absolute canonical/`og:` metadata URLs.
- Literal-color guard: grep `style.css` for hex/rgb outside the two token blocks.
- Reduced-motion guard: the `@media (prefers-reduced-motion: reduce)` block exists and neutralizes the ticker + caret.
- Palette validator invocations (the three from acceptance criteria) wrapped as a check.

### Frontend/UI
- [ ] Screenshot set: 6 views + Help in app light; 2 views in app dark (before/after identical); landing in both themes at desktop + 375px.

---

## Definition of Done
- [ ] All code implemented within the scope contract.
- [ ] Automated checks passing; screenshot checklist complete.
- [ ] All acceptance criteria met.
- [ ] Stage B (code-reviewer) PASS; Stage C (test-writer) PASS — both dispatched cold, both logged with `#subagent:` tags and start/end brackets.
- [ ] Activity rows verified present at close.
- [ ] Branch pushed; publishing left to the owner.

---

## Notes & Tips
- **The brief's "Google Fonts" line is overridden** — self-hosted only. This is written into the reference brief's header too.
- **The landing brief remaps the five categories to a red-family monochrome (its §2) — that is landing-only poster abstraction.** The app's category stripe uses the app's real log-type tokens (green/red/blue/cyan/hatch). Do not import the landing's red-family stripe into the app, and do not "fix" the landing to use the app's hues.
- The app's current light `--accent` `#0a72c4` was contrast-tuned against cream (see the comment at `style.css` light block); re-check its ratios against `#f3f2f2` / `#ffffff` / the new chrome value before assuming it survives.
- `export_app.py` injects `window.LR_HOME` and metadata into the exported app — nothing in this task should touch that machinery.
- Bump `?v=` on the app's asset links when re-exporting (existing rule; see `site/README.md`).
- The sponsor image has no WebP pair because its source isn't tracked — pre-existing, out of scope.

## Critical Rules
1. **Do NOT** invent features or copy. The brief + the scope contract are the whole task.
2. **Do NOT** modify the app's dark theme, layouts, content, or logic. Escalate the temptation instead.
3. **Do NOT** publish (`publish.py`) — build and verify only.
4. **Do NOT** let any agent skip activity logging — it is part of Definition of Done, not optional telemetry.
5. **Links:** file links in this task are relative to `tasks/` in the log_reporter repo.

---

## Completion Checklist
- [ ] All acceptance criteria met
- [ ] All checks passing
- [ ] `activity_logs.db` rows verified (brackets, lineage, tags)
- [ ] Ready for owner review + publish decision

---

# Closeout Documentation

This section is filled in by Stage D (Close) of `exec_task.md` — kept short by design. Git already owns the diff; this section owns *why*, briefly.

<!--MARKER INSERT DESIGN DEVIATION BELOW -->
## Design Deviation v1

Four recorded deviations from this task's own tables, each with cause:
1. **Light `--text-dim` is `#67625f`, not the table's `#6f6a67`** — the table's value measured 4.37:1 on the new `--surface-2`, under AA for the small text that renders there (Stage B round 2). Same class of retune the task explicitly authorized for `--accent` (which became `#0a69b5`, and `--accent-hover` `#08568f`).
2. **Usage and rank ramps validated vs `#ffffff`, not "the stat-tile surface"** — as built, no usage/rank color renders on a tile (`.metric-card` rebinds only text tokens); white cards are where the ramps render. Verified true by both Stage B and Stage C.
3. **Radius zeroing is one light-scoped blanket rule**, not per-value tokenization — provably cannot affect dark; squares the dots by design (matches the approved mockup).
4. **Owner-approved scope extensions during execution:** `docs/design.html` synchronized (was contradicting the restyle in-app), and the brand mark's corners squared in both themes (third sanctioned dark exception).

<!--MARKER INSERT COMPLETION REPORT BELOW -->
## ✅ Completion Report v1

**Completed:** 2026-08-06 · **Branch/commit:** `restyle/task-0010-paper-ink` @ `4690b64` (impl `0567bde`, review fixes `358471f`/`9b57719`/`bc9159f`, checks `4690b64`) · **Deviation:** four, described above

**Summary:** Landing fully restyled to Paper & Ink per the reference brief (copy verbatim, paper now the default theme, animated hero log panel, vendored Archivo, zero external requests preserved); app light theme rebuilt as Paper & Ink with dark render-identical by construction except the three sanctioned exceptions (category stripe, red mark stem, squared mark corners). Stage B ran the full 3 rounds — round 3 blocked on two single-line findings **fixed inline with no cold read** (`docs/design.html` token-table hexes; `--accent-hover` AA), taken to Stage C as its first explicit target and both independently confirmed there. Stage C: PASS, 11 mutation-verified checks in `tasks/checks/` (run via `python tasks/checks/run_all.py`).

**Palette validator outputs (2026-08-05/06):** log types `#0d8442,#e02d1b,#3a5fe0,#0099b0` light vs `#f3f2f2` → ALL PASS; vs `#ffffff` → ALL PASS; usage `#b06f00,#c8306f,#6a4fd0,#d34a13` light vs `#ffffff` → ALL PASS; rank ramp vs `#ffffff --ordinal` → ALL PASS (light-end 2.60:1). Dark-tuned set vs the ink bar `#262322` FAILS CVD/lightness checks it also fails on its own home surface (pre-existing property; colors only the decorative mark foot there, never data).

**Acceptance criteria:** ✅ all, with the two reinterpretations recorded under Design Deviation (ramps-vs-white; red appears on the mark's stem *and* its heel block, which together form the L's corner).

**Issues encountered:**
- Round-1 review caught the favicon edited in its generated copy and `fonts/` missing from the demo export — both real ship-breakers.
- Rounds 2–3 repeatedly caught prose/comments drifting from values (including one genuine AA miss behind an overstated comment); `check_design_doc_tokens.py` + `check_wcag_claims.py` now close that class mechanically.
- Owner escalations resolved during execution: update `docs/design.html` (yes), square the mark corners (yes).

**Carried forward for the owner (not defects of this task):**
- Publish is the owner's call: `python site/publish.py --push` after reviewing `site/_build/`.
- Pre-existing white-on-translucent-accent washes (`style.css` §497/§824-area) measure < 2:1 in light mode under high summer too — out of scope, needs its own small task.
- First-time visitors: landing defaults paper, demo defaults dark (stored choices carry over; only the no-stored-value case mismatches).
- 375px nav wraps to three lines — meets the criterion, reads cramped; owner's eye requested.

### Next Steps
- Owner reviews branch → decides on `python site/publish.py --push`
- (Deferred follow-ups, not in this task: theme-continuity for first-time visitors between landing (paper default) and demo (dark default); the app-wide radius flattening in dark mode. The brand mark's corners are already square in both themes — delivered as the third sanctioned exception.)

# Version History
<!--MARKER INSERT VERSION HISTORY BELOW -->
v1.1 (2026-08-06) - Task executed and closed: Build → Review (3 rounds, round-3 inline exit) → Test (PASS, 11 checks) → Close. Two owner escalations resolved mid-run (design.html sync; mark corners).
v1.0 (2026-08-05) - Task authored (Claude Code session with owner; direction approved on mockup)
