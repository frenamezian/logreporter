(function (window) {
'use strict';
const LogComponent = window.LogComponent;
const { esc, fmt, fmtTs, typeDot } = window.LRC;

const LIMIT = 500;
const SNIPPET_LEN = 80;

const LEGEND = [
  { type: 'activity', label: 'Activity' },
  { type: 'issue', label: 'Issue' },
  { type: 'decision', label: 'Decision' },
  { type: 'github', label: 'GitHub' },
  { type: 'start', label: 'Start/end' },
  { type: 'idle', label: 'Idle' },
];

class LogTimeline extends LogComponent {
  render() {
    const s = window.LogApp.state;
    if (!s.inScope.length) return '<div class="empty">No data in scope</div>';
    const model = s.model;
    let rows = window.LogApp.stream ? window.LogApp.stream(s.inScope, model) : [];
    if (!rows.length) return '<div class="empty">No data</div>';

    // §5.1 — stream() returns ascending; reverse the whole output for newest
    // so day headers and idle gaps stay correctly positioned relative to entries.
    const order = s.order || 'newest';
    if (order === 'newest') rows = rows.slice().reverse();

    // §5.2 — 500-row cap + truncation note
    const total = rows.length;
    const truncated = total > LIMIT;
    const shown = truncated ? rows.slice(0, LIMIT) : rows;
    const note = truncated
      ? 'Showing ' + LIMIT + ' of ' + total + ' rows'
      : total + ' rows';

    // §5.4 — legend strip + entry count
    const entryCount = s.inScope.length;
    const legendHtml = '<div class="chrono-legend">' +
      LEGEND.map((g) =>
        '<span class="chrono-legend-item">' + typeDot(g.type) + esc(g.label) + '</span>'
      ).join('') +
      '<span class="chrono-legend-count">' + entryCount + ' entries</span>' +
      '</div>';

    // §5.1 — newest/oldest toggle buttons
    const toggleHtml = '<div class="chrono-toolbar">' +
      '<span class="chrono-note">' + esc(note) + '</span>' +
      '<span class="chrono-toggles">' +
        '<button class="small' + (order === 'newest' ? ' primary' : '') + '" data-order="newest">Newest first</button>' +
        '<button class="small' + (order === 'oldest' ? ' primary' : '') + '" data-order="oldest">Oldest first</button>' +
      '</span>' +
      '</div>';

    const body = shown.map((r) => this._row(r, s)).join('');
    return legendHtml + toggleHtml + '<div class="timeline">' + body + '</div>';
  }

  _row(r, s) {
    if (r.kind === 'day') {
      return '<div class="chrono-day">' + esc(r.day) + '</div>';
    }
    if (r.kind === 'gap') {
      // §5.3 — idle row names branch + task
      const g = r.gap;
      const where = esc(g.repo || '') + '/' + esc(g.branch || '');
      return '<div class="chrono-gap">Idle ' + fmt(g.ms) + ' · ' + where + ' · ' + esc(g.task || '') + '</div>';
    }
    // §5.3 — entry row: time, dot, type, title, agent, repo/branch, snippet
    const l = r.log;
    const snippet = (l.log_description || '').slice(0, SNIPPET_LEN);
    const where = esc(l.repo_name) + '/' + esc(l.branch_name);
    const selected = s.selectedLog && s.selectedLog.id === l.id ? ' selected' : '';
    return '<div class="log-row' + selected + '" data-id="' + l.id + '">' +
      '<div class="mono chrono-time">' + fmtTs(l.timestamp) + '</div>' +
      '<div class="chrono-type">' + typeDot(l.log_type) + esc(l.log_type) + '</div>' +
      '<div class="chrono-body">' +
        '<div class="chrono-title">' + esc(l.log_title) + '</div>' +
        '<div class="chrono-meta"><span class="mono">' + esc(l.agent_name) + '</span> · ' + where +
          (snippet ? ' · ' + esc(snippet) : '') + '</div>' +
      '</div>' +
    '</div>';
  }

  attach() {
    this.querySelectorAll('.log-row').forEach((el) => {
      el.onclick = () => {
        const id = +el.getAttribute('data-id');
        const log = window.LogApp.state.inScope.find((l) => l.id === id);
        if (log) window.LogApp.selectLog(log);
      };
    });
    this.querySelectorAll('button[data-order]').forEach((btn) => {
      btn.onclick = () => {
        const newOrder = btn.getAttribute('data-order');
        if (window.LogApp.state.order === newOrder) return;
        window.LogApp.state.order = newOrder;
        window.LogApp.render();
      };
    });
  }
}
customElements.define('log-timeline', LogTimeline);
})(window);
