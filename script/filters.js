(function (window) {
'use strict';

const SEARCH_KEYS = ['log_title', 'log_description', 'agent_name', 'agent_path'];

function applyFilters(rows, filter) {
  const f = filter || {};
  return rows.filter((l) => {
    if (f.search) {
      const q = f.search.toLowerCase();
      if (!SEARCH_KEYS.some((k) => (l[k] || '').toLowerCase().includes(q))) return false;
    }
    if (f.repo && l.repo_name !== f.repo) return false;
    if (f.branch && l.branch_name !== f.branch) return false;
    if (f.agent && l.agent_path !== f.agent && l.agent_name !== f.agent) return false;
    if (f.log_type && l.log_type !== f.log_type) return false;
    if (f.log_level && l.log_level !== f.log_level) return false;
    if (f.status && l.status !== f.status) return false;
    if (f.priority && l.priority !== f.priority) return false;
    if (f.from) {
      const t = l.timestamp?.replace(' ', 'T') + 'Z';
      if (t && new Date(t) < new Date(f.from)) return false;
    }
    if (f.to) {
      const t = l.timestamp?.replace(' ', 'T') + 'Z';
      if (t && new Date(t) > new Date(f.to + 'T23:59:59Z')) return false;
    }
    return true;
  });
}

function drillRows(rows, drill) {
  if (!drill) return rows;
  return rows.filter((l) => {
    if (drill.repo && l.repo_name !== drill.repo) return false;
    if (drill.branch && l.branch_name !== drill.branch) return false;
    if (drill.task && (l.task_title || 'Untitled task') !== drill.task) return false;
    if (drill.agent && l.agent_path !== drill.agent && l.agent_name !== drill.agent) return false;
    return true;
  });
}

function unique(rows, key) {
  return Array.from(new Set(rows.map((r) => r[key]).filter(Boolean))).sort();
}

window.Filters = { applyFilters, drillRows, unique };
})(window);
