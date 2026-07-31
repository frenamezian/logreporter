(function (window) {
'use strict';
const LogComponent = window.LogComponent;
const { esc, fmt, bar } = window.LRC;

class LogTimegoes extends LogComponent {
  render() {
    const s = window.LogApp.state;
    const m = s.model;
    const t = m.totals || {};
    return `
      <div class="page-title">Where time goes ${s.drill.repo ? '— ' + esc([s.drill.repo, s.drill.branch, s.drill.task].filter(Boolean).join(' / ')) : ''}</div>
      <div class="metrics-grid" style="grid-template-columns:repeat(5,1fr)">
        <div class="metric-card"><div class="metric-value">${fmt(t.wall)}</div><div class="metric-label">Wall clock</div></div>
        <div class="metric-card"><div class="metric-value">${fmt(t.agentMs)}</div><div class="metric-label">Agent time</div></div>
        <div class="metric-card"><div class="metric-value">${fmt(t.idle)}</div><div class="metric-label">Idle</div></div>
        <div class="metric-card"><div class="metric-value">${fmt(t.issue)}</div><div class="metric-label">Issue time</div></div>
        <div class="metric-card"><div class="metric-value">${fmt(t.github)}</div><div class="metric-label">GitHub time</div></div>
      </div>
      ${this.renderBars(m)}
    `;
  }
  renderBars(m) {
    if (!m.repos?.length) return '<div class="empty">No data</div>';
    const s = window.LogApp.state;
    let items = [];
    if (s.drill.task) {
      const r = m.repos.find((x) => x.name === s.drill.repo);
      const b = r?.branches.find((x) => x.name === s.drill.branch);
      const t = b?.tasks.find((x) => x.title === s.drill.task);
      items = t ? [{ label: t.title, ms: t.ms }] : [];
    } else if (s.drill.branch) {
      items = m.repos.find((x) => x.name === s.drill.repo)?.branches.find((x) => x.name === s.drill.branch)?.tasks.map((t) => ({ label: t.title, ms: t.ms })) || [];
    } else if (s.drill.repo) {
      items = m.repos.find((x) => x.name === s.drill.repo)?.branches.map((b) => ({ label: b.name, ms: b.ms })) || [];
    } else {
      items = m.repos.map((r) => ({ label: r.name, ms: r.ms }));
    }
    const max = Math.max(1, ...items.map((x) => x.ms.wall || 0));
    return `<div class="bars">${items.map((x) => `
      <div class="bar-row">
        <div class="bar-label">${esc(x.label)}</div>
        <div style="flex:1">${bar(x.ms, max)}</div>
        <div class="bar-val">${fmt(x.ms.wall)}</div>
      </div>
    `).join('')}</div>`;
  }
}
customElements.define('log-timegoes', LogTimegoes);
})(window);
