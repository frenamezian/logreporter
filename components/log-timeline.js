(function (window) {
'use strict';
const LogComponent = window.LogComponent;
const { esc, fmt, fmtTs, typeDot } = window.LRC;

class LogTimeline extends LogComponent {
  render() {
    const s = window.LogApp.state;
    if (!s.inScope.length) return '<div class="empty">No data in scope</div>';
    const model = s.model;
    const rows = window.LogApp.stream ? window.LogApp.stream(s.inScope, model) : [];
    if (!rows.length) return '<div class="empty">No data</div>';
    return `<div class="page-title">Chronology</div><div class="timeline">` + rows.map((r) => {
      if (r.kind === 'day') return `<div style="margin:18px 0 8px;font-size:12px;color:var(--text-dim);border-bottom:1px solid var(--border);padding-bottom:4px">${esc(r.day)}</div>`;
      if (r.kind === 'gap') return `<div style="margin:4px 0;padding:6px 10px;background:repeating-linear-gradient(135deg,rgba(255,255,255,0.05) 0 3px,transparent 3px 6px);border-radius:6px;font-size:12px;color:var(--text-dim)">Idle ${fmt(r.gap.ms)} · ${esc(r.gap.task)}</div>`;
      const l = r.log;
      return `<div class="log-row" data-id="${l.id}" style="display:flex;gap:12px;padding:6px 0;border-bottom:1px solid var(--border);cursor:pointer">
        <div class="mono" style="width:50px">${fmtTs(l.timestamp)}</div>
        <div style="width:80px">${typeDot(l.log_type)}${esc(l.log_type)}</div>
        <div style="flex:1"><div style="font-weight:500">${esc(l.log_title)}</div><div style="font-size:12px;color:var(--text-dim)">${esc(l.agent_name)} · ${esc(l.repo_name)}/${esc(l.branch_name)}</div></div>
      </div>`;
    }).join('') + `</div>`;
  }
  attach() {
    this.querySelectorAll('.log-row').forEach((el) => {
      el.onclick = () => {
        const id = +el.getAttribute('data-id');
        const log = window.LogApp.state.inScope.find((l) => l.id === id);
        if (log) window.LogApp.selectLog(log);
      };
    });
  }
}
customElements.define('log-timeline', LogTimeline);
})(window);
