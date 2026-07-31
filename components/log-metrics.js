(function (window) {
'use strict';
const LogComponent = window.LogComponent;
const { esc, fmt, typeDot } = window.LRC;

class LogMetrics extends LogComponent {
  render() {
    const s = window.LogApp.state;
    const m = s.model;
    const t = m.totals || {};
    const typeCounts = {};
    s.inScope.forEach((l) => { typeCounts[l.log_type] = (typeCounts[l.log_type] || 0) + 1; });
    const typeBars = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
    const maxT = Math.max(1, ...typeBars.map((x) => x[1]));
    const openIssues = s.inScope.filter((l) => l.log_type === 'issue' && !l.resolved_by);
    const agentTime = {};
    s.inScope.forEach((l) => {
      const k = l.agent_path || l.agent_name;
      if (k) agentTime[k] = (agentTime[k] || 0) + 1;
    });
    const agentBars = Object.entries(agentTime).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxA = Math.max(1, ...agentBars.map((x) => x[1]));
    return `
      <div class="page-title">Metrics</div>
      <div class="metrics-grid">
        <div class="metric-card"><div class="metric-value">${t.open || 0}</div><div class="metric-label">Open</div></div>
        <div class="metric-card"><div class="metric-value">${t.done || 0}</div><div class="metric-label">Completed</div></div>
        <div class="metric-card"><div class="metric-value">${t.failed || 0}</div><div class="metric-label">Failed</div></div>
        <div class="metric-card"><div class="metric-value">${fmt(t.idle)}</div><div class="metric-label">Idle</div></div>
      </div>
      <h4 style="margin:14px 0 8px">Entries by log type</h4>
      ${typeBars.length ? typeBars.map(([type, n]) => `
        <div class="bar-row">
          <div class="bar-label">${typeDot(type)}${esc(type)}</div>
          <div style="flex:1"><div class="bar-track"><div class="bar-seg ${type}" style="width:${(n / maxT * 100).toFixed(1)}%"></div></div></div>
          <div class="bar-val">${n}</div>
        </div>
      `).join('') : '<div class="empty">No entries</div>'}
      <h4 style="margin:14px 0 8px">Open issues</h4>
      ${openIssues.length ? openIssues.map((l) => `<div class="bar-row" data-id="${l.id}" style="cursor:pointer"><div class="bar-label" style="color:var(--issue)">${esc(l.log_title)}</div><div class="bar-val">${esc(l.repo_name)}</div></div>`).join('') : '<div class="empty">No open issues</div>'}
      <h4 style="margin:14px 0 8px">Agent activity</h4>
      ${agentBars.map(([ag, n]) => `
        <div class="bar-row">
          <div class="bar-label" class="mono">${esc(ag)}</div>
          <div style="flex:1"><div class="bar-track"><div class="bar-seg activity" style="width:${(n / maxA * 100).toFixed(1)}%"></div></div></div>
          <div class="bar-val">${n}</div>
        </div>
      `).join('')}
    `;
  }
  attach() {
    this.querySelectorAll('.bar-row[data-id]').forEach((el) => {
      el.onclick = () => {
        const id = +el.getAttribute('data-id');
        const log = window.LogApp.state.inScope.find((l) => l.id === id);
        if (log) { window.LogApp.setPage('hierarchy'); window.LogApp.selectLog(log); }
      };
    });
  }
}
customElements.define('log-metrics', LogMetrics);
})(window);
