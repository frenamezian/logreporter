(function (window) {
'use strict';
const LogComponent = window.LogComponent;
const { esc, fmt, bar, statusBadge } = window.LRC;

class LogTree extends LogComponent {
  constructor() { super(); this._open = new Set(); }
  render() {
    const s = window.LogApp.state;
    const model = s.treeModel;
    if (!model?.repos?.length) return '<div class="empty">No data</div>';
    return `<div class="page-title">Hierarchy ${this.bread()}</div>${model.repos.map((r) => this.repoCard(r)).join('')}`;
  }
  bread() {
    const d = window.LogApp.state.drill;
    if (!d.repo) return '';
    const parts = [d.repo, d.branch, d.task].filter(Boolean);
    return '— ' + parts.map(esc).join(' / ');
  }
  repoCard(r) {
    const open = this._open.has('r:' + r.name);
    return `
      <div class="tree-card">
        <div class="tree-head" data-key="r:${esc(r.name)}">
          <span class="caret">${open ? '▾' : '▸'}</span>
          <span class="name">${esc(r.name)}</span>
          <span class="meta">${r.branches.length} branches · ${fmt(r.ms.wall)} · ${r.ms.issues} issues</span>
          <div style="width:120px">${bar(r.ms, Math.max(r.ms.wall, 1))}</div>
        </div>
        <div class="tree-body" ${open ? '' : 'hidden'}>
          ${r.branches.map((b) => this.branchBlock(r, b)).join('')}
        </div>
      </div>
    `;
  }
  branchBlock(r, b) {
    const open = this._open.has(`b:${esc(r.name)}|${esc(b.name)}`);
    return `
      <div class="tree-head" style="padding-left:28px" data-key="b:${esc(r.name)}|${esc(b.name)}">
        <span class="caret">${open ? '▾' : '▸'}</span>
        <span class="name">${esc(b.name)}</span>
        <span class="meta">${b.tasks.length} tasks · ${fmt(b.ms.wall)}</span>
        <div style="width:120px">${bar(b.ms, Math.max(b.ms.wall, 1))}</div>
      </div>
      <div class="tree-body" ${open ? '' : 'hidden'} style="padding-left:28px">
        ${b.tasks.map((t) => this.taskBlock(t)).join('')}
      </div>
    `;
  }
  taskBlock(t) {
    return `
      <div class="bar-row" data-drill='{"repo":"${esc(t.repo)}","branch":"${esc(t.branch)}","task":"${esc(t.title)}"}' style="cursor:pointer">
        <div class="bar-label">${esc(t.title)} ${statusBadge(t.status)}</div>
        <div style="width:220px">${bar(t.ms, Math.max(t.ms.wall, 1))}</div>
        <div class="bar-val">${fmt(t.ms.wall)}</div>
        <div class="bar-val">${t.ms.idle ? fmt(t.ms.idle) + ' idle' : ''}</div>
      </div>
    `;
  }
  attach() {
    this.querySelectorAll('.tree-head').forEach((h) => {
      h.onclick = () => {
        const k = h.getAttribute('data-key');
        this._open.has(k) ? this._open.delete(k) : this._open.add(k);
        this.refresh();
      };
    });
    this.querySelectorAll('[data-drill]').forEach((el) => {
      el.onclick = () => {
        const d = JSON.parse(el.getAttribute('data-drill'));
        window.LogApp.setDrill(d);
      };
    });
  }
}
customElements.define('log-tree', LogTree);
})(window);
