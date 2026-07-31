(function (window) {
'use strict';
const LogComponent = window.LogComponent;
const { esc, fmt, typeDot, bar } = window.LRC;
const { GIT_ACTIONS, gitAction } = window.LR;

function median(arr) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

class LogMetrics extends LogComponent {
  render() {
    const s = window.LogApp.state;
    const m = s.model || {};
    const t = m.totals || {};

    // --- stat cards (full width, above the two columns) ---
    const stats = `
      <div class="metrics-grid">
        <div class="metric-card"><div class="metric-value">${t.open || 0}</div><div class="metric-label">Open</div></div>
        <div class="metric-card"><div class="metric-value">${t.done || 0}</div><div class="metric-label">Completed</div></div>
        <div class="metric-card"><div class="metric-value">${t.failed || 0}</div><div class="metric-label">Failed</div></div>
        <div class="metric-card"><div class="metric-value">${fmt(t.idle)}</div><div class="metric-label">Idle</div></div>
      </div>
    `;

    // --- left column: distributions ---

    // entries by log type
    const typeCounts = {};
    s.inScope.forEach((l) => { typeCounts[l.log_type] = (typeCounts[l.log_type] || 0) + 1; });
    const typeBars = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
    const maxT = Math.max(1, ...typeBars.map((x) => x[1]));
    const typeHtml = typeBars.length ? typeBars.map(([type, n]) => `
      <div class="bar-row">
        <div class="bar-label">${typeDot(type)}${esc(type)}</div>
        <div style="flex:1"><div class="bar-track"><div class="bar-seg ${type}" style="width:${(n / maxT * 100).toFixed(1)}%"></div></div></div>
        <div class="bar-val">${n}</div>
      </div>
    `).join('') : '<div class="empty">No entries</div>';

    // github operations breakdown (§7.2)
    const gitCounts = {};
    s.inScope.forEach((l) => {
      if (l.log_type !== 'github') return;
      const a = gitAction(l);
      if (a) gitCounts[a] = (gitCounts[a] || 0) + 1;
    });
    const gitBars = GIT_ACTIONS
      .map((a) => [a, gitCounts[a] || 0])
      .filter((x) => x[1])
      .sort((a, b) => b[1] - a[1]);
    const maxG = Math.max(1, ...gitBars.map((x) => x[1]));
    const gitHtml = gitBars.length ? gitBars.map(([action, n]) => `
      <div class="bar-row">
        <div class="bar-label">${esc(action)}</div>
        <div style="flex:1"><div class="bar-track"><div class="bar-seg github" style="width:${(n / maxG * 100).toFixed(1)}%"></div></div></div>
        <div class="bar-val">${n}</div>
      </div>
    `).join('') : '<div class="empty">No GitHub operations</div>';

    // median task duration by repository (§7.3)
    const repoWalls = {};
    (m.tasks || []).forEach((task) => {
      if (!repoWalls[task.repo]) repoWalls[task.repo] = [];
      repoWalls[task.repo].push(task.ms.wall || 0);
    });
    const durBars = Object.entries(repoWalls)
      .map(([repo, walls]) => [repo, median(walls)])
      .sort((a, b) => b[1] - a[1]);
    const maxD = Math.max(1, ...durBars.map((x) => x[1]));
    const durHtml = durBars.length ? durBars.map(([repo, ms]) => `
      <div class="bar-row">
        <div class="bar-label">${esc(repo)}</div>
        <div style="flex:1"><div class="bar-track"><div class="bar-seg activity" style="width:${(ms / maxD * 100).toFixed(1)}%"></div></div></div>
        <div class="bar-val">${fmt(ms)}</div>
      </div>
    `).join('') : '<div class="empty">No tasks</div>';

    const leftCol = `
      <section class="metrics-col">
        <h4 class="metrics-h">Entries by log type</h4>
        ${typeHtml}
        <h4 class="metrics-h">GitHub operations</h4>
        ${gitHtml}
        <h4 class="metrics-h">Median task duration by repository</h4>
        ${durHtml}
      </section>
    `;

    // --- right column: open issues + agent time ---

    // open issues as cards (§7.4)
    const openIssues = s.inScope.filter((l) => l.log_type === 'issue' && !l.resolved_by);
    const issueHtml = openIssues.length ? openIssues.map((l) => `
      <div class="issue-card" data-id="${l.id}">
        <div class="issue-card-where">${esc(l.repo_name || '?')} · ${esc(l.branch_name || '?')}</div>
        <div class="issue-card-title">${esc(l.log_title || '')}</div>
        ${l.log_description ? `<p class="issue-card-body">${esc(l.log_description)}</p>` : ''}
        <div class="issue-card-tags">
          ${l.log_level ? `<span class="tag tag-${esc(l.log_level)}">${esc(l.log_level)}</span>` : ''}
          <span class="tag tag-neutral">${esc(l.agent_name || l.agent_path || '?')}</span>
        </div>
      </div>
    `).join('') : '<div class="empty">No open issues</div>';

    // agent time with actual duration (§7.5)
    const agentTime = {};
    (m.tasks || []).forEach((task) => {
      (task.runs || []).forEach((r) => {
        const k = r.path || r.agent || '?';
        if (!agentTime[k]) agentTime[k] = { ms: 0, count: 0 };
        agentTime[k].ms += r.ms || 0;
        agentTime[k].count += 1;
      });
    });
    const agentBars = Object.entries(agentTime)
      .sort((a, b) => b[1].ms - a[1].ms)
      .slice(0, 12);
    const agentHtml = agentBars.length ? agentBars.map(([path, v]) => `
      <div class="agent-row">
        <span class="agent-path">${esc(path)}</span>
        <span class="agent-time">${fmt(v.ms)}</span>
        <span class="agent-count">${v.count}</span>
      </div>
    `).join('') : '<div class="empty">No agent activity</div>';

    const rightCol = `
      <section class="metrics-col">
        <h4 class="metrics-h">Open issues and escalations</h4>
        <div class="issue-card-list">${issueHtml}</div>
        <h4 class="metrics-h">Agent time</h4>
        <div class="agent-table">${agentHtml}</div>
      </section>
    `;

    return `
      ${stats}
      <div class="metrics-cols">
        ${leftCol}
        ${rightCol}
      </div>
    `;
  }

  attach() {
    this.querySelectorAll('.issue-card').forEach((el) => {
      el.onclick = () => {
        const id = +el.getAttribute('data-id');
        const log = window.LogApp.state.inScope.find((l) => l.id === id);
        if (!log) return;
        window.LogApp.setPage('hierarchy');
        window.LogApp.selectLog(log);
        const tree = document.querySelector('log-tree');
        if (tree && tree._open) {
          tree._open.add('r:' + log.repo_name);
          tree._open.add('b:' + log.repo_name + '|' + log.branch_name);
          tree._open.add('t:' + log.repo_name + '|' + log.branch_name + '|' + (log.task_title || ''));
          tree.refresh();
        }
      };
    });
  }
}
customElements.define('log-metrics', LogMetrics);
})(window);
