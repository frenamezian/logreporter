(function (window) {
'use strict';

const SEARCH_KEYS = ['log_title', 'log_description', 'agent_name', 'agent_path'];

function applyFilters(rows, filter) {
  const f = filter || {};
  // Helper: check if a filter value is active (non-empty array or non-empty string)
  const isActive = (v) => Array.isArray(v) ? v.length > 0 : !!v;
  // Helper: check if a row's value matches the filter (array membership or string equality)
  const match = (fv, val) => Array.isArray(fv) ? fv.includes(val) : fv === val;
  return rows.filter((l) => {
    if (f.search) {
      const q = f.search.toLowerCase();
      if (!SEARCH_KEYS.some((k) => (l[k] || '').toLowerCase().includes(q))) return false;
    }
    if (isActive(f.repo) && !match(f.repo, l.repo_name)) return false;
    if (isActive(f.branch) && !match(f.branch, l.branch_name)) return false;
    if (isActive(f.agent) && !match(f.agent, l.agent_path) && !match(f.agent, l.agent_name)) return false;
    if (isActive(f.log_type) && !match(f.log_type, l.log_type)) return false;
    if (isActive(f.git)) {
      const ga = window.LR && window.LR.gitAction ? window.LR.gitAction(l) : '';
      if (l.log_type !== 'github' || !match(f.git, ga)) return false;
    }
    if (isActive(f.log_level) && !match(f.log_level, l.log_level)) return false;
    if (isActive(f.status) && !match(f.status, l.status)) return false;
    if (isActive(f.priority) && !match(f.priority, l.priority)) return false;
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
    // Agent match: drill.agent is an agent name (last path segment); a row is in
    // scope when that name appears anywhere in its agent_path segments.
    if (drill.agent && !(l.agent_path || '').split('/').includes(drill.agent)) return false;
    return true;
  });
}

function unique(rows, key) {
  return Array.from(new Set(rows.map((r) => r[key]).filter(Boolean))).sort();
}

window.Filters = { applyFilters, drillRows, unique };
})(window);
