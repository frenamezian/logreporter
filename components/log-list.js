(function (window) {
'use strict';
const LogComponent = window.LogComponent;
const { esc, fmtTs, typeDot } = window.LRC;

class LogList extends LogComponent {
  render() {
    const s = window.LogApp.state;
    const rows = s.inScope.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    if (!rows.length) return '<div class="empty">No logs in scope</div>';
    return `
      <div class="list-head"><h4>Logs in view</h4><span class="hint">${rows.length}</span></div>
      <table class="log-table">
        <thead><tr><th>Time</th><th>Type</th><th>Title</th><th>Agent</th></tr></thead>
        <tbody>
          ${rows.map((l) => `
            <tr data-id="${l.id}" class="${s.selectedLog?.id === l.id ? 'selected' : ''}">
              <td class="mono">${fmtTs(l.timestamp)}</td>
              <td>${typeDot(l.log_type)}${esc(l.log_type)}</td>
              <td>${esc(l.log_title)}</td>
              <td class="mono">${esc(l.agent_name)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
  attach() {
    this.querySelectorAll('tr[data-id]').forEach((tr) => {
      tr.onclick = () => {
        const id = +tr.getAttribute('data-id');
        const log = window.LogApp.state.inScope.find((l) => l.id === id);
        if (log) window.LogApp.selectLog(log);
      };
    });
  }
}
customElements.define('log-list', LogList);
})(window);
