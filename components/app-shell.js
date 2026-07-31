(function (window) {
'use strict';
const LogComponent = window.LogComponent;
const { esc } = window.LRC;

// Per-page title + one-line note (§1.4). help is handled by the layout swap.
const PAGE_META = {
  hierarchy:   { title: 'Hierarchy',     note: 'Repo → branch → task tree with stacked time bars.' },
  chronology:  { title: 'Chronology',    note: 'Every log entry in time order, with idle gaps.' },
  timegoes:    { title: 'Where time goes', note: 'How time splits across repos, branches, tasks.' },
  metrics:     { title: 'Metrics',       note: 'Counts, distributions, open issues, agent time.' },
  maintenance: { title: 'Maintenance',   note: 'Delete, export, and inspect stored volume.' }
};

class AppShell extends HTMLElement {
  connectedCallback() {
    this._on = () => this.setPage();
    window.addEventListener('logapp:update', this._on);
    this.setPage();
  }
  setPage() {
    const s = window.LogApp?.state;
    if (!s) return;
    if (s.page === 'help') this._renderHelp();
    else this._renderNormal();
  }
  _renderNormal() {
    const s = window.LogApp.state;
    this.innerHTML = `
      <log-header></log-header>
      <div class="layout">
        ${s.sidebar ? this._sidebarHTML() : this._railHTML()}
        <div class="content">
          ${this._breadcrumbHTML(s)}
          <div class="page-host" id="pages">
            <div data-page="hierarchy"><log-tree></log-tree></div>
            <div data-page="chronology" hidden><log-timeline></log-timeline></div>
            <div data-page="timegoes" hidden><log-timegoes></log-timegoes></div>
            <div data-page="metrics" hidden><log-metrics></log-metrics></div>
            <div data-page="maintenance" hidden><log-maintenance></log-maintenance></div>
          </div>
          ${s.selectedLog ? this._detailPanelHTML() : ''}
        </div>
      </div>
    `;
    const p = s.page || 'hierarchy';
    this.querySelectorAll('[data-page]').forEach((el) => { el.hidden = el.getAttribute('data-page') !== p; });
    this._wireShell();
  }
  _sidebarHTML() {
    return `
      <aside class="sidebar">
        <button class="sidebar-collapse" title="Collapse sidebar" data-collapse="1">«</button>
        <log-filters></log-filters>
      </aside>
    `;
  }
  _railHTML() {
    const s = window.LogApp.state;
    const n = this._activeFilterCount(s);
    return `
      <aside class="sidebar-rail">
        <button class="rail-filter" title="Open filters" data-open-filters="1">
          <span class="rail-filter-icon">⚙</span>
          ${n ? `<span class="rail-badge">${n}</span>` : ''}
        </button>
      </aside>
    `;
  }
  _activeFilterCount(s) {
    return Object.values(s.filter || {}).filter((v) => v && String(v).trim()).length;
  }
  _breadcrumbHTML(s) {
    const meta = PAGE_META[s.page] || { title: esc(s.page), note: '' };
    const d = s.drill || {};
    const crumbs = [`<button class="crumb" data-drill-clear="1">All repos</button>`];
    if (d.repo) crumbs.push(`<span class="crumb-sep">›</span><button class="crumb" data-drill='{"repo":${JSON.stringify(d.repo)}}'>${esc(d.repo)}</button>`);
    if (d.branch) crumbs.push(`<span class="crumb-sep">›</span><button class="crumb" data-drill='{"repo":${JSON.stringify(d.repo)},"branch":${JSON.stringify(d.branch)}}'>${esc(d.branch)}</button>`);
    if (d.task) crumbs.push(`<span class="crumb-sep">›</span><button class="crumb" data-drill='{"repo":${JSON.stringify(d.repo)},"branch":${JSON.stringify(d.branch)},"task":${JSON.stringify(d.task)}}'>${esc(d.task)}</button>`);
    return `
      <div class="breadcrumb-strip">
        <div class="breadcrumb-crumbs">${crumbs.join('')}</div>
        <div class="breadcrumb-title">${meta.title}</div>
        <div class="breadcrumb-note">${meta.note}</div>
      </div>
    `;
  }
  _detailPanelHTML() {
    return `
      <div class="right-panel">
        <button class="detail-close" title="Close" data-close-detail="1">✕</button>
        <log-details></log-details>
      </div>
    `;
  }
  _renderHelp() {
    // §1.5: help page replaces the whole layout. The help subagent (Phase 10)
    // will populate the nav + article; for now we scaffold the structure so
    // closeHelp() and the layout swap work.
    this.innerHTML = `
      <div class="help-layout">
        <aside class="help-nav" id="help-nav"><log-help></log-help></aside>
        <main class="help-article" id="help-article"></main>
      </div>
    `;
    this._wireShell();
  }
  _wireShell() {
    const collapse = this.querySelector('[data-collapse]');
    if (collapse) collapse.onclick = () => window.LogApp.toggleSidebar();
    const openFilters = this.querySelector('[data-open-filters]');
    if (openFilters) openFilters.onclick = () => window.LogApp.openFilters();
    const closeDetail = this.querySelector('[data-close-detail]');
    if (closeDetail) closeDetail.onclick = () => window.LogApp.closeDetail();
    this.querySelectorAll('[data-drill-clear]').forEach((b) => b.onclick = () => window.LogApp.clearDrill());
    this.querySelectorAll('.crumb[data-drill]').forEach((b) => b.onclick = () => {
      const d = JSON.parse(b.getAttribute('data-drill'));
      window.LogApp.setDrill(d);
    });
  }
}
customElements.define('app-shell', AppShell);
})(window);
