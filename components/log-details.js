(function (window) {
'use strict';
const LogComponent = window.LogComponent;
const { esc } = window.LRC;

class LogDetails extends LogComponent {
  render() {
    const l = window.LogApp.state.selectedLog;
    if (!l) return '<div class="empty">Select a log to see details</div>';
    const rows = [
      ['Timestamp', l.timestamp], ['Repo', l.repo_name], ['Branch', l.branch_name], ['Trace', l.trace_id || '—'],
      ['Parent trace', l.parent_trace_id || '—'], ['Task', l.task_title || '—'], ['Agent', l.agent_name], ['Path', l.agent_path],
      ['Type', l.log_type], ['Title', l.log_title], ['Description', l.log_description], ['Level', l.log_level || '—'],
      ['Status', l.status || '—'], ['Priority', l.priority || '—'], ['User', l.user_id], ['Tags', l.tags || '—'],
      ['Error details', l.error_details], ['Resolved by', l.resolved_by || '—'], ['Resolution time', l.resolution_time || '—'],
      ['Performance', l.performance_metrics], ['Hash', l.input_output_hash || '—']
    ];
    return `
      <div class="detail">
        <h4>Record</h4>
        <dl>
          ${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${k === 'Description' || k === 'Error details' || k === 'Performance' ? (v ? `<pre>${esc(v)}</pre>` : '—') : esc(v ?? '—')}</dd>`).join('')}
        </dl>
      </div>
    `;
  }
}
customElements.define('log-details', LogDetails);
})(window);
