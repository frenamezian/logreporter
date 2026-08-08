(function (window) {
'use strict';
const LogComponent = window.LogComponent;
const { esc, fmt, bar, fmtTs, statusBadge } = window.LRC;

// Categories in stacking order, matching the legend
const CATS = ['activity', 'issue', 'decision', 'github', 'idle'];
// A per-category duration bucket holding a single value
const only = (cat, ms) => ({ activity: 0, issue: 0, decision: 0, github: 0, idle: 0, [cat]: ms });

// Every task span in view for a repository, or for one branch of it.
const spansFor = (m, repo, branch) => (m.tasks || [])
  .filter((t) => t.repo === repo && (!branch || t.branch === branch) && t.span)
  .map((t) => t.span);

// Overlapping spans are deliberately *not* weighted here, unlike the parts of a
// task in cost-model.summarize. A repository bar is asking "did this request
// happen during any logged work", which a row inside two spans answers once.
const inAnySpan = (u, spans) => {
  const v = Date.parse(String(u.timestamp || ''));
  if (!Number.isFinite(v)) return false;
  return spans.some((sp) => v >= sp.from && v <= sp.to);
};

class LogTimegoes extends LogComponent {
  // Scope-wide totals, like every other card here. The waterfall below shows
  // one task, so this card and those rows describe different sets whenever the
  // scope is wider than a task - which is already true of the time cards.
  usageCard(s) {
    const CM = window.CostModel;
    const rows = s.usageInScope || [];
    if (!CM || !rows.length) {
      return `<div class="metric-card"><div class="metric-value muted">—</div>
        <div class="metric-label">Tokens</div>
        <div class="metric-sub">${(s.usageDb && s.usageDb.status && s.usageDb.status.state === 'absent')
          ? 'no usage cache yet' : 'none in scope'}</div></div>`;
    }
    const sum = CM.summarize(rows);
    return `<div class="metric-card" title="Modelled at API list prices, not billed. Scoped like every other card on this row.">
      <div class="metric-value">${CM.fmtTokens(sum.tokens.total)}</div>
      <div class="metric-label">Tokens <span class="metric-hint">modelled cost</span></div>
      <div class="metric-sub">${sum.pricedRows ? CM.fmtCost(sum.cost.total) : '—'} · ${rows.length.toLocaleString('en-US')} requests</div>
    </div>`;
  }

  // --- token usage on this page -------------------------------------------
  //
  // A waterfall row is one *run* — one agent's start/end pair — so usage can be
  // narrowed further here than anywhere else: a request belongs to a run when
  // the agent it was joined to is that run's agent AND its timestamp falls
  // inside that run's window. An agent that ran three times gets three separate
  // figures rather than one aggregate.
  //
  // The path is matched exactly, not as a subtree, so Tokens and Cost mean the
  // same thing as the Own column they sit beside: this agent's work, not its
  // subagents'. The subagents have their own rows.
  usageByRun(task) {
    const CM = window.CostModel;
    const LR = window.LR;
    const s = window.LogApp.state;
    const out = new Map();
    if (!CM || !LR || !task) return out;
    const map = LR.agentTypeMap(task);
    (s.usageInScope || []).forEach((u) => {
      const t = Date.parse(u.timestamp);
      if (!Number.isFinite(t) || t < task.span.from || t > task.span.to) return;
      const a = LR.usageAgent(u, map);
      if (!a.path) return;
      const run = (task.runs || []).find((r) => r.path === a.path && t >= r.from && t <= r.to);
      if (!run) return;              // between this agent's runs: no row owns it
      const k = run.path + '|' + run.from;
      if (!out.has(k)) out.set(k, []);
      out.get(k).push(u);
    });
    return out;
  }

  // The same two figures in the waterfall's own cell class.
  wfUsageCells(rows) {
    const CM = window.CostModel;
    if (!CM || !rows || !rows.length) {
      return '<div class="wf-span na">—</div><div class="wf-span na">—</div>';
    }
    const sum = CM.summarize(rows);
    return `<div class="wf-span">${CM.fmtTokens(sum.tokens.total)}</div>` +
           `<div class="wf-span">${sum.pricedRows ? CM.fmtCost(sum.cost.total) : '—'}</div>`;
  }

  // Tokens and cost for an arbitrary set of usage rows, as two table cells.
  usageCells(rows) {
    const CM = window.CostModel;
    if (!CM || !rows || !rows.length) {
      return '<div class="bar-val na">—</div><div class="bar-val na">—</div>';
    }
    const sum = CM.summarize(rows);
    return `<div class="bar-val">${CM.fmtTokens(sum.tokens.total)}</div>` +
           `<div class="bar-val">${sum.pricedRows ? CM.fmtCost(sum.cost.total) : '—'}</div>`;
  }

  // Usage for one item of the bars panel above the agent level: a repository, a
  // branch, or a task. All three join on name *and* span.
  //
  // The repo and branch rows used to join on name alone, and the result was a
  // row that quietly answered two different questions at once: Playground read
  // "9m" beside "7.43B tokens", because the TIME column meant the tasks in view
  // and the TOKENS column meant every request that repository had ever made.
  // Ten weeks of spend sat next to nine minutes of work with nothing saying so.
  //
  // Bounding both to the same spans is what makes a row internally consistent.
  // The tokens that fall outside every span are not discarded for it — they are
  // the `outside logged tasks` row in renderBars, which is a more useful number
  // than the inflated total ever was: it is how much of this agent's spend the
  // logs never accounted for.
  usageForItem(x, m) {
    const s = window.LogApp.state;
    const rows = s.usageInScope || [];
    if (x.scope && x.scope.task) {
      const t = (m.tasks || []).find((k) => k.title === x.scope.task &&
        k.repo === x.scope.repo && k.branch === x.scope.branch);
      if (!t) return [];
      return rows.filter((u) => u.repo_name === t.repo && u.branch_name === t.branch &&
        (() => { const v = Date.parse(u.timestamp);
                 return Number.isFinite(v) && v >= t.span.from && v <= t.span.to; })());
    }
    if (x.scope && x.scope.branch) {
      return rows.filter((u) => u.repo_name === x.scope.repo &&
        u.branch_name === x.scope.branch && inAnySpan(u, spansFor(m, x.scope.repo, x.scope.branch)));
    }
    if (x.scope && x.scope.repo) {
      return rows.filter((u) => u.repo_name === x.scope.repo &&
        inAnySpan(u, spansFor(m, x.scope.repo, null)));
    }
    return [];
  }

  render() {
    const s = window.LogApp.state;
    const m = s.model;
    const t = m.totals || {};
    const wall = t.wall || 0;
    // Unclamped: agent time legitimately exceeds wall clock when agents nest or
    // run in parallel, and that ratio is the interesting number. Clamping it to
    // 100% used to hide exactly that.
    const ratio = (v) => wall ? ((v / wall) * 100).toFixed(1) + '% of wall' : '—';
    const sec = (v) => v ? ratio(v) : '0% of wall';
    return `
      <div class="metrics-grid" style="grid-template-columns:repeat(6,1fr)">
        <div class="metric-card"><div class="metric-value">${fmt(t.wall)}</div><div class="metric-label">Wall clock</div><div class="metric-sub">${t.tasks || 0} tasks</div></div>
        <div class="metric-card" title="Sum of every agent run. A parent stays open while its subagents work, so nested and parallel time is counted more than once — over 100% of wall clock means agents overlapped.">
          <div class="metric-value">${fmt(t.agentMs)}</div>
          <div class="metric-label">Agent time <span class="metric-hint">sum of runs</span></div>
          <div class="metric-sub">${sec(t.agentMs)} · ${fmt(t.selfMs)} excl. subagents</div>
        </div>
        <div class="metric-card"><div class="metric-value">${fmt(t.idle)}</div><div class="metric-label">Idle</div><div class="metric-sub">${sec(t.idle)}</div></div>
        <div class="metric-card"><div class="metric-value">${fmt(t.issue)}</div><div class="metric-label">Issue time</div><div class="metric-sub">${t.issues || 0} issues</div></div>
        <div class="metric-card"><div class="metric-value">${fmt(t.github)}</div><div class="metric-label">GitHub time</div><div class="metric-sub">${sec(t.github)}</div></div>
        ${this.usageCard(s)}
      </div>
      ${this.renderBars(m)}
      ${this.renderWaterfall(m)}
      ${this.renderGaps(m)}
    `;
  }

  // §6.3 — clickable bar rows. Above the agent level a click drills one level
  // deeper; at the agent level there is nowhere left to drill, so a click only
  // moves the focus of the waterfall and the run log list below it.
  renderBars(m) {
    if (!m.repos?.length) return '<div class="empty">No data</div>';
    const s = window.LogApp.state;
    let items = [];
    if (s.drill.task) {
      const r = m.repos.find((x) => x.name === s.drill.repo);
      const b = r?.branches.find((x) => x.name === s.drill.branch);
      const t = b?.tasks.find((x) => x.title === s.drill.task);
      // at task level, bars are per-agent runs (agent level)
      items = t ? t.runs.map((run) => ({
        label: run.agent || run.path,
        depth: run.depth, // subagents are indented rather than drilled into
        ms: { activity: run.by.activity, issue: run.by.issue, decision: run.by.decision, github: run.by.github, idle: 0, wall: run.ms },
        // Time the agent spent outside its subagents' runs
        self: run.childMs ? run.selfMs : null,
        run: { path: run.path, from: run.from },
        // an agent's bar is made of its individual log entries
        parts: run.segments.filter((sg) => sg.ms > 0).map((sg) => ({ label: sg.log.log_title || sg.log.log_type, ms: only(sg.cat, sg.ms) })),
      })) : [];
    } else if (s.drill.branch) {
      items = m.repos.find((x) => x.name === s.drill.repo)?.branches.find((x) => x.name === s.drill.branch)?.tasks.map((t) => ({
        label: t.title,
        ms: t.ms,
        drill: { repo: s.drill.repo, branch: s.drill.branch, task: t.title },
        scope: { repo: s.drill.repo, branch: s.drill.branch, task: t.title },
        parts: t.runs.map((run) => ({
          label: run.agent || run.path,
          ms: { activity: run.by.activity, issue: run.by.issue, decision: run.by.decision, github: run.by.github, idle: 0 },
        })),
      })) || [];
    } else if (s.drill.repo) {
      items = m.repos.find((x) => x.name === s.drill.repo)?.branches.map((b) => ({
        label: b.name,
        ms: b.ms,
        drill: { repo: s.drill.repo, branch: b.name },
        scope: { repo: s.drill.repo, branch: b.name },
        parts: b.tasks.map((t) => ({ label: t.title, ms: t.ms })),
      })) || [];
    } else {
      items = m.repos.map((r) => ({
        label: r.name, ms: r.ms, drill: { repo: r.name }, scope: { repo: r.name },
        parts: r.branches.map((b) => ({ label: b.name, ms: b.ms })),
      }));
    }
    const max = Math.max(1, ...items.map((x) => x.ms.wall || 0));
    const sel = s.selectedRun || {};
    // At task level these rows ARE the waterfall's rows - the same runs, in the
    // same order - so the two panels share one grid template and their columns
    // line up. The header makes that readable instead of implied.
    const task = s.drill.task ? (m.tasks || []).find((t) => t.title === s.drill.task &&
      t.repo === s.drill.repo && t.branch === s.drill.branch) : null;
    const perRun = task ? this.usageByRun(task) : null;
    const head = `
      <div class="bars-axis">
        <span>${s.drill.task ? 'Agent' : s.drill.branch ? 'Task' : s.drill.repo ? 'Branch' : 'Repository'}</span>
        <span></span>
        <span class="bars-axis-end">Time</span>
        <span class="bars-axis-end" title="Excluding its subagents' runs">Own</span>
        <span class="bars-axis-end">Tokens</span>
        <span class="bars-axis-end">Cost</span>
      </div>`;
    // Hoisted out of the template so the rows each bar claimed can be counted
    // against the scope total below.
    const perItem = items.map((x) => (x.run && perRun)
      ? (perRun.get(x.run.path + '|' + x.run.from) || [])
      : this.usageForItem(x, m));

    const body = items.map((x, i) => {
      const active = x.run && sel.path === x.run.path && sel.from === x.run.from;
      const attrs = x.run
        ? `data-run-path="${esc(x.run.path)}" data-run-from="${esc(String(x.run.from))}"`
        : `data-drill='${esc(JSON.stringify(x.drill))}'`;
      const indent = x.depth ? `<span class="bar-indent">${'└'.padStart(x.depth * 2, ' ')}</span>` : '';
      return `
      <div class="bar-row bar-clickable${active ? ' bar-row-active' : ''}" ${attrs}>
        <div class="bar-label" style="padding-left:${(x.depth || 0) * 14}px" title="${esc(x.run ? x.run.path : x.label)}">${indent}${esc(x.label)}</div>
        <div class="bar-cell">${this.partedBar(x, max)}</div>
        <div class="bar-val">${fmt(x.ms.wall)}</div>
        <div class="bar-val bar-own">${x.self != null ? fmt(x.self) : '<span class="na">—</span>'}</div>
        ${this.usageCells(perItem[i])}
      </div>`;
    }).join('');

    return `${head}<div class="bars">${body}${this.outsideRow(s, perItem)}</div>`;
  }

  // What the bars above do NOT account for: requests in scope that fell outside
  // every task span they cover.
  //
  // This row is the reason bounding the bars to their spans does not lose
  // anything. Before, a repository's total silently swallowed this; now it is
  // named, and it turns out to be the more interesting figure — 9 minutes of
  // logged work beside 7.43B unaccounted tokens is not a rounding error in the
  // attribution, it is a statement about how little of the work was logged.
  //
  // Omitted at the agent level: there, the bars are the runs of one task and
  // `outside` would mean "inside the task but between its runs", which is a
  // different question this row would be mistaken for an answer to.
  outsideRow(s, perItem) {
    if (s.drill.task) return '';
    const scope = s.usageInScope || [];
    if (!scope.length) return '';
    const claimed = new Set();
    perItem.forEach((rs) => rs.forEach((u) => claimed.add(u.request_id)));
    const outside = scope.filter((u) => !claimed.has(u.request_id));
    if (!outside.length) return '';
    return `
      <div class="bar-row bar-row-outside" title="Requests inside the current scope that fall outside every task span shown above — work the activity log never covered.">
        <div class="bar-label"><span class="na">outside logged tasks</span></div>
        <div class="bar-cell"></div>
        <div class="bar-val"><span class="na">—</span></div>
        <div class="bar-val bar-own"><span class="na">—</span></div>
        ${this.usageCells(outside)}
      </div>`;
  }

  // A stacked bar whose colour blocks are subdivided by whatever makes them up
  // — branches of a repo, tasks of a branch, agents of a task, log entries of
  // an agent — with a hairline between neighbours. Category order is unchanged,
  // so the bar still reads as activity / issue / decision / github / idle; the
  // hairlines only reveal that a block is several things, not one.
  partedBar(item, max) {
    const parts = item.parts || [];
    if (!parts.length) return bar(item.ms, max);
    const w = (v) => Math.max(0, Math.min(100, (v / max) * 100)).toFixed(3);
    const segs = [];
    CATS.forEach((cat) => {
      const total = item.ms[cat] || 0;
      if (total <= 0) return;
      const sum = parts.reduce((n, p) => n + (p.ms[cat] || 0), 0);
      // Idle belongs to the task as a whole — no child owns it — so it stays one block
      if (sum <= 0) {
        segs.push(`<div class="bar-seg bar-part ${cat}" style="width:${w(total)}%" title="${esc(cat)} ${esc(fmt(total))}"></div>`);
        return;
      }
      // A parent's category total is an apportioned figure (see time-model.js)
      // while children carry raw sums, and nested agents are counted twice in
      // those sums. Scale the children onto the parent's total so subdividing a
      // bar never changes its length.
      const k = total / sum;
      parts.forEach((p) => {
        const v = (p.ms[cat] || 0) * k;
        if (v <= 0) return;
        segs.push(`<div class="bar-seg bar-part ${cat}" style="width:${w(v)}%" title="${esc(p.label)} · ${esc(cat)} ${esc(fmt(v))}"></div>`);
      });
    });
    return `<div class="bar-track">${segs.join('')}</div>`;
  }

  // §6.1 — waterfall at task level
  renderWaterfall(m) {
    const s = window.LogApp.state;
    if (!s.drill.task) return '';
    const r = m.repos.find((x) => x.name === s.drill.repo);
    const b = r?.branches.find((x) => x.name === s.drill.branch);
    const task = b?.tasks.find((x) => x.title === s.drill.task);
    if (!task || !task.runs?.length) return '';
    const span = task.span;
    const total = Math.max(1, span.to - span.from);
    const pct = (v) => Math.max(0, Math.min(100, (v / total) * 100)).toFixed(2);
    const axis = [0, 1, 2, 3, 4].map((i) => {
      const d = new Date(span.from + total * i / 4);
      return d.toISOString().slice(11, 16);
    });
    const sel = s.selectedRun || {};
    const perRun = this.usageByRun(task);
    // The log open in the detail panel, and its trace. Highlighting both makes
    // the Prev/Next-in-trace buttons legible on the waterfall: the whole trace
    // stays lit and the current step is outlined as it moves.
    const selLog = s.selectedLog;
    const traceId = selLog?.trace_id || '';
    const rows = task.runs.map((run) => {
      const indent = run.depth ? '└' + ' '.repeat(run.depth * 2 - 1) : '·';
      const left = pct(run.from - span.from);
      const width = pct(run.to - run.from);
      // One segment is exactly one log: it spans from that log to the next one
      // in the same run. Clicking it opens that log on the right.
      const segs = run.segments.map((sg) => {
        const sl = pct(sg.from - run.from);
        const inTrace = traceId && sg.log.trace_id === traceId;
        const current = selLog && sg.log.id === selLog.id;
        const cls = `wf-seg ${sg.cat}${sg.point ? ' wf-point' : ''}${inTrace ? ' in-trace' : ''}${current ? ' current' : ''}`;
        // A point (an `end` log, or logs sharing a timestamp) has no width of
        // its own, so it is drawn as a tick — otherwise it would be invisible
        // and unselectable, which is why `end` entries never lit up. The bar
        // clips its children, so a tick sitting on the closing edge is pinned
        // with `right` instead of `left`.
        const style = !sg.point ? `left:${sl}%;width:${pct(sg.ms)}%`
          : (parseFloat(sl) > 99 ? 'right:0' : `left:${sl}%`);
        return `<div class="${cls}" style="${style}" data-seg-id="${sg.log.id}"
                     title="${esc(sg.log.log_type)} · ${esc(sg.log.log_title || '')}${sg.point ? '' : ` — ${esc(fmt(sg.ms))}`}"></div>`;
      }).join('');
      const active = sel.path === run.path && sel.from === run.from;
      const hasSel = selLog && run.events.some((e) => e.id === selLog.id);
      return `
        <div class="wf-row${active ? ' wf-row-active' : ''}${hasSel ? ' wf-row-current' : ''}" data-run-id="${esc(String(run.from))}" data-run-path="${esc(run.path)}">
          <div class="wf-agent">
            <span class="wf-indent">${esc(indent)}</span>
            <span class="wf-name">${esc(run.agent || run.path)}</span>
            ${run.status ? statusBadge(run.status) : ''}
            <span class="wf-count">${run.events.length} logs</span>
          </div>
          <div class="wf-track">
            <div class="wf-bar" style="left:${left}%;width:${width}%">${segs}</div>
          </div>
          <div class="wf-span">${fmt(run.ms)}</div>
          <div class="wf-span wf-self">${run.childMs ? fmt(run.selfMs) : '—'}</div>
          ${this.wfUsageCells(perRun.get(run.path + '|' + run.from))}
        </div>`;
    }).join('');
    // IDLE row showing gaps
    const gapsHtml = task.gaps.map((g) => {
      const left = pct(g.from - span.from);
      const width = pct(g.ms);
      return `<div class="wf-gap" style="left:${left}%;width:${width}%"></div>`;
    }).join('');
    const idleRow = `
      <div class="wf-row wf-idle">
        <div class="wf-agent"><span class="wf-name">IDLE</span></div>
        <div class="wf-track">${gapsHtml}</div>
        <div class="wf-span">${fmt(task.ms.idle)}</div>
        <div class="wf-span wf-self">—</div>
        <div class="wf-span na">—</div>
        <div class="wf-span na">—</div>
      </div>`;
    return `
      <div class="waterfall${selLog ? ' wf-focus' : ''}">
        <div class="wf-head">
          <h4>Waterfall — ${esc(task.title)}</h4>
          <span class="wf-sub">trace ${esc(task.trace || 'none')} · indentation is agent_path · horizontal position is wall-clock · one segment is one log</span>
        </div>
        <div class="wf-legend">
          <span><span class="wf-dot activity"></span>Activity</span>
          <span><span class="wf-dot issue"></span>Issue</span>
          <span><span class="wf-dot decision"></span>Decision</span>
          <span><span class="wf-dot github"></span>GitHub</span>
          <span><span class="wf-dot idle"></span>Idle</span>
          ${selLog ? `<span class="wf-legend-focus">lit = trace ${esc(selLog.trace_id || 'none')} · outlined = open entry</span>` : ''}
        </div>
        <div class="wf-axis">
          <span>Agent</span>
          <span class="wf-axis-ticks">${axis.map((a) => `<span>${a}</span>`).join('')}</span>
          <span class="wf-axis-end">Span</span>
          <span class="wf-axis-end" title="Span minus the runs of its subagents">Own</span>
          <span class="wf-axis-end" title="This agent's own requests inside this run - not its subagents'">Tokens</span>
          <span class="wf-axis-end" title="Modelled at API list prices, not billed">Cost</span>
        </div>
        ${rows}
        ${idleRow}
        ${this.renderRunLogs(task)}
      </div>`;
  }

  // The logs behind one run. A waterfall segment is a single log (it runs from
  // that log to the next one), so the useful breakdown is the whole run: click
  // a row to list every log in it, with the stretch each one accounts for.
  renderRunLogs(task) {
    const sel = window.LogApp.state.selectedRun;
    if (!sel) return '';
    const run = task.runs.find((r) => r.path === sel.path && r.from === sel.from);
    if (!run) return '';
    const selId = window.LogApp.state.selectedLog?.id;
    const rows = run.segments.map((sg) => `
      <tr class="run-log-row${selId === sg.log.id ? ' current' : ''}" data-log-id="${sg.log.id}">
        <td class="mono">${esc(fmtTs(sg.log.timestamp))}</td>
        <td><span class="wf-dot ${sg.cat}"></span>${esc(sg.log.log_type)}</td>
        <td class="run-log-title">${esc(sg.log.log_title || '')}</td>
        <td>${esc(sg.log.log_level || '')}</td>
        <td class="run-log-ms">${sg.point ? '—' : fmt(sg.ms)}</td>
      </tr>`).join('');
    return `
      <div class="run-logs">
        <div class="run-logs-head">
          <h4>Logs in this run — ${esc(run.agent || run.path)}</h4>
          <span class="run-logs-sub">${run.events.length} logs · ${fmt(run.ms)} span${run.childMs ? ` · ${fmt(run.selfMs)} excluding subagents` : ''}</span>
          <button class="small" data-run-close="1">Close</button>
        </div>
        <table class="gaps-table">
          <thead><tr><th>Time</th><th>Type</th><th>Entry</th><th>Level</th><th>Accounts for</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="5">No logs</td></tr>'}</tbody>
        </table>
      </div>`;
  }

  // §6.2 — longest idle gaps table
  renderGaps(m) {
    const gaps = m.gaps || [];
    if (!gaps.length) return '';
    const rows = gaps.slice(0, 20).map((g) => `
      <tr class="gap-row" data-drill='${esc(JSON.stringify({ repo: g.repo, branch: g.branch, task: g.task }))}'>
        <td>${esc(g.repo)}</td>
        <td>${esc(g.branch)}</td>
        <td>${esc(g.task)}</td>
        <td>${fmtTs(new Date(g.from).toISOString().replace('T', ' '))}</td>
        <td>${fmtTs(new Date(g.to).toISOString().replace('T', ' '))}</td>
        <td>${fmt(g.ms)}</td>
      </tr>`).join('');
    return `
      <div class="gaps-section">
        <h4>Longest idle gaps in view</h4>
        <table class="gaps-table">
          <thead><tr><th>Repo</th><th>Branch</th><th>Task</th><th>From</th><th>To</th><th>Idle</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  attach() {
    // §6.3 — bar rows above the agent level drill one level deeper
    this.querySelectorAll('.bar-clickable[data-drill]').forEach((el) => {
      el.onclick = () => {
        let drill;
        try { drill = JSON.parse(el.getAttribute('data-drill')); } catch { return; }
        window.LogApp.setDrill(drill);
      };
    });
    // Agent-level bars are the bottom of the hierarchy: clicking one focuses
    // that run in the waterfall and lists its logs, without narrowing scope.
    this.querySelectorAll('.bar-clickable[data-run-path]').forEach((el) => {
      el.onclick = () => {
        const s = window.LogApp.state;
        const path = el.getAttribute('data-run-path');
        const from = +el.getAttribute('data-run-from');
        const cur = s.selectedRun;
        s.selectedRun = (cur && cur.path === path && cur.from === from) ? null : { path, from };
        window.LogApp.render();
      };
    });
    // §6.1 — clicking a waterfall row opens the list of logs behind that run
    this.querySelectorAll('.wf-row[data-run-id]').forEach((el) => {
      el.onclick = (e) => {
        const s = window.LogApp.state;
        const from = +el.getAttribute('data-run-id');
        const path = el.getAttribute('data-run-path');
        // A segment is one log — clicking it opens that log directly
        const seg = e.target.closest('[data-seg-id]');
        if (seg) {
          const log = s.inScope.find((l) => l.id === +seg.getAttribute('data-seg-id'));
          s.selectedRun = { path, from };
          if (log) return window.LogApp.selectLog(log);
        }
        const cur = s.selectedRun;
        s.selectedRun = (cur && cur.path === path && cur.from === from) ? null : { path, from };
        window.LogApp.render();
      };
    });
    // Rows of the run log list open that entry in the detail panel
    this.querySelectorAll('.run-log-row').forEach((el) => {
      el.onclick = () => {
        const log = window.LogApp.state.inScope.find((l) => l.id === +el.getAttribute('data-log-id'));
        if (log) window.LogApp.selectLog(log);
      };
    });
    const runClose = this.querySelector('[data-run-close]');
    if (runClose) runClose.onclick = (e) => {
      e.stopPropagation();
      window.LogApp.state.selectedRun = null;
      window.LogApp.render();
    };
    // §6.2 — clicking a gaps row drills to that task
    this.querySelectorAll('.gap-row').forEach((el) => {
      el.onclick = () => {
        let drill;
        try { drill = JSON.parse(el.getAttribute('data-drill')); } catch { return; }
        window.LogApp.setDrill(drill);
      };
    });
  }
}
customElements.define('log-timegoes', LogTimegoes);
})(window);
