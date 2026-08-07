# LogReporter — agent instructions

**This repo is the activity-logging tool itself.** `log_activity.py`, `mint_trace.py`, and `query_activity.py` sit at the root beside `activity_logs.db`, and the dashboard is tested against that live data — **do not change the schema or the table name** (the table is `logs`). Both `.db` files are untracked and deliberately *not* gitignored (see the header of `.gitignore` for why); never commit them, and enable the guard with `git config core.hooksPath .githooks`.

## How work happens here

One agent, in conversation. No orchestrator, no dispatch, no Build → Review → Test → Close tiering — that harness lives in `../Playground/.claude` and does not apply to this repo.

`orchestrator_logging_instructions.md` and `subagent_logging_instructions.md` are **product artifacts, not house rules.** They are the prompts LogReporter ships to its users, and a downstream repo copies and re-syncs them. Edit them as deliverables when the tool's logging contract changes; do not follow them here, and do not trim them to match this file.

## Log your work

Substantial work gets a trace, so the dashboard has something to show. Once per task:

1. `python mint_trace.py` → an 8-char `trace_id`, reused by every row for that task.
2. A `start` row (`--log-type start --status in_progress`), then 3–8 interior rows (`activity`, `decision`, `issue`, `github`), then an `end` row (`--status completed` or `failed`).

What is easiest to get wrong:

1. **Run the scripts from this repo root.** The working directory decides which repo and branch a row is filed under, and the tool reads both from git. A row written from elsewhere detaches from this repo's cost reporting and nothing tells you: the write succeeds and exits 0.
2. **One `trace_id` ↔ one `task_title`.** Mint once, when the work starts. Never re-mint mid-task.
3. **`--agent lead_architect`, and omit `--agent-path`.** It defaults to `--agent` when absent, which is exactly what a flat single-agent run wants, and it matches the shape of the rows already in the database. Never pass a file path there.
4. **Do not pass `--async`.** Writes are synchronous by default. Use `--timestamp '<UTC YYYY-MM-DD HH:MM:SS>'` to backdate a row you should have written earlier.
5. **Never log tokens by hand.** `usage_reader.py` reads them out of the agents' own session transcripts into `token_usage.db`; the dashboard joins the two on repo, branch and time.

## What counts as a run

Substantial work with no task file still gets logged. Log it if **any** of these is true: it follows a written plan or brief, it will produce more than one commit, or it runs a full test tier.

Casual chat work does not: answering a question, reading or explaining code, a single small edit, a typo or formatting fix, exploratory searching. **If you are one edit and one commit from done, it is chat, not a run** — noise costs more than a missing row.

When a chat exchange *turns into* a run, mint the trace at the moment it does and backdate the `start` row with `--timestamp` to when the work actually began. Use a descriptive `task_title` in place of a task number (e.g. `Paper & Ink restyle`); one trace, one title still holds.
