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
  models:      { title: 'Models & pricing', note: 'Every model in the LLM registry, priced per 1M tokens.' },
  maintenance: { title: 'Maintenance',   note: 'Delete, export, and inspect stored volume.' },
  help:        { title: 'Help',          note: 'User and developer guide.' }
};

// Pages that describe something other than the logs in scope. A repo → branch →
// task trail would name a scope these pages do not read.
const UNSCOPED = new Set(['help', 'models']);

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
          ${this._setupHTML(s)}
          <div class="content-row">
            <div class="page-host" id="pages">
              <div data-page="hierarchy"><log-tree></log-tree></div>
              <div data-page="chronology" hidden><log-timeline></log-timeline></div>
              <div data-page="timegoes" hidden><log-timegoes></log-timegoes></div>
              <div data-page="metrics" hidden><log-metrics></log-metrics></div>
              <div data-page="models" hidden><log-models></log-models></div>
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
  // Shown when there is nothing to draw, in place of leaving six pages blank and
  // letting the reader work out why. Two distinct causes, and telling them apart
  // is the whole value of the panel: a database that could not be read is a
  // setup step not yet done, an empty one is a setup step done correctly with no
  // agent having logged yet. Both are normal on a fresh install; neither is an
  // error, and neither is a reason to invent rows.
  //
  // Models and Help read no logs at all, so the panel would be noise there.
  _setupHTML(s) {
    if (s.rows.length || s.page === 'models' || s.page === 'help') return '';

    if (!s.src.ok) {
      // On a file:// origin the fetch cannot succeed whether or not the database
      // exists, so leading with "no database" would send the reader off to
      // create one they may already have. The origin is the finding here.
      if (window.location.protocol === 'file:') {
        return `
          <div class="setup-panel">
            <strong>This page is open as a file.</strong>
            On a <code>file://</code> origin the browser cannot read
            <code>activity_logs.db</code> at all, however many rows are in it.
            <div class="setup-how">
              Start it with <code>python serve.py</code> and open
              <code>http://127.0.0.1:8250/index.html</code> — on Windows,
              double-click <code>start_LogReporter.bat</code> instead.
            </div>
            <div class="setup-note">Reported: ${esc(s.src.detail || '')}</div>
          </div>`;
      }
      return `
        <div class="setup-panel">
          <strong>No activity_logs.db yet.</strong>
          A fresh clone has no database until you make one — it is runtime data,
          deliberately not in git.
          <div class="setup-how">
            <code>python seed/new_db.py</code> for an empty one, or
            <code>bash seed/init_db.sh</code> to start from the 148-row sample.
            Then press <strong>Refresh</strong>.
          </div>
          <div class="setup-note">Reported: ${esc(s.src.detail || '')}</div>
        </div>`;
    }

    return `
      <div class="setup-panel">
        <strong>activity_logs.db is empty.</strong>
        The database is there and being read correctly; no agent has logged to it
        yet.
        <div class="setup-how">
          Point your agents at <code>log_activity.py</code> by absolute path —
          see <a href="#help">Help → Installation</a> — then turn
          on <strong>Auto-poll</strong> and the tree fills in as they work.
        </div>
      </div>`;
  }

  _sidebarTopTitle(s) {
    if (s.page === 'help') {
      return '<span class="sidebar-top-title">Help</span>';
    }
    if (s.page === 'models') {
      const m = window.LogApp.modelsFilterCount();
      return `<span class="sidebar-top-title">Filters${m ? ` <span class="filter-count-pill">${m}</span>` : ''}</span>`;
    }
    const n = this._activeFilterCount(s);
    return `
      <span class="sidebar-top-title" data-toggle="filters" title="Toggle Filters panel">
        <span class="caret">${s.panels.filters ? '▾' : '▸'}</span>Filters
        ${n ? `<span class="filter-count-pill">${n}</span>` : ''}
      </span>
    `;
  }

  _sidebarHTML() {
    const s = window.LogApp.state;
    const w = s.sidebarWidth || 320;
    // The sidebar belongs to whatever the page is about. On the help page that
    // is the guide's outline; on the models page it is the registry's own
    // facets. Neither reads the log filters, so neither shows them.
    const panel = s.page === 'help' ? '<log-help-nav></log-help-nav>'
      : s.page === 'models' ? '<log-models-filters></log-models-filters>'
      : '<log-filters></log-filters>';
    return `
      <aside class="sidebar" style="width:${w}px; flex:0 0 ${w}px">
        <div class="sidebar-top">
          ${this._sidebarTopTitle(s)}
          <button class="sidebar-collapse" title="Collapse sidebar" data-collapse="1">«</button>
        </div>
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
    if (s.page === 'models') {
      const m = window.LogApp.modelsFilterCount();
      return `
        <aside class="sidebar-rail">
          <button class="rail-filter" title="Open model filters" data-open-sidebar="1">
            <span class="rail-filter-icon">⚙</span>
            ${m ? `<span class="rail-badge">${m}</span>` : ''}
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
    const f = s.filter || {};
    let n = 0;
    ['repo', 'branch', 'agent', 'log_type', 'git', 'log_level', 'status', 'priority'].forEach((k) => {
      if ((f[k] || []).length) n += 1;
    });
    if (f.search) n += 1;
    if (f.from) n += 1;
    if (f.to) n += 1;
    if (f.hoursActive) n += 1;
    return n;
  }
  _breadcrumbHTML(s) {
    const meta = PAGE_META[s.page] || { title: esc(s.page), note: '' };
    const d = s.drill || {};
    if (UNSCOPED.has(s.page)) {
      return `
        <div class="breadcrumb-strip">
          <div class="breadcrumb-crumbs">${s.page === 'models' ? this._modelCrumbs(s) : ''}</div>
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
  // The models page has no drill, but the provider filter is the same kind of
  // narrowing, so it reads as the same trail.
  _modelCrumbs(s) {
    const picked = (s.modelsFilter && s.modelsFilter.provider) || [];
    const names = (window.ModelCatalog ? window.ModelCatalog.providers() : [])
      .filter((p) => picked.includes(p.key)).map((p) => p.name);
    const all = `<button class="crumb" data-models-all="1">All providers</button>`;
    if (!names.length) return all;
    return all + `<span class="crumb-sep">›</span><span class="crumb">${esc(names.join(', '))}</span>`;
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
    const toggleFilters = this.querySelector('[data-toggle="filters"]');
    if (toggleFilters) toggleFilters.onclick = () => window.LogApp.toggleFilters();
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
    this.querySelectorAll('[data-models-all]').forEach((b) => b.onclick = () => window.LogApp.setModelsFilter('provider', []));
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
