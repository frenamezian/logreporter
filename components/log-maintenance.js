(function (window) {
'use strict';
const LogComponent = window.LogComponent;
const { esc } = window.LRC;

const LOG_TYPES = ['start', 'end', 'activity', 'issue', 'decision', 'github'];

class LogMaintenance extends LogComponent {
  render() {
    const s = window.LogApp.state;
    const rows = s.rows;
    const repos = window.LogApp.unique(rows, 'repo_name');
    const branches = window.LogApp.unique(rows, 'branch_name');
    const scope = this._scope || (this._scope = {});
    const matched = window.LogApp.scopeCount(scope);
    const n = matched.length;
    const total = rows.length;
    const repoCount = new Set(matched.map((l) => l.repo_name)).size;

    // stored-volume table
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

    const confirm = s.confirm;

    return `
      <div class="tree-card" style="padding:14px">
        <h4>Delete logs</h4>
        <p class="maint-note">Scope deletion independently of page filters.</p>
        <div class="maint-scope-grid">
          <select data-del="repo"><option value="">Repository</option>${repos.map((r) => `<option value="${esc(r)}"${scope.repo === r ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select>
          <select data-del="branch"><option value="">Branch</option>${branches.map((r) => `<option value="${esc(r)}"${scope.branch === r ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select>
          <input type="date" data-del="olderThan" value="${esc(scope.olderThan || '')}" placeholder="Older than">
          <select data-del="log_type"><option value="">Log type</option>${LOG_TYPES.map((t) => `<option value="${t}"${scope.log_type === t ? ' selected' : ''}>${t}</option>`).join('')}</select>
        </div>
        <div class="maint-del-row">
          <button class="primary" data-delete="1"${n ? '' : ' disabled'}>Delete ${n} logs</button>
          <span data-match class="maint-match">${n} of ${total} logs match this scope${n ? ` in ${repoCount} ${repoCount === 1 ? 'repository' : 'repositories'}` : ''}</span>
        </div>
      </div>
      <div class="tree-card" style="padding:14px;margin-top:12px">
        <h4>Export</h4>
        <p class="maint-note">Honours the page filters and drill scope, ${window.LogApp.state.rows.length} rows available.</p>
        <div class="maint-export-row">
          <button class="small" data-csv="1">Export CSV (filtered)</button>
          <button class="small" data-json="1">Export JSON (filtered)</button>
          <button class="small" data-save="1">Save database copy</button>
        </div>
      </div>
      <h4 class="maint-vol-head">Stored volume <span class="maint-vol-note">(always the whole database, never the scope)</span></h4>
      <table class="log-table">
        <thead><tr><th>Repo</th><th>Branch</th><th>Logs</th><th>Issues</th><th>Oldest</th><th>Newest</th></tr></thead>
        <tbody>${vols.map((v) => `<tr><td>${esc(v.repo)}</td><td>${esc(v.branch)}</td><td>${v.n}</td><td>${v.issues}</td><td class="mono">${v.oldest}</td><td class="mono">${v.newest}</td></tr>`).join('')}</tbody>
      </table>
      ${confirm ? this._confirmModal(confirm) : ''}
    `;
  }

  _confirmModal(confirm) {
    const c = confirm;
    const repoWord = c.repos === 1 ? 'repository' : 'repositories';
    return `
      <div class="confirm-overlay" data-confirm-overlay>
        <div class="confirm-modal">
          <h4 class="confirm-title">Delete ${c.count} logs?</h4>
          <p class="confirm-body">${c.count} logs in ${c.repos} ${repoWord} will be removed. This cannot be undone.</p>
          <div class="confirm-actions">
            <button class="small" data-confirm-cancel>Cancel</button>
            <button class="primary small" data-confirm-delete>Delete ${c.count} logs</button>
          </div>
        </div>
      </div>
    `;
  }

  attach() {
    const scope = this._scope || (this._scope = {});

    // scope controls -> update match count + button label live
    this.querySelectorAll('[data-del]').forEach((el) => {
      el.onchange = () => {
        scope[el.getAttribute('data-del')] = el.value;
        this.refresh();
      };
    });

    // delete button -> open custom confirm modal (§8.1)
    const delBtn = this.querySelector('[data-delete]');
    if (delBtn) {
      delBtn.onclick = () => {
        const matched = window.LogApp.scopeCount(scope);
        if (!matched.length) return;
        const count = matched.length;
        const repos = new Set(matched.map((l) => l.repo_name)).size;
        window.LogApp.state.confirm = { scope: { ...scope }, count, repos };
        this.refresh();
      };
    }

    // confirm modal actions
    const cancelBtn = this.querySelector('[data-confirm-cancel]');
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        window.LogApp.state.confirm = null;
        this.refresh();
      };
    }
    const confirmDeleteBtn = this.querySelector('[data-confirm-delete]');
    if (confirmDeleteBtn) {
      confirmDeleteBtn.onclick = () => {
        const c = window.LogApp.state.confirm;
        if (!c) return;
        // clear confirm first, then delete (lead will update deleteLogs to
        // skip the browser confirm() once state.confirm flow is wired in app.js)
        window.LogApp.state.confirm = null;
        window.LogApp.deleteLogs(c.scope);
      };
    }
    // click on overlay backdrop cancels
    const overlay = this.querySelector('[data-confirm-overlay]');
    if (overlay) {
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          window.LogApp.state.confirm = null;
          this.refresh();
        }
      };
    }

    // export buttons
    const csv = this.querySelector('[data-csv]');
    if (csv) csv.onclick = () => window.LogApp.exportCsv();
    const json = this.querySelector('[data-json]');
    if (json) json.onclick = () => window.LogApp.exportJson();
    const save = this.querySelector('[data-save]');
    if (save) save.onclick = () => window.LogApp.saveDb();
  }
}
customElements.define('log-maintenance', LogMaintenance);
})(window);
