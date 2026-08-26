(function (window) {
'use strict';

const LogDb = window.LogDb;
const UsageDb = window.UsageDb;
const { buildModel, stream, fmt, agentTypeMap, usageAgent, agentInSubtree } = window.LR;
const { applyFilters, drillRows, unique } = window.Filters;

const HOUR_STEPS = [0, 1, 3, 6, 12, 24, 48];
const HOUR_FILTER_KEY = 'logreporter.hour_filter';

function readHourFilter() {
  try {
    const raw = localStorage.getItem(HOUR_FILTER_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === 'object') {
        return {
          hoursFrom: typeof p.hoursFrom === 'number' ? p.hoursFrom : 6,
          hoursTo: typeof p.hoursTo === 'number' ? p.hoursTo : 0,
          hoursActive: typeof p.hoursActive === 'boolean' ? p.hoursActive : true
        };
      }
    }
  } catch (e) { /* ignored */ }
  return { hoursFrom: 6, hoursTo: 0, hoursActive: true };
}

function saveHourFilter(hoursFrom, hoursTo, hoursActive) {
  try {
    localStorage.setItem(HOUR_FILTER_KEY, JSON.stringify({ hoursFrom, hoursTo, hoursActive }));
  } catch (e) { /* ignored */ }
}

const savedHours = readHourFilter();
const DEFAULT_FILTER = {
  search: '', repo: [], branch: [], agent: [], log_type: [], git: [], log_level: [], status: [], priority: [], from: '', to: '',
  hoursFrom: savedHours.hoursFrom,
  hoursTo: savedHours.hoursTo,
  hoursActive: savedHours.hoursActive
};

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

// --- refresh stats ----------------------------------------------------------
//
// What the database gained since a baseline set of row ids, grouped
// repo → branch → task. The ids are SQLite rowids, already the identity key the
// rest of the app selects rows by.
//
// Deliberately blind to the filters and the drill. It reports what the DATABASE
// picked up, and a filter that quietly swallowed new rows would make that word
// a lie; the panel names the overlap instead of narrowing the count.
function diffRows(baseIds, rows) {
  const added = rows.filter((l) => !baseIds.has(l.id));
  const nowIds = new Set(rows.map((l) => l.id));
  let removed = 0;
  baseIds.forEach((id) => { if (!nowIds.has(id)) removed += 1; });

  const repos = new Map();
  const at = (map, name) => {
    let g = map.get(name);
    if (!g) { g = { name, n: 0, issues: 0, last: '', kids: new Map() }; map.set(name, g); }
    return g;
  };
  added.forEach((l) => {
    const r = at(repos, l.repo_name || '—');
    const b = at(r.kids, l.branch_name || '—');
    const t = at(b.kids, l.task_title || 'Untitled task');
    [r, b, t].forEach((g) => {
      g.n += 1;
      if (l.log_type === 'issue') g.issues += 1;
      if (l.timestamp > g.last) g.last = l.timestamp;
    });
  });
  // Newest first at every level. The question behind this panel is "what just
  // happened", so the freshest thing belongs at the top — not the biggest.
  // Timestamps are 'YYYY-MM-DD HH:MM:SS', so a string compare is chronological.
  const sorted = (map) => Array.from(map.values())
    .sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : 0));
  const tree = sorted(repos).map((r) => ({
    ...r, kids: sorted(r.kids).map((b) => ({ ...b, kids: sorted(b.kids) }))
  }));
  const tasks = tree.reduce((n, r) => n + r.kids.reduce((m, b) => m + b.kids.length, 0), 0);
  return { total: added.length, removed, tasks, repos: tree, rows: added };
}

// The source state for "there is no database to read". Distinct from an empty
// one: an activity_logs.db with no rows in it is a correct, expected state on a
// fresh install and is reported as such — name lit, 0 rows. This is the other
// case, where the file could not be fetched at all, and the difference is what
// the setup panel in app-shell keys off.
function noDatabase(e) {
  return { name: 'No database', ok: false,
    detail: 'activity_logs.db not reachable (' + e.message + ')' };
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
    src: { name: 'No database', ok: false, detail: 'no database open' },
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
    // Which rule the two trees order tasks by. 'recent' is what buildModel
    // already produced before this was a setting — the order was never wrong,
    // it was just never stated.
    taskOrder: 'recent',
    // Refresh stats. The baseline is a set of row ids and the moment it was
    // taken; the diff against it is recomputed on every load and read by the
    // header panel.
    refreshBaseIds: null,
    refreshBaseAt: null,
    refreshBaseLabel: 'page load',
    refreshStats: null,
    refreshOpen: false,
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
      this.state.src = { name: 'activity_logs.db', ok: true,
        detail: rows.length + ' rows · loaded by default' };
    } catch (e) {
      // No rows. Not sample rows — none.
      //
      // This used to fall back to a fabricated 89-row dataset, which reads as a
      // working dashboard: every page fills with plausible repositories, agents
      // and durations, and the only thing saying otherwise is one word in the
      // header. The published demo never took that path — it ships a real
      // activity_logs.db — so the fallback fired nowhere except a local install
      // that was not set up yet, which is precisely where inventing data is
      // most expensive. app-shell renders the setup panel instead.
      this.state.rows = [];
      this.state.src = noDatabase(e);
    }
    this._setRefreshBaseline('page load');
    this._updateRefreshStats();
    this.update();
    // Deliberately after the first render: the usage cache can be tens of
    // megabytes, and the log database is what the page is actually about. The
    // usage views fill in when it lands.
    this.loadUsage().then(() => this.update());
  },

  // --- refresh stats -------------------------------------------------------
  //
  // The baseline moves only on a deliberate act: an explicit Refresh, the page
  // loading, or a different database being opened. Auto-poll must never move
  // it — polling would absorb every new row five seconds after it landed and
  // leave the panel reading "0 new" for anyone running with it on, which is
  // most of the time. Instead the poll recomputes the diff against the standing
  // baseline, so the count climbs live between refreshes.
  _setRefreshBaseline(label) {
    this.state.refreshBaseIds = new Set(this.state.rows.map((l) => l.id));
    this.state.refreshBaseAt = new Date();
    this.state.refreshBaseLabel = label;
  },

  // Against the standing baseline by default; refresh() passes the previous one
  // explicitly, because by then the baseline has already moved to the rows it
  // just read and the diff being reported is the one it just closed.
  _updateRefreshStats(baseIds, at, label) {
    const base = baseIds || this.state.refreshBaseIds;
    if (!base) return;
    this.state.refreshStats = Object.assign(diffRows(base, this.state.rows), {
      since: at || this.state.refreshBaseAt,
      sinceLabel: label || this.state.refreshBaseLabel,
    });
  },

  // How many of the new rows the active filters would keep off the screen. The
  // panel says so rather than counting only what survives them — the point of
  // the number is what the database picked up, filters or no filters.
  refreshHiddenCount() {
    const st = this.state.refreshStats;
    if (!st || !st.total) return 0;
    return st.total - applyFilters(st.rows, this.state.filter).length;
  },

  toggleRefreshStats() {
    this.state.refreshOpen = !this.state.refreshOpen;
    if (this.state.refreshOpen) this.state.srcOpen = false;
    this.render();
  },
  closeRefreshStats() {
    this.state.refreshOpen = false;
    this.render();
  },

  setTaskOrder(mode) {
    this.state.taskOrder = mode === 'name' ? 'name' : 'recent';
    this.render();
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

  setHourFilter(hoursFrom, hoursTo, hoursActive) {
    const f = this.state.filter;
    if (hoursFrom !== undefined) f.hoursFrom = hoursFrom;
    if (hoursTo !== undefined) f.hoursTo = hoursTo;
    if (hoursActive !== undefined) f.hoursActive = hoursActive;
    saveHourFilter(f.hoursFrom, f.hoursTo, f.hoursActive);
    this.state.drill = {};
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
    // Two panels hang off the same header bar, each with its own click-outside
    // overlay. Opening one closes the other, or the second overlay swallows the
    // click meant to dismiss the first.
    if (this.state.srcOpen) this.state.refreshOpen = false;
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
          this.state.src = { name: file.name, ok: true, detail: new Date(file.lastModified).toLocaleString() };
          this._updateRefreshStats();
          this.update();
        }
      } else {
        // re-fetch the default DB (§17.5)
        const rows = await this.state.db.loadDefault();
        this.state.rows = rows;
        // A database that appears while the page is open — the reader finally
        // ran seed/new_db.py — should take the setup panel down with it, rather
        // than loading behind a header still reporting there is none.
        if (!this.state.src.ok) {
          this.state.src = { name: 'activity_logs.db', ok: true,
            detail: rows.length + ' rows · loaded by default' };
        }
        this._updateRefreshStats();
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

    const now = Date.now();
    const hasHours = f.hoursActive && (f.hoursFrom !== undefined || f.hoursTo !== undefined);
    const maxAgeMs = hasHours ? ((f.hoursFrom !== undefined && f.hoursFrom !== null) ? f.hoursFrom : Infinity) * 3600 * 1000 : Infinity;
    const minAgeMs = hasHours ? ((f.hoursTo !== undefined && f.hoursTo !== null) ? f.hoursTo : 0) * 3600 * 1000 : 0;
    const hFrom = now - maxAgeMs;
    const hTo = now - minAgeMs;

    const scoped = (s.usage || []).filter((u) => {
      if (repo.length && !repo.includes(u.repo_name)) return false;
      if (branch.length && !branch.includes(u.branch_name)) return false;
      const t = new Date(String(u.timestamp || '')).getTime();
      if (!Number.isFinite(t)) return false;
      if (span && (t < span.from || t > span.to)) return false;
      if (from !== null && t < from) return false;
      if (to !== null && t > to) return false;
      if (hasHours && (t < hFrom || t > hTo)) return false;
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
        this.state.src = { name: file.name, ok: true, detail: new Date(file.lastModified).toLocaleString() };
        this.state.srcOpen = false;
        // A different file: its rowids have nothing to do with the ones the
        // baseline holds, so every row would count as new. Start again from here
        // and say so, rather than reporting a whole database as an arrival.
        this._setRefreshBaseline('this source was opened');
        this._updateRefreshStats();
      } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.db,.sqlite,.sqlite3';
        input.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          this.state.rows = await this.state.db.open(file);
          this.state.src = { name: file.name, ok: true, detail: new Date(file.lastModified).toLocaleString() };
          this.state.srcOpen = false;
          this._setRefreshBaseline('this source was opened');
          this._updateRefreshStats();
          this.update();
        };
        input.click();
        return;
      }
      this.update();
    } catch (e) {
      // Dismissing the file picker is not a failure and must not be reported as
      // one: the previous source is still open and still correct.
      if (e.name === 'AbortError') { this.state.srcOpen = false; this.update(); return; }
      this.state.src = { ...this.state.src, ok: false, detail: 'could not open: ' + e.message };
      this.update();
    }
  },

  async refresh() {
    // "Refresh" means re-read the database, so it has to go back to the source.
    // Rows appended by agents in other repos since the last load exist only on
    // disk; reading the in-memory copy (readAll) would never surface them, which
    // is what made this button appear to do nothing while agents were working.
    const stamp = () => new Date().toLocaleTimeString();
    // The baseline this refresh is closing. Captured before the read, because
    // a successful one moves the baseline to the rows it just brought back and
    // the stats being reported are the diff it just closed.
    const prevIds = this.state.refreshBaseIds;
    const prevAt = this.state.refreshBaseAt;
    const prevLabel = this.state.refreshBaseLabel;
    let loaded = false;
    try {
      if (this.state.fileHandle) {
        const file = await this.state.fileHandle.getFile();
        this._lastMtime = file.lastModified;
        this.state.rows = await this.state.db.open(file);
        this.state.src = { name: file.name, ok: true,
          detail: this.state.rows.length + ' rows · reloaded ' + stamp() };
      } else {
        // Unconditionally, even from the empty state: Refresh is the button a
        // reader presses straight after creating the database, and it is what
        // makes that work without reloading the page.
        this.state.rows = await this.state.db.loadDefault();
        this.state.src = { name: 'activity_logs.db', ok: true,
          detail: this.state.rows.length + ' rows · reloaded ' + stamp() };
      }
      loaded = true;
    } catch (e) {
      // Still nothing to read: stay in the empty state rather than reporting a
      // failed refresh of a database that was never open in the first place.
      this.state.src = this.state.db.db
        ? { ...this.state.src, ok: false, detail: 'refresh failed: ' + e.message }
        : noDatabase(e);
    }
    // A refresh that failed read nothing, so it closed nothing: the baseline
    // and the standing diff both stay where they were. The source button is
    // already reporting the failure.
    if (loaded) {
      this._setRefreshBaseline('last refresh');
      this._updateRefreshStats(prevIds, prevAt, prevLabel);
      // Opened only when there is something to read. A panel that covers the
      // page every time the button is pressed, to say nothing happened, gets
      // dismissed unread and then ignored when it matters.
      if (this.state.refreshStats && this.state.refreshStats.total) this.state.refreshOpen = true;
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
  HOUR_STEPS,
  readHourFilter,
  saveHourFilter,

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

    try {
      const res = await fetch('api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'HTTP ' + res.status);
      this.state.rows = await this.state.db.loadDefault();
      this.state.src = { name: 'activity_logs.db', ok: true,
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
    // Rows just left. The baseline stays put — a delete is not a refresh — but
    // the standing diff has to be recut, or the panel keeps offering rows that
    // are no longer there.
    this._updateRefreshStats();
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
