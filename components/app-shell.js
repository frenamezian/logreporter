(function (window) {
'use strict';
const LogComponent = window.LogComponent;
const { esc } = window.LRC;

// Per-page title + one-line note (§1.4).
const PAGE_META = {
  hierarchy:   { title: 'Hierarchy',     note: 'Repo → branch → task tree with stacked time bars.' },
  chronology:  { title: 'Chronology',    note: 'Every log entry in time order, with idle gaps.' },
  timegoes:    { title: 'Where time goes', note: 'How time splits across repos, branches, tasks.' },
  metrics:     { title: 'Metrics',       note: 'Counts, distributions, open issues, agent time.' },
  maintenance: { title: 'Maintenance',   note: 'Delete, export, and inspect stored volume.' },
  help:        { title: 'Help',          note: 'User and developer guide.' }
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
    this._render();
  }
  _render() {
    const s = window.LogApp.state;
    this.innerHTML = `
      <log-header></log-header>
      <div class="layout">
        ${s.sidebar ? this._sidebarHTML() : this._railHTML()}
        <div class="content">
          ${this._breadcrumbHTML(s)}
          <div class="content-row">
            <div class="page-host" id="pages">
              <div data-page="hierarchy"><log-tree></log-tree></div>
              <div data-page="chronology" hidden><log-timeline></log-timeline></div>
              <div data-page="timegoes" hidden><log-timegoes></log-timegoes></div>
              <div data-page="metrics" hidden><log-metrics></log-metrics></div>
              <div data-page="maintenance" hidden><log-maintenance></log-maintenance></div>
              <div data-page="help" hidden><log-help></log-help></div>
            </div>
            ${s.selectedLog ? this._detailPanelHTML() : ''}
          </div>
        </div>
      </div>
    `;
    const p = s.page || 'hierarchy';
    this.querySelectorAll('#pages > [data-page]').forEach((el) => { el.hidden = el.getAttribute('data-page') !== p; });
    this._wireShell();
  }
  _sidebarHTML() {
    const s = window.LogApp.state;
    const w = s.sidebarWidth || 320;
    // On the help page the panel carries the guide's outline: filtering rows is
    // meaningless there, and the outline is what you navigate with.
    const panel = s.page === 'help' ? '<log-help-nav></log-help-nav>' : '<log-filters></log-filters>';
    return `
      <aside class="sidebar" style="width:${w}px; flex:0 0 ${w}px">
        <button class="sidebar-collapse" title="Collapse sidebar" data-collapse="1">«</button>
        ${panel}
        <div class="sidebar-resize" data-resize-sidebar="1" title="Drag to resize"></div>
      </aside>
    `;
  }
  _railHTML() {
    const s = window.LogApp.state;
    if (s.page === 'help') {
      return `
        <aside class="sidebar-rail">
          <button class="rail-filter" title="Open help contents" data-open-sidebar="1">
            <span class="rail-filter-icon">☰</span>
          </button>
        </aside>
      `;
    }
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
    // The guide is not scoped to a repository, so a drill trail there would only
    // describe a scope the page ignores.
    if (s.page === 'help') {
      return `
        <div class="breadcrumb-strip">
          <div class="breadcrumb-crumbs"></div>
          <div class="breadcrumb-title">${meta.title}</div>
          <div class="breadcrumb-note">${meta.note}</div>
        </div>
      `;
    }
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
    const w = window.LogApp.state.detailWidth || 372;
    return `
      <div class="right-panel" style="width:clamp(280px, ${w}px, 60vw); flex:0 0 clamp(280px, ${w}px, 60vw)">
        <div class="right-panel-resize" data-resize-detail="1" title="Drag to resize"></div>
        <button class="detail-close" title="Close" data-close-detail="1">✕</button>
        <log-details></log-details>
      </div>
    `;
  }
  _wireShell() {
    const collapse = this.querySelector('[data-collapse]');
    if (collapse) collapse.onclick = () => window.LogApp.toggleSidebar();
    const openFilters = this.querySelector('[data-open-filters]');
    if (openFilters) openFilters.onclick = () => window.LogApp.openFilters();
    const openSidebar = this.querySelector('[data-open-sidebar]');
    if (openSidebar) openSidebar.onclick = () => window.LogApp.toggleSidebar();
    const closeDetail = this.querySelector('[data-close-detail]');
    if (closeDetail) closeDetail.onclick = () => window.LogApp.closeDetail();
    // Close detail panel on outside click (clicking in the page-host area)
    const pageHost = this.querySelector('#pages');
    if (pageHost && window.LogApp.state.selectedLog) {
      pageHost.onclick = (e) => {
        // Only close if clicking on the page-host itself or non-entry elements
        // (not when clicking on a log entry row that opens the detail)
        if (!e.target.closest('[data-id]') && !e.target.closest('[data-time]') && !e.target.closest('.tree-head')
            && !e.target.closest('.wf-row') && !e.target.closest('.run-log-row')) {
          window.LogApp.closeDetail();
        }
      };
    }
    // Only the breadcrumb's own reset — the sidebar wires its copy itself, and
    // a blanket selector here would overwrite that handler.
    this.querySelectorAll('.breadcrumb-crumbs [data-drill-clear]').forEach((b) => b.onclick = () => window.LogApp.clearDrill());
    this.querySelectorAll('.crumb[data-drill]').forEach((b) => b.onclick = () => {
      const d = JSON.parse(b.getAttribute('data-drill'));
      window.LogApp.setDrill(d);
    });

    // Right detail panel: drag the left edge (widening means dragging left)
    this._wireResize('[data-resize-detail]', '.right-panel', 280, -1, (w) => { window.LogApp.state.detailWidth = w; });
    // Left sidebar: drag the right edge (widening means dragging right)
    this._wireResize('[data-resize-sidebar]', '.sidebar', 220, 1, (w) => { window.LogApp.state.sidebarWidth = w; });
  }

  // Shared column resizer. `dir` is 1 when dragging right widens the panel.
  _wireResize(handleSel, panelSel, minW, dir, save) {
    const handle = this.querySelector(handleSel);
    if (!handle) return;
    handle.onmousedown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const panel = handle.closest(panelSel);
      const startX = e.clientX;
      const startW = panel.offsetWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      const onMove = (ev) => {
        const newW = Math.max(minW, Math.min(window.innerWidth * 0.6, startW + dir * (ev.clientX - startX)));
        save(newW);
        panel.style.width = newW + 'px';
        panel.style.flex = '0 0 ' + newW + 'px';
      };
      const onUp = () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
  }
}
customElements.define('app-shell', AppShell);
})(window);
