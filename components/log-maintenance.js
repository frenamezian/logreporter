(function (window) {
'use strict';
const LogComponent = window.LogComponent;
const { esc } = window.LRC;

// Filter keys shown as active-filter chips, matching the left sidebar
const FILTER_LABELS = [
  ['search', 'Search'], ['repo', 'Repo'], ['branch', 'Branch'], ['agent', 'Agent'],
  ['log_type', 'Type'], ['git', 'Git'], ['log_level', 'Level'], ['status', 'Status'],
  ['priority', 'Priority'], ['from', 'From'], ['to', 'To']
];

class LogMaintenance extends LogComponent {
  render() {
    const s = window.LogApp.state;
    // The delete scope inherits the same filters and drill as the left sidebar
    // (s.inScope), with an optional "older than" date as the only delete-specific
    // refinement. This keeps the maintenance panel consistent with every other
    // panel — no independent, hidden scope.
    const rows = s.inScope;
    const allRows = s.rows;
    const olderThan = this._olderThan || '';
    const matched = olderThan ? rows.filter((l) => {
      const t = l.timestamp?.replace(' ', 'T') + 'Z';
      return t && new Date(t) < new Date(olderThan + 'T00:00:00Z');
    }) : rows;
    const n = matched.length;
    const total = allRows.length;
    const repoCount = new Set(matched.map((l) => l.repo_name)).size;

    // Active filter + drill summary (read-only chips reflecting the left sidebar)
    const filterChips = this._filterChips(s);
    const drillChips = this._drillChips(s);

    // stored-volume table (scoped to the current drill/filter)
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
        <p class="maint-note">Uses the same filters and drill scope as the left panel.</p>
        ${filterChips || drillChips ? `<div class="maint-scope-summary">${drillChips}${filterChips}</div>` : '<p class="maint-no-filter">No filters active — all logs in scope.</p>'}
        <div class="maint-del-extra">
          <label>Older than</label>
          <input type="date" data-del="olderThan" value="${esc(olderThan)}">
        </div>
        <div class="maint-del-row">
          <button class="primary" data-delete="1"${n ? '' : ' disabled'}>Delete ${n} logs</button>
          <span data-match class="maint-match">${n} of ${total} logs match${n ? ` in ${repoCount} ${repoCount === 1 ? 'repository' : 'repositories'}` : ''}</span>
        </div>
      </div>
      <div class="tree-card" style="padding:14px;margin-top:12px">
        <h4>Export</h4>
        <p class="maint-note">Honours the page filters and drill scope, ${rows.length} rows in scope.</p>
        <div class="maint-export-row">
          <button class="small" data-csv="1">Export CSV (filtered)</button>
          <button class="small" data-json="1">Export JSON (filtered)</button>
          <button class="small" data-save="1">Save database copy</button>
        </div>
      </div>
      <h4 class="maint-vol-head">Stored volume <span class="maint-vol-note">(scoped to the current filter and drill)</span></h4>
      <table class="log-table">
        <thead><tr><th>Repo</th><th>Branch</th><th>Logs</th><th>Issues</th><th>Oldest</th><th>Newest</th></tr></thead>
        <tbody>${vols.map((v) => `<tr><td>${esc(v.repo)}</td><td>${esc(v.branch)}</td><td>${v.n}</td><td>${v.issues}</td><td class="mono">${v.oldest}</td><td class="mono">${v.newest}</td></tr>`).join('')}</tbody>
      </table>
      ${confirm ? this._confirmModal(confirm) : ''}
    `;
  }

  // Read-only chips showing the current drill scope (from the nav tree / breadcrumb)
  _drillChips(s) {
    const d = s.drill || {};
    const parts = [];
    if (d.repo) parts.push('Repo: ' + d.repo);
    if (d.branch) parts.push('Branch: ' + d.branch);
    if (d.task) parts.push('Task: ' + d.task);
    if (d.agent) parts.push('Agent: ' + d.agent);
    if (!parts.length) return '';
    return '<span class="maint-chip-group">' + parts.map((p) => `<span class="chip maint-chip">${esc(p)}</span>`).join('') + '</span>';
  }

  // Read-only chips showing the active left-sidebar filters
  _filterChips(s) {
    const f = s.filter || {};
    const chips = [];
    FILTER_LABELS.forEach(([k, label]) => {
      const v = f[k];
      if (Array.isArray(v) ? v.length : v) {
        if (Array.isArray(v)) {
          v.forEach((val) => chips.push(label + ': ' + val));
        } else {
          chips.push(label + ': ' + v);
        }
      }
    });
    if (!chips.length) return '';
    return '<span class="maint-chip-group">' + chips.map((c) => `<span class="chip maint-chip">${esc(c)}</span>`).join('') + '</span>';
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
    // "Older than" date — the only delete-specific control
    const olderInput = this.querySelector('[data-del="olderThan"]');
    if (olderInput) {
      olderInput.onchange = () => {
        this._olderThan = olderInput.value;
        this.refresh();
      };
    }

    // delete button -> open custom confirm modal
    const delBtn = this.querySelector('[data-delete]');
    if (delBtn) {
      delBtn.onclick = () => {
        const s = window.LogApp.state;
        const olderThan = this._olderThan || '';
        const matched = olderThan ? s.inScope.filter((l) => {
          const t = l.timestamp?.replace(' ', 'T') + 'Z';
          return t && new Date(t) < new Date(olderThan + 'T00:00:00Z');
        }) : s.inScope;
        if (!matched.length) return;
        const count = matched.length;
        const repos = new Set(matched.map((l) => l.repo_name)).size;
        window.LogApp.state.confirm = { olderThan, count, repos };
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
        window.LogApp.state.confirm = null;
        window.LogApp.deleteLogs(c);
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
