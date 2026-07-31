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
  constructor() { super(); this._open = new Set(); }

  render() {
    const s = window.LogApp.state;
    const model = s.treeModel;
    if (!model?.repos?.length) return '<div class="empty">No data</div>';
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

  // §4.3 / §4.4 / §4.5 — inline log entry rows, compact vs roomy grid, selection highlight
  entryRows(t, s) {
    const rows = (t.logs || []).slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    if (!rows.length) return '<div class="empty" style="padding:10px">No entries</div>';
    const compact = !!s.selectedLog;
    const head = compact
      ? `<span>Time</span><span>Type</span><span>Entry</span>`
      : `<span>Time</span><span>Type</span><span>Agent</span><span>Entry</span><span>Level</span>`;
    const grid = compact ? 'entry-grid entry-grid-compact' : 'entry-grid entry-grid-roomy';
    let body = `<div class="${grid} entry-head">${head}</div>`;
    body += rows.map((l) => this.entryRow(l, compact, s)).join('');
    return body;
  }

  entryRow(l, compact, s) {
    const selected = s.selectedLog?.id === l.id;
    const selCls = selected ? ' entry-row-selected' : '';
    const title = esc(l.log_title || '');
    const snippet = l.log_description ? ` — ${esc(l.log_description)}` : '';
    if (compact) {
      return `
        <div class="${'entry-grid entry-row' + selCls}" data-id="${l.id}" style="cursor:pointer">
          <span class="entry-time mono">${fmtTs(l.timestamp)}</span>
          <span class="entry-type">${typeDot(l.log_type)}${esc(l.log_type)}</span>
          <span class="entry-text"><span class="entry-title">${title}</span><span class="entry-snippet">${snippet}</span></span>
        </div>
      `;
    }
    return `
      <div class="${'entry-grid entry-grid-roomy entry-row' + selCls}" data-id="${l.id}" style="cursor:pointer">
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
    // caret / tree-head toggle (expand/collapse entry rows + nested bodies)
    this.querySelectorAll('.tree-head[data-key]').forEach((h) => {
      const isTask = h.classList.contains('task-head');
      const toggle = (e) => {
        // never toggle when clicking the Time → button (it has its own handler)
        if (e.target.closest('[data-time]')) return;
        if (isTask) {
          // task: only the caret toggles; the title drills (data-drill)
          if (e.target.closest('[data-drill]')) return;
          if (!e.target.closest('[data-toggle]')) return;
        }
        const k = h.getAttribute('data-key');
        this._open.has(k) ? this._open.delete(k) : this._open.add(k);
        this.refresh();
      };
      h.onclick = toggle;
      // §4.7 — double-click drills and collapses this node
      h.ondblclick = (e) => {
        if (e.target.closest('[data-time]')) return;
        e.preventDefault();
        e.stopPropagation();
        const key = h.getAttribute('data-dbl');
        const repo = h.getAttribute('data-repo') || '';
        const branch = h.getAttribute('data-branch') || '';
        const task = h.getAttribute('data-task') || '';
        window.LogApp.drillCollapse(key, repo, branch, task);
      };
    });

    // single-click drill on task title
    this.querySelectorAll('[data-drill]').forEach((el) => {
      el.onclick = (e) => {
        e.stopPropagation();
        const d = JSON.parse(el.getAttribute('data-drill'));
        window.LogApp.setDrill(d);
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
        const log = (s.treeModel.repos || [])
          .flatMap((r) => r.branches).flatMap((b) => b.tasks)
          .flatMap((t) => t.logs || []).find((l) => l.id === id);
        if (log) window.LogApp.selectLog(log);
      };
    });
  }
}
customElements.define('log-tree', LogTree);
})(window);
