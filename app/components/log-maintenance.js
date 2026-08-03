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

// Hierarchy levels, in order. The volume table groups by the level just below
// the current drill scope, so drilling one step down always answers "and what
// is that count made of?".
const LEVELS = [
  { key: 'repo', label: 'Repo', of: (l) => l.repo_name || '—' },
  { key: 'branch', label: 'Branch', of: (l) => l.branch_name || '—' },
  { key: 'task', label: 'Task', of: (l) => l.task_title || 'Untitled task' },
  { key: 'agent', label: 'Agent path', of: (l) => l.agent_path || l.agent_name || '—' }
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

    const confirm = s.confirm;
    const usageStatus = (s.usageDb && s.usageDb.status) || { state: 'unloaded' };
    const usageRows = (s.usage || []).length;
    const usageReport = s.usageReport;
    const usageBusy = s.usageBusy;

    return `
      ${this._scopeBar(s)}
      <div class="maint-row">
        <div class="tree-card maint-card">
          <h4>Delete logs</h4>
          <p class="maint-note">Uses the same filters and drill scope as the left panel.</p>
          <div class="maint-card-mid">
            ${filterChips ? `<div class="maint-scope-summary">${filterChips}</div>` : '<p class="maint-no-filter">No filters active — all logs in scope.</p>'}
            <div class="maint-del-extra">
              <label>Older than</label>
              <input type="date" data-del="olderThan" value="${esc(olderThan)}">
            </div>
          </div>
          <div class="maint-card-actions">
            <span data-match class="maint-match">${n} of ${total} logs match${n ? ` in ${repoCount} ${repoCount === 1 ? 'repository' : 'repositories'}` : ''}</span>
            <button class="primary" data-delete="1"${n ? '' : ' disabled'}>Delete ${n} logs</button>
          </div>
        </div>
        <div class="tree-card maint-card">
          <h4>Token usage</h4>
          <p class="maint-note">Read from the session files your agents already write.
            This cache is disposable — every row can be re-derived, which is why
            it lives in <code>token_usage.db</code> and not in the log database.</p>
          <div class="maint-card-mid">
            <div class="maint-scope-summary">${
              usageStatus.state === 'ok'
                ? `${usageRows.toLocaleString()} requests cached${
                    usageReport ? ` · last read ${esc(usageReport.started || '?')} UTC` : ''}`
                : esc(usageStatus.detail || 'no usage cache')}</div>
          </div>
          <div class="maint-card-actions">
            <span class="maint-match">${usageBusy ? 'reading session files…' : ''}</span>
            <button class="small" data-usage-refresh="1"${usageBusy ? ' disabled' : ''}>Refresh usage</button>
            <button class="small" data-usage-rebuild="1"${usageBusy ? ' disabled' : ''}
              title="Drop the cache and every watermark, then re-read every session file from the beginning">Rebuild usage</button>
          </div>
        </div>
        <div class="tree-card maint-card">
          <h4>Export</h4>
          <p class="maint-note">Honours the page filters and drill scope, ${rows.length} rows in scope.</p>
          <div class="maint-card-mid"></div>
          <div class="maint-card-actions">
            <button class="small" data-csv="1">Export CSV (filtered)</button>
            <button class="small" data-json="1">Export JSON (filtered)</button>
            <button class="small" data-save="1">Save database copy</button>
          </div>
        </div>
      </div>
      ${this._volumeTable(rows, s)}
      ${confirm ? this._confirmModal(confirm) : ''}
    `;
  }

  // §7a — the scope trail, as clickable pills with chevrons, above everything
  // else on the page: it is what every count below is counting.
  _scopeBar(s) {
    const d = s.drill || {};
    const crumbs = [{ label: 'All repos', kind: '', drill: {} }];
    if (d.repo) crumbs.push({ label: d.repo, kind: 'Repo', drill: { repo: d.repo } });
    if (d.branch) crumbs.push({ label: d.branch, kind: 'Branch', drill: { repo: d.repo, branch: d.branch } });
    if (d.task) crumbs.push({ label: d.task, kind: 'Task', drill: { repo: d.repo, branch: d.branch, task: d.task } });
    if (d.agent) crumbs.push({ label: d.agent, kind: 'Agent', drill: { repo: d.repo, branch: d.branch, task: d.task, agent: d.agent } });
    const pills = crumbs.map((c, i) => `
      ${i ? '<span class="scope-chev">›</span>' : ''}
      <button class="scope-pill${i === crumbs.length - 1 ? ' current' : ''}" data-scope='${esc(JSON.stringify(c.drill))}'>
        ${c.kind ? `<span class="scope-pill-kind">${esc(c.kind)}</span>` : ''}${esc(c.label)}
      </button>`).join('');
    return `
      <div class="maint-scope-bar">
        <span class="scope-label">Scope</span>
        <div class="scope-trail">${pills}</div>
        <button class="small scope-reset" data-see-all="1"${crumbs.length > 1 ? '' : ' disabled'}>See all repos</button>
      </div>
    `;
  }

  // §7b — total in scope, broken down by the next level below the drill scope.
  // Columns above that level repeat the scope value; columns below it read
  // "All", because the row aggregates every value they could take.
  _volumeTable(rows, s) {
    const d = s.drill || {};
    // Deepest drilled level; group by the one under it (agent is the floor).
    let depth = 0;
    if (d.repo) depth = 1;
    if (d.branch) depth = 2;
    if (d.task) depth = 3;
    if (d.agent) depth = 3;
    const gi = Math.min(depth, LEVELS.length - 1);
    const level = LEVELS[gi];

    const groups = new Map();
    rows.forEach((l) => {
      const k = level.of(l);
      if (!groups.has(k)) groups.set(k, { k, n: 0, issues: 0, oldest: l.timestamp, newest: l.timestamp });
      const v = groups.get(k);
      v.n++;
      if (l.log_type === 'issue') v.issues++;
      if (l.timestamp < v.oldest) v.oldest = l.timestamp;
      if (l.timestamp > v.newest) v.newest = l.timestamp;
    });
    const vols = Array.from(groups.values()).sort((a, b) => b.n - a.n);

    const cells = (v) => LEVELS.map((lv, i) => {
      if (i === gi) return `<td>${esc(v.k)}</td>`;
      if (i > gi) return '<td class="dim">All</td>';
      return `<td class="dim">${esc(d[lv.key] || 'All')}</td>`;
    }).join('');

    const head = LEVELS.map((lv) => `<th>${lv.label}</th>`).join('');
    return `
      <h4 class="maint-vol-head">Total Log Count: ${rows.length}
        <span class="maint-vol-note">by ${esc(level.label.toLowerCase())}, within the current scope and filters</span>
      </h4>
      <table class="log-table">
        <thead><tr>${head}<th>Logs</th><th>Issues</th><th>Oldest</th><th>Newest</th></tr></thead>
        <tbody>${vols.length
          ? vols.map((v) => `<tr>${cells(v)}<td>${v.n}</td><td>${v.issues}</td><td class="mono">${v.oldest}</td><td class="mono">${v.newest}</td></tr>`).join('')
          : `<tr><td colspan="${LEVELS.length + 4}" class="dim">No logs in scope</td></tr>`}</tbody>
      </table>
    `;
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
    // Scope trail: a pill drills to that level, "See all repos" clears the
    // drill entirely — which also deselects the node in the navigation tree,
    // since that highlight is driven by the drill state.
    this.querySelectorAll('[data-scope]').forEach((pill) => {
      pill.onclick = () => window.LogApp.setDrill(JSON.parse(pill.getAttribute('data-scope')));
    });
    const seeAll = this.querySelector('[data-see-all]');
    if (seeAll) seeAll.onclick = () => window.LogApp.clearDrill();

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

    // Usage import. Refresh reads only what changed; Rebuild drops the cache
    // and every watermark first. Both are executed by serve.py — the page
    // cannot read ~/.claude/projects itself.
    const uref = this.querySelector('[data-usage-refresh]');
    if (uref) uref.onclick = () => window.LogApp.refreshUsage(false);
    const ureb = this.querySelector('[data-usage-rebuild]');
    if (ureb) ureb.onclick = () => window.LogApp.refreshUsage(true);
  }
}
customElements.define('log-maintenance', LogMaintenance);
})(window);
