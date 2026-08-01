# Task — Token usage and cost

**Status:** proposed
**Owner:** unassigned
**Touches:** `serve.py`, `parsers/`, `script/`, `components/`, `style.css`, `index.html`, `docs/`

---

## 1. Goal

Report **how many tokens each task consumed and what it cost**, alongside the wall-clock
time LogReporter already reports.

Usage is *observed*, not declared — read from files the coding agents already write. It
therefore works retroactively on history that predates this feature, and asks nothing of
`log_activity.py`.

The reader resolves a source per agent:

1. **A native parser**, if one in `parsers/` claims the agent. Exact, and the only path
   that can see provider-specific counters (Anthropic's 5-minute vs 1-hour cache writes,
   Codex's `reasoning_output_tokens`).
2. **`ccusage`**, for any agent with no parser yet.
3. **Nothing** — the agent is listed as unsupported. Never a silent zero.

`parsers/claude_code.py` ships first. Every subsequent agent is a community PR that adds
**one file and touches nothing else** (§3).

---

## 2. Non-goals

- **No new agent-side logging.** `log_activity.py` is untouched.
- **No per-tool-call attribution.** The finest grain is one API request.
- **No live streaming.** Usage refreshes on the existing Refresh / Auto-poll cycle.
- **No writes to `activity_logs.db`.** Usage lives in its own file (§5).
- **No parser for an agent nobody uses.** The point of §3 is that adding one is cheap
  when someone actually needs it — not that we pre-build 29 of them.

---

## 3. Parser architecture

The constraint that shapes this: **every agent stores usage differently** — JSONL,
SQLite, protobuf, hook-required, or network-only — and formats change without notice. A
monolithic reader with a growing `if agent == ...` chain becomes unmaintainable and
un-contributable. So the seam is a plugin directory.

### 3.1 The contract

A parser is one Python module in `parsers/` exposing six names. Nothing else.

```python
# parsers/claude_code.py
AGENT_ID   = "claude_code"          # stable key; also the `source` column value
AGENT_NAME = "Claude Code"          # shown in the UI
HOMEPAGE   = "https://claude.com/claude-code"
PRIORITY   = 100                    # higher wins if two parsers claim one agent

def detect() -> bool:
    """Is this agent present on this machine? Cheap — a path test, no parsing."""

def discover() -> list[Path]:
    """Session files/DBs this parser owns. Called on every refresh."""

def parse(path: Path, cursor: str | None) -> tuple[Iterator[UsageRecord], str]:
    """Yield records added since `cursor`, and return the new cursor.

    `cursor` is opaque to the framework — the parser defines it (§5.2). Passing
    None means read the whole source.
    """
```

`UsageRecord` (§4) is the normalization boundary. A parser's only job is to turn its
agent's private format into that shape.

### 3.2 Auto-discovery — no registration list

`usage_reader.py` imports every `parsers/*.py` that is not `_`-prefixed and validates the
six names are present. **There is no central list of parsers to edit.** A contributor
drops in a file; nothing else in the repo changes. That property is the whole point — a
central registry means every PR touches a shared file, and every PR conflicts.

A parser that raises on import is skipped, logged, and reported in the UI. One broken
community parser must never take the dashboard down.

### 3.3 Resolution order

```
for each parser where detect() is True   → use it (highest PRIORITY wins)
for each agent ccusage reports but no parser claimed → use ccusage, source="ccusage:<agent>"
ccusage absent                            → list the agent as unsupported, no rows
```

A native parser always beats `ccusage` for the same agent. Even if both ran, dedupe on
`request_id` (§5.1) makes double-counting structurally impossible rather than a thing the
code has to remember.

### 3.4 Contributing a parser

Ships as `parsers/CONTRIBUTING.md` plus a conformance harness so a PR is checkable
without the reviewer installing that agent:

- `parsers/_template.py` — the six names with docstrings and a worked example.
- `parsers/tests/<agent_id>/` — a small **redacted** fixture session plus the expected
  `UsageRecord` list as JSON. `python -m parsers.conformance` runs every parser against
  its fixture. A PR without a fixture is not mergeable.
- The harness also asserts the §4 invariants (no negative counters, `NULL` never coerced
  to `0`, cursor round-trips, re-parsing a fixture twice yields identical records).

> **Fixtures must be redacted.** Session files contain source code, prompts, and
> whatever secrets passed through them. The template ships a scrubber; `CONTRIBUTING.md`
> makes it the first step.

---

## 4. The record shape

One dataclass, `UsageRecord`, is what every parser emits and the only thing the writer
accepts.

| Field | Type | Note |
| --- | --- | --- |
| `request_id` | str | **Dedupe key.** Synthesize a stable hash if the agent has none. |
| `session_id` | str? | |
| `timestamp` | str | ISO-8601 UTC |
| `model_id` | str? | Must match an `model_id` in the registry (§6) to be priced |
| `repo_name` | str? | Derived from the agent's recorded cwd |
| `branch_name` | str? | |
| `input_tokens` | int? | Uncached input **only** |
| `cache_read_tokens` | int? | |
| `cache_write_5m` | int? | `NULL` where the agent does not split TTLs |
| `cache_write_1h` | int? | |
| `output_tokens` | int? | Includes reasoning tokens where separate |
| `service_tier` | str? | → picks the price tier (§6) |
| `speed` | str? | `fast` prices differently |
| `source` | str | `AGENT_ID`, or `ccusage:<agent>` |
| `extra_json` | str? | Anything provider-specific worth keeping verbatim |

**`NULL` and `0` are different and must stay different.** `0` means the agent reported
zero; `NULL` means it does not report that counter at all. Codex has no cache-write
equivalent — rendering that as `0` would imply cache writes were free. The UI shows `—`.

### 4.1 Two rules the Claude Code parser encodes

Both verified against real transcripts in this repo, and both are conformance assertions:

1. **Dedupe on `request_id`.** One API response is written as *several* JSONL lines (one
   per content block), each carrying an identical `usage` object. In a sampled session,
   44 assistant lines collapsed to **12 distinct requests** — summing every line
   overcounts by **3.4×**.
2. **`input_tokens` is not the input.** It is the uncached remainder. In that session it
   was 1,449 against a true input of ~1.09M. Total input =
   `input_tokens + cache_read + cache_write_5m + cache_write_1h`. Reporting the bare
   field understates input by ~750×.

---

## 5. Storage — `token_usage.db`, a sibling file

Usage lives in **`token_usage.db`, next to `activity_logs.db`** — not inside it.

The two files have opposite natures. `activity_logs.db` is append-only ground truth that
several agents write to continuously and that nothing can reconstruct. `token_usage.db`
is a **cache**: every row is re-derivable by re-reading the agents' own session files.
Keeping them apart means you can delete the usage file, re-run the reader, and be exactly
where you started — and it keeps a schema the README calls a contract completely
untouched.

Practical consequences, all acceptable:

- `serve.py` serves both files; `script/db.js` opens two `sql.js` databases.
- The join is done **in JS, in memory** — which is already the architecture ("every page
  is a pure function of the rows held in memory"). No cross-database SQL.
- The Maintenance page gets **Rebuild usage** (drop + re-import), which is safe precisely
  because the file is disposable.
- Backups: `activity_logs.db` is the one that matters. Say so in the README.

### 5.1 Schema

```sql
CREATE TABLE IF NOT EXISTS token_usage (
  request_id        TEXT PRIMARY KEY,   -- dedupe enforced by the schema, not by code
  session_id        TEXT,
  timestamp         TEXT NOT NULL,
  model_id          TEXT,
  repo_name         TEXT,
  branch_name       TEXT,
  input_tokens      INTEGER,
  cache_read_tokens INTEGER,
  cache_write_5m    INTEGER,
  cache_write_1h    INTEGER,
  output_tokens     INTEGER,
  service_tier      TEXT,
  speed             TEXT,
  source            TEXT NOT NULL,
  extra_json        TEXT
);
CREATE INDEX IF NOT EXISTS ix_usage_scope ON token_usage(repo_name, branch_name, timestamp);
```

`request_id` as primary key + `INSERT OR IGNORE` makes re-import idempotent by
construction.

### 5.2 Per-file watermark

Re-reading every transcript on every refresh does not scale — one session file in this
repo is already 11 MB. The reader keeps a per-file cursor:

```sql
CREATE TABLE IF NOT EXISTS watermark (
  parser_id   TEXT NOT NULL,
  source_path TEXT NOT NULL,
  cursor      TEXT,              -- opaque; the parser defines it
  size_bytes  INTEGER,           -- staleness check
  mtime_ns    INTEGER,
  last_run    TEXT,
  PRIMARY KEY (parser_id, source_path)
);
```

**`cursor` is deliberately opaque.** A JSONL parser stores a byte offset and resumes with
`f.seek()`. A SQLite-backed agent stores a max rowid or timestamp. A protobuf store might
need something else entirely. Fixing the cursor to "byte offset" would exclude half the
agents in §3 from ever having a parser.

**Invalidation — re-read the whole file when any of these hold:**

- `size_bytes` is **smaller** than recorded → truncated or rotated.
- `mtime_ns` moved backwards → replaced or restored from backup.
- The parser's `PRIORITY`/version changed → its output semantics may have changed.

An unchanged `size_bytes` **and** `mtime_ns` means skip the file entirely — the common
case, and the one that makes refresh cheap.

> Watermarks are only a speed optimisation. `INSERT OR IGNORE` on `request_id` means a
> wrong cursor costs time, never correctness. **Rebuild usage** discards all watermarks.

---

## 6. Cost is derived from `llm_registry.js`

There is no `cost` column, and no second rate table. Cost is computed in the browser at
render time from **`script/llm_registry.js`** — the generated registry (102 models, 8
providers, 497 price tiers) that already carries its own refresh prompt.

This mirrors the rule the project holds for time: *durations are never stored; they are
derived each time the page is drawn.* A stored cost silently becomes a lie when prices
change; a derived one is corrected by regenerating the registry.

The registry's `tier_name` vocabulary already matches the counters in §4 almost exactly —
`standard`, `cache_read`, `cache_write_5m`, `cache_write_1h`, `batch`, `fast_mode`,
`cached_input`. `script/cost-model.js` is therefore a *lookup*, not a table:

| Counter | Tier, first match wins |
| --- | --- |
| `input_tokens` | `standard` |
| `cache_read_tokens` | `cache_read` → `cached_input` → `standard` |
| `cache_write_5m` | `cache_write_5m` → `standard` |
| `cache_write_1h` | `cache_write_1h` → `standard` |
| `output_tokens` | `standard` (from `output_token`) |

Modifiers applied before the table: `speed == "fast"` prefers `fast_mode`;
`service_tier == "batch"` prefers `batch`. Both fall back to `standard`.

**Time-bounded tiers.** A tier named `intro_*_until_YYYY_MM_DD` (Sonnet 5 currently has
one) applies only to records timestamped on or before that date; later records use
`standard`. Old sessions must price at what they actually cost.

**Deprecated models still price.** The registry keeps historical prices on `legacy` and
`deprecated` models by design, so a six-month-old session is still costed correctly.

**Unknown `model_id` → tokens shown, cost `—`.** Never guess a rate. The UI links the
unknown id to the registry so the fix is obvious: update `llm_registry.py`, re-run
`python seed/py2js_registry.py`.

> **Label cost as modelled, not billed.** On a Pro/Max subscription these tokens draw
> against a plan, not a per-token invoice. The figure is an API-pricing equivalent —
> useful for comparison, wrong as an accounting number. One footnote on the page.

---

## 7. Attribution to tasks

Usage rows carry `repo_name`, `branch_name`, `timestamp`; tasks already have a computed
wall-clock span in `script/time-model.js`.

A usage row belongs to a task when **repo and branch match** and its timestamp falls
inside that task's `[start, end]` span.

- Rows matching no span go to an explicit **Unattributed** bucket, shown in the UI. Same
  honesty as the idle-time model: work outside a logged span is a real finding, not a
  rendering bug. A large Unattributed share means agents worked without bracketing tasks.
- Overlapping spans (concurrent agents on one repo/branch) split the row evenly and flag
  it. Never silently double-count.

---

## 8. Display

### 8.1 The one hard rule: never one axis for both measures

Tokens and cost are measures of wildly different scale; a shared axis invents a
correlation that is not in the data. **No dual-axis chart in this feature.**

Instead a **measure toggle** in the filter row — `Tokens ⇄ Cost` — re-rendering the same
layout against one measure at a time, with ordering and colour held constant so the two
views are directly comparable.

That is the feature, not a compromise. The two views disagree, and the disagreement is
the insight. From a real session in this repo:

| Segment | Share of tokens | Share of cost |
| --- | ---: | ---: |
| Cache read | 72.8% | 11.1% |
| Cache write | 25.8% | **78.8%** |
| Output | 1.3% | 9.9% |
| Fresh input | 0.1% | 0.2% |

Cache reads dominate the token count and are nearly free. Cache *writes* are a quarter of
the tokens and four-fifths of the bill. A blended "tokens" number hides that completely.

### 8.2 KPI row — four stat tiles

Reuses the existing `.metrics-grid` / `.metric-card` / `.metric-value` / `.metric-label`
classes, so it drops into the Metrics page with no new layout primitives.

| Toggle | Tile 1 | Tile 2 | Tile 3 | Tile 4 |
| --- | --- | --- | --- | --- |
| **Tokens** | Total tokens | Input (incl. cache) | Output | **Saved by cache** |
| **Cost** | Total cost | Input cost | Output cost | **Saved by cache** |

**Tile 4 — Saved by cache — is the one worth the slot.** It is what the cache-read tokens
*would* have cost at that model's full `standard` input rate, minus what they did cost at
`cache_read`:

```
saved = cache_read_tokens × (rate.standard − rate.cache_read) / 1e6
```

It is the only number that justifies the cache, it is invisible in every other view, and
it is the tile a reader screenshots. It holds its slot under both toggle positions —
always a currency value, with the token count it derives from as the sub-label — because
"saved tokens" is not a meaningful quantity.

- Values auto-compact: `1,284` → `12.9K` → `1.11M`; cost as `$3.62`.
- Tile values use the font's **default proportional figures**; `tabular-nums` at display
  size makes numbers look loose. Reserve tabular for the table in §8.5.

### 8.3 Composition bar — where it went

**Form:** one horizontal stacked bar. Part-to-whole across four segments —
`cache read · cache write · fresh input · output` — is what a stacked bar is for, and
horizontal handles the long names.

At **exactly four series, direct labels are mandatory**; colour alone stops being
comfortable at four. Label each segment inline with name and percentage; fold anything
under 3% into the label list rather than shrink it to an unreadable sliver. 2px
surface-coloured gap between segments, 4px rounded outer ends.

### 8.4 Ranking — by repo, branch, task, agent

**Form:** horizontal bars, **sequential** — one hue, more-is-darker. These rank magnitude,
not identity, so this is not a categorical palette. Reuses `.bar-row` / `.bar-track` /
`.bar-seg` / `.bar-val` verbatim. Respects drill scope and filters. Top 12 descending,
tail folded into "Other".

### 8.5 Table view — required

A sortable table of every row behind the charts (task, agent, model, each counter,
modelled cost, source). Both the accessibility path and the honest one: with four token
classes plus cost, some readers need the numbers. Columns use
`font-variant-numeric: tabular-nums` so digits align.

### 8.6 Source transparency panel

Small, and it prevents the worst failure mode — a confident total that is quietly
partial. Lists per agent: parser used (native / `ccusage` / unsupported), files scanned,
records imported, last watermark time, and any parser that failed to load.

### 8.7 Colour — validated, not chosen by eye

`--activity`, `--issue`, `--decision`, `--github` are **reserved for log types**; reusing
them would make a cost bar look like an error. The four-segment stack needs its own ramp,
validated against this project's dark surface (`--surface: #161821`) before shipping:

```
node scripts/validate_palette.js "<hex,hex,hex,hex>" --mode dark
```

Do not reason about colourblind-safety — compute it. A contrast warning obligates visible
labels, which §8.3 already requires.

### 8.8 Placement

Extend the existing **Metrics** page rather than adding a sixth nav tab. Cost is an
attribute of work already described there. Promote it later if it outgrows the page.

---

## 9. Files

| File | Change |
| --- | --- |
| `parsers/__init__.py`, `parsers/loader.py` | **new** — auto-discovery, contract validation |
| `parsers/_template.py`, `parsers/CONTRIBUTING.md` | **new** — the contributor path |
| `parsers/claude_code.py` | **new** — first native parser |
| `parsers/ccusage.py` | **new** — fallback adapter |
| `parsers/conformance.py`, `parsers/tests/` | **new** — fixture harness |
| `usage_reader.py` | **new** — resolution, watermarks, writes `token_usage.db` |
| `seed/new_usage_db.py` | **new** — `token_usage` + `watermark` DDL |
| `serve.py` | serve `token_usage.db`; `/refresh-usage`, `/rebuild-usage` endpoints |
| `script/llm_registry.js` | **generated** — done; regenerate via `seed/py2js_registry.py` |
| `script/cost-model.js` | **new** — registry lookup, tier resolution, saved-by-cache |
| `script/db.js` | open the second database |
| `script/app.js` | measure toggle in state; usage rows in scope filtering |
| `script/time-model.js` | expose task spans for §7 |
| `components/log-metrics.js` | KPI row, composition bar, rankings, table, source panel |
| `components/log-filters.js` | the `Tokens ⇄ Cost` toggle |
| `components/log-maintenance.js` | **Rebuild usage** |
| `style.css` | validated 4-step ramp, stacked-bar classes |
| `index.html` | script tags — **bump `?v=`** |
| `docs/metrics.html`, `components/log-help.js` | document it; bump `DOC_VERSION` |
| `README.md` | backup guidance: `activity_logs.db` is the file that matters |

---

## 10. Acceptance criteria

1. Running the reader twice produces identical totals — import is idempotent.
2. A session total matches a hand-count deduped by `request_id`, **not** the naive
   per-line sum.
3. Reported input equals `input + cache_read + cache_write_*`, not the bare field.
4. An agent that does not report cache writes shows `—`, never `0`.
5. Deleting `token_usage.db` and re-running the reader reproduces the same totals.
6. `activity_logs.db` is byte-identical before and after the feature runs.
7. A parser that raises on import is skipped and named in §8.6; the dashboard still loads.
8. A new parser can be added by creating **one file** in `parsers/` — no other file edited.
9. `python -m parsers.conformance` passes for every shipped parser.
10. A file whose size and mtime are unchanged is not re-read (assert via a call counter).
11. A truncated or restored file is detected and fully re-read.
12. Cost for a `deprecated` model still resolves; unknown `model_id` renders `—`.
13. Toggling Tokens ⇄ Cost changes only the measure — ordering, colour, layout hold.
14. No chart plots tokens and cost on one axis.
15. `node scripts/validate_palette.js` passes for the segment ramp in dark mode.
16. `python seed/py2js_registry.py` output is deep-equal to the Python registry
    (8 providers / 102 models / 497 tiers today) and `node --check` passes.

---

## 11. Risks

| Risk | Mitigation |
| --- | --- |
| **Transcript formats drift** — undocumented, change without notice | Parsers fail soft: unknown shape → skip the line, count it, surface in §8.6. Never crash the dashboard. The plugin seam means one agent's breakage is one file. |
| **Community parser quality varies** | Conformance harness + required fixture; import failure is isolated and reported. |
| **Fixtures leak secrets** | Scrubber in `_template.py`; redaction is step one of `CONTRIBUTING.md`. |
| **Cost read as a bill** | Labelled modelled, once, on the page. §6. |
| **Registry rots** | It carries its own UPDATE PROMPT; unknown model → `—` rather than a wrong number. |
| **Watermark desync** | `INSERT OR IGNORE` makes a wrong cursor cost time, not correctness; **Rebuild usage** is the escape hatch. |
| **Two DB files confuse users** | Only one matters for backup; README says so; Maintenance can rebuild the other. |
| **Transcripts contain source and secrets** | The reader extracts **only** the §4 fields — never message content. Nothing that resembles prompt or response text may reach `token_usage.db`. |

---

## 12. Resolved decisions

| Question | Decision |
| --- | --- |
| Full re-scan or per-file watermark? | **Per-file watermark**, opaque parser-defined cursor. §5.2 |
| One database or a sibling? | **Sibling `token_usage.db`** — it is a rebuildable cache. §5 |
| Is "Saved by cache" worth a tile? | **Yes** — tile 4, in both toggle positions. §8.2 |
| Where do rates live? | **`script/llm_registry.js`**, generated from the Python registry. §6 |
| How do new agents get supported? | **One file in `parsers/`**, auto-discovered. §3 |

Still open:

1. Should `ccusage` be invoked per-agent or once with a combined export? Depends on its
   CLI surface — settle when `parsers/ccusage.py` is written.
2. Does the reader run on `serve.py` start, or only on explicit `/refresh-usage`? Start
   with both, measure the startup cost on a large `~/.claude/projects`.
