(function (window) {
'use strict';
const LogComponent = window.LogComponent;

class LogHelp extends LogComponent {
  render() {
    return `
      <div class="page-title">Help</div>
      <div style="max-width:780px;line-height:1.6">
        <p>LogReporter is a single static page that reads an agent activity log — a SQLite file, <code>activity_logs.db</code> — directly in your browser.</p>
        <ol>
          <li>Click the data-source button in the header and choose <strong>Open activity_logs.db</strong>.</li>
          <li>Use the left panel to filter and drill into repo → branch → task.</li>
          <li>Switch pages with the top tabs: Hierarchy, Chronology, Where time goes, Metrics, Maintenance.</li>
          <li>Click any log row to open details; use CSV/JSON to export the filtered view.</li>
        </ol>
        <h4>Log types</h4>
        <p><span class="type-dot start"></span>start · <span class="type-dot end"></span>end · <span class="type-dot activity"></span>activity · <span class="type-dot issue"></span>issue · <span class="type-dot decision"></span>decision · <span class="type-dot github"></span>github</p>
        <h4>Offline use</h4>
        <p>To run without a network, vendor <code>sql-wasm.js</code> and <code>sql-wasm.wasm</code> from sql.js in a <code>lib/</code> folder and point the loader in <code>db.js</code> at them.</p>
      </div>
    `;
  }
}
customElements.define('log-help', LogHelp);
})(window);
