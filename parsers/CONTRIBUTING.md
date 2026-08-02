# Adding a parser

A parser teaches LogReporter to read one coding agent's token usage. Adding one
means **creating one file in this directory**. Nothing else in the repository
changes — there is no registration list, no import to add, no schema to extend.

That is deliberate. A central list of parsers would put every contributor's
pull request in the same file, and every pull request would conflict with every
other one.

---

## The short version

```bash
cp parsers/_template.py parsers/your_agent.py         # 1. start from the template
python -m parsers._template scrub SESSION.jsonl \
       parsers/tests/your_agent/fixture.jsonl         # 2. redact a fixture FIRST
# 3. fill in the seven names, write expected.json + expected_totals.json
python -m parsers.conformance your_agent              # 4. must pass
```

A pull request without a fixture is not mergeable. See [Why a fixture is
mandatory](#why-a-fixture-is-mandatory).

---

## Step 1 — redact a fixture, before you write any code

Session files contain source code, prompts, API responses, and whatever secrets
passed through them. A fixture is committed to a public repository forever.
So redaction is step one, not a review checklist item.

```bash
python -m parsers._template scrub ~/.your-agent/sessions/abc.jsonl \
       parsers/tests/your_agent/fixture.jsonl
```

The scrubber in `_template.py` is a **whitelist**: it keeps the handful of keys
a parser reads and drops everything else, including the whole message body. A
blacklist of "sensitive-looking" keys would let the next format change quietly
reintroduce a field nobody thought to ban.

Adapt `KEEP_TOP` and `KEEP_MESSAGE` in your copy to your agent's shape, then
**read the output before you commit it.** The scrubber is a tool, not a
guarantee — you are the one who knows what your agent writes.

Keep the fixture small. A dozen requests is plenty; conformance rejects
anything over 512 KB.

---

## Step 2 — the contract

Seven names, and nothing else is required of the module.

| Name | Type | Notes |
| --- | --- | --- |
| `AGENT_ID` | `str` | stable key, also the `source` column value |
| `AGENT_NAME` | `str` | shown in the UI |
| `HOMEPAGE` | `str` | linked from the source panel |
| `PRIORITY` | `int` | higher wins if two parsers claim one agent |
| `detect()` | `-> bool` | is this agent on this machine? |
| `discover()` | `-> list[Path]` | the session files you own |
| `parse(path, cursor)` | `-> (Iterator[UsageRecord], str)` | records since `cursor` |

`detect()` runs on **every refresh, for every parser, before anything is
read.** Make it a path test. Do not shell out, open a database, or import a
heavy library at module scope to answer it.

A module in this directory that declares *none* of these names is not treated
as a parser (that is how `loader.py` and `conformance.py` live here). A module
declaring *some* of them is a parser with a mistake in it, and conformance will
tell you which names are missing.

If your module raises on import, it is skipped, logged, and named in the
dashboard's source panel. One broken parser never takes the dashboard down —
but it also never silently reads as zero.

---

## Step 3 — the four rules that matter more than the code

These are not style preferences. Each one is a way real parsers have produced
confidently wrong numbers.

### 1. Dedupe on `request_id`

Most agents write **several lines per API response** — one per content block —
and every one of those lines carries an *identical* usage object. Summing lines
overcounts. In the Claude Code fixture in this repository, 44 lines carrying
usage collapse to **12 requests**; summing them inflates the total by **3.36×**.

Emit one record per request. If your agent has no request identity, synthesize
a **stable** hash — the same input must produce the same id on every run, or
re-import stops being idempotent.

### 2. `NULL` is not `0`

If your agent does not report a counter, leave it `None`.

`0` means the agent measured zero. `None` means it has nothing to measure.
Codex has no cache-write equivalent — rendering that as `0` tells the reader
its cache writes were free. The UI shows `—` for `None`, and conformance fails
a parser that coerces one into the other.

### 3. The bare "input" field is usually not the input

Anthropic's `input_tokens` is the *uncached remainder*, not the input. In the
fixture here it is **1,449** against a true input of **1,091,210** — off by
753×. The real total is:

```
input_tokens + cache_read_tokens + cache_write_5m + cache_write_1h
```

Check what your agent's field actually means before you map it. Split cache
writes by TTL if your agent distinguishes them, because they are priced
differently; leave the one it does not report as `None`.

### 4. Never emit message content

The record shape has no field for it, and the writer filters `extra_json`
against a whitelist. Do not read it in the first place — extract the numeric
counters and the short envelope, and nothing else.

---

## Step 4 — the cursor

`cursor` is **opaque to the framework**. You define it, you interpret it, and
you are the only code that ever looks inside it.

A JSONL parser stores a byte offset and resumes with `seek()`. A SQLite-backed
agent stores a max rowid or timestamp. Fixing the cursor to "byte offset" in
the framework would exclude every agent that does not store usage in a text
file.

Put your `PARSE_VERSION` inside the cursor and refuse a cursor you do not
recognise by returning offset 0. That is what makes "I changed what this parser
emits, re-read everything" work, and it is self-healing — an unrecognised
cursor costs one full re-read, not a wrong number.

**Getting the cursor wrong costs time, never correctness.** `request_id` is the
primary key and every insert is `INSERT OR IGNORE`, so resuming too early
re-reads rows that are already there and inserts nothing.

Handle the partial last line. Your agent may be mid-write:

```python
if not raw.endswith(b"\n"):
    break            # leave the offset before it; read it complete next time
```

---

## Aggregate sources (a CLI, not files)

If your source is a tool that reports totals rather than a file you read
incrementally — `parsers/ccusage.py` is the worked example — declare:

```python
SOURCE_KIND = "command"
```

The reader then skips stat and watermark entirely, and **replaces every row
whose `source` is `AGENT_ID` or starts with `AGENT_ID:` on each run** instead of
appending. That is required, not an optimisation: an aggregate row's numbers
*change* as the day goes on, and `INSERT OR IGNORE` would freeze the first
snapshot forever.

`discover()` may then return pseudo-paths (`ccusage://codex`) that never touch
the filesystem. Make `parse()` accept a real file path too, so your fixture can
be a recording of the tool's output and conformance can run without the tool
installed.

Two optional names the reader will use if you define them:

| Name | Purpose |
| --- | --- |
| `PARSE_STATS: dict[str, int]` | counters (lines skipped, unknown shapes) surfaced in the source panel |
| `UNAVAILABLE_HINT: str` | shown when `detect()` is False, so "unsupported" reads as "not installed" |
| `exclude_agents(ids)` | fallback adapters only: the reader passes the agent ids that already have a native parser |

---

## Step 5 — conformance

```bash
python -m parsers.conformance              # every parser
python -m parsers.conformance your_agent   # just yours
```

It must pass before your pull request can be reviewed.

```
parsers/tests/<agent_id>/
    fixture.jsonl          a small, redacted session
    expected.json          the records your parser must produce
    expected_totals.json   hand-counted totals, and a note saying why they are right
```

`expected_totals.json` is the one that carries the weight. Generate
`expected.json` from your parser if you like — it pins behaviour against
regressions — but **count the totals by hand** and write down in `_why` how you
arrived at them. A fixture that only pins a parser to its own output will
happily pin in a 3.4× overcount forever.

The harness checks: totals against your hand-count, records against
`expected.json`, that parsing twice is identical, the `UsageRecord` invariants,
that `NULL` survives as `NULL`, that a cursor round-trips, and that nothing
long enough to be message content made it into a field.

### Why a fixture is mandatory

A parser can only be reviewed by someone who has that agent installed —
otherwise the reviewer is reading code against a file format they have never
seen and taking your word for it. A redacted fixture plus its expected output
turns that into something anybody can run in two seconds on any machine.

---

## What good looks like

`parsers/claude_code.py` is the reference: recursive discovery including
subagent sidechains, dedupe, the TTL split, a versioned cursor, per-file stats,
and every failure mode falling through to "skip the line and count it" rather
than raising.

`parsers/ccusage.py` is the reference for the awkward case: a CLI, aggregates,
synthesized ids, field names read by alias because the upstream ones drift, and
an honest note in its fixture about what has and has not been verified.
