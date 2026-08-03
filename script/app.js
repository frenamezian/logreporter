(function (window) {
'use strict';

const LogDb = window.LogDb;
const UsageDb = window.UsageDb;
const { buildModel, stream, fmt, agentTypeMap, usageAgent, agentInSubtree } = window.LR;
const { applyFilters, drillRows, unique } = window.Filters;

const DEFAULT_FILTER = { search: '', repo: [], branch: [], agent: [], log_type: [], git: [], log_level: [], status: [], priority: [], from: '', to: '' };

// --- theme ------------------------------------------------------------------
// Dark is the default and needs no attribute, so the whole theme is one flag on
// <html> that style.css keys off. The value has already been applied by the
// inline bootstrap in index.html — that has to happen before first paint, or
// every load flashes the other theme — so the state below reads the DOM rather
// than assuming a default and fighting what is already on screen.
const THEME_KEY = 'logreporter.theme';

function readTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function applyTheme(theme) {
  if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
  // Wrapped: localStorage throws rather than no-ops when storage is blocked
  // (some file:// configurations), and losing the preference across reloads is
  // not a reason to take the dashboard down.
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* not persisted */ }
}

// The Models page filters the LLM registry, not the logs, so it carries its own
// filter object. Legacy and deprecated models are excluded by default: 31 of
// the 102 in the registry are retired, and they are kept only so an old session
// still prices correctly — they are not something to shop from.
// A fresh object every time: the array values are mutated in place by the
// toggles, and a shared default would be edited by the first click.
const defaultModelsFilter = () => ({
  search: '', provider: [], status: ['active', 'preview'], capability: [], minContext: '', sort: 'registry'
});

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

// The seven pages, and the hash that names each one. The published site links
// straight at a page (.../app/index.html#chronology), so the hash has to be
// readable at boot as well as written on every tab click. An unknown or absent
// hash falls back to Hierarchy rather than rendering nothing.
const PAGES = new Set([
  'hierarchy', 'chronology', 'timegoes', 'metrics', 'models', 'maintenance', 'help',
]);

function pageFromHash() {
  const h = (window.location.hash || '').replace(/^#/, '');
  return PAGES.has(h) ? h : null;
}

window.LogApp = {
  state: {
    rows: [],
    filtered: [],
    inScope: [],
    filter: { ...DEFAULT_FILTER },
    drill: {},
    selectedLog: null,
    // Read at parse time, before init() — a deep link should land on its page
    // directly, not flash Hierarchy first.
    page: pageFromHash() || 'hierarchy',
    treeModel: { repos: [], totals: {} },
    model: { repos: [], totals: {} },
    src: { name: 'Demo data', demo: true, ok: false, detail: 'no database open' },
    db: new LogDb(),
    // Token usage lives in a second database and is joined to the logs in
    // memory, not in SQL. It is optional: everything on every page works
    // unchanged when token_usage.db does not exist.
    usageDb: new UsageDb(),
    usage: [],
    usageReport: null,
    usageBusy: false,
    // Which measure the usage views are drawn against. Tokens and cost are
    // never put on one axis — they differ by orders of magnitude and a shared
    // axis would invent a correlation that is not in the data. The toggle is
    // the feature: the two views disagree, and the disagreement is the point.
    measure: 'tokens',
    // shell state (§11.1)
    theme: readTheme(),
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
    // Models page: which provider panels and which model rows are open. Same
    // contract as the two sets above — they live on state so a poll tick or a
    // filter change does not collapse what the reader opened.
    modelsFilter: defaultModelsFilter(),
    modelsOpen: new Set(),
    modelRowOpen: new Set(),
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
    // Deliberately after the first render: the usage cache can be tens of
    // megabytes, and the log database is what the page is actually about. The
    // usage views fill in when it lands.
    this.loadUsage().then(() => this.update());
  },

  // --- token usage ---------------------------------------------------------

  async loadUsage() {
    this.state.usage = await this.state.usageDb.load();
    this.state.usageReport = await this.state.usageDb.loadReport();
    return this.state.usage;
  },

  // Ask serve.py to re-read the agents' session files. This is the only way
  // usage can change: the browser cannot read ~/.claude/projects, and the page
  // holds a copy of bytes it fetched over HTTP.
  async refreshUsage(rebuild) {
    if (this.state.usageBusy) return;
    this.state.usageBusy = true;
    this.render();
    try {
      const res = await fetch(rebuild ? 'api/rebuild-usage' : 'api/refresh-usage',
                              { method: 'POST' });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'HTTP ' + res.status);
      this.state.usageReport = out;
      await this.loadUsage();
      this.state.usageReport = out;   // the live report beats the file on disk
    } catch (e) {
      // Reached when the page is not served by serve.py. The rows already
      // loaded stay valid; only the re-import is unavailable.
      this.state.usageDb.status = { ...this.state.usageDb.status, ok: false,
        detail: 'could not re-import usage (' + e.message +
                ') — start the app with start_LogReporter.bat' };
    }
    this.state.usageBusy = false;
    this.update();
  },

  setMeasure(measure) {
    this.state.measure = measure === 'cost' ? 'cost' : 'tokens';
    this.render();
  },

  setPage(page) {
    if (!PAGES.has(page)) return;
    this.state.page = page;
    if (page === 'help' || page === 'maintenance' || page === 'models') this.state.selectedLog = null;
    this.state.srcOpen = false;
    // Keep the address bar in step, so any page can be linked to and the back
    // button walks pages instead of leaving the app. Writing a hash that is
    // already current is a no-op, which is what stops this and the hashchange
    // listener below from bouncing off each other.
    if (pageFromHash() !== page) {
      try { window.location.hash = page; } catch (e) { /* about:, sandboxed */ }
    }
    this.render();
  },

  // --- models page ---------------------------------------------------------
  //
  // These all call render(), not update(): the registry is a static file, so
  // nothing here changes which log rows are in scope. recompute() would rebuild
  // the whole tree model to redraw a table that does not read it.

  toggleModelProvider(key) {
    const open = this.state.modelsOpen;
    if (open.has(key)) open.delete(key); else open.add(key);
    this.render();
  },

  toggleModelRow(id) {
    const open = this.state.modelRowOpen;
    if (open.has(id)) open.delete(id); else open.add(id);
    this.render();
  },

  setModelsFilter(key, value) {
    this.state.modelsFilter[key] = value;
    this.render();
  },

  toggleModelsFilter(key, value) {
    const arr = this.state.modelsFilter[key] || [];
    const i = arr.indexOf(value);
    if (i >= 0) arr.splice(i, 1); else arr.push(value);
    this.state.modelsFilter[key] = arr;
    this.render();
  },

  clearModelsFilter() {
    this.state.modelsFilter = defaultModelsFilter();
    this.render();
  },

  modelsFilterCount() {
    const f = this.state.modelsFilter;
    let n = 0;
    ['provider', 'status', 'capability'].forEach((k) => { if ((f[k] || []).length) n += 1; });
    if (f.search) n += 1;
    if (f.minContext) n += 1;
    return n;
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
  toggleTheme() {
    this.state.theme = this.state.theme === 'light' ? 'dark' : 'light';
    applyTheme(this.state.theme);
    // render(), not update(): the theme changes no row, no filter and no scope.
    // It redraws the header so the button's own label and title follow.
    this.render();
  },
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
      // The usage cache is checked with a HEAD first. It is orders of
      // magnitude larger than the log database and changes only when the
      // reader runs, so re-downloading it on every five-second tick would cost
      // megabytes a minute to discover nothing had changed.
      if (await this.state.usageDb.hasChanged()) {
        await this.loadUsage();
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
    s.usageInScope = this.scopeUsage();
  },

  // Usage rows carry repo, branch and a timestamp — and nothing else the log
  // filters know about. Only the filters that can be answered from those three
  // are applied; the rest (log type, level, status, agent, priority, search)
  // describe log entries, which a usage row is not.
  //
  // This is why the usage section says which filters it honours instead of
  // pretending the whole filter bar applies. Silently ignoring a filter the
  // user has set, and showing a total that does not match it, would be the
  // same class of error as a silently partial import.
  scopeUsage() {
    const s = this.state;
    const f = s.filter || {};
    const d = s.drill || {};
    const repo = (d.repo ? [d.repo] : (f.repo || []));
    const branch = (d.branch ? [d.branch] : (f.branch || []));
    const from = f.from ? new Date(f.from + 'T00:00:00Z').getTime() : null;
    // `to` is inclusive of the whole day, matching the log filter.
    const to = f.to ? new Date(f.to + 'T23:59:59.999Z').getTime() : null;

    // Drilling into a task narrows usage to that task's own span — the same
    // join §7 uses everywhere else, so the drilled view and the ranking row
    // for that task always agree.
    //
    // The span comes from treeModel, which is built BEFORE any drill is
    // applied, and that detail is the whole point. s.model is built from the
    // drilled rows, so an agent drill would shrink the task's span to that
    // agent's own runs — and usage would then silently report "every request
    // that happened while this agent was running", which is not the same thing
    // as "this agent's requests" and is not something the data can tell us.
    //
    // A single Claude Code session commonly hosts a whole tree of logged
    // agents: in this repository's own data, one session carries all of
    // lead_architect, task_executor, code_reviewer and test_writer. The
    // transcript has no idea those agent paths exist, so tokens cannot be
    // split between them. Usage is therefore a task-level measure, and an
    // agent drill deliberately does not change it. The UI says so.
    let span = null;
    if (d.task) {
      const t = ((s.treeModel || {}).tasks || []).find((x) => x.title === d.task &&
        (!d.repo || x.repo === d.repo) && (!d.branch || x.branch === d.branch));
      if (t) span = t.span;
    }

    const scoped = (s.usage || []).filter((u) => {
      if (repo.length && !repo.includes(u.repo_name)) return false;
      if (branch.length && !branch.includes(u.branch_name)) return false;
      if (span || from !== null || to !== null) {
        const t = new Date(String(u.timestamp || '')).getTime();
        if (!Number.isFinite(t)) return false;
        if (span && (t < span.from || t > span.to)) return false;
        if (from !== null && t < from) return false;
        if (to !== null && t > to) return false;
      }
      return true;
    });

    if (!d.agent) return scoped;

    // An agent drill keeps that agent and everything it dispatched — the same
    // subtree rule drillRows applies to log rows, so the usage total and the
    // row counts in the tree describe the same set of work.
    const tasks = (s.treeModel.tasks || []).filter((t) =>
      (!d.repo || t.repo === d.repo) && (!d.branch || t.branch === d.branch) &&
      (!d.task || t.title === d.task));
    const maps = tasks.map((t) => ({ t, map: agentTypeMap(t) }));
    return scoped.filter((u) => {
      const ts = new Date(String(u.timestamp || '')).getTime();
      const hit = maps.find(({ t }) => ts >= t.span.from && ts <= t.span.to);
      if (!hit) return false;           // outside every span: not this agent's
      return agentInSubtree(usageAgent(u, hit.map).path, d.agent);
    });
  },

  // Which of the active filters the usage views cannot honour. Named in the UI
  // rather than ignored quietly.
  usageIgnoredFilters() {
    const f = this.state.filter || {};
    // The agent *drill* is honoured (usage joins to the subagent that produced
    // it). The agent *filter* is not: it selects log rows by path, and a usage
    // row is not a log row.
    const named = { agent: 'agent', log_type: 'log type', git: 'git action',
                    log_level: 'level', status: 'status', priority: 'priority' };
    const out = Object.keys(named).filter((k) => (f[k] || []).length);
    if (f.search) out.push('search');
    return out.map((k) => named[k] || k);
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
    // Refresh means "go back to the source", and for usage the source is the
    // agents' session files, not the cache. Ask serve.py to re-read them; if
    // it is not there, fall back to re-reading whatever cache exists.
    try {
      const res = await fetch('api/refresh-usage', { method: 'POST' });
      if (res.ok) this.state.usageReport = await res.json();
    } catch (e) { /* not served by serve.py; the reload below still applies */ }
    await this.loadUsage();
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
        detail: 'NOT saved to the database (' + e.message + ') — start the app with start_LogReporter.bat' };
    }
    this.update();
  }
};

// The footer is a sibling of the shell, not a child: <app-shell> rewrites its
// own innerHTML on every render, which would restart the ad rotation and
// re-request the images on every filter change.
document.body.innerHTML = '<app-shell></app-shell><log-footer></log-footer>';

// Back/forward, and a hash edited by hand, both move the app. setPage writes the
// hash itself, but only when it differs, so this cannot loop.
window.addEventListener('hashchange', () => {
  const page = pageFromHash();
  if (page && page !== window.LogApp.state.page) window.LogApp.setPage(page);
});

window.LogApp.init();
})(window);
