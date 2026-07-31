(function (window) {
'use strict';
const LogComponent = window.LogComponent;
const { esc } = window.LRC;

class LogFilters extends LogComponent {
  render() {
    const s = window.LogApp.state;
    const rows = s.rows;
    const opt = (key, label) => {
      const vals = window.LogApp.unique(rows, key);
      return `<option value="">${esc(label)}</option>` + vals.map((v) => `<option value="${esc(v)}" ${s.filter[key] === v ? 'selected' : ''}>${esc(v)}</option>`).join('');
    };
    const types = ['start', 'end', 'activity', 'issue', 'decision', 'github'];
    const levels = ['debug', 'info', 'warning', 'error'];
    const statuses = ['pending', 'in_progress', 'failed', 'completed'];
    const priorities = ['low', 'medium', 'high', 'critical'];
    return `
      <div class="filter-group">
        <h4 class="section-head" data-toggle="filters"><span class="caret">${s.panels.filters ? '▾' : '▸'}</span>Filters</h4>
        <input placeholder="Search title / description" data-key="search" value="${esc(s.filter.search)}">
        <div class="filter-body" ${s.panels.filters ? '' : 'hidden'}>
          <select data-key="repo">${opt('repo_name', 'Repository')}</select>
          <select data-key="branch">${opt('branch_name', 'Branch')}</select>
          <select data-key="agent">${opt('agent_path', 'Agent')}</select>
          <select data-key="log_type"><option value="">Log type</option>${types.map((t) => `<option value="${t}" ${s.filter.log_type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <select data-key="log_level"><option value="">Level</option>${levels.map((t) => `<option value="${t}" ${s.filter.log_level === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <select data-key="status"><option value="">Status</option>${statuses.map((t) => `<option value="${t}" ${s.filter.status === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <select data-key="priority"><option value="">Priority</option>${priorities.map((t) => `<option value="${t}" ${s.filter.priority === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <div class="filter-row"><label>From</label><input type="date" data-key="from" value="${esc(s.filter.from)}"></div>
          <div class="filter-row"><label>To</label><input type="date" data-key="to" value="${esc(s.filter.to)}"></div>
          <button class="small" data-clear="1" style="width:100%">Clear filters</button>
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
  renderNav(model) {
    if (!model?.repos?.length) return '<div class="empty">No data</div>';
    return `<ul class="nav-tree">${model.repos.map((r) => `
      <li>
        <div class="node" data-drill='{"repo":"${esc(r.name)}"}'><span class="caret">▾</span>${esc(r.name)}</div>
        <ul>${r.branches.map((b) => `
          <li>
            <div class="node" data-drill='{"repo":"${esc(r.name)}","branch":"${esc(b.name)}"}'><span class="caret">▾</span>${esc(b.name)}</div>
            <ul>${b.tasks.map((t) => `
              <li><div class="node" data-drill='{"repo":"${esc(r.name)}","branch":"${esc(b.name)}","task":"${esc(t.title)}"}'>${esc(t.title)}</div></li>
            `).join('')}</ul>
          </li>
        `).join('')}</ul>
      </li>
    `).join('')}</ul>`;
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
    this.querySelector('[data-clear]').onclick = () => {
      Object.keys(window.LogApp.state.filter).forEach((k) => window.LogApp.state.filter[k] = '');
      window.LogApp.setFilter('search', '');
    };
    this.querySelectorAll('[data-drill]').forEach((el) => {
      el.onclick = () => {
        const d = JSON.parse(el.getAttribute('data-drill'));
        window.LogApp.setDrill(d);
      };
    });
    this.querySelector('[data-drill-clear]').onclick = () => window.LogApp.clearDrill();
  }
}
customElements.define('log-filters', LogFilters);
})(window);
