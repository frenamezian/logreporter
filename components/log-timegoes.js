(function (window) {
'use strict';
const LogComponent = window.LogComponent;
const { esc, fmt, bar, fmtTs, statusBadge } = window.LRC;

class LogTimegoes extends LogComponent {
  render() {
    const s = window.LogApp.state;
    const m = s.model;
    const t = m.totals || {};
    const pct = (v, base) => base ? Math.max(0, Math.min(100, (v / base) * 100)).toFixed(1) : '0.0';
    const wall = t.wall || 0;
    const sec = (v) => v ? pct(v, wall) + '% of wall' : '0% of wall';
    return `
      <div class="metrics-grid" style="grid-template-columns:repeat(5,1fr)">
        <div class="metric-card"><div class="metric-value">${fmt(t.wall)}</div><div class="metric-label">Wall clock</div><div class="metric-sub">${t.tasks || 0} tasks</div></div>
        <div class="metric-card"><div class="metric-value">${fmt(t.agentMs)}</div><div class="metric-label">Agent time</div><div class="metric-sub">${sec(t.agentMs)}</div></div>
        <div class="metric-card"><div class="metric-value">${fmt(t.idle)}</div><div class="metric-label">Idle</div><div class="metric-sub">${sec(t.idle)}</div></div>
        <div class="metric-card"><div class="metric-value">${fmt(t.issue)}</div><div class="metric-label">Issue time</div><div class="metric-sub">${t.issues || 0} issues</div></div>
        <div class="metric-card"><div class="metric-value">${fmt(t.github)}</div><div class="metric-label">GitHub time</div><div class="metric-sub">${sec(t.github)}</div></div>
      </div>
      ${this.renderBars(m)}
      ${this.renderWaterfall(m)}
      ${this.renderGaps(m)}
    `;
  }

  // §6.3 — clickable bar rows that drill one level deeper
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
        ms: { activity: run.by.activity, issue: run.by.issue, decision: run.by.decision, github: run.by.github, idle: 0, wall: run.ms },
        drill: { repo: s.drill.repo, branch: s.drill.branch, task: s.drill.task, agent: run.path },
      })) : [];
    } else if (s.drill.branch) {
      items = m.repos.find((x) => x.name === s.drill.repo)?.branches.find((x) => x.name === s.drill.branch)?.tasks.map((t) => ({
        label: t.title,
        ms: t.ms,
        drill: { repo: s.drill.repo, branch: s.drill.branch, task: t.title },
      })) || [];
    } else if (s.drill.repo) {
      items = m.repos.find((x) => x.name === s.drill.repo)?.branches.map((b) => ({
        label: b.name,
        ms: b.ms,
        drill: { repo: s.drill.repo, branch: b.name },
      })) || [];
    } else {
      items = m.repos.map((r) => ({ label: r.name, ms: r.ms, drill: { repo: r.name } }));
    }
    const max = Math.max(1, ...items.map((x) => x.ms.wall || 0));
    return `<div class="bars">${items.map((x) => `
      <div class="bar-row bar-clickable" data-drill='${esc(JSON.stringify(x.drill))}'>
        <div class="bar-label">${esc(x.label)}</div>
        <div style="flex:1">${bar(x.ms, max)}</div>
        <div class="bar-val">${fmt(x.ms.wall)}</div>
      </div>
    `).join('')}</div>`;
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
    const rows = task.runs.map((run) => {
      const indent = run.depth ? '└' + ' '.repeat(run.depth * 2 - 1) : '·';
      const left = pct(run.from - span.from);
      const width = pct(run.to - run.from);
      const segs = run.segments.map((sg) => {
        const sl = pct(sg.from - run.from);
        const sw = pct(sg.ms);
        return `<div class="wf-seg ${sg.cat}" style="left:${sl}%;width:${sw}%"></div>`;
      }).join('');
      return `
        <div class="wf-row" data-run-id="${esc(String(run.from))}">
          <div class="wf-agent">
            <span class="wf-indent">${esc(indent)}</span>
            <span class="wf-name">${esc(run.agent || run.path)}</span>
            ${run.status ? statusBadge(run.status) : ''}
          </div>
          <div class="wf-track">
            <div class="wf-bar" style="left:${left}%;width:${width}%">${segs}</div>
          </div>
          <div class="wf-span">${fmt(run.ms)}</div>
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
      </div>`;
    return `
      <div class="waterfall">
        <div class="wf-head">
          <h4>Waterfall — ${esc(task.title)}</h4>
          <span class="wf-sub">trace ${esc(task.trace || 'none')} · indentation is agent_path · horizontal position is wall-clock</span>
        </div>
        <div class="wf-legend">
          <span><span class="wf-dot activity"></span>Activity</span>
          <span><span class="wf-dot issue"></span>Issue</span>
          <span><span class="wf-dot decision"></span>Decision</span>
          <span><span class="wf-dot github"></span>GitHub</span>
          <span><span class="wf-dot idle"></span>Idle</span>
        </div>
        <div class="wf-axis">
          <span>Agent</span>
          <span class="wf-axis-ticks">${axis.map((a) => `<span>${a}</span>`).join('')}</span>
          <span class="wf-axis-end">Span</span>
        </div>
        ${rows}
        ${idleRow}
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
    // §6.3 — clickable bar rows drill one level deeper
    this.querySelectorAll('.bar-clickable').forEach((el) => {
      el.onclick = () => {
        let drill;
        try { drill = JSON.parse(el.getAttribute('data-drill')); } catch { return; }
        const s = window.LogApp.state;
        // at agent level (task drilled), toggle agent filter
        if (drill.agent) {
          const next = Object.assign({}, s.drill);
          if (next.agent === drill.agent) delete next.agent;
          else next.agent = drill.agent;
          window.LogApp.setDrill(next);
          return;
        }
        window.LogApp.setDrill(drill);
      };
    });
    // §6.1 — clicking a waterfall row selects that run's opening entry
    this.querySelectorAll('.wf-row[data-run-id]').forEach((el) => {
      el.onclick = () => {
        const fromTs = +el.getAttribute('data-run-id');
        const s = window.LogApp.state;
        const r = s.model.repos.find((x) => x.name === s.drill.repo);
        const b = r?.branches.find((x) => x.name === s.drill.branch);
        const task = b?.tasks.find((x) => x.title === s.drill.task);
        const run = task?.runs.find((rn) => rn.from === fromTs);
        if (run && run.events[0]) window.LogApp.selectLog(run.events[0]);
      };
    });
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
