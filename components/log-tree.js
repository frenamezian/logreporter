(function (window) {
'use strict';
const LogComponent = window.LogComponent;
const { esc, fmt, bar, statusBadge, typeDot, fmtTs } = window.LRC;

// idle share as a rounded percentage of wall time (§4.6)
function idleShare(ms) {
  if (!ms || !ms.wall) return 0;
  return Math.round((ms.idle / ms.wall) * 100);
}

class LogTree extends LogComponent {
  constructor() { super(); }

  // Open state persists on LogApp.state so it survives shell re-renders
  get _open() {
    if (!window.LogApp.state.treeOpen) window.LogApp.state.treeOpen = new Set();
    return window.LogApp.state.treeOpen;
  }

  render() {
    const s = window.LogApp.state;
    // Use the drill-applied model so the hierarchy stays consistent with every
    // other panel (chronology, where-time-goes, metrics). The navigation tree
    // in the sidebar keeps using treeModel (un-drilled) so siblings stay visible.
    const model = s.model;
    if (!model?.repos?.length) return '<div class="empty">No data</div>';
    // Auto-expand the drilled path so the user sees the entries immediately
    const d = s.drill || {};
    if (d.repo) {
      model.repos.forEach((r) => {
        this._open.add('r:' + r.name);
        if (d.branch || d.task || d.agent) {
          r.branches.forEach((b) => {
            this._open.add('b:' + r.name + '|' + b.name);
            if (d.task || d.agent) {
              b.tasks.forEach((t) => this._open.add('t:' + r.name + '|' + b.name + '|' + t.title));
            }
          });
        }
      });
    }
    // AppShell renders the breadcrumb strip; LogTree only renders tree content.
    return `${this.legend()}${model.repos.map((r) => this.repoCard(r, s)).join('')}`;
  }

  // §4.2 — legend row with color swatches + Expand all / Collapse all buttons
  legend() {
    const sw = (label, cls) => `<span class="legend-sw"><span class="legend-dot ${cls}"></span>${label}</span>`;
    return `
      <div class="tree-legend">
        <span class="legend-swatches">
          ${sw('Activity', 'activity')}
          ${sw('Issue', 'issue')}
          ${sw('Decision', 'decision')}
          ${sw('GitHub', 'github')}
          ${sw('Idle', 'idle')}
        </span>
        <span class="legend-actions">
          <button class="btn btn-secondary tree-legend-btn" data-expand-all="1">Expand all</button>
          <button class="btn btn-secondary tree-legend-btn" data-collapse-all="1">Collapse all</button>
        </span>
      </div>
    `;
  }

  repoCard(r, s) {
    const key = 'r:' + r.name;
    const open = this._open.has(key);
    const ish = idleShare(r.ms);
    return `
      <div class="tree-card">
        <div class="tree-head" data-key="${esc(key)}" data-dbl="${esc(key)}" data-repo="${esc(r.name)}">
          <span class="caret">${open ? '▾' : '▸'}</span>
          <span class="name">${esc(r.name)}</span>
          <span class="meta">${r.branches.length} branches · ${fmt(r.ms.wall)}${ish ? ' · ' + ish + '% idle' : ''}</span>
          <div style="width:120px">${bar(r.ms, Math.max(r.ms.wall, 1))}</div>
          <span class="tree-badges">${this.badges(r.ms)}</span>
          <button class="btn btn-secondary time-btn" data-time='{"repo":"${esc(r.name)}"}'>Time →</button>
        </div>
        <div class="tree-body" ${open ? '' : 'hidden'}>
          ${r.branches.map((b) => this.branchBlock(r, b, s)).join('')}
        </div>
      </div>
    `;
  }

  branchBlock(r, b, s) {
    const key = 'b:' + r.name + '|' + b.name;
    const open = this._open.has(key);
    const ish = idleShare(b.ms);
    return `
      <div class="tree-head branch-head" data-key="${esc(key)}" data-dbl="${esc(key)}" data-repo="${esc(r.name)}" data-branch="${esc(b.name)}" style="padding-left:28px">
        <span class="caret">${open ? '▾' : '▸'}</span>
        <span class="name mono">${esc(b.name)}</span>
        <span class="meta">${b.tasks.length} tasks · ${fmt(b.ms.wall)}${ish ? ' · ' + ish + '% idle' : ''}</span>
        <div style="width:120px">${bar(b.ms, Math.max(b.ms.wall, 1))}</div>
        <span class="tree-badges">${this.badges(b.ms)}</span>
        <button class="btn btn-secondary time-btn" data-time='{"repo":"${esc(r.name)}","branch":"${esc(b.name)}"}'>Time →</button>
      </div>
      <div class="tree-body" ${open ? '' : 'hidden'} style="padding-left:28px">
        ${b.tasks.map((t) => this.taskBlock(r, b, t, s)).join('')}
      </div>
    `;
  }

  taskBlock(r, b, t, s) {
    const key = 't:' + r.name + '|' + b.name + '|' + t.title;
    const open = this._open.has(key);
    const ish = idleShare(t.ms);
    const drill = JSON.stringify({ repo: r.name, branch: b.name, task: t.title });
    return `
      <div class="tree-task">
        <div class="tree-head task-head" data-key="${esc(key)}" data-dbl="${esc(key)}" data-repo="${esc(r.name)}" data-branch="${esc(b.name)}" data-task="${esc(t.title)}" style="padding-left:40px">
          <span class="caret" data-toggle="1">${open ? '▾' : '▸'}</span>
          <span class="name" data-drill='${esc(drill)}'>${esc(t.title)} ${statusBadge(t.status)}</span>
          <span class="meta">${t.ms.logs} entries · ${fmt(t.ms.wall)} · ${(t.agents || []).length} agents</span>
          <div style="width:160px">${bar(t.ms, Math.max(t.ms.wall, 1))}</div>
          <span class="tree-badges">${this.badges(t.ms)}</span>
          ${ish ? `<span class="tag tag-outline">${ish}% idle</span>` : ''}
          <button class="btn btn-secondary time-btn" data-time='${esc(drill)}'>Time →</button>
        </div>
        <div class="tree-body entry-body" ${open ? '' : 'hidden'}>
          ${open ? this.entryRows(t, s) : ''}
        </div>
      </div>
    `;
  }

  // §4.3 / §4.4 / §4.5 — inline log entry rows, always showing Agent column
  entryRows(t, s) {
    const rows = (t.logs || []).slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    if (!rows.length) return '<div class="empty" style="padding:10px">No entries</div>';
    const head = `<span>Time</span><span>Type</span><span>Agent</span><span>Entry</span><span>Level</span>`;
    let body = `<div class="entry-grid entry-head">${head}</div>`;
    body += rows.map((l) => this.entryRow(l, s)).join('');
    return body;
  }

  entryRow(l, s) {
    const selected = s.selectedLog?.id === l.id;
    const selCls = selected ? ' entry-row-selected' : '';
    const title = esc(l.log_title || '');
    const snippet = l.log_description ? ` — ${esc(l.log_description)}` : '';
    return `
      <div class="${'entry-grid entry-row' + selCls}" data-id="${l.id}" style="cursor:pointer">
        <span class="entry-time mono">${fmtTs(l.timestamp)}</span>
        <span class="entry-type">${typeDot(l.log_type)}${esc(l.log_type)}</span>
        <span class="entry-agent mono">${esc(l.agent_name || '—')}</span>
        <span class="entry-text"><span class="entry-title">${title}</span><span class="entry-snippet">${snippet}</span></span>
        <span class="entry-level">${esc(l.log_level || '')}</span>
      </div>
    `;
  }

  // §4.6 — row badges: [N logs] and issue counts
  badges(ms) {
    if (!ms) return '';
    const out = [];
    if (ms.logs) out.push(`<span class="tag tag-outline">${ms.logs} logs</span>`);
    if (ms.issues) out.push(`<span class="tag tag-issue">${ms.issues} issues</span>`);
    return out.join('');
  }

  attach() {
    // Single click on any tree-head: expand the node + drill to it
    // Double click on any tree-head: collapse the node + drill to it
    // A click timer is used so the single-click action (which triggers a full
    // re-render via setDrill) is delayed; if a dblclick arrives first, the
    // timer is cancelled and the collapse action runs instead. Without this,
    // the re-render would destroy the DOM element between the two clicks and
    // dblclick would never fire.
    const DBLCLICK_MS = 220;
    this._clickTimers = this._clickTimers || new Map();
    this.querySelectorAll('.tree-head[data-key]').forEach((h) => {
      const k = h.getAttribute('data-key');
      const repo = h.getAttribute('data-repo') || '';
      const branch = h.getAttribute('data-branch') || '';
      const task = h.getAttribute('data-task') || '';
      const buildDrill = () => {
        const drill = {};
        if (repo) drill.repo = repo;
        if (branch) drill.branch = branch;
        if (task) drill.task = task;
        return drill;
      };

      h.onclick = (e) => {
        if (e.target.closest('[data-time]')) return;
        e.stopPropagation();
        // Delay the single-click action to see if a dblclick follows
        if (this._clickTimers.has(k)) clearTimeout(this._clickTimers.get(k));
        this._clickTimers.set(k, setTimeout(() => {
          this._clickTimers.delete(k);
          this._open.add(k);
          window.LogApp.setDrill(buildDrill());
        }, DBLCLICK_MS));
      };

      h.ondblclick = (e) => {
        if (e.target.closest('[data-time]')) return;
        e.preventDefault();
        e.stopPropagation();
        // Cancel the pending single-click action
        if (this._clickTimers.has(k)) { clearTimeout(this._clickTimers.get(k)); this._clickTimers.delete(k); }
        this._open.delete(k);
        window.LogApp.setDrill(buildDrill());
      };
    });

    // §4.1 — Time → buttons: set drill scope and switch to "Where time goes"
    this.querySelectorAll('[data-time]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const d = JSON.parse(btn.getAttribute('data-time'));
        window.LogApp.setDrill(d);
        window.LogApp.setPage('timegoes');
      };
    });

    // §4.2 — Expand all / Collapse all
    this.querySelectorAll('[data-expand-all]').forEach((b) => {
      b.onclick = () => window.LogApp.expandAll();
    });
    this.querySelectorAll('[data-collapse-all]').forEach((b) => {
      b.onclick = () => window.LogApp.collapseAll();
    });

    // §4.3 — entry row click selects the log and opens the detail panel
    this.querySelectorAll('.entry-row[data-id]').forEach((row) => {
      row.onclick = () => {
        const id = +row.getAttribute('data-id');
        const s = window.LogApp.state;
        const log = s.inScope.find((l) => l.id === id);
        if (log) window.LogApp.selectLog(log);
      };
    });
  }
}
customElements.define('log-tree', LogTree);
})(window);
