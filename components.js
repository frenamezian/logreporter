(function (window) {
'use strict';

const typeDot = (t) => `<span class="type-dot ${t}"></span>`;
const esc = (s) => window.LogApp?.escapeHtml(s) ?? String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (ms) => window.LogApp?.fmt(ms) ?? '—';
const fmtTs = (ts) => ts?.slice(11, 16) ?? '—';
const fmtDay = (ts) => ts?.slice(0, 10) ?? '—';

function bar(ms, max = ms.wall || 1) {
  if (!ms || !max) return '<div class="bar-track" style="opacity:.4"></div>';
  const pct = (v) => Math.max(0, Math.min(100, (v / max) * 100)).toFixed(1);
  return `<div class="bar-track">
    <div class="bar-seg activity" style="width:${pct(ms.activity)}%"></div>
    <div class="bar-seg issue" style="width:${pct(ms.issue)}%"></div>
    <div class="bar-seg decision" style="width:${pct(ms.decision)}%"></div>
    <div class="bar-seg github" style="width:${pct(ms.github)}%"></div>
    <div class="bar-seg idle" style="width:${pct(ms.idle)}%"></div>
  </div>`;
}

function statusBadge(st) {
  const color = st === 'completed' ? 'var(--activity)' : st === 'failed' ? 'var(--issue)' : 'var(--text-dim)';
  return `<span class="tag" style="color:${color}; border:1px solid ${color}">${esc(st)}</span>`;
}

class LogComponent extends HTMLElement {
  connectedCallback() {
    this._on = () => this.refresh();
    window.addEventListener('logapp:update', this._on);
    this.refresh();
  }
  disconnectedCallback() {
    window.removeEventListener('logapp:update', this._on);
  }
  refresh() {
    this.innerHTML = this.render();
    this.attach();
  }
  render() { return ''; }
  attach() {}
}

class AppShell extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <log-header></log-header>
      <div class="layout">
        <log-filters></log-filters>
        <div class="content">
          <div class="page-host" id="pages"></div>
          <div class="right-panel">
            <log-list></log-list>
            <log-details></log-details>
          </div>
        </div>
      </div>
    `;
    this._pages = this.querySelector('#pages');
    this._pages.innerHTML = `
      <div data-page="hierarchy"><log-tree></log-tree></div>
      <div data-page="chronology" hidden><log-timeline></log-timeline></div>
      <div data-page="timegoes" hidden><log-timegoes></log-timegoes></div>
      <div data-page="metrics" hidden><log-metrics></log-metrics></div>
      <div data-page="maintenance" hidden><log-maintenance></log-maintenance></div>
      <div data-page="help" hidden><log-help></log-help></div>
    `;
    this._on = () => this.setPage();
    window.addEventListener('logapp:update', this._on);
    this.setPage();
  }
  setPage() {
    const p = window.LogApp?.state?.page || 'hierarchy';
    this._pages.querySelectorAll('[data-page]').forEach((el) => { el.hidden = el.getAttribute('data-page') !== p; });
  }
}
customElements.define('app-shell', AppShell);

class LogHeader extends LogComponent {
  render() {
    const s = window.LogApp.state;
    const tabs = ['hierarchy', 'chronology', 'timegoes', 'metrics', 'maintenance', 'help'];
    return `
      <div class="brand"><div class="title">LogReporter</div><div class="subtitle">Local monitor</div></div>
      <nav class="nav-tabs">
        ${tabs.map((t) => {
          const active = s.page === t ? 'active' : '';
          const count = t === 'hierarchy' ? s.inScope.length : '';
          return `<button class="${active}" data-page="${t}">${esc(t)}${count ? `<span class="count">${count}</span>` : ''}</button>`;
        }).join('')}
      </nav>
      <div class="header-right">
        <span class="count-badge">${s.inScope.length} / ${s.rows.length} logs</span>
        <button class="small" data-csv="1">CSV</button>
        <button class="small" data-json="1">JSON</button>
        <button class="small primary" data-refresh="1">Refresh</button>
        <button class="src-button" data-open="1"><span class="src-dot ${s.src.ok ? 'ok' : s.src.demo ? 'demo' : 'fail'}"></span> ${esc(s.src.name)} <span>▾</span></button>
        <button class="small" title="Help" data-page="help">?</button>
      </div>
    `;
  }
  attach() {
    this.querySelectorAll('[data-page]').forEach((b) => b.onclick = () => window.LogApp.setPage(b.getAttribute('data-page')));
    this.querySelector('[data-csv]').onclick = () => window.LogApp.exportCsv();
    this.querySelector('[data-json]').onclick = () => window.LogApp.exportJson();
    this.querySelector('[data-refresh]').onclick = () => window.LogApp.refresh();
    this.querySelector('[data-open]').onclick = () => window.LogApp.openDb();
  }
}
customElements.define('log-header', LogHeader);

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
        <h4>Filters</h4>
        <input placeholder="Search title / description" data-key="search" value="${esc(s.filter.search)}">
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
      <div class="filter-group">
        <h4>Navigation</h4>
        ${this.renderNav(s.treeModel)}
        <button class="small" data-drill-clear="1" style="width:100%">All repositories</button>
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

class LogList extends LogComponent {
  render() {
    const s = window.LogApp.state;
    const rows = s.inScope.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    if (!rows.length) return '<div class="empty">No logs in scope</div>';
    return `
      <div class="list-head"><h4>Logs in view</h4><span class="hint">${rows.length}</span></div>
      <table class="log-table">
        <thead><tr><th>Time</th><th>Type</th><th>Title</th><th>Agent</th></tr></thead>
        <tbody>
          ${rows.map((l) => `
            <tr data-id="${l.id}" class="${s.selectedLog?.id === l.id ? 'selected' : ''}">
              <td class="mono">${fmtTs(l.timestamp)}</td>
              <td>${typeDot(l.log_type)}${esc(l.log_type)}</td>
              <td>${esc(l.log_title)}</td>
              <td class="mono">${esc(l.agent_name)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
  attach() {
    this.querySelectorAll('tr[data-id]').forEach((tr) => {
      tr.onclick = () => {
        const id = +tr.getAttribute('data-id');
        const log = window.LogApp.state.inScope.find((l) => l.id === id);
        if (log) window.LogApp.selectLog(log);
      };
    });
  }
}
customElements.define('log-list', LogList);

class LogDetails extends LogComponent {
  render() {
    const l = window.LogApp.state.selectedLog;
    if (!l) return '<div class="empty">Select a log to see details</div>';
    const rows = [
      ['Timestamp', l.timestamp], ['Repo', l.repo_name], ['Branch', l.branch_name], ['Trace', l.trace_id || '—'],
      ['Parent trace', l.parent_trace_id || '—'], ['Task', l.task_title || '—'], ['Agent', l.agent_name], ['Path', l.agent_path],
      ['Type', l.log_type], ['Title', l.log_title], ['Description', l.log_description], ['Level', l.log_level || '—'],
      ['Status', l.status || '—'], ['Priority', l.priority || '—'], ['User', l.user_id], ['Tags', l.tags || '—'],
      ['Error details', l.error_details], ['Resolved by', l.resolved_by || '—'], ['Resolution time', l.resolution_time || '—'],
      ['Performance', l.performance_metrics], ['Hash', l.input_output_hash || '—']
    ];
    return `
      <div class="detail">
        <h4>Record</h4>
        <dl>
          ${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${k === 'Description' || k === 'Error details' || k === 'Performance' ? (v ? `<pre>${esc(v)}</pre>` : '—') : esc(v ?? '—')}</dd>`).join('')}
        </dl>
      </div>
    `;
  }
}
customElements.define('log-details', LogDetails);

class LogTimeline extends LogComponent {
  render() {
    const s = window.LogApp.state;
    if (!s.inScope.length) return '<div class="empty">No data in scope</div>';
    const model = s.model;
    const rows = window.LogApp.stream ? window.LogApp.stream(s.inScope, model) : [];
    if (!rows.length) return '<div class="empty">No data</div>';
    return `<div class="page-title">Chronology</div><div class="timeline">` + rows.map((r) => {
      if (r.kind === 'day') return `<div style="margin:18px 0 8px;font-size:12px;color:var(--text-dim);border-bottom:1px solid var(--border);padding-bottom:4px">${esc(r.day)}</div>`;
      if (r.kind === 'gap') return `<div style="margin:4px 0;padding:6px 10px;background:repeating-linear-gradient(135deg,rgba(255,255,255,0.05) 0 3px,transparent 3px 6px);border-radius:6px;font-size:12px;color:var(--text-dim)">Idle ${fmt(r.gap.ms)} · ${esc(r.gap.task)}</div>`;
      const l = r.log;
      return `<div class="log-row" data-id="${l.id}" style="display:flex;gap:12px;padding:6px 0;border-bottom:1px solid var(--border);cursor:pointer">
        <div class="mono" style="width:50px">${fmtTs(l.timestamp)}</div>
        <div style="width:80px">${typeDot(l.log_type)}${esc(l.log_type)}</div>
        <div style="flex:1"><div style="font-weight:500">${esc(l.log_title)}</div><div style="font-size:12px;color:var(--text-dim)">${esc(l.agent_name)} · ${esc(l.repo_name)}/${esc(l.branch_name)}</div></div>
      </div>`;
    }).join('') + `</div>`;
  }
  attach() {
    this.querySelectorAll('.log-row').forEach((el) => {
      el.onclick = () => {
        const id = +el.getAttribute('data-id');
        const log = window.LogApp.state.inScope.find((l) => l.id === id);
        if (log) window.LogApp.selectLog(log);
      };
    });
  }
}
customElements.define('log-timeline', LogTimeline);

class LogTimegoes extends LogComponent {
  render() {
    const s = window.LogApp.state;
    const m = s.model;
    const t = m.totals || {};
    return `
      <div class="page-title">Where time goes ${s.drill.repo ? '— ' + esc([s.drill.repo, s.drill.branch, s.drill.task].filter(Boolean).join(' / ')) : ''}</div>
      <div class="metrics-grid" style="grid-template-columns:repeat(5,1fr)">
        <div class="metric-card"><div class="metric-value">${fmt(t.wall)}</div><div class="metric-label">Wall clock</div></div>
        <div class="metric-card"><div class="metric-value">${fmt(t.agentMs)}</div><div class="metric-label">Agent time</div></div>
        <div class="metric-card"><div class="metric-value">${fmt(t.idle)}</div><div class="metric-label">Idle</div></div>
        <div class="metric-card"><div class="metric-value">${fmt(t.issue)}</div><div class="metric-label">Issue time</div></div>
        <div class="metric-card"><div class="metric-value">${fmt(t.github)}</div><div class="metric-label">GitHub time</div></div>
      </div>
      ${this.renderBars(m)}
    `;
  }
  renderBars(m) {
    if (!m.repos?.length) return '<div class="empty">No data</div>';
    const s = window.LogApp.state;
    let items = [];
    if (s.drill.task) {
      const r = m.repos.find((x) => x.name === s.drill.repo);
      const b = r?.branches.find((x) => x.name === s.drill.branch);
      const t = b?.tasks.find((x) => x.title === s.drill.task);
      items = t ? [{ label: t.title, ms: t.ms }] : [];
    } else if (s.drill.branch) {
      items = m.repos.find((x) => x.name === s.drill.repo)?.branches.find((x) => x.name === s.drill.branch)?.tasks.map((t) => ({ label: t.title, ms: t.ms })) || [];
    } else if (s.drill.repo) {
      items = m.repos.find((x) => x.name === s.drill.repo)?.branches.map((b) => ({ label: b.name, ms: b.ms })) || [];
    } else {
      items = m.repos.map((r) => ({ label: r.name, ms: r.ms }));
    }
    const max = Math.max(1, ...items.map((x) => x.ms.wall || 0));
    return `<div class="bars">${items.map((x) => `
      <div class="bar-row">
        <div class="bar-label">${esc(x.label)}</div>
        <div style="flex:1">${bar(x.ms, max)}</div>
        <div class="bar-val">${fmt(x.ms.wall)}</div>
      </div>
    `).join('')}</div>`;
  }
}
customElements.define('log-timegoes', LogTimegoes);

class LogMetrics extends LogComponent {
  render() {
    const s = window.LogApp.state;
    const m = s.model;
    const t = m.totals || {};
    const typeCounts = {};
    s.inScope.forEach((l) => { typeCounts[l.log_type] = (typeCounts[l.log_type] || 0) + 1; });
    const typeBars = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
    const maxT = Math.max(1, ...typeBars.map((x) => x[1]));
    const openIssues = s.inScope.filter((l) => l.log_type === 'issue' && !l.resolved_by);
    const agentTime = {};
    s.inScope.forEach((l) => {
      const k = l.agent_path || l.agent_name;
      if (k) agentTime[k] = (agentTime[k] || 0) + 1;
    });
    const agentBars = Object.entries(agentTime).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxA = Math.max(1, ...agentBars.map((x) => x[1]));
    return `
      <div class="page-title">Metrics</div>
      <div class="metrics-grid">
        <div class="metric-card"><div class="metric-value">${t.open || 0}</div><div class="metric-label">Open</div></div>
        <div class="metric-card"><div class="metric-value">${t.done || 0}</div><div class="metric-label">Completed</div></div>
        <div class="metric-card"><div class="metric-value">${t.failed || 0}</div><div class="metric-label">Failed</div></div>
        <div class="metric-card"><div class="metric-value">${fmt(t.idle)}</div><div class="metric-label">Idle</div></div>
      </div>
      <h4 style="margin:14px 0 8px">Entries by log type</h4>
      ${typeBars.length ? typeBars.map(([type, n]) => `
        <div class="bar-row">
          <div class="bar-label">${typeDot(type)}${esc(type)}</div>
          <div style="flex:1"><div class="bar-track"><div class="bar-seg ${type}" style="width:${(n / maxT * 100).toFixed(1)}%"></div></div></div>
          <div class="bar-val">${n}</div>
        </div>
      `).join('') : '<div class="empty">No entries</div>'}
      <h4 style="margin:14px 0 8px">Open issues</h4>
      ${openIssues.length ? openIssues.map((l) => `<div class="bar-row" data-id="${l.id}" style="cursor:pointer"><div class="bar-label" style="color:var(--issue)">${esc(l.log_title)}</div><div class="bar-val">${esc(l.repo_name)}</div></div>`).join('') : '<div class="empty">No open issues</div>'}
      <h4 style="margin:14px 0 8px">Agent activity</h4>
      ${agentBars.map(([ag, n]) => `
        <div class="bar-row">
          <div class="bar-label" class="mono">${esc(ag)}</div>
          <div style="flex:1"><div class="bar-track"><div class="bar-seg activity" style="width:${(n / maxA * 100).toFixed(1)}%"></div></div></div>
          <div class="bar-val">${n}</div>
        </div>
      `).join('')}
    `;
  }
  attach() {
    this.querySelectorAll('.bar-row[data-id]').forEach((el) => {
      el.onclick = () => {
        const id = +el.getAttribute('data-id');
        const log = window.LogApp.state.inScope.find((l) => l.id === id);
        if (log) { window.LogApp.setPage('hierarchy'); window.LogApp.selectLog(log); }
      };
    });
  }
}
customElements.define('log-metrics', LogMetrics);

class LogMaintenance extends LogComponent {
  render() {
    const s = window.LogApp.state;
    const rows = s.rows;
    const repos = window.LogApp.unique(rows, 'repo_name');
    const branches = window.LogApp.unique(rows, 'branch_name');
    const types = ['start', 'end', 'activity', 'issue', 'decision', 'github'];
    const volumes = [];
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

class LogHelp extends LogComponent {
  render() {
    return `
      <div class="page-title">Help</div>
      <div style="max-width:780px;line-height:1.6">
        <p>LogReporter is a single static page that reads an agent activity log — a SQLite file, <code>activity_logs.db</code> — directly in your browser.</p>
        <ol>
          <li>Click the data-source button in the header and choose <strong>Open activity_logs.db</strong>.</li>
          <li>Use the left panel to filter and drill into repo → branch → task.</li>
          <li>Switch pages with the top tabs: Hierarchy, Chronology, Where time goes, Metrics, Maintenance.</li>
          <li>Click any log row to open details; use CSV/JSON to export the filtered view.</li>
        </ol>
        <h4>Log types</h4>
        <p><span class="type-dot start"></span>start · <span class="type-dot end"></span>end · <span class="type-dot activity"></span>activity · <span class="type-dot issue"></span>issue · <span class="type-dot decision"></span>decision · <span class="type-dot github"></span>github</p>
        <h4>Offline use</h4>
        <p>To run without a network, vendor <code>sql-wasm.js</code> and <code>sql-wasm.wasm</code> from sql.js in a <code>lib/</code> folder and point the loader in <code>db.js</code> at them.</p>
      </div>
    `;
  }
}
customElements.define('log-help', LogHelp);
})();
