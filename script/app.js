(function (window) {
'use strict';

const LogDb = window.LogDb;
const { buildModel, stream, fmt } = window.LR;
const { applyFilters, drillRows, unique } = window.Filters;

const DEFAULT_FILTER = { search: '', repo: [], branch: [], agent: [], log_type: [], git: [], log_level: [], status: [], priority: [], from: '', to: '' };

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
    confirm: null,
    selectedRun: null, // waterfall run whose logs are listed below it
    fileHandle: null,
    navOpen: new Set(), // navigation tree expand/collapse state (persists across re-renders)
    treeOpen: new Set(), // hierarchy tree expand/collapse state (persists across re-renders)
    detailWidth: 372, // right detail panel width (drag to resize)
    sidebarWidth: 320, // left sidebar width (drag to resize)
    // Search box text the user is still typing. The filter itself is only
    // applied on Enter, so this draft has to survive shell re-renders.
    searchDraft: null,
    searchFocused: false
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
    this.state.page = page;
    if (page === 'help' || page === 'maintenance') this.state.selectedLog = null;
    this.state.srcOpen = false;
    this.render();
  },

  setFilter(key, value) {
    // Respect the key's default type (array vs string) when clearing
    this.state.filter[key] = value || (Array.isArray(DEFAULT_FILTER[key]) ? [] : '');
    if (key === 'search') this.state.searchDraft = null;
    this.state.drill = {}; // changing filters clears drill
    this.state.selectedLog = null;
    this.update();
  },

  // Toggle a value in an array-based filter (multi-select)
  toggleFilter(key, value) {
    if (!Array.isArray(this.state.filter[key])) this.state.filter[key] = [];
    const arr = this.state.filter[key];
    const idx = arr.indexOf(value);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(value);
    this.state.drill = {};
    this.state.selectedLog = null;
    this.update();
  },

  setDrill(drill) {
    // Replace the drill state entirely (not merge) so drilling to a shallower
    // level clears deeper keys (e.g. clicking a task clears a stale agent).
    this.state.drill = { ...drill };
    this.state.selectedLog = null;
    this.state.selectedRun = null;
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
  expandAll() {
    if (!this.state.treeOpen) this.state.treeOpen = new Set();
    const s = this.state;
    // Expand every repo/branch/task that holds a row currently in scope
    s.inScope.forEach((l) => {
      s.treeOpen.add('r:' + l.repo_name);
      s.treeOpen.add('b:' + l.repo_name + '|' + l.branch_name);
      s.treeOpen.add('t:' + l.repo_name + '|' + l.branch_name + '|' + (l.task_title || 'Untitled task'));
    });
    const tree = document.querySelector('log-tree');
    if (tree) tree.refresh();
  },
  collapseAll() {
    if (this.state.treeOpen) this.state.treeOpen.clear();
    const tree = document.querySelector('log-tree');
    if (tree) tree.refresh();
  },

  selectLog(log) {
    this.state.selectedLog = log;
    if (log) {
      // Prev/Next in trace can walk into another task. Follow it, so the
      // waterfall keeps showing the entry that is open on the right instead of
      // silently leaving the scope behind.
      const task = log.task_title || 'Untitled task';
      const d = this.state.drill || {};
      if (d.task && d.task !== task) {
        this.state.drill = { repo: log.repo_name, branch: log.branch_name, task };
        this.recompute();
      }
      // The run log list below the waterfall follows the selected entry
      this.state.selectedRun = this.runOf(log);
    }
    this.render();
  },

  // The run (agent start→end pair) that contains a given log, as {path, from}
  runOf(log) {
    const wanted = log.task_title || 'Untitled task';
    const task = (this.state.model.tasks || []).find((t) =>
      t.repo === log.repo_name && t.branch === log.branch_name && t.title === wanted);
    const run = task?.runs.find((r) => r.events.some((e) => e.id === log.id));
    return run ? { path: run.path, from: run.from } : null;
  },

  recompute() {
    const s = this.state;
    s.filtered = applyFilters(s.rows, s.filter);
    s.inScope = drillRows(s.filtered, s.drill);
    s.treeModel = buildModel(s.filtered);
    s.model = buildModel(s.inScope);
  },

  update() {
    this.recompute();
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
    // "Refresh" means re-read the database, so it has to go back to the source.
    // Rows appended by agents in other repos since the last load exist only on
    // disk; reading the in-memory copy (readAll) would never surface them, which
    // is what made this button appear to do nothing while agents were working.
    const stamp = () => new Date().toLocaleTimeString();
    try {
      if (this.state.fileHandle) {
        const file = await this.state.fileHandle.getFile();
        this._lastMtime = file.lastModified;
        this.state.rows = await this.state.db.open(file);
        this.state.src = { name: file.name, demo: false, ok: true,
          detail: this.state.rows.length + ' rows · reloaded ' + stamp() };
      } else if (!this.state.src.demo) {
        this.state.rows = await this.state.db.loadDefault();
        this.state.src = { name: 'activity_logs.db', demo: false, ok: true,
          detail: this.state.rows.length + ' rows · reloaded ' + stamp() };
      } else {
        // No database is open, so the sample set is the only available source.
        this.state.rows = await this.state.db.loadSample();
        this.state.src = { ...this.state.src, detail: 'demo data · restamped ' + stamp() };
      }
    } catch (e) {
      this.state.src = { ...this.state.src, ok: false, detail: 'refresh failed: ' + e.message };
    }
    this.update();
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
    // Delete scope now inherits the current filter + drill (s.inScope), with
    // an optional "older than" date as the only delete-specific refinement.
    const s = this.state;
    const rows = s.inScope;
    if (!scope || !scope.olderThan) return rows;
    return rows.filter((l) => {
      const t = l.timestamp?.replace(' ', 'T') + 'Z';
      return t && new Date(t) < new Date(scope.olderThan + 'T00:00:00Z');
    });
  },

  // Deletes are executed by serve.py against activity_logs.db, not against the
  // in-memory image. sql.js holds a copy of bytes fetched over HTTP, so a delete
  // applied there is discarded by the next read — the row has to be removed by a
  // process that owns the file. After the server confirms, the database is
  // re-read so what is on screen is what is stored.
  async deleteLogs(scope) {
    const toDelete = this.scopeCount(scope);
    if (!toDelete.length) return;
    this.state.confirm = null;
    const ids = Array.from(new Set(toDelete.map((l) => l.id)));

    // Demo data has no backing file, so the in-memory delete is all there is.
    if (this.state.src.demo) {
      this.state.db.deleteByIds(ids);
      this.state.rows = this.state.db.readAll();
      this.state.src = { ...this.state.src, detail: 'demo data · ' + ids.length + ' rows removed in memory' };
      this.update();
      return;
    }

    try {
      const res = await fetch('api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'HTTP ' + res.status);
      this.state.rows = await this.state.db.loadDefault();
      this.state.src = { name: 'activity_logs.db', demo: false, ok: true,
        detail: out.deleted + ' deleted · ' + this.state.rows.length + ' rows remain' };
    } catch (e) {
      // Reached when the page is not being served by serve.py (plain
      // http.server, or opened over file://). Fall back to the in-memory delete
      // so the view still responds, but flag it as not persisted rather than
      // letting it look permanent.
      this.state.db.deleteByIds(ids);
      this.state.rows = this.state.db.db ? this.state.db.readAll() : this.state.rows.filter((l) => !ids.includes(l.id));
      this.state.src = { ...this.state.src, ok: false,
        detail: 'NOT saved to the database (' + e.message + ') — start the app with start_dashboard.bat' };
    }
    this.update();
  }
};

document.body.innerHTML = '<app-shell></app-shell>';
window.LogApp.init();
})(window);
