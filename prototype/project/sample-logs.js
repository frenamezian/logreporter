// Demo dataset shaped exactly like the `logs` table in activity_logs.db.
// Replaced at runtime by real rows when a .db file is opened.
//
// Log types are the six sanctioned by the spec: start, end, activity, issue, decision, github.
// A github log carries its git action in `tags` (#pull, #push, #commit, #add, #delete).
// Each agent's work is bracketed by an explicit start/end pair so durations and
// idle gaps are derivable exactly as they would be from a real database.
const ts = (d, h, m) => new Date(Date.UTC(2026, 6, d, h, m)).toISOString().slice(0, 19).replace('T', ' ');

const tasks = [
  {
    repo: 'nocturne-web', branch: 'feat/telemetry-ingest', task: 'Ship telemetry ingest endpoint',
    trace: 'c41f8a0e', day: 29, hour: 9,
    runs: [
      { ag: 'lead_architect', span: [0, 7], st: 'in_progress', pr: 'high',
        open: { title: 'Task accepted: telemetry ingest endpoint', desc: 'Decomposed the request into schema design, handler, and load test.' },
        close: { title: 'Handed off to subagents', desc: 'Two subagents spawned with the shared trace.' },
        logs: [
          { t: 'activity', lv: 'info', m: 2, title: 'Decomposed into three workstreams', desc: 'Schema, handler, load test. Ordering chosen so the handler is not blocked on the migration review.', metrics: { execution_ms: 94000, tokens: 8120 }, tags: '#ingest' },
        ] },
      { ag: 'lead_architect/schema_designer', span: [4, 12], st: 'completed',
        open: { title: 'Started schema design', desc: 'Designing the events table for append-only ingest.' },
        close: { title: 'Schema design complete', desc: 'Migration 0042 drafted and reviewed.' },
        logs: [
          { t: 'decision', lv: 'info', pr: 'high', m: 4, title: 'Chose append-only table over upsert', desc: 'Upsert needs a natural key the producers do not have. Append-only with a dedupe view keeps writes O(1) and lets us backfill without locking.', tags: '#schema,#decision' },
          { t: 'activity', lv: 'debug', m: 7, title: 'Read migrations/0041_events.sql', desc: 'Loaded prior migration to match column naming.', metrics: { execution_ms: 210, tokens: 1840 } },
        ] },
      { ag: 'lead_architect/handler_dev', span: [14, 36], st: 'completed',
        open: { title: 'Started handler implementation', desc: 'Building POST /v1/ingest against the drafted schema.' },
        close: { title: 'Handler implementation complete', desc: 'Merged behind a flag; load test queued.' },
        logs: [
          { t: 'github', lv: 'info', m: 15, title: 'Pulled feat/telemetry-ingest', desc: 'git pull --rebase origin feat/telemetry-ingest — 4 commits behind, fast-forwarded cleanly.', tags: '#pull,#git' },
          { t: 'activity', lv: 'info', m: 18, title: 'Implemented POST /v1/ingest', desc: 'Batch of up to 500 events, validated against the schema, written in one transaction.', metrics: { execution_ms: 412000, tokens: 22140, cpu_pct: 34 }, tags: '#handler' },
          { t: 'github', lv: 'info', m: 22, title: 'Committed handler and route table', desc: 'git commit -m "feat(ingest): batch POST /v1/ingest" — 3 files changed, 214 insertions.', tags: '#commit,#git' },
          { t: 'issue', lv: 'warning', m: 26, title: 'Retry 2/5 — SQLITE_BUSY on write', desc: 'Concurrent writer held the lock. Backing off 400ms with jitter.', err: 'sqlite3.OperationalError: database is locked (attempt 2, backoff 400ms)', tags: '#concurrency,#retry' },
          { t: 'decision', lv: 'info', m: 31, title: 'Write contention resolved with WAL mode', desc: 'Tried serialising writes in the app layer (too slow), then a single writer thread (queue grew unbounded). Enabling WAL plus a 5s busy_timeout cleared it.', resolved: 'lead_architect/handler_dev', res_m: 33, tags: '#concurrency,#resolved' },
          { t: 'github', lv: 'info', m: 35, title: 'Pushed to origin/feat/telemetry-ingest', desc: 'git push origin feat/telemetry-ingest — 5 commits, PR #412 opened against main.', tags: '#push,#git' },
        ] },
      { ag: 'lead_architect', span: [44, 49], st: 'completed', pr: 'high',
        open: { title: 'Reviewing load test results', desc: 'Load test finished while no agent was active.' },
        close: { title: 'Task complete', desc: 'All acceptance criteria met. 3 files changed, 214 insertions.' },
        logs: [
          { t: 'activity', lv: 'info', m: 48, title: 'Endpoint merged, p95 62ms at 500-event batches', desc: 'Load test at 40 rps sustained for 10 minutes with no lock errors. Follow-up filed for the dedupe view.', metrics: { execution_ms: 288000, tokens: 74210 } },
        ] },
    ],
  },
  {
    repo: 'nocturne-web', branch: 'fix/dashboard-empty-state', task: 'Dashboard renders blank on first load',
    trace: '9b30d7c2', day: 29, hour: 13,
    runs: [
      { ag: 'lead_architect', span: [0, 4], st: 'in_progress', pr: 'critical',
        open: { title: 'Triage: blank dashboard on cold start', desc: 'Reproduced on a fresh profile.' },
        close: { title: 'Assigned to debugger_1', desc: 'Single debugging subagent, trace propagated.' },
        logs: [
          { t: 'activity', lv: 'info', m: 1, title: 'Reproduced on a clean profile', desc: 'Blank table, no console error in production build. Reproduces 5/5 with cleared local storage.', tags: '#bug,#urgent' },
        ] },
      { ag: 'lead_architect/debugger_1', span: [5, 26], st: 'failed', pr: 'critical',
        open: { title: 'Started root cause investigation', desc: 'Bisecting against the last known good build.' },
        close: { title: 'Investigation ended without a fix', desc: 'Root cause identified, fix requires a decision above this agent.' },
        logs: [
          { t: 'github', lv: 'debug', m: 5, title: 'Pulled last 200 commits for bisect', desc: 'git pull --unshallow then git bisect start HEAD v2.14.0.', tags: '#pull,#git' },
          { t: 'activity', lv: 'info', m: 6, title: 'Bisected to commit 3f9ad2c', desc: 'The query hook now returns undefined before the store hydrates; the table maps over it and throws.', metrics: { execution_ms: 96400, tokens: 18320 } },
          { t: 'issue', lv: 'error', m: 22, title: 'Cannot reproduce in CI', desc: 'Local repro is reliable, CI passes every time. Suspect the headless runner seeds the store before mount. Needs a maintainer decision on whether to change the runner or the hook.', err: 'TypeError: Cannot read properties of undefined (reading "map")\n  at LogTable.render (log-table.js:118:24)', tags: '#blocked' },
          { t: 'decision', lv: 'error', pr: 'critical', m: 24, title: 'Escalated to lead_architect', desc: 'Handing back with the bisect result and two candidate fixes rather than guessing at CI configuration.', tags: '#escalation' },
        ] },
      { ag: 'lead_architect', span: [29, 34], st: 'in_progress',
        open: { title: 'Picked up the escalation', desc: 'Reviewing both candidate fixes.' },
        close: { title: 'Fix assigned, awaiting implementation', desc: 'Task still open.' },
        logs: [
          { t: 'decision', lv: 'info', m: 29, title: 'Fix the hook, not the runner', desc: 'CI behaviour is correct; the hook should tolerate an unhydrated store. Returning an empty array and an explicit loading flag.', tags: '#decision' },
        ] },
    ],
  },
  {
    repo: 'ledger-svc', branch: 'main', task: 'Harden ledger-svc write path',
    trace: '2ed6b915', day: 28, hour: 16,
    runs: [
      { ag: 'lead_architect', span: [0, 5], st: 'in_progress', pr: 'medium',
        open: { title: 'Add exponential backoff to the reporter', desc: 'Writes drop under four concurrent agents. Target: no dropped log at eight writers.' },
        close: { title: 'Delegated to reliability_eng', desc: 'Acceptance criteria written into the task.' },
        logs: [
          { t: 'activity', lv: 'info', m: 2, title: 'Measured the baseline drop rate', desc: '4 writers, 2,000 logs each: 61 dropped writes, all SQLITE_BUSY.', metrics: { execution_ms: 61000 } },
        ] },
      { ag: 'lead_architect/reliability_eng', span: [6, 20], st: 'completed',
        open: { title: 'Started backoff implementation', desc: 'Retry policy plus a spill file for terminal failures.' },
        close: { title: 'Backoff implemented', desc: 'Ready for the stress harness.' },
        logs: [
          { t: 'decision', lv: 'info', m: 8, title: 'Full jitter over decorrelated jitter', desc: 'Full jitter is simpler and the write bursts are short enough that the extra spread does not cost throughput.', tags: '#decision' },
          { t: 'activity', lv: 'info', m: 11, title: 'Backoff with jitter, 5 attempts', desc: 'Base 100ms, factor 2, full jitter, cap 3.2s. Failures past attempt 5 spill to a newline-delimited JSON file next to the db.', metrics: { execution_ms: 63100, tokens: 14020 } },
        ] },
      { ag: 'lead_architect/reliability_eng/test_writer', span: [19, 26], st: 'completed',
        open: { title: 'Started stress harness', desc: 'Eight concurrent writers against a single db file.' },
        close: { title: 'Stress harness complete', desc: 'No dropped writes.' },
        logs: [
          { t: 'activity', lv: 'debug', m: 19, title: 'Spawned 8 writer processes', desc: 'Stress harness writing 2,000 logs each against one db file.', metrics: { execution_ms: 184000, cpu_pct: 71, memory_mb: 240 } },
          { t: 'activity', lv: 'info', m: 25, title: '16,000 / 16,000 logs written, 0 dropped', desc: '312 retries total, worst case attempt 3. Spill file never created.', tags: '#tested' },
        ] },
      { ag: 'lead_architect', span: [30, 33], st: 'completed', pr: 'medium',
        open: { title: 'Reviewing harness output', desc: 'Verifying the retry histogram before merge.' },
        close: { title: 'Merged to main', desc: 'Reporter version 0.4.0 tagged.' },
        logs: [
          { t: 'activity', lv: 'info', m: 31, title: 'Retry histogram reviewed', desc: 'p99 attempt count is 2. Cap never reached.', metrics: { execution_ms: 44000 } },
          { t: 'github', lv: 'info', m: 32, title: 'Merged and pushed v0.4.0 to main', desc: 'git merge --no-ff feat/backoff, tagged v0.4.0, git push origin main --tags.', tags: '#push,#git' },
        ] },
    ],
  },
  {
    repo: 'ledger-svc', branch: 'feat/redaction', task: 'Redact sensitive fields before write',
    trace: '5a71c308', day: 29, hour: 11,
    runs: [
      { ag: 'compliance_agent', span: [0, 5], st: 'in_progress', pr: 'high',
        open: { title: 'Add a redaction pass to the reporter', desc: 'No PII or credentials may reach the log table.' },
        close: { title: 'Delegated to pattern_writer', desc: 'Detector list agreed.' },
        logs: [
          { t: 'activity', lv: 'info', m: 1, title: 'Catalogued the payload fields at risk', desc: 'log_description and error_details carry free text; everything else is structured.', tags: '#gdpr' },
        ] },
      { ag: 'compliance_agent/pattern_writer', span: [7, 28], st: 'completed',
        open: { title: 'Started detector implementation', desc: 'Writing and corpus-testing twelve detectors.' },
        close: { title: 'Detectors complete', desc: 'Clean on a 5,000-line corpus.' },
        logs: [
          { t: 'github', lv: 'debug', m: 8, title: 'Added redaction/detectors/ to the index', desc: 'git add redaction/detectors/*.py — 12 new files staged.', tags: '#add,#git' },
          { t: 'activity', lv: 'info', m: 9, title: 'Twelve detectors added', desc: 'Email, phone, IBAN, AWS key, bearer token, private key header, JWT, national IDs. Matches are replaced with a typed placeholder, never the original length.', metrics: { execution_ms: 74300, tokens: 26410 }, tags: '#gdpr,#redaction' },
          { t: 'github', lv: 'warning', m: 26, title: 'Deleted legacy scrub_regex.py', desc: 'git rm redaction/scrub_regex.py — superseded by the detector set, no remaining callers.', tags: '#delete,#git' },
          { t: 'issue', lv: 'warning', m: 21, title: 'False positives on commit SHAs', desc: 'The JWT detector matched 40-char hex strings, flagging every commit reference in the corpus.', err: '12 false positives / 5,000 lines (JWT detector)' },
          { t: 'decision', lv: 'info', m: 23, title: 'Require two dots in the JWT detector', desc: 'Tightening the charset still matched. Requiring the three-segment structure is clean on the whole corpus.', resolved: 'compliance_agent/pattern_writer', res_m: 24, tags: '#resolved' },
        ] },
      { ag: 'compliance_agent', span: [34, 38], st: 'completed', pr: 'high',
        open: { title: 'Reviewing detector output', desc: 'Corpus diff reviewed before enabling by default.' },
        close: { title: 'Redaction on by default', desc: 'Opt-out requires an explicit flag and emits a warning log.' },
        logs: [
          { t: 'activity', lv: 'info', m: 35, title: 'Corpus diff reviewed and signed off', desc: 'No unredacted secrets remain; no legitimate content lost.', metrics: { execution_ms: 210000, tokens: 61200 } },
        ] },
    ],
  },
  {
    repo: 'agent-runtime', branch: 'feat/subagent-tracing', task: 'Propagate trace_id through nested subagents',
    trace: 'd8c02f47', day: 30, hour: 8,
    runs: [
      { ag: 'lead_architect', span: [0, 4], st: 'in_progress', pr: 'high',
        open: { title: 'Thread trace context through spawn', desc: 'Nested subagents currently start a fresh trace, so hierarchies cannot be reconstructed.' },
        close: { title: 'Delegated to runtime_dev', desc: 'Approach left to the implementing agent.' },
        logs: [
          { t: 'activity', lv: 'info', m: 2, title: 'Surveyed the spawn call sites', desc: 'Six internal callers, one public helper with a documented signature.', metrics: { execution_ms: 72000 } },
        ] },
      { ag: 'lead_architect/runtime_dev', span: [5, 30], st: 'completed',
        open: { title: 'Started spawn signature change', desc: 'Explicit parent trace parameter.' },
        close: { title: 'Spawn change complete', desc: 'Tests green after one retry.' },
        logs: [
          { t: 'decision', lv: 'info', m: 5, title: 'parent_trace_id on the spawn call', desc: 'Rejected an ambient context var — it leaks across the thread pool. The spawn signature now carries the parent explicitly.', tags: '#decision,#tracing' },
          { t: 'issue', lv: 'warning', m: 26, title: 'Retry 1/5 — test db locked by fixture', desc: 'Fixture teardown had not closed its connection. Retried after 100ms and passed.', err: 'sqlite3.OperationalError: database is locked (attempt 1, backoff 100ms)', tags: '#retry' },
        ] },
      { ag: 'lead_architect/runtime_dev/subagent_1', span: [12, 24], st: 'completed',
        open: { title: 'Started call site migration', desc: 'Migrating six internal callers.' },
        close: { title: 'Call site migration complete', desc: 'Deprecated overload retained for one release.' },
        logs: [
          { t: 'activity', lv: 'info', m: 14, title: 'Spawn signature updated in 6 call sites', desc: 'All internal callers migrated; the public helper keeps a deprecated overload for one release.', metrics: { execution_ms: 88200, tokens: 19870 } },
          { t: 'github', lv: 'info', m: 18, title: 'Committed spawn signature migration', desc: 'git commit -m "refactor(runtime): explicit parent_trace_id on spawn" — 7 files changed.', tags: '#commit,#git' },
        ] },
      { ag: 'lead_architect/runtime_dev/subagent_1/nested_subagent_3', span: [20, 23], st: 'completed',
        open: { title: 'Started depth verification', desc: 'Checking reconstruction at four levels.' },
        close: { title: 'Depth verification complete', desc: 'Four-level paths reconstruct correctly.' },
        logs: [
          { t: 'activity', lv: 'debug', m: 22, title: 'Queried logs for depth check', desc: 'Confirmed paths four levels deep reconstruct from agent_path alone.', metrics: { execution_ms: 640 } },
        ] },
      { ag: 'lead_architect', span: [41, 44], st: 'in_progress', pr: 'high',
        open: { title: 'Preparing review request', desc: 'Waiting on a maintainer for the deprecation window.' },
        close: { title: 'Review requested, task open', desc: 'Awaiting maintainer review on the deprecated overload window.' },
        logs: [
          { t: 'activity', lv: 'info', m: 41, title: 'Review requested', desc: 'Awaiting maintainer review on the deprecated overload window.', tags: '#review' },
        ] },
    ],
  },
  {
    repo: 'agent-runtime', branch: 'chore/token-budget', task: 'Cap per-task token budget',
    trace: 'ba95e6d1', day: 27, hour: 10,
    runs: [
      { ag: 'ops_agent', span: [0, 3], st: 'in_progress', pr: 'low',
        open: { title: 'Introduce a soft token ceiling', desc: 'Long-running tasks have burned 400k tokens without a checkpoint.' },
        close: { title: 'Delegated to budget_writer', desc: 'Enforcement point left open.' },
        logs: [
          { t: 'activity', lv: 'info', m: 1, title: 'Pulled last month of token totals', desc: 'Two tasks over 400k, eleven over 100k.', metrics: { execution_ms: 38000 } },
        ] },
      { ag: 'ops_agent/budget_writer', span: [4, 18], st: 'failed', pr: 'medium',
        open: { title: 'Started budget enforcement', desc: 'Rolling per-log token counts up to the task.' },
        close: { title: 'Enforcement blocked', desc: 'Cannot proceed without a schema decision.' },
        logs: [
          { t: 'issue', lv: 'error', m: 17, title: 'No per-task token attribution', desc: 'performance_metrics records tokens per log, not per task. Rolling them up by trace_id double counts retries. Needs a schema decision before the cap can be enforced.', err: 'AssertionError: sum(tokens by trace) 512,300 > provider-reported 388,100', tags: '#blocked,#metrics' },
        ] },
      { ag: 'ops_agent', span: [20, 22], st: 'pending', pr: 'medium',
        open: { title: 'Reviewing the blocker', desc: 'Deciding whether to estimate or park.' },
        close: { title: 'Task parked', desc: 'Not proceeding on an estimate.' },
        logs: [
          { t: 'decision', lv: 'warning', m: 20, title: 'Parked pending schema decision', desc: 'Raised on the schema thread; not proceeding on an estimate.', tags: '#escalation' },
        ] },
    ],
  },
  {
    repo: 'nocturne-web', branch: 'main', task: 'Nightly log compaction',
    trace: '31f7ac9b', day: 30, hour: 3,
    runs: [
      { ag: 'ops_agent', span: [0, 9], st: 'completed', pr: 'low',
        open: { title: 'Nightly compaction started', desc: 'VACUUM plus index rebuild on activity_logs.db.' },
        close: { title: 'Compaction complete — 41.2MB → 18.7MB', desc: '54% reduction, 512,300 rows retained.' },
        logs: [
          { t: 'activity', lv: 'debug', m: 2, title: 'Acquired exclusive lock', desc: 'No agents writing at 03:02 UTC.', metrics: { execution_ms: 120 } },
          { t: 'activity', lv: 'info', m: 6, title: 'VACUUM finished', desc: 'Freelist reclaimed, indexes rebuilt.', metrics: { execution_ms: 402000, cpu_pct: 22 } },
          { t: 'github', lv: 'info', m: 8, title: 'Pushed compaction report to main', desc: 'git commit -am "chore: nightly compaction report" && git push origin main.', tags: '#push,#git' },
        ] },
    ],
  },
];

let id = 1000;
const mk = (tk, run, s, type, extra) => Object.assign({
  id: ++id,
  timestamp: ts(tk.day, tk.hour, s.m),
  repo_name: tk.repo,
  branch_name: tk.branch,
  trace_id: tk.trace,
  parent_trace_id: run.ag.includes('/') ? tk.trace : null,
  task_title: tk.task,
  agent_name: run.ag.split('/').pop(),
  agent_path: run.ag,
  log_title: s.title,
  log_description: s.desc,
  log_type: type,
  log_level: s.lv || 'info',
  status: null,
  priority: run.pr || null,
  user_id: 'admin',
  tags: s.tags || null,
  error_details: s.err || null,
  resolved_by: s.resolved || null,
  resolution_time: s.res_m != null ? ts(tk.day, tk.hour, s.res_m) : null,
  performance_metrics: s.metrics ? JSON.stringify(s.metrics) : null,
  input_output_hash: s.metrics ? 'sha256:' + (id * 7919).toString(16).padStart(12, '0') : null,
}, extra || {});

export const sampleLogs = tasks.flatMap((tk) => tk.runs.flatMap((run) => {
  const rows = [mk(tk, run, Object.assign({m: run.span[0], lv: 'info'}, run.open), 'start', {status: 'in_progress'})];
  run.logs.forEach((s) => rows.push(mk(tk, run, s, s.t)));
  rows.push(mk(tk, run, Object.assign({m: run.span[1], lv: run.st === 'failed' ? 'error' : 'info'}, run.close), 'end', {status: run.st}));
  return rows;
}));
