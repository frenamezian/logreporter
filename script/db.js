(function (window) {
'use strict';

const SQL_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js';
const WASM_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.wasm';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('failed to load ' + src));
    document.head.appendChild(s);
  });
}

// Returns the initialised sql.js module — the thing with .Database on it.
//
// This used to early-return `window.initSqlJs`, which is the *factory* that
// produces that module, not the module itself. The first call fell through to
// the real path and was correct, so nothing broke while the page only ever
// opened one database; the second call handed back the factory and
// `new SQL.Database(bytes)` failed with "SQL.Database is not a constructor".
// Opening the usage database is simply the first thing that calls this twice.
//
// The promise is cached rather than the result, so two callers that arrive
// while the wasm is still downloading share one initialisation instead of
// racing to start a second.
let _sqlReady = null;

function ensureSqlJs() {
  if (window.SQL) return Promise.resolve(window.SQL);
  if (_sqlReady) return _sqlReady;
  _sqlReady = (async () => {
    if (!window.initSqlJs) await loadScript(SQL_CDN);
    if (!window.initSqlJs) throw new Error('sql.js did not load');
    window.SQL = await window.initSqlJs({
      locateFile: (file) => (file === 'sql-wasm.wasm' ? WASM_CDN : file)
    });
    return window.SQL;
  })();
  // A failed load must not poison every later attempt: clear the cache so a
  // Refresh can retry after the network comes back.
  _sqlReady.catch(() => { _sqlReady = null; });
  return _sqlReady;
}

function rowsFromResult(result) {
  if (!result || !result.length) return [];
  const { columns, values } = result[0];
  return values.map((row) => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

const SCHEMA_COLS = [
  'id','timestamp','repo_name','branch_name','trace_id','parent_trace_id','task_title',
  'agent_name','agent_path','log_title','log_description','log_type','log_level','status',
  'priority','user_id','tags','error_details','resolved_by','resolution_time',
  'performance_metrics','input_output_hash'
];

const SCHEMA_SQL = `CREATE TABLE logs (
  id INTEGER PRIMARY KEY, timestamp TEXT, repo_name TEXT, branch_name TEXT,
  trace_id TEXT, parent_trace_id TEXT, task_title TEXT, agent_name TEXT, agent_path TEXT,
  log_title TEXT, log_description TEXT, log_type TEXT, log_level TEXT, status TEXT,
  priority TEXT, user_id TEXT, tags TEXT, error_details TEXT, resolved_by TEXT,
  resolution_time TEXT, performance_metrics TEXT, input_output_hash TEXT
);`;

// Build an in-memory SQLite database from a set of rows. Used by loadSample()
// so that deletes and saves work on demo data exactly as they do on a real .db
// file — without this, this.db stays null and every mutation is lost on reload.
function dbFromRows(SQL, rows) {
  const db = new SQL.Database();
  db.run(SCHEMA_SQL);
  const stmt = db.prepare(`INSERT INTO logs (${SCHEMA_COLS.join(',')}) VALUES (${SCHEMA_COLS.map(() => '?').join(',')})`);
  rows.forEach((r) => stmt.run(SCHEMA_COLS.map((c) => r[c] ?? null)));
  stmt.free();
  return db;
}

const MIN_SAMPLE = [
  { id: 1, timestamp: '2026-07-29 09:00:00', repo_name: 'demo', branch_name: 'main', task_title: 'Sample task', agent_name: 'lead_architect', agent_path: 'lead_architect', log_title: 'Task started', log_description: 'Started sample task.', log_type: 'start', log_level: 'info', status: 'in_progress', user_id: 'admin' },
  { id: 2, timestamp: '2026-07-29 09:05:00', repo_name: 'demo', branch_name: 'main', task_title: 'Sample task', agent_name: 'lead_architect', agent_path: 'lead_architect', log_title: 'Did some work', log_description: 'A sample activity log.', log_type: 'activity', log_level: 'info', user_id: 'admin' },
  { id: 3, timestamp: '2026-07-29 09:10:00', repo_name: 'demo', branch_name: 'main', task_title: 'Sample task', agent_name: 'lead_architect', agent_path: 'lead_architect', log_title: 'Task complete', log_description: 'Completed sample task.', log_type: 'end', log_level: 'info', status: 'completed', user_id: 'admin' }
];

// The usage cache, opened as a *second* sql.js database.
//
// token_usage.db is a sibling file, not a table inside activity_logs.db, and
// the two are never joined in SQL — they meet in JS, in memory, which is
// already how this application works ("every page is a pure function of the
// rows held in memory"). Keeping them apart means the reader never opens the
// database the README calls a contract, and that deleting the usage file and
// re-running the reader puts you exactly back where you started.
//
// Everything here degrades to "no usage yet" rather than to an error: the file
// is absent until somebody runs usage_reader.py, and a dashboard that refuses
// to load because an optional cache is missing would be a worse failure than
// the missing cache.
class UsageDb {
  constructor() {
    this.db = null;
    this.rows = [];
    this.status = { state: 'unloaded', detail: 'not loaded yet', rows: 0 };
    this._stamp = null;
  }

  // Has the file changed since we last read it? A HEAD is a few hundred bytes;
  // the database itself is tens of megabytes, and the auto-poll runs every five
  // seconds. Without this check polling would re-download the whole cache
  // twelve times a minute to discover nothing had happened.
  async hasChanged() {
    try {
      const res = await fetch('token_usage.db', { method: 'HEAD', cache: 'no-store' });
      if (!res.ok) return this.status.state !== 'absent';
      const stamp = (res.headers.get('Last-Modified') || '') + '/' +
                    (res.headers.get('Content-Length') || '');
      return stamp !== this._stamp;
    } catch (e) {
      return false;
    }
  }

  async load() {
    let res;
    try {
      res = await fetch('token_usage.db', { cache: 'no-store' });
    } catch (e) {
      return this._fail('unreachable', 'token_usage.db could not be fetched (' + e.message + ')');
    }
    if (res.status === 404) {
      return this._fail('absent',
        'no token_usage.db yet — run `python usage_reader.py`, or use Rebuild usage');
    }
    if (!res.ok) return this._fail('unreachable', 'HTTP ' + res.status);

    const stamp = (res.headers.get('Last-Modified') || '') + '/' +
                  (res.headers.get('Content-Length') || '');
    let buf;
    try {
      buf = new Uint8Array(await res.arrayBuffer());
      const SQL = await ensureSqlJs();
      this.db = new SQL.Database(buf);
      this.rows = rowsFromResult(this.db.exec(
        'SELECT * FROM token_usage ORDER BY timestamp'));
    } catch (e) {
      // An empty file, a database with no token_usage table, or a half-written
      // one during a rebuild. None of these should take the dashboard down.
      return this._fail('unreadable', 'token_usage.db could not be read (' + e.message + ')');
    }

    this._stamp = stamp;
    this.status = {
      state: 'ok',
      rows: this.rows.length,
      bytes: buf.length,
      detail: this.rows.length.toLocaleString() + ' usage rows'
    };
    return this.rows;
  }

  _fail(state, detail) {
    this.db = null;
    this.rows = [];
    this._stamp = null;
    this.status = { state, detail, rows: 0 };
    return this.rows;
  }

  // The reader's own report of what it scanned, written beside the database by
  // usage_reader.py. This is what the source-transparency panel shows: which
  // parser ran, how many files it saw, what failed to load. Absent is fine.
  async loadReport() {
    try {
      const res = await fetch('token_usage.report.json', { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }
}

class LogDb {
  constructor() { this.db = null; this.name = 'Demo data'; }

  async open(file) {
    const SQL = await ensureSqlJs();
    const buf = new Uint8Array(await file.arrayBuffer());
    this.db = new SQL.Database(buf);
    this.name = file.name;
    return this.readAll();
  }

  async loadDefault() {
    // no-store: python -m http.server sends Last-Modified but no Cache-Control,
    // so Chrome applies heuristic freshness (~10% of the file's age) and can skip
    // revalidation entirely — a refresh would then return a stale database.
    const res = await fetch('activity_logs.db', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = new Uint8Array(await res.arrayBuffer());
    const SQL = await ensureSqlJs();
    this.db = new SQL.Database(buf);
    this.name = 'activity_logs.db';
    return this.readAll();
  }

  async loadSample() {
    // window.sampleLogs is populated by script/sample-logs.js (loaded via a
    // plain <script> tag so it works over file:// as well as http://).
    let rows = (window.sampleLogs && window.sampleLogs.length) ? window.sampleLogs : null;
    if (!rows) {
      // Fallback: try a dynamic import (works over http:// only)
      try {
        const mod = await import('../prototype/project/sample-logs.js');
        rows = mod.sampleLogs || MIN_SAMPLE;
      } catch (e) {
        rows = MIN_SAMPLE;
      }
    }
    // Build an in-memory SQLite database from the sample rows so that deletes,
    // saves, and reloads all work the same way they do with a real .db file.
    const SQL = await ensureSqlJs();
    this.db = dbFromRows(SQL, rows);
    this.name = 'Demo data (in-memory)';
    return this.readAll();
  }

  readAll() {
    if (!this.db) return [];
    const r = this.db.exec('SELECT * FROM logs ORDER BY timestamp DESC');
    return rowsFromResult(r);
  }

  deleteByIds(ids) {
    if (!this.db || !ids.length) return;
    const safe = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (!safe.length) return;
    this.db.exec(`DELETE FROM logs WHERE id IN (${safe.join(',')})`);
  }

  exportDb() {
    return this.db ? this.db.export() : null;
  }

  static async download(rows, name) {
    const SQL = await ensureSqlJs();
    const db = dbFromRows(SQL, rows);
    const data = db.export();
    const blob = new Blob([data], { type: 'application/x-sqlite3' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

window.LogDb = LogDb;
window.UsageDb = UsageDb;
})(window);
