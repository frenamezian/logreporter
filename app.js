import './components.js';
import { LogDb } from './db.js';
import { buildModel, stream, fmt } from './time-model.js';
import { applyFilters, drillRows, unique } from './filters.js';

const DEFAULT_FILTER = { search: '', repo: '', branch: '', agent: '', log_type: '', log_level: '', status: '', priority: '', from: '', to: '' };

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
    db: new LogDb()
  },

  async init() {
    const sample = await this.state.db.loadSample();
    this.state.rows = sample;
    this.state.src = { name: 'Demo data', demo: true, ok: false, detail: 'using bundled demo data' };
    this.update();
  },

  setPage(page) {
    this.state.page = page;
    if (page === 'help' || page === 'maintenance') this.state.selectedLog = null;
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
        this.state.rows = await this.state.db.open(file);
        this.state.src = { name: file.name, demo: false, ok: true, detail: new Date(file.lastModified).toLocaleString() };
      } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.db,.sqlite,.sqlite3';
        input.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          this.state.rows = await this.state.db.open(file);
          this.state.src = { name: file.name, demo: false, ok: true, detail: new Date(file.lastModified).toLocaleString() };
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
      ...s.filter,
      repo: scope.repo || s.filter.repo,
      branch: scope.branch || s.filter.branch,
      log_type: scope.log_type || s.filter.log_type,
      to: '',
      from: ''
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
    if (!confirm(`Delete ${toDelete.length} logs? This cannot be undone.`)) return;
    const ids = toDelete.map((l) => l.id);
    this.state.db.deleteByIds(ids);
    this.state.rows = this.state.db.readAll();
    this.update();
  }
};

document.body.innerHTML = '<app-shell></app-shell>';
window.LogApp.init();
