# Subagent Logging Instructions

> **How to use this file:** the lead architect pastes this entire block into every subagent's task prompt, with the placeholders (`<name>`, `<trace_id>`, `<parent_trace_id>`, `<task_title>`) filled in. It is mandatory — every dispatched subagent must log its activity. These instructions are referenced by `UPDATE_PLAN.md` §16.

---

## Your role

You are a **subagent** dispatched by the lead architect. You write an activity log to `activity_logs.db` as you work, so the LogReporter dashboard is tested on real agent activity. The schema and table name must NOT change.

## The one tool you use

### `log_activity.py` — append one row (asynchronous by default)
```
python log_activity.py \
  --log-type <type> \
  --repo log_reporter --branch main \
  --task "<task title>" \
  --agent <name> --agent-path lead_architect/<name> \
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
Required: `--log-type`, `--repo`, `--log-title`, `--agent`. `--agent-path` defaults to `--agent`. `--log-level` defaults to `info`. `--user-id` defaults to `admin`.

**Asynchronous by default:** the script validates the args, spawns a detached background process that performs the INSERT, and exits immediately (exit 0). It does NOT print the row id and does NOT block on SQLite — so logging never slows down your work. The background child opens the DB in WAL mode with a 10s busy timeout, so concurrent agents and dashboard polling coexist. If multiple agents write at once and a write still fails the busy timeout, the child retries up to 5 times with exponential backoff (0.25s → 0.5s → 1s → 2s → 4s), logging each retry to `log_activity_errors.log`. If the background write ultimately fails, the error is appended to that same file.

**`--sync`** (optional): wait for the INSERT and print the new row id. Use this only if you actually need the row id (you usually don't).

## You do NOT mint trace_id

**Never call `mint_trace.py`.** That tool is for the lead architect only. Use the `--trace-id <trace_id>` value given to you by the lead, verbatim, and always set `--parent-trace-id <parent_trace_id>` to the lead's trace_id. The trace timeline is how a multi-agent run reads as one sequence — if you minted your own trace, your work would detach from the run.

## Fill in these values (given to you by the lead)

- `--agent` = **`<name>`**
- `--agent-path` = **`lead_architect/<name>`**
- `--tags` must include **`#subagent:<subagent_type>`** on every row, where
  `<subagent_type>` is the type you were dispatched as (the coding agent's own
  name for you, e.g. `code-reviewer`). This is the join key between this log and
  the token counts: without it, cost cannot be attributed to you rather than to
  your parent. Combine it with any other tags — `--tags "#subagent:code-reviewer #commit"`.
- `--trace-id` = **`<trace_id>`** (the lead's trace for this task — use it verbatim on every row)
- `--parent-trace-id` = **`<parent_trace_id>`** (the lead's trace_id — same value as `--trace-id` when the lead is your direct parent)
- `--repo` = **`log_reporter`**
- `--branch` = **`main`**
- `--task` = **`<task_title>`** (use the exact string the lead gave you, character for character — it is a grouping key)

## Bracket your portion of the task

- **First action you take:** append a `start` row.
- **Last action, always, even on failure:** append an `end` row with the final `--status` (`completed` or `failed`). Durations and idle time are derived from this pair — a missing `end` erases your work from every time view.

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

- `repo_name`, `branch_name`, `task_title` — identical for every row you write, character for character (they are the grouping keys).
- `agent_name` = `<name>`; `agent_path` = `lead_architect/<name>`.
- `trace_id` = `<trace_id>` (the lead's, verbatim).
- `parent_trace_id` = `<parent_trace_id>` (the lead's trace_id).
- `log_title` — one specific line ("Chose append-only over upsert", not "Made a decision").
- `log_level` — `debug | info | warning | error`.
- `status` — `pending | in_progress | failed | completed`.
- `priority` — `low | medium | high | critical`.
- `tags` — comma-separated `#tokens`.

Do NOT log per token, per line, or inside tight loops. One row per step a human would want to see. Silence between rows is reported as idle time, so log when you begin waiting on something slow.

## Worked example (a subagent's portion of a task)

Given by the lead: `name=header_agent`, `trace_id=9f2c41a8`, `parent_trace_id=9f2c41a8`, `task_title="Implement header dropdown"`.

```
$ python log_activity.py --log-type start --repo log_reporter --branch main \
    --task "Implement header dropdown" --agent header_agent \
    --agent-path lead_architect/header_agent --trace-id 9f2c41a8 \
    --parent-trace-id 9f2c41a8 --log-title "Started header dropdown component" \
    --log-level info --status in_progress
# (exits immediately; row written in the background)

$ python log_activity.py --log-type activity --repo log_reporter --branch main \
    --task "Implement header dropdown" --agent header_agent \
    --agent-path lead_architect/header_agent --trace-id 9f2c41a8 \
    --parent-trace-id 9f2c41a8 --log-title "Read prototype header markup (L32-53)" \
    --log-level info
# (exits immediately)

$ python log_activity.py --log-type decision --repo log_reporter --branch main \
    --task "Implement header dropdown" --agent header_agent \
    --agent-path lead_architect/header_agent --trace-id 9f2c41a8 \
    --parent-trace-id 9f2c41a8 \
    --log-title "Used overlay for click-outside close vs document listener" \
    --log-description "Overlay is simpler and matches prototype L41; document listener would need cleanup on disconnect" \
    --log-level info
# (exits immediately)

$ python log_activity.py --log-type end --repo log_reporter --branch main \
    --task "Implement header dropdown" --agent header_agent \
    --agent-path lead_architect/header_agent --trace-id 9f2c41a8 \
    --parent-trace-id 9f2c41a8 --log-title "Finished header dropdown component" \
    --log-level info --status completed
# (exits immediately)
```

## Worked example (a github commit)

After committing (e.g. `git rev-parse HEAD` → `a1b2c3d4e5f6789012345678901234567890abcd`,
`git log -1 --format=%h` → `a1b2c3d4`):

```
$ python log_activity.py --log-type github --repo log_reporter --branch main \
    --task "Implement header dropdown" --agent header_agent \
    --agent-path lead_architect/header_agent --trace-id 9f2c41a8 \
    --parent-trace-id 9f2c41a8 \
    --log-title "commit a1b2c3d4: Add header dropdown" \
    --log-description "Add header dropdown component

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>" \
    --tags "#commit" --commit-reference a1b2c3d4e5f6789012345678901234567890abcd
# (exits immediately; row written in the background with commit_reference set)
```

Full contract and rationale: `UPDATE_PLAN.md` §16.
