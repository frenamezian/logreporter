(function (window) {
'use strict';

const typeDot = (t) => `<span class="type-dot ${t}"></span>`;
const esc = (s) => window.LogApp?.escapeHtml(s) ?? String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (ms) => window.LogApp?.fmt(ms) ?? '—';
const fmtTs = (ts) => ts?.slice(11, 16) ?? '—';
const fmtDay = (ts) => ts?.slice(0, 10) ?? '—';

function bar(ms, max = ms.wall || 1) {
  if (!ms || !max) return '<div class="bar-track" style="opacity:.4"></div>';
  const pct = (v) => Math.max(0, Math.min(100, (v / max) * 100)).toFixed(1);
  return `<div class="bar-track">
    <div class="bar-seg activity" style="width:${pct(ms.activity)}%"></div>
    <div class="bar-seg issue" style="width:${pct(ms.issue)}%"></div>
    <div class="bar-seg decision" style="width:${pct(ms.decision)}%"></div>
    <div class="bar-seg github" style="width:${pct(ms.github)}%"></div>
    <div class="bar-seg idle" style="width:${pct(ms.idle)}%"></div>
  </div>`;
}

function statusBadge(st) {
  const color = st === 'completed' ? 'var(--activity)' : st === 'failed' ? 'var(--issue)' : 'var(--text-dim)';
  return `<span class="tag" style="color:${color}; border:1px solid ${color}">${esc(st)}</span>`;
}

class LogComponent extends HTMLElement {
  connectedCallback() {
    this._on = () => this.refresh();
    window.addEventListener('logapp:update', this._on);
    this.refresh();
  }
  disconnectedCallback() {
    window.removeEventListener('logapp:update', this._on);
  }
  refresh() {
    this.innerHTML = this.render();
    this.attach();
  }
  render() { return ''; }
  attach() {}
}

window.LogComponent = LogComponent;
window.LRC = { typeDot, esc, fmt, fmtTs, fmtDay, bar, statusBadge };
})(window);
