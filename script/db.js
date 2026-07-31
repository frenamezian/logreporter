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

async function ensureSqlJs() {
  if (window.initSqlJs) return window.initSqlJs;
  await loadScript(SQL_CDN);
  if (!window.initSqlJs) throw new Error('sql.js did not load');
  window.SQL = await window.initSqlJs({
    locateFile: (file) => (file === 'sql-wasm.wasm' ? WASM_CDN : file)
  });
  return window.SQL;
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
})(window);
