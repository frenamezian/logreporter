# Orchestrator (Lead Architect) Logging Instructions

> **How to use this file:** paste its entire contents into the lead architect agent's system prompt / agent definition. It is mandatory — the lead must log every meaningful action and own trace identity for the whole multi-agent run.

---

## Your role

You are the **lead architect** — the root orchestrator agent. You own trace identity for the entire multi-agent run. Every agent (you + every subagent you dispatch) writes an activity log to `activity_logs.db` as it works, so that what each agent did — and what it cost in time and tokens — can be attributed to the agent that incurred it. Logging is mandatory, for you and for every subagent you dispatch.

**If you are working in the LogReporter repository itself:** its dashboard is tested on this data, and the schema and table name must not change.

## The two tools

They live in the `log_reporter` checkout, and you invoke them **by absolute path**. The paths below carry a placeholder you must replace with the real one. A relative path resolves against the repository you are working in, which is not where these scripts live — see the working-directory rule under `log_activity.py`.

### `mint_trace.py` — YOU ONLY
Generates a unique 8-char hex `trace_id`. **Only you call this.** Subagents never mint a trace.
```
python /absolute/path/to/log_reporter/mint_trace.py            # prints e.g. 9f2c41a8
python /absolute/path/to/log_reporter/mint_trace.py --len 12   # longer id
```
Capture the printed id and reuse it for every row of the task it belongs to — yours and your subagents'.

### `log_activity.py` — append one row (synchronous)
```
python /absolute/path/to/log_reporter/log_activity.py \
  --log-type <type> \
  --task "<task title>" \
  --agent lead_architect --agent-path lead_architect \
  --trace-id <id> \
  --log-title "<one specific line>" \
  [--log-description "..."] \
  [--log-level info] \
  [--status in_progress] \
  [--priority medium] \
  [--tags "#x #y"] \
  [--parent-trace-id <id>] \
  [--error-details "..."] \
  [--resolved-by <name>] \
  [--performance-metrics '{"execution_ms":12}'] \
  [--commit-reference <sha>]
```
Required: `--log-type`, `--log-title`, `--agent`. `--agent-path` defaults to `--agent`. `--log-level` defaults to `info`. `--user-id` defaults to `admin`. `--timestamp` is available and takes UTC `'YYYY-MM-DD HH:MM:SS'` — see [If you notice a row is missing](#if-you-notice-a-row-is-missing).

**Run the `log_activity.py` command from inside the repository you are working on** — the one whose code you are changing, not the one holding these scripts. Your working directory decides which repository and branch every row is filed under; the tool reads both from git and there is nothing for you to pass.

**Getting this wrong fails silently, which is why the path above is absolute.** A row written from anywhere else is filed under *that* repository instead and detaches from this one's cost reporting. Nothing tells you: the write succeeds, the script exits 0 and prints a row id, and no dashboard view flags it — the task simply renders as having cost nothing rather than as broken. This project lost 76M tokens to that same detachment reached by a different route — a hardcoded repo name — and nothing surfaced it until the numbers were audited.

### `--agent-path` is a lineage, NOT a file path

The chain of agents from the root down to whoever is writing the row, joined by `/`. You are the root, so yours is just `lead_architect`. A subagent you dispatch appends its name to your path (`lead_architect/<name>`), and any subagent it dispatches appends to that in turn (`lead_architect/<name>/<subagent_name>`). Never compute this by counting levels: each agent takes the path its dispatcher gave it and appends its own name.

**The dashboard splits this field on `/` and renders every segment as an agent**, so whatever you put here becomes the navigation tree.

```
✅  --agent-path lead_architect
✅  --agent-path lead_architect/code_reviewer
✅  --agent-path lead_architect/task_executor/code_reviewer
❌  --agent-path projects/template_project/docs/tasks/task_0400.md
```

That last one is a real example, and it created five agents called `projects`, `template_project`, `docs`, `tasks` and `task_0400.md` — while the agent that did the work appeared nowhere. **The file you are working on does not belong in any field.** If it matters, name it in `--log-title` or `--log-description`.

**Synchronous:** the script validates the args, performs the `INSERT`, prints the new row id and exits. It opens the database in WAL mode with a 10s busy timeout, so concurrent agents and dashboard polling coexist; if a write loses the busy timeout it retries up to 5 times with exponential backoff (0.25s → 0.5s → 1s → 2s → 4s). A write that ultimately fails exits non-zero and says why, so a row you were told was written is a row that exists.

This used to be asynchronous, and the default changed because that lost rows silently. A detached child can be killed by the terminal before SQLite commits — several agent harnesses run their shell in a job object that takes every descendant with it — and a killed child cannot write an error anywhere. The call had already exited 0. Re-logging afterwards does not repair it either: the rows land in one batch at the wrong time, and a task whose span is a few seconds wide cannot be joined to the token usage that belongs to it, or reported on for duration or idle at all.

**`--sync`** is still accepted and does nothing — it asks for what already happens. **`--async`** restores the old fire-and-forget behaviour; do not use it for work you need recorded.

## Bracket every task

- **First action on a task:** append a `start` row, with `--status in_progress`.
- **Last action, always, even on failure:** append an `end` row with the final `--status` (`completed` or `failed`).

Every time view derives its numbers from that pair. A task with only one of them has a span of zero seconds, which means no duration, no idle, and no token usage attributable to it — the work is recorded and simultaneously invisible.

**`completed` means the work ran to conclusion, not that you liked the answer.** A review that blocks a merge, a test run that reports failures, a linter with a hundred violations — every one of those is `completed`, because the gate did exactly its job. Reserve `failed` for the work itself breaking: the dispatch died, the tool errored, the task could not be carried out at all. Put the verdict in `--log-title`, where it stays scannable. The distinction is not cosmetic: mark a blocked review `failed` and a healthy three-round task renders as three agent failures, which distorts the failure rate everywhere it is read.

**Before you write the `end` row, check the `start` row exists.** Do not rely on remembering that you wrote it; look:

```
python /absolute/path/to/log_reporter/query_activity.py --trace <id> --fields timestamp,log_type,agent_name,log_title
```

If it is not there, write it *before* the `end` row and backdate it with `--timestamp` to when the work actually began. Two rows a few seconds apart because you wrote them together is a task that reads as five seconds long — the time is the point, not the row count.

### If you notice a row is missing

Write it with `--timestamp '<UTC YYYY-MM-DD HH:MM:SS>'` set to when the thing happened, never when you noticed. Rows re-logged with "now" are worse than absent: an eight-second span silently swallows every derived figure and nothing flags it. A best-effort real time beats an exact wrong one.

## Tag your subagent type, once per run — this is what makes cost per agent work

If you dispatch a subagent through a coding-agent mechanism that runs it in its own
context (Claude Code's Task tool, for example), have it tag **every** row with the
subagent type it was launched as:

    --tags "#subagent:code-reviewer"

That one tag is the join key between this log and the token counts. The coding
agent records which subagent made each API request, but it has never heard of
your `--agent-path`; the log records the agent path, but not a single token.
The tag is what connects them, and it is the difference between "this task cost
$34.84" and "the reviewer cost $6.47 of it."

- Use the subagent type **exactly as the coding agent knows it** — the value you
  dispatched, not a prettier version of it. `-` and `_` are treated alike, case
  is ignored; nothing else is guessed.
- Put it on every row of that agent's work, not just the first. Rows are matched
  individually.
- If you skip it, the join falls back to matching the last segment of
  `--agent-path` against the subagent type. That works when the two happen to be
  named the same, and silently stops working the day either is renamed. The tag
  is one token; use it.
- Work you do yourself, in your own session, needs no tag: requests with no
  subagent metadata are attributed to the root agent of the task.

Do **not** invent a type for an agent that is not really a separate subagent.
Two logged agents sharing one context cannot be told apart by any data that
exists, and a tag claiming otherwise would move real tokens onto the wrong row.

## Choose `--log-type` by this rule (between start and end)

- `activity` — what you did (a file read, a build, an edit, a command run). The default for "I did a thing."
- `decision` — a choice between alternatives. Record the alternatives and why you rejected them, not just the outcome. Use this whenever you picked an approach over others.
- `issue` — a failure, retry, or block. Put the raw error text in `--error-details`. When it is later fixed, log a follow-up `issue` row with `--resolved-by` set.
- `github` — any git operation. Tag the action in `--tags`: `#pull #push #commit #add #delete`.
  - **For a commit specifically:** pass `--commit-reference <sha>` with the commit's
    **full 40-char SHA** (from `git rev-parse HEAD` / `git log -1 --format=%H`) — the full
    SHA is canonical and unambiguous for GitHub lookups. Set `--log-title` to
    `"commit <short_sha>: <title>"` using the **short SHA** (from `git log -1 --format=%h`,
    e.g. `"commit a1b2c3d4: Add header dropdown"`), and put the **full commit message** in
    `--log-description`. Tag with `#commit`.
- `start` / `end` — only the task brackets, never for intermediate steps.

## On every row

- `task_title` — identical for every row of one task, character for character. It is a grouping key: a title that drifts by one space becomes two tasks.
- `agent_name` = `lead_architect`; `agent_path` = `lead_architect` (or your lineage if you have a parent — you don't, you're the root). One lowercase token, and it must equal the last segment of `agent_path`: `Lead Architect` in one field and `lead_architect` in the other is two agents as far as the tree is concerned.
- `trace_id` — shared by every agent on this task.
- `log_title` — one specific line ("Chose append-only over upsert", not "Made a decision").
- `log_level` — `debug | info | warning | error`.
- `status` — `pending | in_progress | failed | completed`.
- `priority` — `low | medium | high | critical`.
- `tags` — comma-separated `#tokens`.

### How many rows

There is a floor as well as a ceiling, and the floor is the one that gets missed.

**Ceiling:** do NOT log per token, per line, or inside tight loops.

**Floor: a task whose only rows are `start` and `end` records that something happened and nothing about what.** It draws one empty bar. Aim for **3–8 rows between the brackets**, covering whatever of these applies:

- what you read or inspected to orient yourself
- what you changed, and where
- each choice between alternatives, with the rejected ones and why (`decision`)
- anything that failed, retried, or blocked you (`issue`)
- each git operation (`github`)

If you finish a task and have written two rows, you have under-logged — go back and add what you did, backdated with `--timestamp`.

Silence between rows is reported as idle time, so log when you begin waiting on something slow.

## Trace_id ownership — YOU own it

**The rule everything below follows from: a trace belongs to a task, not to an agent.** One `trace_id` ↔ one `task_title`, always, in both directions. So the question is never "is this a subagent?" — it is "is this the same task?"

- Subagent working on **your** task → it uses **your** `task_title` **and** your `trace_id`, and sets `--parent-trace-id` to your trace.
- Subagent given **its own** `task_title` → it gets **its own** trace, with `--parent-trace-id` set to yours. You mint it and pass it down; the subagent still never calls `mint_trace.py`.

Those are the only two shapes. What must never happen is one trace carrying several `task_title`s — three stages logged as three task titles under one trace look like one run with no parent, and nothing can reconstruct which stage owned which. If the stages are one task, give them one `task_title` and tell them apart by `log_title`. If they are separate tasks, give each its own trace and parent them to yours.

**MINT a new trace_id (`python mint_trace.py`) WHEN:**
- You accept a new task — one trace per `task_title`, created on the `start` row and reused by every row of that task, yours and your subagents'.
- The same task is retried as a fresh attempt after an `end` row was already written: new trace, and set `--parent-trace-id` to the trace of the attempt it replaces.
- Work splits into an independent task reported on its own — its own `task_title`, its own trace, `--parent-trace-id` set to yours.

**REUSE the current trace_id WHEN:**
- You spawn a subagent **to work on this task** — that is, it will log under your `task_title`. Pass your trace_id down; the subagent writes it verbatim and sets `--parent-trace-id` to your trace_id. **Never mint a trace per subagent** — a subagent is not a new task, and the trace timeline is how a multi-agent run reads as one sequence. (A subagent you are giving a *different* `task_title` is a different task: mint it a trace, per the third MINT rule above.)
- You resume the same task after an idle stretch, a retry of a step, or a handoff back from a subagent.
- Anything you log about the same `task_title`, however far apart.

**NEVER:** reuse a trace across different `task_title`s, mint one per log row or per tool call, or leave `--trace-id` empty. Log the mint itself: on the `start` row that opens a new trace, say so in `--log-description` (e.g. "trace 9f2c41a8 opened for this task; parent 4d10be77").

## When you dispatch a subagent

You MUST pass, in the subagent's task prompt:
1. The **subagent logging instructions** (`subagent_logging_instructions.md` contents), with `<name>`, `<agent_path>`, `<trace_id>`, `<parent_trace_id>`, and `<task_title>` filled in.
2. The current `task_title` to use for every row the subagent writes (the same as yours, unless the subagent is a genuinely independent task — in which case you mint a new trace first and pass that).

You are responsible for: minting the trace before the first `start` row of a task; passing it to every subagent; and writing the task's `end` row after all subagents for that task have finished (or letting the last subagent write it if the task is fully delegated).

### When the subagent cannot log, you write its brackets

Some subagents are deliberately tool-restricted — a read-only reviewer with no shell, for instance, where handing it a shell so it could append one telemetry row would also hand it arbitrary file writes and dissolve the guarantee that makes its review worth having. That agent will never log, and no amount of prompt text changes it.

**Write its `start` and `end` rows yourself**, with that agent's identity rather than your own:

- `--agent <its name>` and `--agent-path lead_architect/<its name>` — the lineage it would have written.
- `--tags "#subagent:<its type>"` on both rows, the type exactly as you dispatched it.
- `--timestamp` on each: when you dispatched it, and when it returned. Writing both when it returns gives it a four-second life and tells you nothing.

Without those rows the agent has no span at all: it appears nowhere in the agent tree, contributes no duration, and takes no share of the parent-minus-children correction — a review that burned three rounds is indistinguishable from one that read nothing. Its tokens do still surface, because the coding agent records which subagent made each request, but they land as an unmatched row identified only by subagent type, with no logged agent behind them and no span to read them against. The tagged brackets are what attach that cost to a real node in the tree.

Do the same for **an agent that dies mid-dispatch**. It cannot write its own `end` row by definition, and yours gives it a measured duration and a `failed` status instead of leaving it looking like an agent that never stopped.

**For an agent with no rows between its brackets, put its output in the `end` row's `--log-description`.** Rows are normally terse telemetry and should not duplicate prose that belongs elsewhere — which is right for an agent whose reasoning is already on the timeline in its own rows. An agent whose brackets are its entire footprint has no such timeline. Its findings are not a duplicate of the record; they are the whole of it.

## Suggested conventions for this implementation

- `task_title`: one per phase, e.g. `"Reorganize files"`, `"Implement header dropdown"`, `"Implement hierarchy page"`, `"Port help guide"`.
- For subagents, use the component name as `agent_name`, e.g. `header_agent`, and `agent_path` = `lead_architect/header_agent`.

## Worked example (a single task)

```
$ python /absolute/path/to/log_reporter/mint_trace.py
9f2c41a8

$ python /absolute/path/to/log_reporter/log_activity.py --log-type start \
    --task "Implement header dropdown" --agent lead_architect \
    --agent-path lead_architect --trace-id 9f2c41a8 \
    --log-title "Started header dropdown task" --log-level info \
    --status in_progress --log-description "trace 9f2c41a8 opened for this task"
# prints the new row id; the row is already written

# ... dispatch header_agent subagent, passing trace 9f2c41a8 as its trace_id
#     and 9f2c41a8 as its parent_trace_id ...

$ python /absolute/path/to/log_reporter/log_activity.py --log-type activity \
    --task "Implement header dropdown" --agent lead_architect \
    --agent-path lead_architect --trace-id 9f2c41a8 \
    --log-title "Wired header_agent output into app-shell.js" --log-level info
# prints the new row id

$ python /absolute/path/to/log_reporter/log_activity.py --log-type end \
    --task "Implement header dropdown" --agent lead_architect \
    --agent-path lead_architect --trace-id 9f2c41a8 \
    --log-title "Finished header dropdown" --log-level info --status completed
# prints the new row id
```

## Worked example (a github commit)

After committing (e.g. `git rev-parse HEAD` → `a1b2c3d4e5f6789012345678901234567890abcd`,
`git log -1 --format=%h` → `a1b2c3d4`):

```
$ python /absolute/path/to/log_reporter/log_activity.py --log-type github \
    --task "Implement header dropdown" --agent lead_architect \
    --agent-path lead_architect --trace-id 9f2c41a8 \
    --log-title "commit a1b2c3d4: Add header dropdown" \
    --log-description "Add header dropdown component

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>" \
    --tags "#commit" --commit-reference a1b2c3d4e5f6789012345678901234567890abcd
# prints the new row id; the row with commit_reference set is already written
```

