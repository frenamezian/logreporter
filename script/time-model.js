(function (window) {
'use strict';

// Derives durations, per-type time and idle gaps from raw log rows.
// A run is one start/end pair for a single agent inside one task; time between
// runs that no agent covers is idle — treated as a first-class category.

const TYPES = ['start', 'end', 'activity', 'issue', 'decision', 'github'];
const CATEGORIES = ['activity', 'issue', 'decision', 'github', 'idle'];

// git actions carried in `tags` on a github log, e.g. "#push,#main"
const GIT_ACTIONS = ['pull', 'push', 'commit', 'add', 'delete'];
const gitAction = (l) => {
  const hay = ((l.tags || '') + ' ' + (l.log_title || '')).toLowerCase();
  return GIT_ACTIONS.find((a) => hay.includes(a)) || '';
};

const at = (s) => new Date(String(s).replace(' ', 'T') + 'Z').getTime();
const key = (l) => l.repo_name + '\u0000' + l.branch_name + '\u0000' + (l.task_title || 'Untitled task');

function union(intervals) {
  const s = intervals.slice().sort((a, b) => a.from - b.from);
  const out = [];
  s.forEach((iv) => {
    const last = out[out.length - 1];
    if (last && iv.from <= last.to) last.to = Math.max(last.to, iv.to);
    else out.push({from: iv.from, to: iv.to});
  });
  return out;
}

function complement(span, covered) {
  const out = [];
  let cur = span.from;
  covered.forEach((iv) => {
    if (iv.from > cur) out.push({from: cur, to: iv.from});
    cur = Math.max(cur, iv.to);
  });
  if (cur < span.to) out.push({from: cur, to: span.to});
  return out.filter((g) => g.to > g.from);
}

// One agent's start→end pair, with the logs that fall inside it.
function runsFor(logs) {
  const byAgent = new Map();
  logs.forEach((l) => {
    const k = l.agent_path || l.agent_name || '?';
    if (!byAgent.has(k)) byAgent.set(k, []);
    byAgent.get(k).push(l);
  });
  const runs = [];
  byAgent.forEach((ls, path) => {
    ls.sort((a, b) => at(a.timestamp) - at(b.timestamp));
    let cur = null;
    const push = () => { if (cur && cur.events.length) runs.push(cur); cur = null; };
    ls.forEach((l) => {
      if (l.log_type === 'start') { push(); cur = {path, agent: l.agent_name, from: at(l.timestamp), to: null, status: null, events: [l]}; return; }
      if (!cur) cur = {path, agent: l.agent_name, from: at(l.timestamp), to: null, status: null, events: []};
      cur.events.push(l);
      if (l.log_type === 'end') { cur.to = at(l.timestamp); cur.status = l.status || 'completed'; push(); }
    });
    push();
  });
  runs.forEach((r) => {
    if (r.to == null) r.to = at(r.events[r.events.length - 1].timestamp);
    r.ms = Math.max(0, r.to - r.from);
    r.depth = (r.path || '').split('/').length - 1;
    // Attribute each stretch to the type of the event that opened it. Events
    // with nothing after them — the closing `end` log, or two logs sharing a
    // timestamp — get a zero-length segment flagged as a point rather than
    // being dropped: they still have to be selectable and highlightable, they
    // just account for no time.
    const segs = [];
    r.events.forEach((e, i) => {
      const from = at(e.timestamp);
      const to = i + 1 < r.events.length ? at(r.events[i + 1].timestamp) : r.to;
      const cat = e.log_type === 'issue' ? 'issue' : e.log_type === 'decision' ? 'decision' : e.log_type === 'github' ? 'github' : 'activity';
      segs.push({from, to: Math.max(to, from), ms: Math.max(0, to - from), cat, point: to <= from, log: e});
    });
    r.segments = segs;
    r.by = {activity: 0, issue: 0, decision: 0, github: 0};
    segs.forEach((sg) => { r.by[sg.cat] += sg.ms; });
  });
  // Exclusive ("self") time. A parent agent stays open while its subagents
  // work, so its run contains theirs and r.ms double counts the delegation.
  // Subtracting the union of the descendants' runs leaves the time the agent
  // spent on its own work; parent self + children then add up to the span the
  // parent covers. Sibling agents running in true parallel are NOT subtracted
  // from each other — that overlap is real concurrency, not nesting.
  runs.forEach((r) => {
    const kids = runs.filter((o) => o !== r && o.path && r.path && o.path.startsWith(r.path + '/'));
    const clipped = kids
      .map((k) => ({from: Math.max(k.from, r.from), to: Math.min(k.to, r.to)}))
      .filter((iv) => iv.to > iv.from);
    r.childMs = union(clipped).reduce((n, iv) => n + (iv.to - iv.from), 0);
    r.selfMs = Math.max(0, r.ms - r.childMs);
  });
  return runs.sort((a, b) => a.from - b.from || a.depth - b.depth);
}

function blank() { return {activity: 0, issue: 0, decision: 0, github: 0, idle: 0, wall: 0, agentMs: 0, selfMs: 0, logs: 0, issues: 0}; }
function add(a, b) { CATEGORIES.forEach((c) => { a[c] += b[c]; }); a.wall += b.wall; a.agentMs += b.agentMs; a.selfMs += b.selfMs; a.logs += b.logs; a.issues += b.issues; return a; }

function buildModel(logs) {
  const tasksMap = new Map();
  logs.forEach((l) => {
    if (!l || !l.timestamp) return;
    if (!tasksMap.has(key(l))) tasksMap.set(key(l), []);
    tasksMap.get(key(l)).push(l);
  });

  const tasks = [];
  tasksMap.forEach((ls, k) => {
    const [repo, branch, title] = k.split('\u0000');
    const runs = runsFor(ls);
    if (!runs.length) return;
    const span = {from: Math.min(...runs.map((r) => r.from)), to: Math.max(...runs.map((r) => r.to))};
    const covered = union(runs.map((r) => ({from: r.from, to: r.to})));
    const busy = covered.reduce((n, iv) => n + (iv.to - iv.from), 0);
    const gaps = complement(span, covered).map((g) => Object.assign(g, {ms: g.to - g.from, repo, branch, task: title}));
    const idle = gaps.reduce((n, g) => n + g.ms, 0);
    const agentMs = runs.reduce((n, r) => n + r.ms, 0);
    const agentBy = {activity: 0, issue: 0, decision: 0, github: 0};
    runs.forEach((r) => { agentBy.activity += r.by.activity; agentBy.issue += r.by.issue; agentBy.decision += r.by.decision; agentBy.github += r.by.github; });
    const sum = agentBy.activity + agentBy.issue + agentBy.decision + agentBy.github || 1;
    // apportion wall-clock busy time across types so a bar sums to wall time
    const ms = {
      activity: Math.round(busy * agentBy.activity / sum),
      issue: Math.round(busy * agentBy.issue / sum),
      decision: Math.round(busy * agentBy.decision / sum),
      github: Math.round(busy * agentBy.github / sum),
      idle, wall: span.to - span.from, agentMs,
      selfMs: runs.reduce((n, r) => n + r.selfMs, 0),
      logs: ls.length, issues: ls.filter((l) => l.log_type === 'issue').length,
    };
    const ends = ls.filter((l) => l.log_type === 'end' && l.status);
    const last = ends.sort((a, b) => at(a.timestamp) - at(b.timestamp))[ends.length - 1];
    tasks.push({
      repo, branch, title, ms, span, gaps, runs, logs: ls,
      status: last ? last.status : 'in_progress',
      agents: Array.from(new Set(runs.map((r) => r.path))),
      largestGap: gaps.slice().sort((a, b) => b.ms - a.ms)[0] || null,
      trace: (ls.find((l) => l.trace_id) || {}).trace_id || '',
    });
  });

  tasks.sort((a, b) => b.span.to - a.span.to);

  const repos = [];
  const rmap = new Map();
  tasks.forEach((t) => {
    if (!rmap.has(t.repo)) { const r = {name: t.repo, ms: blank(), branches: [], _b: new Map()}; rmap.set(t.repo, r); repos.push(r); }
    const r = rmap.get(t.repo);
    add(r.ms, t.ms);
    if (!r._b.has(t.branch)) { const b = {name: t.branch, repo: t.repo, ms: blank(), tasks: []}; r._b.set(t.branch, b); r.branches.push(b); }
    const b = r._b.get(t.branch);
    add(b.ms, t.ms);
    b.tasks.push(t);
  });
  repos.forEach((r) => { delete r._b; r.branches.sort((a, b) => b.ms.wall - a.ms.wall); });
  repos.sort((a, b) => b.ms.wall - a.ms.wall);

  const totals = tasks.reduce((acc, t) => add(acc, t.ms), blank());
  totals.tasks = tasks.length;
  totals.done = tasks.filter((t) => t.status === 'completed').length;
  totals.open = tasks.filter((t) => t.status === 'in_progress' || t.status === 'pending').length;
  totals.failed = tasks.filter((t) => t.status === 'failed').length;

  return {
    tasks, repos, totals,
    gaps: tasks.flatMap((t) => t.gaps).sort((a, b) => b.ms - a.ms),
  };
}

// Chronological stream: logs in time order with explicit idle rows between them.
function stream(logs, model) {
  const rows = logs.slice().sort((a, b) => at(a.timestamp) - at(b.timestamp));
  const gapAt = new Map();
  model.tasks.forEach((t) => t.gaps.forEach((g) => {
    const k = t.repo + '\u0000' + t.branch + '\u0000' + t.title + '\u0000' + g.from;
    gapAt.set(k, g);
  }));
  const out = [];
  let prevDay = '';
  rows.forEach((l, i) => {
    const day = l.timestamp.slice(0, 10);
    if (day !== prevDay) { out.push({kind: 'day', day}); prevDay = day; }
    const prev = rows[i - 1];
    if (prev && key(prev) === key(l)) {
      const g = gapAt.get(key(l) + '\u0000' + at(prev.timestamp));
      if (g) out.push({kind: 'gap', gap: g});
    }
    out.push({kind: 'log', log: l});
  });
  return out;
}

const fmt = (ms) => {
  if (ms == null || isNaN(ms)) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm';
  return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm';
};

// --- attributing token usage to tasks (§7) ----------------------------------
//
// A usage row belongs to a task when the repo and branch match and its
// timestamp falls inside that task's [start, end] span. Tasks already carry
// that span; nothing new is computed here, it is only exposed and joined.
//
// Two honesty rules, both of which cost more code than the alternative:
//
//   Rows matching no span go to an explicit Unattributed bucket rather than
//   being dropped or forced into the nearest task. Agents that worked without
//   bracketing a task are a real finding — the same position the idle model
//   takes about time nobody logged — and a large Unattributed share is
//   information, not a rendering bug.
//
//   Rows matching several spans (concurrent agents on one repo and branch) are
//   split evenly across them and flagged, never counted once per task. The
//   flag matters: an evenly split row is a guess about attribution, and the
//   page says so rather than presenting it as measured.

// Usage timestamps are ISO-8601 with a Z; log timestamps are 'YYYY-MM-DD
// HH:MM:SS' and also UTC (log_activity.py writes utc_now()). Both go through
// Date, so the join never compares a local time with a UTC one.
const usageAt = (s) => {
  const t = new Date(String(s || '')).getTime();
  return Number.isFinite(t) ? t : null;
};

function taskSpans(tasks) {
  return (tasks || []).map((t) => ({
    key: t.repo + '\u0000' + t.branch + '\u0000' + t.title,
    repo: t.repo, branch: t.branch, title: t.title,
    from: t.span.from, to: t.span.to,
    // The task travels with its span: joining usage to the agent that produced
    // it needs the task's log rows, which is where the #subagent tags live.
    task: t
  }));
}

function attributeUsage(usageRows, tasks) {
  const spans = taskSpans(tasks);
  const byScope = new Map();
  spans.forEach((s) => {
    const k = s.repo + '\u0000' + s.branch;
    if (!byScope.has(k)) byScope.set(k, []);
    byScope.get(k).push(s);
  });

  const buckets = new Map();      // task key -> { task, rows, weights }
  spans.forEach((s) => buckets.set(s.key, { task: s, rows: [], weights: [] }));
  const unattributed = { rows: [], weights: [] };
  let splitRows = 0;

  (usageRows || []).forEach((row) => {
    const t = usageAt(row.timestamp);
    const candidates = t === null ? [] :
      (byScope.get(row.repo_name + '\u0000' + row.branch_name) || [])
        .filter((s) => t >= s.from && t <= s.to);

    if (!candidates.length) {
      unattributed.rows.push(row);
      unattributed.weights.push(1);
      return;
    }
    const w = 1 / candidates.length;
    if (candidates.length > 1) splitRows += 1;
    candidates.forEach((s) => {
      const b = buckets.get(s.key);
      b.rows.push(row);
      b.weights.push(w);
    });
  });

  return { buckets, unattributed, splitRows, spans };
}

// --- joining usage to the agent that produced it ----------------------------
//
// Claude Code records which subagent made each request, in the meta.json beside
// every sidechain transcript; the parser keeps it as extra_json.agent_type.
// That is exact, first-party data - not an inference from overlapping time
// windows, which was wrong by 10-25% on the sampled task.
//
// What is missing is only the join key, because the two sides name agents
// independently: LogReporter knows `lead_architect/task_executor`, Claude Code
// knows `task-executor`. An agent declares the link by tagging its rows
//
//     --tags "#subagent:task-executor"
//
// and the mapping survives any later rename. Where the tag is absent we fall
// back to matching the last path segment with `-` and `_` treated alike, which
// costs nothing and works for agents already named after their subagent type.

const SUBAGENT_TAG = /#subagent:([A-Za-z0-9_.\- ]+)/;
const normAgent = (s) => String(s || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

function subagentTag(log) {
  const m = SUBAGENT_TAG.exec(log.tags || '');
  return m ? m[1].trim() : null;
}

// For one task: subagent type -> the logged agent_path that declared it.
function agentTypeMap(task) {
  const byTag = new Map();      // explicit, wins
  const byName = new Map();     // naming convention, fallback
  let root = null;
  (task.logs || []).forEach((l) => {
    const p = l.agent_path || l.agent_name;
    if (!p) return;
    const tag = subagentTag(l);
    if (tag) byTag.set(normAgent(tag), p);
    byName.set(normAgent(p.split('/').pop()), p);
    // The root is the shallowest path in the task: in a single-session run it
    // is what was executing whenever no subagent was.
    if (root === null || p.split('/').length < root.split('/').length) root = p;
  });
  return { byTag, byName, root };
}

// Which agent produced this usage row. `exact` distinguishes first-party
// metadata from the assumption made about main-session requests.
function usageAgent(row, map) {
  let type = null;
  if (row.extra_json) {
    try { type = (JSON.parse(row.extra_json) || {}).agent_type || null; } catch (e) { type = null; }
  }
  if (!type) {
    // No subagent metadata: the request came from the main session, where the
    // root agent is the one running. An assumption, and labelled as one.
    return { path: root_or_null(map), exact: false, via: 'main session', type: null };
  }
  const k = normAgent(type);
  if (map.byTag.has(k)) return { path: map.byTag.get(k), exact: true, via: 'tag', type };
  if (map.byName.has(k)) return { path: map.byName.get(k), exact: true, via: 'name', type };
  // Claude Code ran a subagent this task never logged. Real, and not the same
  // as "no usage" - it gets its own row rather than being folded into a parent.
  return { path: null, exact: true, via: 'unmatched', type };
}

function root_or_null(map) { return map && map.root ? map.root : null; }

// True when `name` is `path` or one of its ancestors - the same subtree rule
// drillRows applies to log rows, so drilling to an agent shows that agent and
// everything it dispatched, exactly as the tree counts do.
function agentInSubtree(path, name) {
  return !!path && path.split('/').includes(name);
}

window.LR = { TYPES, CATEGORIES, GIT_ACTIONS, gitAction, buildModel, stream, fmt,
              taskSpans, attributeUsage, agentTypeMap, usageAgent, agentInSubtree,
              subagentTag, normAgent };
})(window);
