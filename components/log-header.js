(function (window) {
'use strict';
const LogComponent = window.LogComponent;
const { esc } = window.LRC;

class LogHeader extends LogComponent {
  render() {
    const s = window.LogApp.state;
    const tabs = ['hierarchy', 'chronology', 'timegoes', 'metrics', 'maintenance', 'help'];
    return `
      <div class="brand"><div class="title">LogReporter</div><div class="subtitle">Local monitor</div></div>
      <nav class="nav-tabs">
        ${tabs.map((t) => {
          const active = s.page === t ? 'active' : '';
          const count = t === 'hierarchy' ? s.inScope.length : '';
          return `<button class="${active}" data-page="${t}">${esc(t)}${count ? `<span class="count">${count}</span>` : ''}</button>`;
        }).join('')}
      </nav>
      <div class="header-right">
        <span class="count-badge">${s.inScope.length} / ${s.rows.length} logs</span>
        <button class="small" data-csv="1">CSV</button>
        <button class="small" data-json="1">JSON</button>
        <button class="small primary" data-refresh="1">Refresh</button>
        <button class="src-button" data-open="1"><span class="src-dot ${s.src.ok ? 'ok' : s.src.demo ? 'demo' : 'fail'}"></span> ${esc(s.src.name)} <span>▾</span></button>
        <button class="small" title="Help" data-page="help">?</button>
      </div>
    `;
  }
  attach() {
    this.querySelectorAll('[data-page]').forEach((b) => b.onclick = () => window.LogApp.setPage(b.getAttribute('data-page')));
    this.querySelector('[data-csv]').onclick = () => window.LogApp.exportCsv();
    this.querySelector('[data-json]').onclick = () => window.LogApp.exportJson();
    this.querySelector('[data-refresh]').onclick = () => window.LogApp.refresh();
    this.querySelector('[data-open]').onclick = () => window.LogApp.openDb();
  }
}
customElements.define('log-header', LogHeader);
})(window);
