(function (window) {
'use strict';
const LogComponent = window.LogComponent;
const { esc } = window.LRC;

// The brand mark: an L whose foot is a stacked category bar, in the fixed
// stacking order activity -> decision -> github -> idle. It is inlined rather
// than linked because an <img> gets its own document and cannot see the theme
// tokens, so a linked mark would need two files and a swap on every toggle.
// Decorative — the title beside it already reads "LogReporter" — hence
// aria-hidden, and no issue red: red means an issue everywhere else in the app.
const BRAND_MARK = `
  <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <clipPath id="lr-ell-foot"><rect x="5" y="22.4" width="24" height="5.6" rx="2.8"/></clipPath>
    <g clip-path="url(#lr-ell-foot)">
      <rect x="5" y="22.4" width="7" height="5.6" fill="var(--accent)"/>
      <rect x="12" y="22.4" width="6.5" height="5.6" fill="var(--activity)"/>
      <rect x="18.5" y="22.4" width="4.5" height="5.6" fill="var(--decision)"/>
      <rect x="23" y="22.4" width="3.5" height="5.6" fill="var(--github)"/>
      <rect x="26.5" y="22.4" width="2.5" height="5.6" fill="var(--hatch-strong)"/>
    </g>
    <rect x="5" y="4" width="5.6" height="24" rx="2.8" fill="var(--accent)"/>
  </svg>`;

// Page key -> human-readable nav tab label (§2.4)
const TAB_LABELS = {
  hierarchy: 'Hierarchy',
  chronology: 'Chronology',
  timegoes: 'Where time goes',
  metrics: 'Metrics',
  models: 'Models',
  maintenance: 'Maintenance',
  help: 'Help',
};

class LogHeader extends LogComponent {
  render() {
    const s = window.LogApp.state;
    const tabs = ['hierarchy', 'chronology', 'timegoes', 'metrics', 'models', 'maintenance', 'help'];
    const dotClass = s.src.ok ? 'ok' : s.src.demo ? 'demo' : 'fail';
    return `
      <div class="brand">${BRAND_MARK}<div class="brand-text"><div class="title">LogReporter</div><div class="subtitle">Local monitor</div></div></div>
      <nav class="nav-tabs">
        ${tabs.map((t) => {
          const active = s.page === t ? 'active' : '';
          const label = esc(TAB_LABELS[t] || t);
          // Only Hierarchy carries a count badge (§2.4)
          const count = t === 'hierarchy' ? s.inScope.length : '';
          return `<button class="${active}" data-page="${t}">${label}${count ? `<span class="count">${count}</span>` : ''}</button>`;
        }).join('')}
      </nav>
      <div class="header-right">
        <span class="count-badge">${s.inScope.length} / ${s.rows.length} logs</span>
        <button class="small" data-csv="1">CSV</button>
        <button class="small" data-json="1">JSON</button>
        <button class="small primary" data-refresh="1">Refresh</button>
        <button class="src-button" data-src="1"><span class="src-dot ${dotClass}"></span> ${esc(s.src.name)} <span>▾</span></button>
        ${this._renderThemeToggle(s)}
        <button class="small" title="Help — user and developer guide" data-page="help">?</button>
      </div>
      ${s.srcOpen ? this._renderDropdown(s) : ''}
    `;
  }

  // The glyph shows the theme you would GET, not the one you are in: a button
  // labelled with the current state reads as a status light, and gets clicked
  // by people who wanted the thing it was already showing.
  _renderThemeToggle(s) {
    const toLight = s.theme !== 'light';
    return `<button class="small theme-toggle" data-theme-toggle="1"
              aria-pressed="${!toLight}"
              title="Switch to ${toLight ? 'light' : 'dark'} mode">${toLight ? '☀' : '☾'}</button>`;
  }

  _renderDropdown(s) {
    const pollLabel = s.poll ? 'on' : 'off';
    return `
      <div class="src-overlay" data-close-src="1"></div>
      <div class="src-dropdown">
        <div class="src-dropdown-head">
          <div class="src-dropdown-label">Data source</div>
          <div class="src-dropdown-name">${esc(s.src.name)}</div>
          <div class="src-dropdown-detail">${esc(s.src.detail || '')}</div>
        </div>
        <button class="small primary src-dropdown-btn" data-open-db="1">Open activity_logs.db</button>
        <button class="small src-dropdown-btn" data-toggle-poll="1">Auto-poll ${esc(pollLabel)}</button>
        <button class="small src-dropdown-btn" data-save-db="1">Save database copy</button>
        <div class="src-dropdown-note">Runs entirely in the browser. sql.js reads the file in place; nothing is uploaded.</div>
      </div>
    `;
  }

  attach() {
    this.querySelectorAll('[data-page]').forEach((b) => b.onclick = () => window.LogApp.setPage(b.getAttribute('data-page')));
    const csv = this.querySelector('[data-csv]');
    if (csv) csv.onclick = () => window.LogApp.exportCsv();
    const json = this.querySelector('[data-json]');
    if (json) json.onclick = () => window.LogApp.exportJson();
    const refresh = this.querySelector('[data-refresh]');
    if (refresh) refresh.onclick = () => window.LogApp.refresh();
    // Source button toggles the dropdown panel (§2.1)
    const src = this.querySelector('[data-src]');
    if (src) src.onclick = () => window.LogApp.toggleSrc();
    const theme = this.querySelector('[data-theme-toggle]');
    if (theme) theme.onclick = () => window.LogApp.toggleTheme();
    // Dropdown actions
    const openDb = this.querySelector('[data-open-db]');
    if (openDb) openDb.onclick = () => window.LogApp.openDb();
    const togglePoll = this.querySelector('[data-toggle-poll]');
    if (togglePoll) togglePoll.onclick = () => window.LogApp.togglePoll();
    const saveDb = this.querySelector('[data-save-db]');
    if (saveDb) saveDb.onclick = () => window.LogApp.saveDb();
    // Click-outside overlay closes the dropdown (§2.1)
    const closeOverlay = this.querySelector('[data-close-src]');
    if (closeOverlay) closeOverlay.onclick = () => window.LogApp.closeSrc();
  }
}
customElements.define('log-header', LogHeader);
})(window);
