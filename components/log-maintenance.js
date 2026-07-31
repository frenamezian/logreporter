(function (window) {
'use strict';
const LogComponent = window.LogComponent;
const { esc } = window.LRC;

class LogMaintenance extends LogComponent {
  render() {
    const s = window.LogApp.state;
    const rows = s.rows;
    const repos = window.LogApp.unique(rows, 'repo_name');
    const branches = window.LogApp.unique(rows, 'branch_name');
    const types = ['start', 'end', 'activity', 'issue', 'decision', 'github'];
    const byRepo = new Map();
    rows.forEach((l) => {
      const k = l.repo_name + '\0' + l.branch_name;
      if (!byRepo.has(k)) byRepo.set(k, { repo: l.repo_name, branch: l.branch_name, n: 0, issues: 0, oldest: l.timestamp, newest: l.timestamp });
      const v = byRepo.get(k);
      v.n++; if (l.log_type === 'issue') v.issues++;
      if (l.timestamp < v.oldest) v.oldest = l.timestamp;
      if (l.timestamp > v.newest) v.newest = l.timestamp;
    });
    const vols = Array.from(byRepo.values()).sort((a, b) => b.n - a.n);
    return `
      <div class="page-title">Maintenance</div>
      <div class="tree-card" style="padding:14px">
        <h4>Delete logs</h4>
        <p style="font-size:12px;color:var(--text-dim)">Scope deletion independently of page filters.</p>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0">
          <select data-del="repo"><option value="">Repository</option>${repos.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select>
          <select data-del="branch"><option value="">Branch</option>${branches.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select>
          <input type="date" data-del="olderThan" placeholder="Older than">
          <select data-del="log_type"><option value="">Log type</option>${types.map((t) => `<option value="${t}">${t}</option>`).join('')}</select>
        </div>
        <button class="primary" data-delete="1" style="margin-right:8px">Delete selected logs</button>
        <span data-match style="font-size:12px;color:var(--text-dim)">0 logs match</span>
      </div>
      <div class="tree-card" style="padding:14px;margin-top:12px">
        <h4>Export</h4>
        <button class="small" data-csv="1">Export CSV (filtered)</button>
        <button class="small" data-json="1">Export JSON (filtered)</button>
        <button class="small" data-save="1">Save database copy</button>
      </div>
      <h4 style="margin:14px 0 8px">Stored volume</h4>
      <table class="log-table">
        <thead><tr><th>Repo</th><th>Branch</th><th>Logs</th><th>Issues</th><th>Oldest</th><th>Newest</th></tr></thead>
        <tbody>${vols.map((v) => `<tr><td>${esc(v.repo)}</td><td>${esc(v.branch)}</td><td>${v.n}</td><td>${v.issues}</td><td class="mono">${v.oldest}</td><td class="mono">${v.newest}</td></tr>`).join('')}</tbody>
      </table>
    `;
  }
  attach() {
    const scope = {};
    this.querySelectorAll('[data-del]').forEach((el) => {
      el.onchange = () => {
        scope[el.getAttribute('data-del')] = el.value;
        const matched = window.LogApp.scopeCount(scope);
        const badge = this.querySelector('[data-match]');
        if (badge) badge.textContent = `${matched.length} logs match`;
      };
    });
    this.querySelector('[data-delete]').onclick = () => window.LogApp.deleteLogs(scope);
    this.querySelector('[data-csv]').onclick = () => window.LogApp.exportCsv();
    this.querySelector('[data-json]').onclick = () => window.LogApp.exportJson();
    this.querySelector('[data-save]').onclick = () => window.LogApp.saveDb();
  }
}
customElements.define('log-maintenance', LogMaintenance);
})(window);
