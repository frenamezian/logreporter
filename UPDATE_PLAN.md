# LogReporter — Update Plan

Comparison of the existing reimplementation (`index.html`, `app.js`, `components.js`, `styles.css`, `db.js`, `filters.js`, `time-model.js`) against the prototype specification in `prototype/project/LogReporter.dc.html` (which embeds both a User Guide and a Developer Guide describing the expected behavior of every UI element).

This plan lists only **verified gaps** — features present in the prototype but missing or incomplete in the reimplementation. Things the reimplementation already has (stacked bars, stat cards, day headers, idle gap rows, expand/collapse in the hierarchy tree, `buildModel`/`stream`/`fmt`, demo data loading, CSV/JSON export, delete + stored volume table, etc.) are intentionally not listed.

Sections are ordered roughly by impact. Each item references the prototype behavior and the file/area to change.

---

## 1. Shell / Layout (`components.js` AppShell, `styles.css`)

### 1.1 Collapsible left sidebar (rail mode) — MISSING
Prototype (`LogReporter.dc.html` ~L602–L619, L1699–L1700):
- State `sidebar: true` + `panels: {filters, nav}`.
- `«` button collapses the 262px sidebar into a 46px rail carrying only a filter-icon button (with a count badge when filters are active).
- Clicking the rail filter icon reopens the sidebar **with the Filters section expanded** (`openFilters`).
- `toggleSidebar` flips `sidebar`; `openFilters` sets `sidebar:true, panels.filters:true`.

Reimplementation: `<log-filters>` is a fixed 270px column with no collapse control.
**Change:** Add `sidebar` + `panels` state to `LogApp.state`; render either the full sidebar or the 46px rail in `AppShell`; add `«` button and rail filter icon; toggle via `LogApp.toggleSidebar()` / `LogApp.openFilters()`.

### 1.2 Independently collapsible Filters / Navigation sections — MISSING
Prototype (~L611–L707): The sidebar has two sections (Filters, Navigation), each with its own caret (`▾`/`▸`) and toggle (`panels.toggleFilters` / `panels.toggleNav`). Search input stays visible even when Filters is collapsed; the Filters body scrolls in a `max-height:44vh` container.

Reimplementation: Both groups are always fully expanded.
**Change:** Wrap each group's body in a collapsible container driven by `panels.filters` / `panels.nav`; add caret + header click toggles.

### 1.3 Right panel visibility — WRONG MODEL
Prototype (~L1096–L1145): The 372px right panel is the **detail panel only** and appears **only when a log is selected** (`<sc-if value="{{ detail }}">`). There is **no always-visible log list table** — log entries are shown inline within the Hierarchy/Chronology pages. Closing the panel (✕) clears the selection and the content region reflows wider.

Reimplementation (`components.js` L52–L56): A 360px `.right-panel` is always visible, containing `<log-list>` (a persistent table) + `<log-details>`.
**Change:** Remove the persistent `<log-list>` from the right panel. Make the right panel conditional on `state.selectedLog` (render only when set). Add a ✕ close button that calls `LogApp.selectLog(null)`. Move log-list-style entry rendering inline into the Hierarchy and Chronology pages (see §4.4, §5.3). The content region should reflow wider when no log is selected.

### 1.4 Breadcrumb strip in content region — MISSING
Prototype (~L712–L723): Above each page's content there is a fixed strip with breadcrumb buttons (`All repos › repo › branch › task`, each clickable to truncate drill to that depth), the page title, and a one-line note. Only the content area below scrolls.

Reimplementation: Pages render their own `<div class="page-title">` with a text breadcrumb appended (e.g. `Hierarchy — repo / branch`); no clickable breadcrumb buttons, no note, no fixed strip.
**Change:** Add a shared breadcrumb strip in `AppShell` (above `#pages`) with clickable crumb buttons that call `LogApp.setDrill(...)` at each depth and an "All repos" crumb that calls `clearDrill()`. Add per-page `note` strings.

### 1.5 Help page replaces the whole layout — MISSING
Prototype (~L56–L598): When `page.isHelp`, the **entire** header+sidebar+content shell is replaced by a dedicated help layout: a 268px left nav (Help sections) + a scrollable article. No main header, no filters, no right panel. "← Back to dashboard" returns to the previously remembered page.

Reimplementation (`components.js` L66): `<log-help>` is just another page inside the same shell, rendered in `#pages` alongside the sidebars and right panel.
**Change:** In `AppShell.setPage()`, when `page === 'help'`, swap the entire shell innerHTML for the help layout (help-nav aside + help article) instead of showing a page div. Remember the previous page so "Back to dashboard" restores it.

---

## 2. Header (`components.js` LogHeader)

### 2.1 Data-source dropdown menu — MISSING
Prototype (~L32–L53): The source button opens a **dropdown panel** containing:
- Data source name + detail line,
- "Open activity_logs.db" button,
- "Auto-poll on/off" toggle button (label reflects state),
- "Save database copy" button,
- Privacy note ("Runs entirely in the browser…").
- A transparent full-screen overlay closes the dropdown on outside click (`closeSrc`).

Reimplementation (`components.js` L97, L107): The source button calls `openDb()` directly — no dropdown, no auto-poll toggle, no save-db entry here, no click-outside handling.
**Change:** Add `srcOpen` state + a dropdown panel rendered in `LogHeader`; wire Open/Auto-poll/Save; add overlay for click-outside close.

### 2.2 Auto-poll — MISSING
Prototype (~L1297–L1306): `togglePoll` starts/stops a 5s interval that re-reads the file via the stored File System Access handle when `file.lastModified` changes. Falls back to manual refresh on non-Chromium browsers.
Reimplementation: No polling at all.
**Change:** Add `poll` state + interval in `LogApp`; store the file handle from `showOpenFilePicker` on `LogApp.state`/`LogDb`; check `lastModified` and re-read on change.

### 2.3 Help button title attribute — MISSING
Prototype (L38): `title="Help — user and developer guide"`.
Reimplementation: `title="Help"` only.
**Change:** Update the title attribute.

### 2.4 Nav tab labels — MINOR
Prototype tabs: "Hierarchy", "Chronology", "Where time goes", "Metrics", "Maintenance" (human-readable, only Hierarchy carries a count).
Reimplementation: uses the raw page keys (`hierarchy`, `chronology`, `timegoes`, `metrics`, `maintenance`, `help`) as visible labels.
**Change:** Map keys to display labels.

---

## 3. Filters / Left Sidebar (`components.js` LogFilters, `filters.js`)

### 3.1 Git action filter — MISSING
Prototype (~L630): a "Git action" dropdown (`f.git`) filtering by `pull`/`push`/`commit`/`add`/`delete` derived from tags/title (`GIT_ACTIONS` in `time-model.js`).
Reimplementation: no git filter.
**Change:** Add `git` to `DEFAULT_FILTER`, derive options from `GIT_ACTIONS`, apply in `applyFilters`.

### 3.2 Active filter chips — MISSING
Prototype (~L636–L640): each active filter renders as a dismissible chip (`label: value ✕`); clicking ✕ clears that one filter. A "Clear all filters" button appears when any are active.
Reimplementation: only a "Clear filters" button that wipes everything; no per-filter chips.
**Change:** Render chips for each non-empty filter; wire ✕ to clear that key; show "Clear all filters" when `hasFilters`.

### 3.3 Branch dropdown scoped to selected repo — MISSING
Prototype (~L627, `opts.scopeBranch`): the Branch dropdown options depend on the selected Repository.
Reimplementation: Branch options come from all rows regardless of selected repo.
**Change:** Compute branch options from rows filtered by `filter.repo`.

### 3.4 Navigation tree enhancements — MISSING
Prototype (~L654–L700):
- Per-node expand/collapse caret (independent open state, `n:`/`r:`/`b:`/`t:` keys),
- Meta info on the right of each node (wall-clock time / count),
- **Double-click** drills AND collapses the node (`drillCollapse`),
- An **agent leaf** level under tasks (toggle agent within task),
- "All repositories" reset button at top.

Reimplementation (`components.js` L146–L161): tree is always fully expanded; no carets; no meta; no double-click; no agent level; has "All repositories" button (OK).
**Change:** Add per-node open state + carets; add meta (e.g. `fmt(ms.wall)`); add `ondblclick` handler; add agent leaves; keep "All repositories".

### 3.5 Tree built from filtered-before-drill set — VERIFY
Prototype (~L1329–L1350): the nav tree is built from the **filtered** set (before drill scope) so siblings remain visible. `LogApp.update()` already sets `treeModel = buildModel(s.filtered)` (filtered, pre-drill) and `model = buildModel(s.inScope)` (drilled). This looks correct — verify behavior matches and leave as-is unless testing reveals otherwise.

---

## 4. Hierarchy Page (`components.js` LogTree)

### 4.1 "Time →" buttons — MISSING
Prototype (~L756, L744–L756): each repo / branch / task row has a "Time →" button that sets the drill scope to that node **and** switches to the "Where time goes" page.
Reimplementation: no such button.
**Change:** Add a "Time →" button on each row that calls `LogApp.setDrill({...})` then `LogApp.setPage('timegoes')`.

### 4.2 "Expand all" / "Collapse all" buttons — MISSING
Prototype (~L734–L736): a legend row with color swatches plus Expand all / Collapse all buttons that act only on in-scope nodes (independent of nav-tree state).
Reimplementation: none.
**Change:** Add a legend row + the two buttons operating on `LogTree._open`.

### 4.3 Inline log entry rows inside tasks — MISSING
Prototype (~L758–L833): expanding a task shows its individual log entries (time / type / agent / entry / level grid) sorted ascending; clicking an entry selects it and opens the detail panel.
Reimplementation: tree stops at the task level (no entry rows).
**Change:** When a task is expanded, render its `t.logs` (ascending) as clickable entry rows that call `LogApp.selectLog(l)`.

### 4.4 Compact vs roomy grid based on selection — MISSING
Prototype (~L792 vs L804, L349, L378): when the detail panel is open, entry rows drop optional columns (5-col → time/type/entry) so titles stay readable at the narrower content width.
Reimplementation: no grid switching.
**Change:** Pass `state.selectedLog` into the tree render; switch entry-row column set accordingly.

### 4.5 Selection highlighting — MISSING
Prototype (~L797, L374): selected row has a 2px accent left border + 12% accent background wash.
Reimplementation (`LogTree`): no per-row selected styling (only `LogList`/table rows have `.selected`).
**Change:** Add selected styling to the entry row matching `state.selectedLog?.id`.

### 4.6 Row badges + idle share — MISSING
Prototype (~L755, L745): rows show badges (`[12 logs]`, issue counts) and `XX% idle` next to wall time.
Reimplementation: shows `fmt(ms.wall)` and issue count text but no badge styling and no idle percentage.
**Change:** Add badge spans and compute `idleShare = pctOf(ms.idle, ms.wall)`.

### 4.7 Double-click-to-drill-collapse — MISSING
Prototype (~L346, L1311–L1313): double-clicking a tree node (repo/branch/task) sets the drill scope AND collapses that node.
Reimplementation: single-click drills; no double-click handler.
**Change:** Add `ondblclick` that drills and removes the node key from `_open`.

---

## 5. Chronology Page (`components.js` LogTimeline)

### 5.1 Newest/Oldest toggle — MISSING
Prototype (~L844–L846): "Newest first" / "Oldest first" buttons reverse the stream; day headers and idle rows are recomputed (not merely flipped).
Reimplementation: hardcoded descending sort (L257).
**Change:** Add `order` state (`'newest'`/`'oldest'`) and recompute `stream()` accordingly.

### 5.2 500-row limit + truncation note — MISSING
Prototype (~L867, L1477, L1767): renders the first 500 rows in scope and shows a truncation note in the header when hit.
Reimplementation: renders all rows.
**Change:** Cap rendered rows at 500; show a note when truncated.

### 5.3 Entry row content — INCOMPLETE
Prototype (~L867–L887): each entry row shows time, colored type dot, type, title, agent, repo/branch location, and a description snippet; idle rows name branch + task.
Reimplementation (L323–L327): shows time, type dot+type, title, agent + repo/branch; no snippet; idle row names task only.
**Change:** Add description snippet (truncated); include branch in idle row text.

### 5.4 Legend row — MISSING
Prototype (~L389): color legend (Activity/Issue/Decision/GitHub/Start-end/Idle) + entry count.
Reimplementation: none.
**Change:** Add a legend strip above the timeline.

---

## 6. Where Time Goes Page (`components.js` LogTimegoes)

### 6.1 Waterfall at task level — MISSING
Prototype (~L422–L428, L1522–L1539): when drilled to a task, show a waterfall — one row per agent run, indented by `agent_path` depth, horizontally positioned by real clock time, segmented by log type, with an IDLE row underneath showing gaps. Clicking a waterfall row selects that run's opening entry.
Reimplementation: only bar rows, no waterfall.
**Change:** When `drill.task` is set, render the waterfall using `task.runs` + `task.segments` + `task.gaps` from `buildModel`. Position segments with `%` left/width from the task span. Click → `selectLog(run.events[0])`.

### 6.2 Longest idle gaps table — MISSING
Prototype (~L430–L432, L938–L945): a "Longest idle gaps in view" table (repo / branch / task / from / to / idle) below the bars; clicking a row drills to that task.
Reimplementation: no gaps table (the model already exposes `model.gaps`).
**Change:** Render `s.model.gaps` (already computed) as a clickable table; onClick → `setDrill({repo, branch, task})`.

### 6.3 Clickable bar rows (drill one level deeper) — MISSING
Prototype (~L434, L1434): clicking a bar row drills one level deeper (repo→branch→task→agent) and re-renders this page; agent bars toggle agent filter within task.
Reimplementation (L376–L382): bar rows are non-interactive.
**Change:** Make bar rows call `LogApp.setDrill({repo})` / `{repo, branch}` / `{repo, branch, task}`; at agent level, toggle `drill.agent`.

### 6.4 Stat card secondary lines — MISSING
Prototype (~L414–L417): each stat card has a primary value + secondary line (e.g. "12 tasks", "71% of wall", "9 issues").
Reimplementation (L350–L354): primary value + label only.
**Change:** Add secondary line per card (tasks count, % of wall, issue count, etc.).

---

## 7. Metrics Page (`components.js` LogMetrics)

### 7.1 Two-column layout — MISSING
Prototype (~L446, L1000–L1058): left column = stat cards + distributions; right column = open issues cards + agent time table.
Reimplementation: single column.
**Change:** Wrap in a two-column grid.

### 7.2 GitHub operations breakdown — MISSING
Prototype (~L458–L460, L1021–L1028): bar chart of `push`/`commit`/`pull`/etc. counts derived from `gitAction()`.
Reimplementation: none.
**Change:** Add a GitHub ops section using `GIT_ACTIONS` + `gitAction` from `time-model.js`.

### 7.3 Median task duration by repository — MISSING
Prototype (~L463, L1029–L1036): per-repo median task wall time bar chart.
Reimplementation: none.
**Change:** Compute median `ms.wall` per repo from `model.tasks`; render bars.

### 7.4 Open issues as cards — INCOMPLETE
Prototype (~L1041–L1048): open issues rendered as cards with repo/branch, title, description, level tag, agent; clicking jumps to Hierarchy with that entry selected and ancestors expanded.
Reimplementation (L421): flat bar-rows with title + repo; click selects log and switches to hierarchy (close, but no ancestor expansion).
**Change:** Render cards; on click, also set `_open` keys for the entry's repo/branch/task so the tree expands around it.

### 7.5 Agent time with actual duration — INCOMPLETE
Prototype (~L1060, L1050–L1057): agent time table shows **duration** (e.g. "22m") + count.
Reimplementation (L397–L402): counts entries per agent only, no duration.
**Change:** Sum run durations per agent from `model.tasks[*].runs` and show `fmt(ms)` alongside count.

---

## 8. Maintenance Page (`components.js` LogMaintenance)

### 8.1 Custom confirmation dialog — MISSING
Prototype (~L491–L495, L1779–L1786): a custom modal showing the count + number of repositories affected, with Cancel / Delete buttons.
Reimplementation (L173): browser `confirm()`.
**Change:** Render a custom modal in `LogMaintenance` driven by `LogApp.state.confirm`.

### 8.2 Dynamic delete button label + live match count — PARTIAL
Prototype (~L481): "38 of 240 logs match this scope" live text + "Delete 38 logs" button label.
Reimplementation (L474): "0 logs match" static text + "Delete selected logs" button.
**Change:** Update match-count text on every scope change (already partially done) and set the delete button label to `Delete ${n} logs`.

### 8.3 Export scope note + stored-volume note — MISSING
Prototype (~L484, L487): Export section notes it "honours the page filters and drill scope"; Stored volume notes it is "always the whole database, never the scope".
Reimplementation: no such notes.
**Change:** Add the explanatory notes.

---

## 9. Detail Panel (`components.js` LogDetails)

### 9.1 Close button (✕) — MISSING
Prototype (~L1103): ✕ button clears selection and closes the panel.
Reimplementation: no close button; panel just shows an empty state.
**Change:** Add ✕ → `LogApp.selectLog(null)`.

### 9.2 Type badge + title header — MISSING
Prototype (~L1100–L1101): type tag + `<h4>` title at the top.
Reimplementation: jumps straight into a `<dl>` record grid.
**Change:** Add header with type badge + title.

### 9.3 Prev / Next in trace — MISSING
Prototype (~L1106): "‹ Prev in trace" / "Next in trace ›" buttons walk through entries sharing the selected log's `trace_id`.
Reimplementation: none.
**Change:** Compute trace siblings from `state.inScope` by `trace_id`; wire prev/next to `selectLog`.

### 9.4 Tags row — MISSING
Prototype (~L1108): tags rendered as accent badge chips.
Reimplementation: tags shown as a plain `<dd>` value.
**Change:** Parse `l.tags` (comma/space separated) and render chips.

### 9.5 Dedicated Error details section — MISSING
Prototype (~L1109–L1114): a styled "Error details" block with monospace pre + warning color, shown only when `error_details` exists.
Reimplementation: error_details is just another row in the `<dl>`.
**Change:** Pull error_details out of the grid into its own styled block.

### 9.6 Agent path chain — MISSING
Prototype (~L1115–L1122): `agent_path` rendered as an indented chain of path components.
Reimplementation: `agent_path` is a plain `<dd>` string.
**Change:** Split `agent_path` on `/` and render indented components.

### 9.7 Trace timeline visualization — MISSING
Prototype (~L1132–L1145): a vertical list of all entries in the trace, each with a dot (current = larger accent dot, others = small gray dot), an offset, and a title; clicking selects that entry.
Reimplementation: none.
**Change:** Build trace entries from `state.inScope` by `trace_id`; render the timeline list; click → `selectLog`.

---

## 10. Help Page (`components.js` LogHelp) — LARGELY MISSING

### 10.1 Full help layout with User Guide + Developer Guide — MISSING
Prototype (~L1187–L1200): two nav groups:
- **User Guide** (9 topics): Getting started, The header row, Filters and the tree, Hierarchy page, Chronology page, Where time goes, Metrics page, Maintenance page, Entry detail panel.
- **Developer Guide** (12 topics): Architecture, Data model, Queries, Duration and idle model, Page design, Master layout, Hierarchy layout, Chronology layout, Where time goes layout, Metrics layout, Maintenance layout, Agent logging prompts.
  - The 6 "…layout" topics are sub-items (indented 24px).

Reimplementation (`components.js` L507–L527): a single static page with ~4 lines of text and a log-type legend. No navigation, no sections, no developer guide.
**Change:** Implement the full help layout per §1.5: left nav with the two groups + active highlighting + sub-item indentation; article body that swaps content per `helpTopic`. Port the prototype's help text for each of the 21 topics.

### 10.2 Previous / Next navigation — MISSING
Prototype (~L587–L594, L1221–L1229): prev/next buttons walk the flat help topic list; scroll resets to top on navigation.
**Change:** Add prev/next buttons in the help article footer.

### 10.3 "← Back to dashboard" — MISSING
Prototype (~L77): returns to the page the user left.
**Change:** Add the button; restore the remembered page.

---

## 11. State / Misc (`app.js`)

### 11.1 State additions
Add to `LogApp.state`:
- `sidebar: true`, `panels: {filters: false, nav: true}`,
- `srcOpen: false`, `poll: false`, `order: 'newest'`,
- `helpTopic: 'started'`, `prevPage: 'hierarchy'`,
- `confirm: null` (for the delete modal),
- store the File System Access handle (e.g. `fileHandle`).

### 11.2 Methods to add
- `toggleSidebar()`, `openFilters()`, `toggleFilters()`, `toggleNav()`,
- `toggleSrc()` / `closeSrc()`, `togglePoll()`,
- `closeDetail()` (= `selectLog(null)`),
- `setHelpTopic(id)`, `closeHelp()`,
- `drillCollapse(key, repo, branch, task)` (drill + close node),
- `expandAll()` / `collapseAll()` for the hierarchy tree.

### 11.3 Export scope — VERIFY (likely OK)
Reimplementation exports `s.inScope` (filtered + drilled), which matches the prototype's "honours page filters and drill scope". No change expected, but verify drill scope is included.

### 11.4 Delete vs export scope separation — VERIFY
Prototype: delete uses its own independent scope (`d: {repo, branch, before, type}`), export uses page filters. Reimplementation: `scopeCount(scope)` builds its own filter object from the maintenance form — appears independent. Verify it ignores `state.filter` (it currently spreads `state.filter` then overrides — this may incorrectly include page filters). **Change:** `scopeCount` should build from an empty filter, not from `state.filter`, to match the prototype's "independent of page filter" behavior.

---

## 12. Suggested Implementation Order

1. **State + shell layout** (§1.1–1.4, §11.1–11.2) — foundation for everything else.
2. **Right panel model fix** (§1.3, §9) — remove persistent log list; conditional detail panel with close button + header + trace nav.
3. **Header dropdown + auto-poll** (§2).
4. **Filters: chips, git filter, scoped branch, nav tree enhancements** (§3).
5. **Hierarchy page polish** (§4).
6. **Chronology page polish** (§5).
7. **Where time goes: waterfall + gaps table + clickable bars** (§6).
8. **Metrics page: two columns + GitHub ops + median + cards** (§7).
9. **Maintenance: custom confirm dialog + notes** (§8).
10. **Help page: full layout + all 21 topics + prev/next** (§10) — largest content port.

---

## 13. Notes

- The reimplementation's data layer (`time-model.js`, `filters.js`, `db.js`) is largely faithful to the prototype and generally does not need rewriting — most gaps are in the **view layer** (`components.js`, `styles.css`) and in **shell/state behavior** (`app.js`).
- The prototype uses a DC runtime (`sc-if`, `sc-for`, `onClick="{{ ... }}"`); the reimplementation uses native Web Components with `innerHTML` + `attach()`. Keep the Web Component approach — translate behaviors, not template syntax.
- All bar geometry in the prototype is applied post-paint via `data-bar` attributes; the reimplementation already computes widths inline in JS, which is fine.
- Color tokens differ slightly (prototype uses `oklch(...)` and `--color-accent-*`; reimplementation uses hex `--accent` etc.). Visual parity is secondary to behavioral parity — match behavior first, then align colors if desired.

---

## 14. Target Directory Structure

The reimplementation should be reorganized into a simple static-site layout. The current flat layout (`index.html`, `app.js`, `components.js`, `db.js`, `filters.js`, `time-model.js`, `styles.css` all in root) should become:

```
log_reporter/
├── README.md              # project readme (new or updated)
├── index.html             # entry point — loads style.css and all scripts
├── style.css              # global styles (was styles.css)
├── activity_logs.db       # SQLite database (root) — agents write here, UI reads here
├── log_activity.py        # tool: append one activity-log row (all agents)
├── mint_trace.py          # tool: generate a trace_id (lead architect only)
├── orchestrator_logging_instructions.md  # lead's logging rules (inject into lead prompt)
├── subagent_logging_instructions.md      # subagent's logging rules (inject into every dispatch)
├── UPDATE_PLAN.md         # this plan (living doc)
├── IMPLEMENTATION_PLAN.md # original plan (living doc)
├── components/            # one file per Web Component (custom element)
│   ├── app-shell.js
│   ├── log-header.js
│   ├── log-filters.js
│   ├── log-tree.js
│   ├── log-timeline.js
│   ├── log-timegoes.js
│   ├── log-metrics.js
│   ├── log-maintenance.js
│   └── log-help.js
└── script/                # plain JS modules (state, data, models, filters)
    ├── app.js             # central state + event bus (was app.js)
    ├── db.js              # sql.js wrapper (was db.js)
    ├── time-model.js      # duration/idle/run derivation (was time-model.js)
    └── filters.js         # filter + drill logic (was filters.js)
```

Rules:
- `index.html` loads `style.css` once, then every `script/*.js` (data layer first: `time-model.js`, `filters.js`, `db.js`, then `app.js`), then every `components/*.js` (in dependency order, `app-shell.js` last since it references the others).
- Each Web Component lives in its own file under `components/` and registers itself via `customElements.define(...)`.
- No build step, no bundler, no module imports required — plain `<script>` tags are fine (matches the existing vanilla-JS approach). ES modules are acceptable only if every file is consistently `type="module"`; the current code uses IIFEs on `window`, so keep that pattern unless rewriting wholesale.
- The `prototype/` directory is reference-only and should not be touched or served.
- Keep `UPDATE_PLAN.md` and `IMPLEMENTATION_PLAN.md` in the root as living docs.

Migration steps when implementing:
1. Create `components/` and `script/` directories.
2. Move `app.js` → `script/app.js`, `db.js` → `script/db.js`, `time-model.js` → `script/time-model.js`, `filters.js` → `script/filters.js`.
3. Split `components.js` into one file per component class under `components/` (each class + its `customElements.define` call).
4. Rename `styles.css` → `style.css`.
5. Rewrite `index.html` `<script src="...">` tags to the new paths in the correct load order.
6. Verify the page still loads before applying any behavioral changes from §1–§12.

---

## 15. Orchestration Strategy for the Implementing Agent

The implementing agent ("lead architect") should preserve its own context window by delegating heavy reading, research, and bulk code generation to **background subagents**. The lead architect's job is to plan, dispatch, review, and integrate — not to read 4000-line files or write entire components inline.

### 15.1 When to use subagents

**ALWAYS delegate (do not do inline):**
- Reading large reference files: `prototype/project/LogReporter.dc.html` (~154KB), `prototype/project/support.js` (~69KB), `prototype/project/sample-logs.js`. Use `subagent_explore` (read-only) to extract exactly the lines/behaviors needed for a specific section.
- Porting help-guide content: the 21 help topics in the prototype total thousands of lines. Dispatch one `subagent_general` per group (User Guide topics, Developer Guide topics) to extract and reformat the text.
- Generating a complete new component file end-to-end (e.g. `components/log-help.js`, `components/log-timegoes.js` waterfall). Give the subagent the spec section + the data layer API + the existing file as a template, and have it write the file.
- Verifying a finished component against its spec section: dispatch `subagent_explore` to diff behavior vs. prototype.

**Do NOT delegate (keep inline):**
- Small, surgical edits to existing files (a few lines, a state field, an event handler).
- Cross-file wiring in `app.js` / `index.html` (the lead must hold the integration picture).
- Decisions about load order, state shape, or the event bus contract.
- Final review of how the pieces fit together.

### 15.2 Recommended dispatch pattern

For each major section of this plan, the lead architect should:

1. **Define the task precisely** — quote the relevant § from this plan, name the target file(s), and list the exact API surface the subagent may rely on (`window.LogApp`, `window.LR`, `window.Filters`, `window.LogDb`, the `logapp:update` event).
2. **Dispatch a background `subagent_general`** with `is_background: true` for any file-writing task, or `subagent_explore` for any read/research task. Launch independent tasks in parallel.
3. **Continue with other work** while background subagents run; do not poll. The system will notify on completion.
4. **Review the returned diff/output**, then make any small integration edits inline (e.g. wiring the new component into `app-shell.js`, adding a script tag to `index.html`).

### 15.3 Concrete dispatch plan by phase

**Phase 0 — Reorganize (inline, small):** Lead does the file moves and `index.html` rewrite directly (§14 migration steps). No subagent needed.

**Phase 1 — State + shell (inline):** Lead edits `script/app.js` and `components/app-shell.js` for §1.1–1.4, §11.1–11.2. These are surgical edits the lead must own.

**Phase 2 — Header dropdown + auto-poll (subagent):** Dispatch one `subagent_general` to write `components/log-header.js` per §2, given the existing header file and the prototype's dropdown markup (lines ~32–53, ~1297–1306). Lead wires the new file into `index.html`.

**Phase 3 — Filters + nav tree (subagent):** Dispatch one `subagent_general` to rewrite `components/log-filters.js` and `script/filters.js` per §3. Run in parallel with Phase 2.

**Phase 4 — Hierarchy page (subagent):** Dispatch one `subagent_general` to rewrite `components/log-tree.js` per §4, given the spec and the existing file as a template. Depends on Phase 1 state shape — run after Phase 1.

**Phase 5 — Chronology page (subagent):** Dispatch one `subagent_general` for `components/log-timeline.js` per §5. Parallel with Phase 4.

**Phase 6 — Where time goes (subagent):** Dispatch one `subagent_general` for `components/log-timegoes.js` per §6, including the waterfall. Parallel with Phases 4–5.

**Phase 7 — Metrics page (subagent):** Dispatch one `subagent_general` for `components/log-metrics.js` per §7. Parallel.

**Phase 8 — Maintenance page (subagent):** Dispatch one `subagent_general` for `components/log-maintenance.js` per §8. Parallel.

**Phase 9 — Detail panel (subagent):** Dispatch one `subagent_general` to extend/rewrite the detail component per §9. Parallel.

**Phase 10 — Help page (two subagents in parallel):**
- `subagent_explore` #1: extract all 9 User Guide topic bodies from `LogReporter.dc.html` (lines ~88–315) and return them as clean markdown/HTML.
- `subagent_explore` #2: extract all 12 Developer Guide topic bodies (lines ~316–595) the same way.
- Then one `subagent_general` writes `components/log-help.js` per §10 using both extractions.

**Phase 11 — Integration + verify (inline):** Lead wires any remaining script tags, runs a quick load check, and dispatches a final `subagent_explore` to audit each component against its spec section.

### 15.4 Subagent prompt template

When dispatching, always include:
- The exact § number(s) from this plan the subagent must satisfy.
- The target file path(s) to create or modify.
- The data-layer API it may call: `window.LogApp` (state + methods), `window.LR` (`buildModel`, `stream`, `fmt`, `gitAction`, `GIT_ACTIONS`), `window.Filters` (`applyFilters`, `drillRows`, `unique`), `window.LogDb`.
- The render contract: components extend a `LogComponent` base class whose `refresh()` re-renders on the `logapp:update` window event; `render()` returns HTML string, `attach()` wires events.
- The existing file (if any) as a style template — "match this file's conventions."
- An explicit instruction: "Do not edit files outside the listed paths. Return a summary of what you changed."
- **The contents of `subagent_logging_instructions.md` verbatim**, with `<name>`, `<trace_id>`, `<parent_trace_id>`, and `<task_title>` filled in. This is non-negotiable — every dispatched subagent must log its activity to `activity_logs.db`. See §16.5.

The lead must mint a trace_id (`python mint_trace.py`) for the current task *before* dispatching any subagent for it, write its own `start` row, then pass that trace_id to every subagent dispatch. See §16.3 and §16.6.

### 15.5 Context budget rule of thumb

If the lead architect's context approaches ~60% used, stop dispatching new writing subagents and instead:
- Finish in-flight work,
- Commit progress,
- Hand off to a fresh conversation with a short status note pointing back to this plan and the remaining §s.

This keeps any single session from degrading mid-implementation.

---

## 16. Agent Activity Logging (self-testing)

Every agent — the lead architect and every subagent — must log its activity to `activity_logs.db` as it works. This makes the dashboard self-testing: by the time the implementation is done, the database contains a real multi-agent run that the finished app can render. The schema and table name must NOT change (the prototype defines them; the app reads them).

### 16.1 The two tools (repo root)

**`mint_trace.py`** — generate a unique trace_id. **Lead architect only.** Prints an 8-char hex id (default) or longer with `--len`. Subagents never call this.
```
python mint_trace.py            # prints e.g. 9f2c41a8
python mint_trace.py --len 12    # longer id
```

**`log_activity.py`** — append one row to `activity_logs.db`, **asynchronously by default**. The parent validates args, spawns a detached background process that performs the INSERT, and exits immediately (exit 0) without printing a row id — so logging never blocks the agent. The background child opens the DB in WAL mode with a 10s busy timeout (concurrent agents + dashboard polling coexist). If a write still fails the busy timeout (rare with WAL), the child retries up to 5 times with exponential backoff (0.25s → 0.5s → 1s → 2s → 4s), logging each retry to `log_activity_errors.log`. Background write errors go to that same file. Does NOT mint traces — always receives a `--trace-id`. `--sync` waits and prints the row id for cases where it's needed (usually it isn't — `trace_id` is the meaningful identifier and it's an input).
```
python log_activity.py --log-type <type> --repo <repo> --branch <branch> \
  --task "<task title>" --agent <name> --agent-path <path> --trace-id <id> \
  --log-title "<one line>" [--log-description "..."] [--log-level info] \
  [--status in_progress] [--priority medium] [--tags "#x #y"] \
  [--parent-trace-id <id>] [--error-details "..."] [--performance-metrics '{"execution_ms":12}']
```
Required for an insert: `--log-type`, `--repo`, `--log-title`, `--agent`. `--agent-path` defaults to `--agent`. `--log-level` defaults to `info`. `--user-id` defaults to `admin`. The lead should check `log_activity_errors.log` occasionally.

### 16.2 The logging contract (from the prototype's "Agent logging prompts")

Every agent must follow this contract. It is baked into the mandatory prompt blocks in §16.5 — do not paraphrase it away.

**Bracket your work:**
- First action on a task: append a `start` row.
- Last action, always, even on failure: append an `end` row with the final `status`. Durations and idle time are derived from this pair — a missing `end` erases your work from every time view.

**While working, append one row per meaningful step — choose the log_type by this rule:**
- `activity` — what you did (a file read, a build, an edit, a command run). The default for "I did a thing."
- `decision` — a choice between alternatives. Record the alternatives and why you rejected them, not just the outcome. Use this whenever you picked an approach over others.
- `issue` — a failure, retry, or block. Put the raw error text in `--error-details`. When it is later fixed, log a follow-up `issue` row with `--resolved-by` set.
- `github` — any git operation. Tag the action in `--tags`: `#pull #push #commit #add #delete`.
- `start` / `end` — only the task brackets, never for intermediate steps.

**On every row:**
- `repo_name`, `branch_name`, `task_title` — identical for every row of one task, character for character (they are the grouping keys).
- `agent_name` — your name; `agent_path` — your lineage, e.g. `lead_architect/handler_dev`.
- `trace_id` — shared by every agent on this task.
- `log_title` — one specific line ("Chose append-only over upsert", not "Made a decision").
- `log_level` — `debug | info | warning | error`; `status` — `pending | in_progress | failed | completed`; `priority` — `low | medium | high | critical`; `tags` — comma-separated `#tokens`.

Do NOT log per token, per line, or inside tight loops. One row per step a human would want to see. Silence between rows is reported as idle time, so log when you begin waiting on something slow.

### 16.3 Trace_id ownership — lead architect only

The lead architect is the root agent and owns trace identity. This rule is baked into the lead's prompt block in §16.5. Subagents never mint a trace.

**MINT A NEW trace_id (`python mint_trace.py`) WHEN:**
- You accept a new task — one trace per `task_title`, created on the `start` row and reused by every row of that task, yours and your subagents'.
- The same task is retried as a fresh attempt after an `end` row was already written: new trace, and set `parent_trace_id` to the trace of the attempt it replaces.
- Work splits into an independent task reported on its own — its own `task_title`, its own trace, `parent_trace_id` set to yours.

**REUSE THE CURRENT trace_id WHEN:**
- You spawn a subagent for this task. Pass your trace_id down; the subagent writes it verbatim and sets `parent_trace_id` to your trace_id. Never mint a trace per subagent — the trace timeline is how a multi-agent run reads as one sequence.
- You resume the same task after an idle stretch, a retry of a step, or a handoff back from a subagent.
- Anything you log about the same `task_title`, however far apart.

**NEVER:** reuse a trace across different `task_title`s, mint one per log row or per tool call, or leave `trace_id` empty. Log the mint itself: on the `start` row that opens a new trace, say so in `log_description` (e.g. "trace 9f2c41a8 opened for this task; parent 4d10be77").

### 16.4 Suggested task/repo/branch for this implementation

So the dashboard groups the build sensibly:
- `repo_name`: `log_reporter`
- `branch_name`: `main`
- `task_title`: one per phase, e.g. `"Reorganize files"`, `"Implement header dropdown"`, `"Implement hierarchy page"`, `"Port help guide"`, etc.
- `agent_name` / `agent_path`: `lead_architect` for the lead; for subagents use the component name, e.g. `agent_name=header_agent`, `agent_path=lead_architect/header_agent`.

### 16.5 Mandatory instruction files (inject verbatim)

Two ready-to-paste instruction files live in the repo root and are the single source of truth for agent logging behavior. They embed the tool usage, the log_type decision rule, and the trace_id rules so no agent can forget them.

- **`orchestrator_logging_instructions.md`** — the lead architect's logging instructions. The lead's system prompt / agent definition MUST include this file's contents verbatim. It covers: the two tools (`mint_trace.py` for the lead only, `log_activity.py` for everyone), the start/end bracket rule, the log_type decision rule, the per-row field rules, and the full trace_id ownership rules (when to mint vs. reuse vs. never).
- **`subagent_logging_instructions.md`** — every subagent's logging instructions. EVERY subagent dispatch MUST include this file's contents verbatim, with the placeholders (`<name>`, `<trace_id>`, `<parent_trace_id>`, `<task_title>`) filled in by the lead before dispatch. It covers: the one tool the subagent uses (`log_activity.py`), the explicit "never call `mint_trace.py`" rule, the start/end bracket, the log_type decision rule, and the per-row field rules.

These files are referenced by §16 and §15.4. Do not paraphrase them — paste them whole. If the contract ever changes, edit the files (and §16.2) and every future dispatch picks up the new version automatically.

### 16.6 Orchestration rule for the lead

When the lead dispatches a subagent it MUST pass, in the task prompt:
1. The contents of `subagent_logging_instructions.md` with `<name>`, `<trace_id>`, `<parent_trace_id>`, and `<task_title>` filled in.
2. The current `task_title` to use for every row the subagent writes (the same as the lead's current task, unless the subagent is a genuinely independent task — in which case the lead mints a new trace first and passes that as `<trace_id>` and the lead's trace as `<parent_trace_id>`).
3. `repo_name` = `log_reporter` and `branch_name` = `main` (already baked into the instruction file, but confirm).

The lead is responsible for: minting the trace (`python mint_trace.py`) before the first `start` row of a task; passing it to every subagent; and writing the task's `end` row after all subagents for that task have finished (or letting the last subagent write it if the task is fully delegated).

### 16.7 Verification

Three smoke-test rows (ids 61–63, trace `063ddd11`, task "Test logging tool") were inserted to verify the tool. They are harmless demo data; leave them or delete them via the Maintenance page once it is implemented (which itself tests that feature). After the build, open `activity_logs.db` in the finished dashboard — the agents' own build activity should render across Hierarchy, Chronology, Where time goes, Metrics, and the trace timelines in the detail panel.

---

## 17. Default database loading (UI + tool both default to activity_logs.db)

Per the target directory structure (§14), `index.html`, `log_activity.py`, and `activity_logs.db` all live together in the repo root. Both the logging tool and the UI must default to that same file until the user explicitly picks a different one.

### 17.1 Logging tool — already correct

`log_activity.py` resolves the database relative to its own location:
```python
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "activity_logs.db")
```
Since the script sits in the repo root next to `activity_logs.db`, this always points at the right file. No change needed; agents just run `python log_activity.py ...` from the repo root.

### 17.2 UI — currently defaults to demo data (GAP, must fix)

The current `app.js` `init()` hardcodes demo data and never attempts to load `activity_logs.db`:
```js
async init() {
  const sample = await this.state.db.loadSample();
  this.state.rows = sample;
  this.state.src = { name: 'Demo data', demo: true, ok: false, detail: 'using bundled demo data' };
  this.update();
}
```

Required new behavior: on startup, the UI must try to load `activity_logs.db` (relative to `index.html`) and only fall back to bundled demo data if that fetch fails.

**Change in `script/db.js`** — add a `loadDefault()` method:
```js
async loadDefault() {
  const res = await fetch('activity_logs.db');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = new Uint8Array(await res.arrayBuffer());
  const SQL = await ensureSqlJs();
  this.db = new SQL.Database(buf);
  this.name = 'activity_logs.db';
  return this.readAll();
}
```

**Change in `script/app.js`** — `init()` becomes:
```js
async init() {
  try {
    const rows = await this.state.db.loadDefault();
    this.state.rows = rows;
    this.state.src = { name: 'activity_logs.db', demo: false, ok: true,
      detail: rows.length + ' rows · loaded by default' };
  } catch (e) {
    // file:// or missing file — fall back to bundled demo data
    const sample = await this.state.db.loadSample();
    this.state.rows = sample;
    this.state.src = { name: 'Demo data', demo: true, ok: false,
      detail: 'activity_logs.db not reachable (' + e.message + '); using demo data' };
  }
  this.update();
}
```

### 17.3 Why a fetch, not a file pick

- `fetch('activity_logs.db')` works when the site is served over a local HTTP server (the normal way to run a static site). The dashboard then reads the real, agent-populated database with no user action.
- It fails on `file://` (browser CORS blocks fetch of local files) and when the file is absent. Both cases fall back to demo data, so the page never breaks.
- The user can still pick a different database via the header data-source dropdown (§2.1) at any time; that path is unchanged.

### 17.4 Source status dot

With this default, the header status dot starts **accent (ok)** when served over HTTP (real DB loaded), or **neutral (demo)** when opened via `file://` or when the file is missing. This is the correct signal — the user sees immediately whether they are looking at live agent data or the demo.

### 17.5 Auto-poll interaction

When auto-poll (§2.2) is on and the default `activity_logs.db` was loaded via fetch, polling should re-fetch the same URL on an interval (since there is no stored File System Access handle for a fetch-loaded file). When the user picked a file via the picker, polling re-reads via the stored handle as before. The `refresh()` method should branch on which path loaded the data.

### 17.6 Implementation note

This is a Phase 1 (state + shell) change since it touches `app.js` init and `db.js`. The lead architect should make this edit inline alongside the other state changes in §11.1, before dispatching the header-dropdown subagent (which depends on the source-state shape).
