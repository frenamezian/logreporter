(function (window) {
'use strict';
const LogComponent = window.LogComponent;
const { esc, fmt } = window.LRC;

// Filter keys that render as dismissible chips, in display order.
const CHIP_KEYS = [
  ['search', 'Search'],
  ['repo', 'Repository'],
  ['branch', 'Branch'],
  ['agent', 'Agent'],
  ['log_type', 'Type'],
  ['git', 'Git'],
  ['log_level', 'Level'],
  ['status', 'Status'],
  ['priority', 'Priority'],
  ['from', 'From'],
  ['to', 'To']
];

class LogFilters extends LogComponent {
  constructor() {
    super();
    // Per-node expand/collapse state for the navigation tree (independent of
    // the main log-tree component). Keys: n:repo, b:repo|branch, t:repo|branch|task.
    this._openNav = new Set();
  }

  render() {
    const s = window.LogApp.state;
    const rows = s.rows;

    // Branch options are scoped to the selected repository (§3.3): when a repo
    // is selected, branches come only from that repo's rows, not all rows.
    const branchRows = s.filter.repo ? rows.filter((l) => l.repo_name === s.filter.repo) : rows;
    const opt = (key, label, src) => {
      const vals = window.LogApp.unique(src || rows, key);
      return `<option value="">${esc(label)}</option>` + vals.map((v) => `<option value="${esc(v)}" ${s.filter[key] === v ? 'selected' : ''}>${esc(v)}</option>`).join('');
    };
    const types = ['start', 'end', 'activity', 'issue', 'decision', 'github'];
    const levels = ['debug', 'info', 'warning', 'error'];
    const statuses = ['pending', 'in_progress', 'failed', 'completed'];
    const priorities = ['low', 'medium', 'high', 'critical'];
    const gitActions = window.LR.GIT_ACTIONS || [];

    const chips = this.renderChips(s.filter);
    const hasFilters = CHIP_KEYS.some(([k]) => s.filter[k]);

    return `
      <div class="filter-group">
        <h4 class="section-head" data-toggle="filters"><span class="caret">${s.panels.filters ? '▾' : '▸'}</span>Filters</h4>
        <input placeholder="Search title / description" data-key="search" value="${esc(s.filter.search)}">
        <div class="filter-body" ${s.panels.filters ? '' : 'hidden'}>
          <select data-key="repo">${opt('repo_name', 'Repository')}</select>
          <select data-key="branch">${opt('branch_name', 'Branch', branchRows)}</select>
          <select data-key="agent">${opt('agent_path', 'Agent')}</select>
          <select data-key="log_type"><option value="">Log type</option>${types.map((t) => `<option value="${t}" ${s.filter.log_type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <select data-key="git"><option value="">Git action</option>${gitActions.map((t) => `<option value="${t}" ${s.filter.git === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <select data-key="log_level"><option value="">Level</option>${levels.map((t) => `<option value="${t}" ${s.filter.log_level === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <select data-key="status"><option value="">Status</option>${statuses.map((t) => `<option value="${t}" ${s.filter.status === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <select data-key="priority"><option value="">Priority</option>${priorities.map((t) => `<option value="${t}" ${s.filter.priority === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <div class="filter-row"><label>From</label><input type="date" data-key="from" value="${esc(s.filter.from)}"></div>
          <div class="filter-row"><label>To</label><input type="date" data-key="to" value="${esc(s.filter.to)}"></div>
          ${chips}
          ${hasFilters ? '<button class="small" data-clear-all="1" style="width:100%">Clear all filters</button>' : ''}
        </div>
      </div>
      <div class="filter-group">
        <h4 class="section-head" data-toggle="nav"><span class="caret">${s.panels.nav ? '▾' : '▸'}</span>Navigation</h4>
        <div class="filter-body" ${s.panels.nav ? '' : 'hidden'}>
          ${this.renderNav(s.treeModel)}
          <button class="small" data-drill-clear="1" style="width:100%">All repositories</button>
        </div>
      </div>
    `;
  }

  // §3.2 — dismissible chips for each active (non-empty) filter.
  renderChips(filter) {
    const active = CHIP_KEYS.filter(([k]) => filter[k]);
    if (!active.length) return '';
    const chips = active.map(([k, label]) => {
      const val = filter[k];
      return `<button class="chip" data-chip="${esc(k)}" title="Clear ${esc(label)}">${esc(label)}: ${esc(val)} ✕</button>`;
    }).join('');
    return `<div class="chips">${chips}</div>`;
  }

  // §3.4 — navigation tree with per-node carets, meta info, double-click
  // drill+collapse, and agent leaves under tasks.
  renderNav(model) {
    if (!model?.repos?.length) return '<div class="empty">No data</div>';
    const open = this._openNav;
    const drill = window.LogApp.state.drill || {};
    // A node is "active" when the current drill targets exactly that node.
    const active = (d) => {
      return (d.repo || '') === (drill.repo || '') &&
        (d.branch || '') === (drill.branch || '') &&
        (d.task || '') === (drill.task || '') &&
        (d.agent || '') === (drill.agent || '');
    };
    const caret = (key, hasKids) => {
      if (!hasKids) return '<span class="caret"></span>';
      const isOpen = open.has(key);
      return `<button class="nav-caret" data-nav-toggle="${esc(key)}">${isOpen ? '▾' : '▸'}</button>`;
    };
    // HTML-escape JSON for safe embedding in a single-quoted attribute.
    const jattr = (d) => esc(JSON.stringify(d));

    return `<ul class="nav-tree">${model.repos.map((r) => {
      const rk = 'n:' + r.name;
      const rOpen = open.has(rk);
      const rDrill = { repo: r.name };
      return `
        <li>
          <div class="node${active(rDrill) ? ' active' : ''}" data-drill='${jattr(rDrill)}' data-nav-key="${esc(rk)}">
            ${caret(rk, true)}
            <span class="node-label">${esc(r.name)}</span>
            <span class="node-meta">${esc(fmt(r.ms.wall))}</span>
          </div>
          ${rOpen ? `<ul>${r.branches.map((b) => {
            const bk = 'b:' + r.name + '|' + b.name;
            const bOpen = open.has(bk);
            const bDrill = { repo: r.name, branch: b.name };
            return `
              <li>
                <div class="node${active(bDrill) ? ' active' : ''}" data-drill='${jattr(bDrill)}' data-nav-key="${esc(bk)}">
                  ${caret(bk, true)}
                  <span class="node-label mono">${esc(b.name)}</span>
                  <span class="node-meta">${esc(fmt(b.ms.wall))}</span>
                </div>
                ${bOpen ? `<ul>${b.tasks.map((t) => {
                  const tk = 't:' + r.name + '|' + b.name + '|' + t.title;
                  const tOpen = open.has(tk);
                  const tDrill = { repo: r.name, branch: b.name, task: t.title };
                  const agentCount = (t.agents || []).length;
                  return `
                    <li>
                      <div class="node${active(tDrill) ? ' active' : ''}" data-drill='${jattr(tDrill)}' data-nav-key="${esc(tk)}">
                        ${caret(tk, agentCount > 0)}
                        <span class="node-label">${esc(t.title)}</span>
                        <span class="node-meta">${esc(String(t.ms.logs || 0))}</span>
                      </div>
                      ${tOpen && agentCount ? `<ul>${(t.agents || []).map((path) => {
                        const aDrill = { repo: r.name, branch: b.name, task: t.title, agent: path };
                        const cnt = (t.logs || []).filter((l) => (l.agent_path || l.agent_name) === path).length;
                        return `<li><div class="node leaf${active(aDrill) ? ' active' : ''}" data-drill='${jattr(aDrill)}'><span class="caret"></span><span class="node-label mono">${esc(path)}</span><span class="node-meta">${esc(String(cnt))}</span></div></li>`;
                      }).join('')}</ul>` : ''}
                    </li>
                  `;
                }).join('')}</ul>` : ''}
              </li>
            `;
          }).join('')}</ul>` : ''}
        </li>
      `;
    }).join('')}</ul>`;
  }

  // Toggle a nav node's open state and re-render locally (no LogApp update).
  _toggleNav(key) {
    if (this._openNav.has(key)) this._openNav.delete(key);
    else this._openNav.add(key);
    this.refresh();
  }

  attach() {
    this.querySelectorAll('.section-head').forEach((h) => {
      h.onclick = () => {
        const which = h.getAttribute('data-toggle');
        if (which === 'filters') window.LogApp.toggleFilters();
        else window.LogApp.toggleNav();
      };
    });
    this.querySelectorAll('[data-key]').forEach((el) => {
      const key = el.getAttribute('data-key');
      el.oninput = el.onchange = () => window.LogApp.setFilter(key, el.value);
    });
    // §3.2 — clear a single filter via its chip.
    this.querySelectorAll('[data-chip]').forEach((el) => {
      el.onclick = () => window.LogApp.setFilter(el.getAttribute('data-chip'), '');
    });
    const clearAll = this.querySelector('[data-clear-all]');
    if (clearAll) clearAll.onclick = () => {
      const f = window.LogApp.state.filter;
      Object.keys(f).forEach((k) => { f[k] = ''; });
      // one update via an arbitrary key (also clears drill)
      window.LogApp.setFilter('search', '');
    };
    // §3.4 — per-node caret toggles.
    this.querySelectorAll('[data-nav-toggle]').forEach((el) => {
      el.onclick = (e) => {
        e.stopPropagation();
        this._toggleNav(el.getAttribute('data-nav-toggle'));
      };
    });
    // §3.4 — single click drills; double-click drills AND collapses the node.
    this.querySelectorAll('[data-drill]').forEach((el) => {
      el.onclick = (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('nav-caret')) return;
        const d = JSON.parse(el.getAttribute('data-drill'));
        window.LogApp.setDrill(d);
      };
      el.ondblclick = () => {
        const key = el.getAttribute('data-nav-key');
        if (key) this._openNav.delete(key);
        const d = JSON.parse(el.getAttribute('data-drill'));
        window.LogApp.drillCollapse(key, d.repo, d.branch, d.task);
      };
    });
    this.querySelector('[data-drill-clear]').onclick = () => window.LogApp.clearDrill();
  }
}
customElements.define('log-filters', LogFilters);
})(window);
