(function (window) {
'use strict';
const LogComponent = window.LogComponent;
const { esc, fmt } = window.LRC;

// Dropdown filter keys that support multi-select, in display order.
const DROPDOWN_KEYS = [
  ['repo', 'repo_name', 'Repository'],
  ['branch', 'branch_name', 'Branch'],
  ['agent', 'agent_path', 'Agent'],
  ['log_type', null, 'Log type'],
  ['git', null, 'Git action'],
  ['log_level', null, 'Level'],
  ['status', null, 'Status'],
  ['priority', null, 'Priority']
];
const STATIC_OPTIONS = {
  log_type: ['start', 'end', 'activity', 'issue', 'decision', 'github'],
  git: window.LR.GIT_ACTIONS || [],
  log_level: ['debug', 'info', 'warning', 'error'],
  status: ['pending', 'in_progress', 'failed', 'completed'],
  priority: ['low', 'medium', 'high', 'critical']
};
// All filter keys for chip rendering
const CHIP_KEYS = [
  ['search', 'Search'],
  ...DROPDOWN_KEYS.map(([k, , label]) => [k, label]),
  ['from', 'From'],
  ['to', 'To']
];

// Count active filters (array = non-empty, string = non-empty)
function countActiveFilters(filter) {
  return CHIP_KEYS.filter(([k]) => {
    const v = filter[k];
    return Array.isArray(v) ? v.length > 0 : !!v;
  }).length;
}

class LogFilters extends LogComponent {
  constructor() {
    super();
    this._openDropdown = null; // which multi-select dropdown is open
  }

  // Nav open state lives on LogApp.state so it survives shell re-renders
  get _openNav() { return window.LogApp.state.navOpen; }

  render() {
    const s = window.LogApp.state;
    const rows = s.rows;
    const filterCount = countActiveFilters(s.filter);

    // Build multi-select dropdowns
    const branchRows = (Array.isArray(s.filter.repo) && s.filter.repo.length)
      ? rows.filter((l) => s.filter.repo.includes(l.repo_name))
      : rows;

    const dropdowns = DROPDOWN_KEYS.map(([key, rowKey, label]) => {
      let options;
      if (key === 'branch') {
        // Branch options are scoped to selected repos (#3)
        options = window.LogApp.unique(branchRows, 'branch_name');
      } else if (rowKey) {
        // Repo, agent: always show ALL options from all rows (#2)
        options = window.LogApp.unique(rows, rowKey);
      } else {
        options = STATIC_OPTIONS[key] || [];
      }
      return this._renderMultiSelect(key, label, options, s.filter);
    }).join('');

    const chips = this._renderChips(s.filter);
    const hasFilters = filterCount > 0;

    return `
      <div class="filter-group">
        <h4 class="section-head" data-toggle="filters">
          <span class="caret">${s.panels.filters ? '▾' : '▸'}</span>Filters
          ${filterCount ? `<span class="filter-count-pill">${filterCount}</span>` : ''}
          <button class="section-head-btn" data-clear-all="1"${hasFilters ? '' : ' disabled'}
                  title="Clear every active filter">Clear all filters</button>
        </h4>
        ${chips}
        <input class="filter-search" placeholder="Search title / description — press Enter" data-search="1" value="${esc(s.searchDraft ?? s.filter.search)}">
        <div class="filter-body" ${s.panels.filters ? '' : 'hidden'}>
          ${dropdowns}
          <div class="filter-row"><label>From</label><input type="date" data-key="from" value="${esc(s.filter.from)}"></div>
          <div class="filter-row"><label>To</label><input type="date" data-key="to" value="${esc(s.filter.to)}"></div>
        </div>
      </div>
      <div class="filter-group">
        <h4 class="section-head" data-toggle="nav">
          <span class="caret">${s.panels.nav ? '▾' : '▸'}</span>Navigation
          <button class="section-head-btn" data-drill-clear="1"${Object.keys(s.drill || {}).length ? '' : ' disabled'}
                  title="Clear the selection and show every repository">All repositories</button>
        </h4>
        <div class="filter-body" ${s.panels.nav ? '' : 'hidden'}>
          ${this._renderNav(s.treeModel)}
        </div>
      </div>
    `;
  }

  // Multi-select dropdown: button + collapsible checkbox panel
  _renderMultiSelect(key, label, options, filter) {
    const selected = Array.isArray(filter[key]) ? filter[key] : [];
    const count = selected.length;
    const isOpen = this._openDropdown === key;
    const btnLabel = count ? `${label} (${count})` : label;
    const summary = count ? selected.slice(0, 3).map(esc).join(', ') + (count > 3 ? ` +${count - 3}` : '') : '';

    const checkboxes = options.map((v) => {
      const checked = selected.includes(v) ? 'checked' : '';
      return `<label class="ms-option"><input type="checkbox" value="${esc(v)}" ${checked} data-ms-key="${esc(key)}">${esc(v)}</label>`;
    }).join('');

    return `
      <div class="multiselect" data-ms-container="${esc(key)}">
        <button class="ms-btn ${isOpen ? 'open' : ''}" data-ms-toggle="${esc(key)}" type="button">
          <span class="ms-btn-label">${esc(btnLabel)}</span>
          <span class="ms-btn-arrow">${isOpen ? '▴' : '▾'}</span>
        </button>
        ${isOpen ? `
          <div class="ms-panel">
            ${checkboxes || '<div class="ms-empty">No options</div>'}
          </div>
        ` : ''}
        ${count ? `<div class="ms-summary">${esc(summary)}</div>` : ''}
      </div>
    `;
  }

  // Chips: one per selected value for dropdowns, one for search/from/to
  _renderChips(filter) {
    const chips = [];
    if (filter.search) chips.push(`<button class="chip" data-chip-key="search" title="Clear Search">Search: ${esc(filter.search)} ✕</button>`);
    DROPDOWN_KEYS.forEach(([key, , label]) => {
      const vals = Array.isArray(filter[key]) ? filter[key] : [];
      vals.forEach((v) => {
        chips.push(`<button class="chip" data-chip-key="${esc(key)}" data-chip-val="${esc(v)}" title="Clear ${esc(label)}: ${esc(v)}">${esc(label)}: ${esc(v)} ✕</button>`);
      });
    });
    if (filter.from) chips.push(`<button class="chip" data-chip-key="from" title="Clear From">From: ${esc(filter.from)} ✕</button>`);
    if (filter.to) chips.push(`<button class="chip" data-chip-key="to" title="Clear To">To: ${esc(filter.to)} ✕</button>`);
    if (!chips.length) return '';
    return `<div class="chips">${chips.join('')}</div>`;
  }

  // Build a nested agent tree from flat agent_path strings (e.g. "lead/handler_dev")
  // Returns [{path, name, children: [...]}]
  _agentTree(agents) {
    const root = { children: {} };
    agents.forEach((path) => {
      const parts = path.split('/');
      let node = root;
      parts.forEach((part, i) => {
        const full = parts.slice(0, i + 1).join('/');
        if (!node.children[part]) node.children[part] = { path: full, name: part, children: {} };
        node = node.children[part];
      });
    });
    function toList(children) {
      return Object.values(children).map((n) => ({ path: n.path, name: n.name, children: toList(n.children) }));
    }
    return toList(root.children);
  }

  // Render nested agent nodes recursively
  _renderAgentNodes(agents, task, r, b, open, drill, caret, jattr, depth) {
    const tree = this._agentTree(agents);
    const renderNode = (node, d) => {
      const ak = 'a:' + r.name + '|' + b.name + '|' + task.title + '|' + node.path;
      const aOpen = open.has(ak);
      // Drill by agent name (last path segment), matching the prototype's
      // split('/').includes() filter semantics.
      const aDrill = { repo: r.name, branch: b.name, task: task.title, agent: node.name };
      const hasKids = node.children.length > 0;
      const cnt = (task.logs || []).filter((l) => (l.agent_path || '').split('/').includes(node.name)).length;
      const active = drill.agent === node.name && drill.task === task.title;
      const pad = 'padding-left:' + (12 + d * 14) + 'px';
      return `
        <li>
          <div class="node leaf${active ? ' active' : ''}" data-drill='${jattr(aDrill)}' data-nav-key="${esc(ak)}" data-has-kids="${hasKids ? '1' : '0'}" style="${pad}">
            ${hasKids ? `<span class="nav-caret-icon ${aOpen ? 'open' : ''}">${aOpen ? '▾' : '▸'}</span>` : '<span class="nav-caret-spacer"></span>'}
            <span class="node-label mono">${esc(node.name)}</span>
            <span class="node-meta">${esc(String(cnt))}</span>
          </div>
          ${hasKids && aOpen ? `<ul>${node.children.map((c) => renderNode(c, d + 1)).join('')}</ul>` : ''}
        </li>
      `;
    };
    return tree.map((node) => renderNode(node, depth)).join('');
  }

  // Navigation tree: click = drill + open, click the node you are on = collapse
  _renderNav(model) {
    if (!model?.repos?.length) return '<div class="empty">No data</div>';
    const open = this._openNav;
    const drill = window.LogApp.state.drill || {};
    // Per-level active state matching the prototype:
    // repo active when drilled to repo (no branch); branch active when drilled
    // to branch (no task); task active when drilled to task or agent under it;
    // agent active when drilled to that agent name.
    const caret = (key, hasKids) => {
      if (!hasKids) return '<span class="nav-caret-spacer"></span>';
      const isOpen = open.has(key);
      return `<span class="nav-caret-icon ${isOpen ? 'open' : ''}">${isOpen ? '▾' : '▸'}</span>`;
    };
    const jattr = (d) => esc(JSON.stringify(d));

    return `<ul class="nav-tree">${model.repos.map((r) => {
      const rk = 'n:' + r.name;
      const rOpen = open.has(rk);
      const rDrill = { repo: r.name };
      const rActive = drill.repo === r.name && !drill.branch;
      return `
        <li>
          <div class="node${rActive ? ' active' : ''}" data-drill='${jattr(rDrill)}' data-nav-key="${esc(rk)}" data-has-kids="1">
            ${caret(rk, true)}
            <span class="node-label">${esc(r.name)}</span>
            <span class="node-meta">${esc(fmt(r.ms.wall))}</span>
          </div>
          ${rOpen ? `<ul>${r.branches.map((b) => {
            const bk = 'b:' + r.name + '|' + b.name;
            const bOpen = open.has(bk);
            const bDrill = { repo: r.name, branch: b.name };
            const bActive = drill.repo === r.name && drill.branch === b.name && !drill.task;
            return `
              <li>
                <div class="node${bActive ? ' active' : ''}" data-drill='${jattr(bDrill)}' data-nav-key="${esc(bk)}" data-has-kids="1">
                  ${caret(bk, true)}
                  <span class="node-label mono">${esc(b.name)}</span>
                  <span class="node-meta">${esc(fmt(b.ms.wall))}</span>
                </div>
                ${bOpen ? `<ul>${b.tasks.map((t) => {
                  const tk = 't:' + r.name + '|' + b.name + '|' + t.title;
                  const tOpen = open.has(tk);
                  const tDrill = { repo: r.name, branch: b.name, task: t.title };
                  const tActive = drill.task === t.title && drill.branch === b.name;
                  const agentCount = (t.agents || []).length;
                  return `
                    <li>
                      <div class="node${tActive ? ' active' : ''}" data-drill='${jattr(tDrill)}' data-nav-key="${esc(tk)}" data-has-kids="${agentCount > 0 ? '1' : '0'}">
                        ${caret(tk, agentCount > 0)}
                        <span class="node-label">${esc(t.title)}</span>
                        <span class="node-meta">${esc(String(t.ms.logs || 0))}</span>
                      </div>
                      ${tOpen && agentCount ? `<ul>${this._renderAgentNodes(t.agents || [], t, r, b, open, drill, caret, jattr, 0)}</ul>` : ''}
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

  attach() {
    const self = this;
    const s = window.LogApp.state;

    // Section collapse/expand
    this.querySelectorAll('.section-head').forEach((h) => {
      h.onclick = () => {
        const which = h.getAttribute('data-toggle');
        if (which === 'filters') window.LogApp.toggleFilters();
        else window.LogApp.toggleNav();
      };
    });

    // Date inputs apply immediately; they do not lose a partial value the way
    // a text field does.
    this.querySelectorAll('[data-key]').forEach((el) => {
      const key = el.getAttribute('data-key');
      el.onchange = () => window.LogApp.setFilter(key, el.value);
    });

    // Search box: type freely, apply on Enter. Applying on every keystroke
    // re-rendered the sidebar and destroyed the input after a single letter.
    const search = this.querySelector('[data-search]');
    if (search) {
      search.oninput = () => { s.searchDraft = search.value; };
      search.onfocus = () => { s.searchFocused = true; };
      search.onblur = () => { s.searchFocused = false; };
      search.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const v = search.value;
          s.searchDraft = null;
          window.LogApp.setFilter('search', v);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          s.searchDraft = null;
          if (s.filter.search) window.LogApp.setFilter('search', '');
          else search.value = '';
        }
      };
      // A background re-render (poll tick, drill, …) rebuilds this input, so
      // restore the caret where the user left it.
      if (s.searchFocused) {
        search.focus();
        const n = search.value.length;
        search.setSelectionRange(n, n);
      }
    }

    // Multi-select dropdown toggle (open/close)
    this.querySelectorAll('[data-ms-toggle]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const key = btn.getAttribute('data-ms-toggle');
        this._openDropdown = (this._openDropdown === key) ? null : key;
        this.refresh();
      };
    });

    // Multi-select checkbox toggle
    this.querySelectorAll('[data-ms-key]').forEach((cb) => {
      cb.onchange = () => {
        const key = cb.getAttribute('data-ms-key');
        window.LogApp.toggleFilter(key, cb.value);
      };
    });

    // Chips: clear a single filter value
    this.querySelectorAll('[data-chip-key]').forEach((el) => {
      el.onclick = () => {
        const key = el.getAttribute('data-chip-key');
        const val = el.getAttribute('data-chip-val');
        if (val !== null) {
          // Remove one value from an array filter
          window.LogApp.toggleFilter(key, val);
        } else {
          // Clear a string filter
          window.LogApp.setFilter(key, '');
        }
      };
    });

    // Clear all filters — lives in the Filters section head, so the click must
    // not also collapse that section.
    const clearAll = this.querySelector('[data-clear-all]');
    if (clearAll) clearAll.onclick = (e) => {
      e.stopPropagation();
      if (clearAll.disabled) return;
      const f = window.LogApp.state.filter;
      Object.keys(f).forEach((k) => { f[k] = Array.isArray(f[k]) ? [] : ''; });
      window.LogApp.setFilter('search', '');
    };

    // Navigation tree: a click drills to the node and opens it; clicking the
    // node you are already on (open + drilled) collapses it again. Drilling
    // re-renders the sidebar, so we cannot rely on the dblclick event firing —
    // this toggle rule makes a slow double click collapse just the same, and
    // the dblclick handler below covers the fast case.
    this.querySelectorAll('[data-drill]').forEach((el) => {
      // Skip non-nav drill targets (breadcrumb etc. are in app-shell)
      if (!el.classList.contains('node')) return;

      const isDrilledTo = (d) => {
        const cur = window.LogApp.state.drill || {};
        return ['repo', 'branch', 'task', 'agent'].every((f) => (cur[f] || '') === (d[f] || ''));
      };
      const doDrill = (d) => {
        if (d.agent) {
          const cur = window.LogApp.state.drill || {};
          if (cur.agent === d.agent && cur.task === d.task) {
            window.LogApp.setDrill({ repo: d.repo, branch: d.branch, task: d.task });
          } else {
            window.LogApp.setDrill(d);
          }
        } else {
          window.LogApp.setDrill(d);
        }
      };

      // Suppress the text selection the second click of a double click makes
      el.onmousedown = (e) => { if (e.detail > 1) e.preventDefault(); };

      el.onclick = (e) => {
        e.stopPropagation();
        const d = JSON.parse(el.getAttribute('data-drill'));
        const navKey = el.getAttribute('data-nav-key');
        const hasKids = el.getAttribute('data-has-kids') === '1';
        if (hasKids && navKey) {
          if (this._openNav.has(navKey) && isDrilledTo(d)) this._openNav.delete(navKey);
          else this._openNav.add(navKey);
        }
        doDrill(d);
      };

      el.ondblclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        const d = JSON.parse(el.getAttribute('data-drill'));
        const navKey = el.getAttribute('data-nav-key');
        if (el.getAttribute('data-has-kids') === '1' && navKey) this._openNav.delete(navKey);
        doDrill(d);
      };
    });

    // All repositories reset — it sits inside the Navigation section head, so
    // the click must not also collapse that section.
    const drillClear = this.querySelector('[data-drill-clear]');
    if (drillClear) drillClear.onclick = (e) => {
      e.stopPropagation();
      if (!drillClear.disabled) window.LogApp.clearDrill();
    };

    // Close open dropdown on outside click (deferred to avoid immediate close)
    if (this._openDropdown) {
      setTimeout(() => {
        const onOutside = (ev) => {
          if (!self.contains(ev.target)) {
            self._openDropdown = null;
            self.refresh();
            document.removeEventListener('click', onOutside, true);
          } else if (!ev.target.closest('[data-ms-container="' + self._openDropdown + '"]')) {
            self._openDropdown = null;
            self.refresh();
            document.removeEventListener('click', onOutside, true);
          }
        };
        document.addEventListener('click', onOutside, true);
      }, 0);
    }
  }
}
customElements.define('log-filters', LogFilters);
})(window);
