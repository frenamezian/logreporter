# Subagent Logging Instructions

> **How to use this file:** the dispatcher pastes this entire block into every subagent's task prompt, with the placeholders (`<name>`, `<agent_path>`, `<trace_id>`, `<parent_trace_id>`, `<task_title>`) filled in. It is mandatory — every dispatched subagent must log its activity.

---

## Your role

You are a **subagent** dispatched by a parent agent. You write an activity log to `activity_logs.db` as you work, so that what each agent did — and what it cost in time and tokens — can be attributed to the agent that incurred it. Logging is mandatory, for you and for any subagent you dispatch in turn.

**If you are working in the LogReporter repository itself:** its dashboard is tested on this data, and the schema and table name must not change.

## The one tool you use

### `log_activity.py` — append one row (synchronous)

It lives in the `log_reporter` checkout, and you invoke it **by absolute path**. The path below carries a placeholder the lead must replace with the real one. A relative path resolves against the repository you are working in, which is not where the script lives.

```
python /absolute/path/to/log_reporter/log_activity.py \
  --log-type <type> \
  --task "<task title>" \
  --agent <name> --agent-path <agent_path> \
  --trace-id <trace_id> \
  --parent-trace-id <parent_trace_id> \
  --log-title "<one specific line>" \
  [--log-description "..."] \
  [--log-level info] \
  [--status in_progress] \
  [--priority medium] \
  [--tags "#x #y"] \
  [--error-details "..."] \
  [--resolved-by <name>] \
  [--performance-metrics '{"execution_ms":12}'] \
  [--commit-reference <sha>]
```
Required: `--log-type`, `--log-title`, `--agent`. `--agent-path` defaults to `--agent`. `--log-level` defaults to `info`. `--user-id` defaults to `admin`. `--timestamp` is available and takes UTC `'YYYY-MM-DD HH:MM:SS'` — see [If you notice a row is missing](#if-you-notice-a-row-is-missing).

**Run the `log_activity.py` command from inside the repository you are working on** — the one whose code you are changing, not the one holding the script. Your working directory decides which repository and branch every row is filed under; the tool reads both from git and there is nothing for you to pass.

**Getting this wrong fails silently, which is why the path above is absolute.** A row written from anywhere else is filed under *that* repository instead and detaches from this one's cost reporting. Nothing tells you: the write succeeds, the script exits 0 and prints a row id, and no dashboard view flags it — the work simply renders as having cost nothing rather than as broken. This project lost 76M tokens to that same detachment reached by a different route — a hardcoded repo name — and nothing surfaced it until the numbers were audited.

### `--agent-path` is a lineage, NOT a file path

It is the chain of agents from the root down to you, joined by `/` — on your own rows, use the `<agent_path>` value your dispatcher gave you verbatim. If you dispatch child agents in turn, their path is your `<agent_path>` with their own name appended (and if nothing dispatched you, your path is just your own name). Never compute this by counting levels: take exactly what you were given and add one segment for each downward dispatch.

**The dashboard splits this field on `/` and renders every segment as an agent**, so whatever you put here becomes the navigation tree.

```
✅  --agent-path lead_architect/code_reviewer
✅  --agent-path lead_architect/task_executor/code_reviewer
❌  --agent-path projects/template_project/docs/tasks/task_0400.md
```

That last one is a real example, and it created five agents called `projects`, `template_project`, `docs`, `tasks` and `task_0400.md` — while the agent that did the work appeared nowhere. **The file you are working on does not belong in any field.** If it matters, name it in `--log-title` or `--log-description`.

**Synchronous:** the script validates the args, performs the `INSERT`, prints the new row id and exits. It opens the database in WAL mode with a 10s busy timeout, so concurrent agents and dashboard polling coexist; if a write loses the busy timeout it retries up to 5 times with exponential backoff (0.25s → 0.5s → 1s → 2s → 4s). A write that ultimately fails exits non-zero and says why, so a row you were told was written is a row that exists.

This used to be asynchronous, and the default changed because that lost rows silently. A detached child can be killed by the terminal before SQLite commits — several agent harnesses run their shell in a job object that takes every descendant with it — and a killed child cannot write an error anywhere. The call had already exited 0. Re-logging afterwards does not repair it either: the rows land in one batch at the wrong time, and a task whose span is a few seconds wide cannot be joined to the token usage that belongs to it, or reported on for duration or idle at all.

**`--sync`** is still accepted and does nothing — it asks for what already happens. **`--async`** restores the old fire-and-forget behaviour; do not use it for work you need recorded.

## You do NOT mint trace_id

**Never call `mint_trace.py`.** That tool is for the lead architect only. Use the `--trace-id <trace_id>` value given to you by the lead, verbatim, and always set `--parent-trace-id <parent_trace_id>` to the lead's trace_id. The trace timeline is how a multi-agent run reads as one sequence — if you minted your own trace, your work would detach from the run.

**A trace belongs to a task, not to an agent.** One `trace_id` ↔ one `task_title`, in both directions. The lead has already decided which case you are in and given you a matching pair, so your only job is to write both verbatim on every row:

- Working on the lead's task → its `task_title` and its trace, `--parent-trace-id` the same value.
- Given your own `task_title` → the lead minted you a separate trace, `--parent-trace-id` pointing at the lead's.

If the `task_title` you were given and the `trace_id` you were given do not obviously belong together — you were handed one trace and told to log several different task titles under it — **stop and ask the lead**, because that combination cannot be recorded correctly. Three stages logged as three task titles under one trace read as one run with no parent, and nothing can reconstruct which stage owned which.

## Fill in these values (given to you by your dispatcher)

- `--agent` = **`<name>`**
- `--agent-path` = **`<agent_path>`**
- `--tags` must include **`#subagent:<subagent_type>`** on every row, where
  `<subagent_type>` is the type you were dispatched as (the coding agent's own
  name for you, e.g. `code-reviewer`). This is the join key between this log and
  the token counts: without it, cost cannot be attributed to you rather than to
  your parent. Combine it with any other tags — `--tags "#subagent:code-reviewer #commit"`.
- `--trace-id` = **`<trace_id>`** (the lead's trace for this task — use it verbatim on every row)
- `--parent-trace-id` = **`<parent_trace_id>`** (the lead's trace_id — same value as `--trace-id` when the lead is your direct parent)
- `--task` = **`<task_title>`** (use the exact string the lead gave you, character for character — it is a grouping key)

## Bracket your portion of the task

- **First action you take:** append a `start` row, with `--status in_progress`.
- **Last action, always, even on failure:** append an `end` row with the final `--status` (`completed` or `failed`).

Every time view derives its numbers from that pair. A portion with only one of them has a span of zero seconds, which means no duration, no idle, and no token usage attributable to you — your work is recorded and simultaneously invisible.

**`completed` means you ran to conclusion, not that you liked the answer.** If you are a gate — a reviewer, a test run, a linter — reporting problems is you working correctly, and that is `completed`. Reserve `failed` for your own work breaking: the tool errored, you were blocked, the portion could not be carried out at all. Put the verdict in `--log-title`, where it stays scannable. Mark a blocked review `failed` and a healthy three-round task renders as three agent failures, which distorts the failure rate everywhere it is read.

**Unless the lead told you it writes your brackets, they are yours.** Some subagents are tool-restricted to the point of being unable to log at all, and their dispatcher writes the `start` and `end` rows on their behalf; if you were told that is your case, do not write them too — two starts and two ends read as a longer, messier span than one of each.

**Before you write the `end` row, check the `start` row exists.** Do not rely on remembering that you wrote it; look:

```
python /absolute/path/to/log_reporter/query_activity.py --trace <trace_id> --fields timestamp,log_type,agent_name,log_title
```

If it is not there, write it *before* the `end` row and backdate it with `--timestamp` to when you actually began. Two rows a few seconds apart because you wrote them together is work that reads as five seconds long — the time is the point, not the row count.

### If you notice a row is missing

Write it with `--timestamp '<UTC YYYY-MM-DD HH:MM:SS>'` set to when the thing happened, never when you noticed. Rows re-logged with "now" are worse than absent: a few-second span silently swallows every derived figure and nothing flags it. A best-effort real time beats an exact wrong one.

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
- `start` / `end` — only the brackets, never for intermediate steps.

## On every row

- `task_title` — identical for every row you write, character for character. It is a grouping key: a title that drifts by one space becomes two tasks.
- `agent_name` = `<name>`; `agent_path` = `<agent_path>`. One lowercase token, and `agent_name` must equal the last segment of `agent_path`: `Code Reviewer` in one field and `code_reviewer` in the other is two agents as far as the tree is concerned.
- `trace_id` = `<trace_id>` (the lead's, verbatim).
- `parent_trace_id` = `<parent_trace_id>` (the lead's trace_id).
- `log_title` — one specific line ("Chose append-only over upsert", not "Made a decision").
- `log_level` — `debug | info | warning | error`.
- `status` — `pending | in_progress | failed | completed`.
- `priority` — `low | medium | high | critical`.
- `tags` — comma-separated `#tokens`.

### How many rows

There is a floor as well as a ceiling, and the floor is the one that gets missed.

**Ceiling:** do NOT log per token, per line, or inside tight loops.

**Floor: a portion whose only rows are `start` and `end` records that you ran and nothing about what you did.** It draws one empty bar. Aim for **3–8 rows between the brackets**, covering whatever of these applies:

- what you read or inspected to orient yourself
- what you changed, and where
- each choice between alternatives, with the rejected ones and why (`decision`)
- anything that failed, retried, or blocked you (`issue`)
- each git operation (`github`)

If you finish and have written two rows, you have under-logged — go back and add what you did, backdated with `--timestamp`. A code review that logs only "started" and "completed" is indistinguishable from one that never read anything.

Silence between rows is reported as idle time, so log when you begin waiting on something slow.

## Worked example (a subagent's portion of a task)

Given by the lead: `name=header_agent`, `agent_path=lead_architect/header_agent`, `trace_id=9f2c41a8`, `parent_trace_id=9f2c41a8`, `task_title="Implement header dropdown"`.

```
$ python /absolute/path/to/log_reporter/log_activity.py --log-type start \
    --task "Implement header dropdown" --agent header_agent \
    --agent-path lead_architect/header_agent --trace-id 9f2c41a8 \
    --parent-trace-id 9f2c41a8 --log-title "Started header dropdown component" \
    --log-level info --status in_progress
# prints the new row id; the row is already written

$ python /absolute/path/to/log_reporter/log_activity.py --log-type activity \
    --task "Implement header dropdown" --agent header_agent \
    --agent-path lead_architect/header_agent --trace-id 9f2c41a8 \
    --parent-trace-id 9f2c41a8 --log-title "Read prototype header markup (L32-53)" \
    --log-level info
# prints the new row id

$ python /absolute/path/to/log_reporter/log_activity.py --log-type decision \
    --task "Implement header dropdown" --agent header_agent \
    --agent-path lead_architect/header_agent --trace-id 9f2c41a8 \
    --parent-trace-id 9f2c41a8 \
    --log-title "Used overlay for click-outside close vs document listener" \
    --log-description "Overlay is simpler and matches prototype L41; document listener would need cleanup on disconnect" \
    --log-level info
# prints the new row id

$ python /absolute/path/to/log_reporter/log_activity.py --log-type end \
    --task "Implement header dropdown" --agent header_agent \
    --agent-path lead_architect/header_agent --trace-id 9f2c41a8 \
    --parent-trace-id 9f2c41a8 --log-title "Finished header dropdown component" \
    --log-level info --status completed
# prints the new row id
```

## Worked example (a github commit)

After committing (e.g. `git rev-parse HEAD` → `a1b2c3d4e5f6789012345678901234567890abcd`,
`git log -1 --format=%h` → `a1b2c3d4`):

```
$ python /absolute/path/to/log_reporter/log_activity.py --log-type github \
    --task "Implement header dropdown" --agent header_agent \
    --agent-path lead_architect/header_agent --trace-id 9f2c41a8 \
    --parent-trace-id 9f2c41a8 \
    --log-title "commit a1b2c3d4: Add header dropdown" \
    --log-description "Add header dropdown component

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>" \
    --tags "#commit" --commit-reference a1b2c3d4e5f6789012345678901234567890abcd
# prints the new row id; the row with commit_reference set is already written
```

