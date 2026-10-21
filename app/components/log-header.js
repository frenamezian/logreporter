(function (window) {
'use strict';
const LogComponent = window.LogComponent;
const { esc, fmtDayMon, fmtStamp } = window.LRC;

// The brand mark: an L whose foot is a stacked category bar, in the fixed
// stacking order activity -> decision -> github -> idle. It is inlined rather
// than linked because an <img> gets its own document and cannot see the theme
// tokens, so a linked mark would need two files and a swap on every toggle.
// Decorative — the title beside it already reads "LogReporter" — hence
// aria-hidden.
//
// The stem is --brand (the landing's red), in both themes — an owner
// decision from Task 0010 that superseded this mark's original "no issue
// red" rule. The reservation still holds where it matters: red as an
// interaction or DATA color means an issue everywhere else in the app; the
// mark sits on the chrome bar, where it reads as identity, and it is the
// only place the brand red appears inside the app.
const BRAND_MARK = `
  <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <clipPath id="lr-ell-foot"><rect x="5" y="22.4" width="24" height="5.6"/></clipPath>
    <g clip-path="url(#lr-ell-foot)">
      <rect x="5" y="22.4" width="7" height="5.6" fill="var(--brand)"/>
      <rect x="12" y="22.4" width="6.5" height="5.6" fill="var(--activity)"/>
      <rect x="18.5" y="22.4" width="4.5" height="5.6" fill="var(--decision)"/>
      <rect x="23" y="22.4" width="3.5" height="5.6" fill="var(--github)"/>
      <rect x="26.5" y="22.4" width="2.5" height="5.6" fill="var(--hatch-strong)"/>
    </g>
    <rect x="5" y="4" width="5.6" height="24" fill="var(--brand)"/>
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

// Where the published website lives. Named absolutely because it is the one
// address that is true from everywhere — including a clone on a laptop, which
// has no path to it at all.
const SITE_URL = 'https://frenamezian.github.io/logreporter/';

// The brand always links home. Which home, and how, depends on where the app is
// running, and the two cases differ in more than their href.
//
// Published under /app/, the landing page is a sibling one level up. The link is
// relative and stays in the tab: it is navigation within one site, and a
// relative path is also what keeps a fork's demo pointing at the fork's own
// landing page instead of at this one. export_app.py injects window.LR_HOME.
//
// Locally there is nothing above the app — serve.py serves it at the root of its
// own clone — so home is the website, named absolutely. That leaves the
// application, so it opens in a new tab, where the dashboard and everything
// filtered or drilled into in it stay exactly as they were, and it says so
// rather than jumping silently: a title, and a mark beside the name.
//
// This adds no network call. A link is inert until someone clicks it — nothing
// is fetched, prefetched or resolved on load, and the app still reaches the
// network for nothing but sql.js.
function brandHtml() {
  const home = window.LR_HOME;
  const away = !home;
  const mark = away ? ' <span class="brand-ext" aria-hidden="true">↗</span>' : '';
  const inner = `${BRAND_MARK}<div class="brand-text"
      ><div class="title">LogReporter${mark}</div
      ><div class="subtitle">Local monitor</div></div>`;

  if (away) {
    return `<a class="brand" href="${SITE_URL}" target="_blank" rel="noopener"
               title="Open the LogReporter website — leaves the app, in a new tab">${inner}</a>`;
  }
  return `<a class="brand" href="${esc(home)}"
             title="Back to the LogReporter home page">${inner}</a>`;
}

class LogHeader extends LogComponent {
  render() {
    const s = window.LogApp.state;
    const tabs = ['hierarchy', 'chronology', 'timegoes', 'metrics', 'models', 'maintenance', 'help'];
    const dotClass = s.src.ok ? 'ok' : 'fail';
    return `
      ${brandHtml()}
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
        ${this._renderRefreshStats(s)}
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

  // --- refresh stats (§2.5) -------------------------------------------------
  //
  // What the database has picked up since the last explicit Refresh, at the
  // left end of the header's control cluster — beside the button whose result
  // it reports.

  // The moment the standing count is measured from, named as well as stamped.
  // "12 new since 15:04" is only meaningful if the reader knows what happened
  // at 15:04.
  _sinceText(st) {
    const s = window.LogApp.state;
    const at = (st && st.since) || s.refreshBaseAt;
    const label = (st && st.sinceLabel) || s.refreshBaseLabel;
    if (!at) return 'page load';
    return label + ', ' + at.toLocaleTimeString();
  }

  _renderRefreshStats(s) {
    const st = s.refreshStats;
    const n = st ? st.total : 0;
    const since = this._sinceText(st);
    const title = n
      ? `${n} new log${n === 1 ? '' : 's'} since ${since} — click for the breakdown`
      : `No new logs since ${since}`;
    return `
      <div class="refresh-stats">
        <button class="small refresh-stats-btn${n ? ' has-new' : ''}"
                data-refresh-stats="1" aria-expanded="${s.refreshOpen ? 'true' : 'false'}"
                title="${esc(title)}">
          <span class="refresh-stats-caret">${s.refreshOpen ? '▾' : '▸'}</span>Refresh stats${
            n ? `<span class="refresh-pill">${n}</span>` : ''}
        </button>
        ${s.refreshOpen ? this._renderRefreshPanel(s, st) : ''}
      </div>`;
  }

  _renderRefreshPanel(s, st) {
    const n = st ? st.total : 0;
    const since = this._sinceText(st);
    const hidden = window.LogApp.refreshHiddenCount();
    const removed = st ? st.removed : 0;
    const repos = st ? st.repos.length : 0;
    return `
      <div class="src-overlay" data-close-refresh="1"></div>
      <div class="refresh-panel">
        <div class="refresh-panel-head">
          <div class="src-dropdown-label">Refresh stats</div>
          <div class="refresh-panel-total">${n
            ? `${n} new log${n === 1 ? '' : 's'} since ${esc(since)}`
            : `No new logs since ${esc(since)}`}</div>
          ${n ? `<div class="src-dropdown-detail">${st.tasks} task${st.tasks === 1 ? '' : 's'}
                   in ${repos} ${repos === 1 ? 'repository' : 'repositories'}${
                   removed ? ` · ${removed} log${removed === 1 ? '' : 's'} removed` : ''}</div>`
              : removed ? `<div class="src-dropdown-detail">${removed} log${removed === 1 ? '' : 's'} removed</div>` : ''}
        </div>
        ${n ? `<div class="refresh-panel-body">${this._refreshTree(st)}</div>` : ''}
        <div class="refresh-panel-foot">
          ${hidden ? `<div class="refresh-panel-warn">${hidden} of these ${hidden === 1 ? 'is' : 'are'}
             hidden by the active filters — the count above is what the database
             gained, not what is on screen.</div>` : ''}
          <div class="src-dropdown-note">Auto-poll adds to this total; only Refresh resets it.</div>
        </div>
      </div>`;
  }

  // Flat rows rather than a collapsible tree: this lists only what arrived, so
  // it is short by construction, and a panel that opens on its own should not
  // then need to be opened again inside itself.
  _refreshTree(st) {
    return st.repos.map((r) => `
      <div class="refresh-row refresh-row-repo">
        <span class="refresh-name">${esc(r.name)}</span>
        <span class="refresh-n">${r.n}</span>
      </div>
      ${r.kids.map((b) => `
        <div class="refresh-row refresh-row-branch">
          <span class="refresh-name mono">${esc(b.name)}</span>
          <span class="refresh-n">${b.n}</span>
        </div>
        ${b.kids.map((t) => `
          <button class="refresh-row refresh-row-task"
                  data-refresh-drill='${esc(JSON.stringify({ repo: r.name, branch: b.name, task: t.name }))}'
                  title="${esc(t.name)} — last of the new logs ${esc(fmtStamp(t.last))}">
            <span class="refresh-date">${esc(fmtDayMon(t.last))}</span>
            <span class="refresh-name">${esc(t.name)}</span>
            ${t.issues ? `<span class="tag tag-issue">${t.issues}</span>` : ''}
            <span class="refresh-n">${t.n}</span>
          </button>`).join('')}`).join('')}`).join('');
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
    // Refresh stats panel (§2.5)
    const rstats = this.querySelector('[data-refresh-stats]');
    if (rstats) rstats.onclick = () => window.LogApp.toggleRefreshStats();
    const closeRstats = this.querySelector('[data-close-refresh]');
    if (closeRstats) closeRstats.onclick = () => window.LogApp.closeRefreshStats();
    // A task row drills the dashboard to it. The panel is closed on the state
    // directly rather than through closeRefreshStats(), so setDrill's re-render
    // is the only one — closing afterwards would render the header twice.
    this.querySelectorAll('[data-refresh-drill]').forEach((btn) => {
      btn.onclick = () => {
        window.LogApp.state.refreshOpen = false;
        window.LogApp.setDrill(JSON.parse(btn.getAttribute('data-refresh-drill')));
      };
    });
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
