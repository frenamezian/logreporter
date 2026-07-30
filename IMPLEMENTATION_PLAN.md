# LogReporter — Implementation Plan

## 1. Goal

Reimplement the `LogReporter` prototype in plain HTML, CSS, JavaScript, and Web Components, using a local SQLite database read in the browser. No React, no build step, no backend.

## 2. Constraints & Decisions

- **No framework:** vanilla JS, custom Web Components (native `customElements`).
- **No React:** the prototype's DC runtime and React dependencies will be replaced by a custom component glue layer.
- **Local-only:** no login, no server, no upload.
- **SQLite in browser:** `sql.js` (WASM) to read `activity_logs.db` from a file picked by the user.
- **File access:** File System Access API with `<input type="file">` fallback.
- **Single-page:** all views in `index.html`; views switch via Web Component routing/visibility.

## 3. Tech Stack

| Layer | Choice |
|-------|--------|
| Markup | `index.html` |
| Styling | `styles.css` + CSS custom properties (dark theme) |
| Logic | `app.js` (state, db loading, filtering, exports) |
| Web Components | `components/*.js` |
| SQLite | `sql.js` (`sql-wasm.wasm` + `sql-wasm.js`) from CDN or vendored in `lib/` |
| Charts/Timeline | Plain DOM/CSS bars, no external chart library |

## 4. Project Structure

```
log_reporter/
├── index.html
├── styles.css
├── app.js
├── db.js              # sql.js wrapper, load/save .db
├── time-model.js      # duration/idle/run derivation (reuse/rewrite from prototype)
├── filters.js         # filter state and log filtering
├── components/
│   ├── app-shell.js
│   ├── log-header.js
│   ├── log-filters.js
│   ├── log-tree.js
│   ├── log-list.js
│   ├── log-details.js
│   ├── log-timeline.js
│   ├── log-timegoes.js
│   ├── log-metrics.js
│   ├── log-maintenance.js
│   └── log-help.js
├── lib/
│   ├── sql-wasm.js
│   └── sql-wasm.wasm
├── assets/
│   └── (demo dataset if needed)
└── activity_logs.db   # user-provided
```

## 5. Data Model

Single `logs` table:

```sql
CREATE TABLE logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  trace_id TEXT,
  parent_trace_id TEXT,
  task_title TEXT,
  agent_name TEXT NOT NULL,
  agent_path TEXT NOT NULL,
  log_title TEXT NOT NULL,
  log_description TEXT NOT NULL,
  log_type TEXT NOT NULL,   -- start, end, activity, issue, decision, github
  log_level TEXT,
  status TEXT,
  priority TEXT,
  user_id TEXT DEFAULT 'admin',
  tags TEXT,
  error_details TEXT,
  resolved_by TEXT,
  resolution_time TEXT,
  performance_metrics TEXT, -- JSON string
  input_output_hash TEXT
);

CREATE INDEX idx_timestamp ON logs (timestamp);
CREATE INDEX idx_repo_branch_task ON logs (repo_name, branch_name, task_title);
```

## 6. Core Modules

### `db.js`
- `loadDb(file)`: read `Uint8Array`, `SQL.Database(array)`, `SELECT * FROM logs`.
- `saveDb(db)`: export bytes and trigger download.
- `deleteRows(db, ids)`: `DELETE FROM logs WHERE id IN (...)`.
- Supports auto-poll for file mtime changes.

### `time-model.js`
- Derive runs, segments, idle gaps, totals from raw rows.
- Exports `buildModel(logs)` and `stream(logs, model)`.
- Port logic from prototype `prototype/project/time-model.js` to plain JS.

### `filters.js`
- Maintain filter state: search text, repo, branch, agent, log type, git action, level, status, priority, date range.
- Apply AND logic, return `rowsInScope`.
- Drill scope: repo → branch → task → agent.
- Breadcrumb string generation.

### `app.js`
- Central state object: `rows`, `filtered`, `drill`, `page`, `selectedLog`, `db`, `src`.
- Event bus for component communication (`window.events` or a tiny EventTarget).
- Load sample data or real `.db`.
- Export CSV/JSON.
- Trigger re-renders on filter/db/drill changes.

## 7. Web Components

| Component | Responsibility |
|-----------|----------------|
| `<log-header>` | App title, page tabs, counts, CSV/JSON/Refresh, source status menu, help button |
| `<log-filters>` | Collapsible filter panel with dropdowns, chips, search, navigation tree |
| `<log-tree>` | Hierarchy: repo → branch → task → entry rows; expand/collapse, stacked time bars |
| `<log-list>` | Table of logs for selected node |
| `<log-details>` | Right-side detail panel for selected log; trace timeline, record grid |
| `<log-timeline>` | Chronology view with day headers, idle rows, entry cards |
| `<log-timegoes>` | Where time goes: stat cards, bar rows, waterfall, idle gaps table |
| `<log-metrics>` | Counts, distributions, open issues, agent time, median durations |
| `<log-maintenance>` | Delete scope, export, stored volume, confirmation dialog |
| `<log-help>` | Static help content (from prototype) |

## 8. Pages / Views

1. **Hierarchy** — nested repo/branch/task tree with summary bars.
2. **Chronology** — flat time-ordered stream with idle rows.
3. **Where time goes** — time breakdown, waterfall, idle gaps.
4. **Metrics** — counts, open issues, distributions, agent time.
5. **Maintenance** — delete, export, save db copy.
6. **Help** — user guide.

## 9. Implementation Milestones

### Phase 0 — Skeleton (Day 1)
- [ ] Create `index.html`, `styles.css`, `app.js`, `db.js`.
- [ ] Add base CSS tokens and layout (header / sidebar / content / detail).
- [ ] Wire `sql.js` load and `<input type="file">`.

### Phase 1 — Data & Models (Day 1–2)
- [ ] Port `time-model.js` to plain ES module.
- [ ] Load demo sample into in-memory `rows` if no DB.
- [ ] Implement `filters.js` and filter UI.

### Phase 2 — Core Views (Day 2–3)
- [ ] `<log-tree>` with expand/collapse and selection.
- [ ] `<log-list>` and `<log-details>`.
- [ ] `<log-timeline>` and `<log-timegoes>`.

### Phase 3 — Secondary Views (Day 3–4)
- [ ] `<log-metrics>`.
- [ ] `<log-maintenance>` with delete + export.
- [ ] `<log-help>`.

### Phase 4 — Polish & File I/O (Day 4)
- [ ] CSV/JSON export.
- [ ] Save database copy.
- [ ] Auto-poll.
- [ ] Help, tooltips, dark theme refinement.

### Phase 5 — Validation
- [ ] Test with `prototype/project/sample-logs.js` embedded as `sample_logs.js`.
- [ ] Open a real `activity_logs.db`.
- [ ] Verify delete + save roundtrip.

## 10. Key Design Notes

- All pages read from the same in-memory `rows` array; no SQL per view.
- Color coding is fixed:
  - Activity — green `#4CAF50`
  - Issue — red `#F44336`
  - Decision — blue `#2196F3`
  - GitHub — cyan `#4FC3F7`
  - Idle — hatched/transparent
- Time bars use `%` widths calculated in JS, not external chart libs.
- Breadcrumb and filters are global; page switches do not reset state.

## 11. Acceptance Criteria

- [ ] Opens `activity_logs.db` and renders all views.
- [ ] Filters and drill scope update every view instantly.
- [ ] Clicking any entry opens the detail panel.
- [ ] Exports filtered rows as CSV and JSON.
- [ ] Maintenance delete reflects in memory and can be saved to a new `.db`.
- [ ] No React, no build step, works from `index.html` in a browser.
