(function (window) {
'use strict';

const LogDb = window.LogDb;
const { buildModel, stream, fmt } = window.LR;
const { applyFilters, drillRows, unique } = window.Filters;

const DEFAULT_FILTER = { search: '', repo: '', branch: '', agent: '', log_type: '', git: '', log_level: '', status: '', priority: '', from: '', to: '' };

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function exportRows(rows, format) {
  const cols = ['id','timestamp','repo_name','branch_name','trace_id','parent_trace_id','task_title','agent_name','agent_path','log_type','log_title','log_description','log_level','status','priority','user_id','tags','error_details','resolved_by','resolution_time','performance_metrics','input_output_hash'];
  if (format === 'json') {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'logs.json'; a.click(); URL.revokeObjectURL(a.href);
  } else {
    const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? '')).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'logs.csv'; a.click(); URL.revokeObjectURL(a.href);
  }
}

window.LogApp = {
  state: {
    rows: [],
    filtered: [],
    inScope: [],
    filter: { ...DEFAULT_FILTER },
    drill: {},
    selectedLog: null,
    page: 'hierarchy',
    treeModel: { repos: [], totals: {} },
    model: { repos: [], totals: {} },
    src: { name: 'Demo data', demo: true, ok: false, detail: 'no database open' },
    db: new LogDb(),
    // shell state (§11.1)
    sidebar: true,
    panels: { filters: false, nav: true },
    srcOpen: false,
    poll: false,
    order: 'newest',
    helpTopic: 'started',
    prevPage: 'hierarchy',
    confirm: null,
    fileHandle: null
  },

  async init() {
    try {
      const rows = await this.state.db.loadDefault();
      this.state.rows = rows;
      this.state.src = { name: 'activity_logs.db', demo: false, ok: true,
        detail: rows.length + ' rows · loaded by default' };
    } catch (e) {
      const sample = await this.state.db.loadSample();
      this.state.rows = sample;
      this.state.src = { name: 'Demo data', demo: true, ok: false,
        detail: 'activity_logs.db not reachable (' + e.message + '); using demo data' };
    }
    this.update();
  },

  setPage(page) {
    if (page === 'help' && this.state.page !== 'help') this.state.prevPage = this.state.page;
    this.state.page = page;
    if (page === 'help' || page === 'maintenance') this.state.selectedLog = null;
    this.state.srcOpen = false;
    this.render();
  },

  setFilter(key, value) {
    this.state.filter[key] = value || '';
    this.state.drill = {}; // changing filters clears drill
    this.state.selectedLog = null;
    this.update();
  },

  setDrill(drill) {
    this.state.drill = { ...this.state.drill, ...drill };
    this.state.selectedLog = null;
    this.update();
  },

  clearDrill() {
    this.state.drill = {};
    this.update();
  },

  // --- shell / sidebar / panels (§11.2) ---
  toggleSidebar() {
    this.state.sidebar = !this.state.sidebar;
    this.render();
  },
  openFilters() {
    this.state.sidebar = true;
    this.state.panels.filters = true;
    this.render();
  },
  toggleFilters() {
    this.state.panels.filters = !this.state.panels.filters;
    this.render();
  },
  toggleNav() {
    this.state.panels.nav = !this.state.panels.nav;
    this.render();
  },
  toggleSrc() {
    this.state.srcOpen = !this.state.srcOpen;
    this.render();
  },
  closeSrc() {
    this.state.srcOpen = false;
    this.render();
  },
  togglePoll() {
    this.state.poll = !this.state.poll;
    if (this.state.poll) this._startPoll();
    else this._stopPoll();
    this.render();
  },
  _startPoll() {
    this._stopPoll();
    this._pollTimer = setInterval(() => this._pollTick(), 5000);
  },
  _stopPoll() {
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
  },
  async _pollTick() {
    try {
      if (this.state.fileHandle) {
        const file = await this.state.fileHandle.getFile();
        if (file.lastModified !== this._lastMtime) {
          this._lastMtime = file.lastModified;
          this.state.rows = await this.state.db.open(file);
          this.state.src = { name: file.name, demo: false, ok: true, detail: new Date(file.lastModified).toLocaleString() };
          this.update();
        }
      } else if (!this.state.src.demo) {
        // re-fetch the default DB (§17.5)
        const rows = await this.state.db.loadDefault();
        this.state.rows = rows;
        this.update();
      }
    } catch (e) { /* ignore poll errors */ }
  },
  closeDetail() { this.selectLog(null); },
  setHelpTopic(id) {
    this.state.helpTopic = id;
    this.render();
  },
  closeHelp() {
    this.setPage(this.state.prevPage || 'hierarchy');
  },
  drillCollapse(key, repo, branch, task) {
    this.setDrill({ repo, branch, task });
    const tree = document.querySelector('log-tree');
    if (tree && tree._open) tree._open.delete(key);
    this.update();
  },
  expandAll() {
    const tree = document.querySelector('log-tree');
    if (!tree || !tree._open) return;
    const s = this.state;
    s.treeModel.repos.forEach((r) => {
      tree._open.add('r:' + r.name);
      r.branches.forEach((b) => tree._open.add('b:' + r.name + '|' + b.name));
    });
    tree.refresh();
  },
  collapseAll() {
    const tree = document.querySelector('log-tree');
    if (!tree || !tree._open) return;
    tree._open.clear();
    tree.refresh();
  },

  selectLog(log) {
    this.state.selectedLog = log;
    this.render();
  },

  update() {
    const s = this.state;
    s.filtered = applyFilters(s.rows, s.filter);
    s.inScope = drillRows(s.filtered, s.drill);
    s.treeModel = buildModel(s.filtered);
    s.model = buildModel(s.inScope);
    this.render();
  },

  render() {
    window.dispatchEvent(new CustomEvent('logapp:update', { detail: this.state }));
  },

  async openDb() {
    try {
      if (window.showOpenFilePicker) {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'SQLite databases', accept: { 'application/x-sqlite3': ['.db', '.sqlite', '.sqlite3'] } }]
        });
        const file = await handle.getFile();
        this.state.fileHandle = handle;
        this._lastMtime = file.lastModified;
        this.state.rows = await this.state.db.open(file);
        this.state.src = { name: file.name, demo: false, ok: true, detail: new Date(file.lastModified).toLocaleString() };
        this.state.srcOpen = false;
      } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.db,.sqlite,.sqlite3';
        input.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          this.state.rows = await this.state.db.open(file);
          this.state.src = { name: file.name, demo: false, ok: true, detail: new Date(file.lastModified).toLocaleString() };
          this.state.srcOpen = false;
          this.update();
        };
        input.click();
        return;
      }
      this.update();
    } catch (e) {
      this.state.src = { name: 'Demo data', demo: true, ok: false, detail: e.message };
      this.update();
    }
  },

  async refresh() {
    if (this.state.src.demo) {
      const sample = await this.state.db.loadSample();
      this.state.rows = sample;
      this.update();
    } else {
      this.state.rows = this.state.db.readAll();
      this.update();
    }
  },

  exportCsv() { exportRows(this.state.inScope, 'csv'); },
  exportJson() { exportRows(this.state.inScope, 'json'); },

  escapeHtml,
  fmt,
  stream,
  unique,

  async saveDb() {
    const bytes = this.state.db.exportDb();
    if (!bytes) return;
    const blob = new Blob([bytes], { type: 'application/x-sqlite3' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'activity_logs.db';
    a.click();
    URL.revokeObjectURL(a.href);
  },

  scopeCount(scope) {
    const s = this.state;
    return applyFilters(s.rows, {
      ...DEFAULT_FILTER,
      repo: scope.repo || '',
      branch: scope.branch || '',
      log_type: scope.log_type || ''
    }).filter((l) => {
      if (scope.olderThan) {
        const t = l.timestamp?.replace(' ', 'T') + 'Z';
        if (t && new Date(t) >= new Date(scope.olderThan + 'T00:00:00Z')) return false;
      }
      return true;
    });
  },

  deleteLogs(scope) {
    const toDelete = this.scopeCount(scope);
    if (!toDelete.length) return;
    // §8.1: confirmation is handled by the Maintenance component's custom modal
    // (state.confirm). The modal clears state.confirm then calls this method,
    // so by the time we reach here the user has already confirmed.
    this.state.confirm = null;
    const ids = new Set(toDelete.map((l) => l.id));
    this.state.db.deleteByIds(Array.from(ids));
    this.state.rows = this.state.db.db ? this.state.db.readAll() : this.state.rows.filter((l) => !ids.has(l.id));
    this.update();
  }
};

document.body.innerHTML = '<app-shell></app-shell>';
window.LogApp.init();
})(window);
