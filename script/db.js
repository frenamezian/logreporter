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
    const res = await fetch('activity_logs.db');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = new Uint8Array(await res.arrayBuffer());
    const SQL = await ensureSqlJs();
    this.db = new SQL.Database(buf);
    this.name = 'activity_logs.db';
    return this.readAll();
  }

  async loadSample() {
    try {
      const mod = await import('../prototype/project/sample-logs.js');
      return mod.sampleLogs || MIN_SAMPLE;
    } catch (e) {
      return MIN_SAMPLE;
    }
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
    // Note: this recreates a new in-memory DB from the rows, so original indexes etc are lost.
    const SQL = await ensureSqlJs();
    const db = new SQL.Database();
    db.run(`CREATE TABLE logs (
      id INTEGER PRIMARY KEY, timestamp TEXT, repo_name TEXT, branch_name TEXT,
      trace_id TEXT, parent_trace_id TEXT, task_title TEXT, agent_name TEXT, agent_path TEXT,
      log_title TEXT, log_description TEXT, log_type TEXT, log_level TEXT, status TEXT,
      priority TEXT, user_id TEXT, tags TEXT, error_details TEXT, resolved_by TEXT,
      resolution_time TEXT, performance_metrics TEXT, input_output_hash TEXT
    );`);
    const cols = [
      'id','timestamp','repo_name','branch_name','trace_id','parent_trace_id','task_title',
      'agent_name','agent_path','log_title','log_description','log_type','log_level','status',
      'priority','user_id','tags','error_details','resolved_by','resolution_time','performance_metrics','input_output_hash'
    ];
    const stmt = db.prepare(`INSERT INTO logs (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
    rows.forEach((r) => stmt.run(cols.map((c) => r[c] ?? null)));
    stmt.free();
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
