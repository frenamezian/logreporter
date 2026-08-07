(function (window) {
'use strict';

const typeDot = (t) => `<span class="type-dot ${t}"></span>`;
const esc = (s) => window.LogApp?.escapeHtml(s) ?? String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (ms) => window.LogApp?.fmt(ms) ?? '—';
const fmtTs = (ts) => ts?.slice(11, 16) ?? '—';
const fmtDay = (ts) => ts?.slice(0, 10) ?? '—';

// A task's last-log date as dd/mon, from an epoch in ms (task.span.to).
//
// UTC accessors and a fixed month table, both deliberately. Log timestamps are
// UTC — log_activity.py writes utc_now() — so getDate() would slide a 23:40 log
// into the next day for every reader east of Greenwich, and toLocaleDateString
// would render one database as 07/août on one machine and 07/aug on the next.
//
// The year is appended only when it is not the current one: "07/aug" for
// something from last August would read as this week.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Both callers' shapes: an epoch in ms (task.span.to) and the database's own
// 'YYYY-MM-DD HH:MM:SS'. The second is UTC but carries no marker saying so, and
// every engine reads an unmarked datetime as local — which is precisely the day
// shift the UTC accessors below exist to avoid, arriving one step earlier.
function toDate(t) {
  if (typeof t !== 'string') return new Date(t);
  const s = t.includes('T') ? t : t.replace(' ', 'T');
  return new Date(/([Zz]|[+-]\d{2}:?\d{2})$/.test(s) ? s : s + 'Z');
}

function fmtDayMon(t) {
  const d = toDate(t);
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getUTCDate()).padStart(2, '0');
  const y = d.getUTCFullYear();
  const cur = new Date().getUTCFullYear();
  return `${day}/${MONTHS[d.getUTCMonth()]}` + (y === cur ? '' : '/' + String(y).slice(2));
}

// The same instant in full, for the title attribute on a row whose visible date
// is deliberately abbreviated. UTC for the same reason as above, and it says so.
function fmtStamp(t) {
  const d = toDate(t);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

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
window.LRC = { typeDot, esc, fmt, fmtTs, fmtDay, fmtDayMon, fmtStamp, bar, statusBadge };
})(window);
