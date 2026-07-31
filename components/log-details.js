(function (window) {
'use strict';
const LogComponent = window.LogComponent;
const { esc, typeDot, fmtTs, fmt } = window.LRC;

class LogDetails extends LogComponent {
  render() {
    const l = window.LogApp.state.selectedLog;
    if (!l) return '<div class="empty">Select a log to see details</div>';

    // §9.3 — trace siblings (same trace_id, sorted by timestamp)
    const trace = (l.trace_id && window.LogApp.state.inScope.filter((x) => x.trace_id && x.trace_id === l.trace_id)) || [];
    trace.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
    const idx = trace.findIndex((x) => x.id === l.id);
    const hasPrev = idx > 0;
    const hasNext = idx >= 0 && idx < trace.length - 1;

    // §9.4 — tags parsed from comma/space separated string
    const tags = (l.tags || '').split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);

    // §9.6 — agent path chain split on /
    const pathParts = (l.agent_path || '').split('/').filter((p) => p !== '');

    // §9.7 — trace timeline offsets from first entry
    const firstTs = trace.length ? trace[0].timestamp : null;
    const timeline = trace.map((e) => ({
      e,
      current: e.id === l.id,
      offset: firstTs ? this._offset(firstTs, e.timestamp) : '0s',
    }));

    // record grid (error_details pulled out into its own block per §9.5)
    const rows = [
      ['Timestamp', l.timestamp], ['Repo', l.repo_name], ['Branch', l.branch_name], ['Trace', l.trace_id || '—'],
      ['Parent trace', l.parent_trace_id || '—'], ['Task', l.task_title || '—'], ['Agent', l.agent_name], ['Type', l.log_type],
      ['Title', l.log_title], ['Description', l.log_description], ['Level', l.log_level || '—'],
      ['Status', l.status || '—'], ['Priority', l.priority || '—'], ['User', l.user_id],
      ['Resolved by', l.resolved_by || '—'], ['Resolution time', l.resolution_time || '—'],
      ['Performance', l.performance_metrics], ['Hash', l.input_output_hash || '—']
    ];

    return `
      <div class="detail">
        <div class="detail-header">
          <div class="detail-header-text">
            <span class="type-badge type-${esc(l.log_type)}">${typeDot(l.log_type)}${esc(l.log_type)}</span>
            <h4 class="detail-title">${esc(l.log_title)}</h4>
          </div>
        </div>
        <div class="detail-body">
          <div class="trace-nav">
            <button class="trace-nav-btn" data-act="prev" ${hasPrev ? '' : 'disabled'}>‹ Prev in trace</button>
            <button class="trace-nav-btn" data-act="next" ${hasNext ? '' : 'disabled'}>Next in trace ›</button>
          </div>
          ${l.log_description ? `<p class="detail-desc">${esc(l.log_description)}</p>` : ''}
          ${tags.length ? `<div class="tag-row">${tags.map((t) => `<span class="tag tag-accent">${esc(t)}</span>`).join('')}</div>` : ''}
          ${l.error_details ? `
            <div class="error-block">
              <div class="detail-section-label">Error details</div>
              <pre class="error-pre">${esc(l.error_details)}</pre>
            </div>` : ''}
          ${pathParts.length ? `
            <div class="agent-path">
              <div class="detail-section-label">Agent path</div>
              <div class="agent-path-chain">
                ${pathParts.map((p, i) => `<div class="agent-path-item" style="padding-left:${i * 14}px">${esc(p)}</div>`).join('')}
              </div>
            </div>` : ''}
          <div class="detail-record">
            <div class="detail-section-label">Record</div>
            <dl>
              ${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${k === 'Description' || k === 'Performance' ? (v ? `<pre>${esc(v)}</pre>` : '—') : esc(v ?? '—')}</dd>`).join('')}
            </dl>
          </div>
          ${trace.length ? `
            <div class="trace-timeline">
              <div class="detail-section-label">Trace timeline · ${esc(l.trace_id)}</div>
              <div class="trace-timeline-list">
                ${timeline.map(({ e, current, offset }) => `
                  <button class="trace-tl-row${current ? ' current' : ''}" data-id="${e.id}">
                    <span class="trace-tl-dot${current ? ' current' : ''}"></span>
                    <span class="trace-tl-offset">${esc(offset)}</span>
                    <span class="trace-tl-title">${esc(e.log_title)}</span>
                  </button>`).join('')}
              </div>
            </div>` : ''}
        </div>
      </div>
    `;
  }

  _offset(firstTs, ts) {
    const a = new Date(firstTs).getTime();
    const b = new Date(ts).getTime();
    if (isNaN(a) || isNaN(b)) return '—';
    const diff = b - a;
    if (diff < 1000) return diff + 'ms';
    if (diff < 60000) return (diff / 1000).toFixed(1) + 's';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
    return Math.floor(diff / 3600000) + 'h';
  }

  attach() {
    const l = window.LogApp.state.selectedLog;
    if (!l) return;
    const trace = (l.trace_id && window.LogApp.state.inScope.filter((x) => x.trace_id && x.trace_id === l.trace_id)) || [];
    trace.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
    const idx = trace.findIndex((x) => x.id === l.id);

    this.querySelectorAll('.trace-nav-btn').forEach((btn) => {
      btn.onclick = () => {
        if (btn.disabled) return;
        const act = btn.getAttribute('data-act');
        const ni = act === 'prev' ? idx - 1 : idx + 1;
        if (trace[ni]) window.LogApp.selectLog(trace[ni]);
      };
    });

    this.querySelectorAll('.trace-tl-row').forEach((el) => {
      el.onclick = () => {
        const id = +el.getAttribute('data-id');
        const entry = trace.find((x) => x.id === id);
        if (entry) window.LogApp.selectLog(entry);
      };
    });
  }
}
customElements.define('log-details', LogDetails);
})(window);
