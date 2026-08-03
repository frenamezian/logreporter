(function (window) {
'use strict';
const { esc } = window.LRC;
const CM = window.CostModel;
const { attributeUsage, agentTypeMap, usageAgent } = window.LR;

// The token-usage block on the Metrics page. Rendered by <log-metrics> rather
// than being its own page: cost is an attribute of work the Metrics page
// already describes, and a sixth nav tab would imply it is a separate subject.
//
// The one hard rule this file exists to honour: tokens and cost are never put
// on one axis. They differ by six orders of magnitude, and a shared axis would
// draw a correlation that is not in the data. Instead one measure at a time,
// with ordering, colour and layout held constant across the switch — so the
// two views are directly comparable, and where they disagree, the disagreement
// is the finding.

const SEGMENTS = [
  { key: 'cache_read', cls: 'cache_read', label: 'Cache read', field: 'cache_read_tokens' },
  { key: 'cache_write', cls: 'cache_write', label: 'Cache write', field: 'cache_write' },
  { key: 'input', cls: 'input', label: 'Fresh input', field: 'input_tokens' },
  { key: 'output', cls: 'output', label: 'Output', field: 'output_tokens' }
];

const RANK_LEVELS = [
  { key: 'repo', label: 'Repository' },
  { key: 'branch', label: 'Branch' },
  { key: 'task', label: 'Task' },
  { key: 'agent', label: 'Agent' },
  { key: 'model', label: 'Model' }
];

const TABLE_COLS = [
  { key: 'timestamp', label: 'When', num: false },
  { key: 'task', label: 'Task', num: false },
  { key: 'source', label: 'Agent', num: false },
  { key: 'model_id', label: 'Model', num: false },
  { key: 'input_tokens', label: 'Input', num: true },
  { key: 'cache_read_tokens', label: 'Cache read', num: true },
  { key: 'cache_write_5m', label: 'Write 5m', num: true },
  { key: 'cache_write_1h', label: 'Write 1h', num: true },
  { key: 'output_tokens', label: 'Output', num: true },
  { key: 'cost', label: 'Cost', num: true }
];

const TABLE_LIMIT = 500;

// --- helpers ----------------------------------------------------------------

// request_id -> the agent path that produced it, for every attributed row.
// Built once per render: the header split and the Agent ranking must not be
// able to disagree about who spent what.
function agentIndex(attribution) {
  const out = new Map();
  attribution.buckets.forEach((b) => {
    if (!b.rows.length) return;
    const map = agentTypeMap(b.task.task || b.task);
    b.rows.forEach((r) => {
      const a = usageAgent(r, map);
      const cur = out.get(r.request_id);
      // A row inside two overlapping task spans is offered to both. Take the
      // task that can actually name the agent: resolving against whichever
      // bucket happened to come first would answer "main session" from a task
      // that never logged that agent, and the whole subtree would read as zero.
      if (!cur || (!cur.path && a.path) || (cur.via === 'main session' && a.via !== 'main session')) {
        out.set(r.request_id, a);
      }
    });
  });
  return out;
}

const leafOf = (path) => (path ? path.split('/').pop() : null);

// Under an agent drill the rows in scope are that agent AND its subagents.
// Splitting the two is the whole point: "lead_architect: $2.83 of $34.84" says
// in one line what the drill total on its own cannot.
function agentSplit(rows, index, agentName, measure) {
  const own = [], below = [];
  rows.forEach((r) => {
    const a = index.get(r.request_id);
    (leafOf(a && a.path) === agentName ? own : below).push(r);
  });
  const val = (rs) => {
    const s = CM.summarize(rs);
    return measure === 'cost' ? (s.pricedRows ? s.cost.total : null) : s.tokens.total;
  };
  const o = val(own), t = val(rows);
  return {
    own: o, total: t, below: val(below),
    ownRows: own.length, belowRows: below.length,
    pct: (o !== null && t) ? (100 * o / t) : null
  };
}

// Segment totals for one summary, in both measures. Returns null for a segment
// whose counter no agent in the bucket reported — which renders as an em dash,
// never as a zero-width slice that claims the agent measured nothing.
function segmentValues(rows, weights, measure) {
  const s = CM.summarize(rows, weights);
  return SEGMENTS.map((seg) => {
    const tokens = seg.field === 'cache_write' ? s.tokens.cache_write : s.tokens[seg.field];
    if (measure === 'tokens') return { seg, value: tokens, summary: s };
    if (tokens === null) return { seg, value: null, summary: s };
    // Cost per segment, summed row by row: the tier that applies depends on the
    // model, the date and the service tier, so it cannot be derived from the
    // bucket's token totals.
    let cost = 0, known = false;
    rows.forEach((r, i) => {
      const w = weights ? (weights[i] === undefined ? 1 : weights[i]) : 1;
      const c = CM.costRow(r);
      if (!c.known) return;
      known = true;
      if (seg.key === 'cache_write') {
        cost += ((c.parts.cache_write_5m || 0) + (c.parts.cache_write_1h || 0)) * w;
      } else if (seg.key === 'cache_read') {
        cost += (c.parts.cache_read_tokens || 0) * w;
      } else if (seg.key === 'input') {
        cost += (c.parts.input_tokens || 0) * w;
      } else {
        cost += (c.parts.output_tokens || 0) * w;
      }
    });
    return { seg, value: known ? cost : null, summary: s };
  });
}

function fmtMeasure(v, measure) {
  return measure === 'cost' ? CM.fmtCost(v) : CM.fmtTokens(v);
}

class LogUsage {
  // Rendered as plain HTML inside <log-metrics>; the interactive bits are
  // bound by attach() below, the same contract every component here follows.
  static render(s) {
    if (!CM) return '';
    const rows = s.usageInScope || [];
    const status = (s.usageDb && s.usageDb.status) || { state: 'unloaded' };

    if (!rows.length) return LogUsage._empty(s, status);

    const measure = s.measure === 'cost' ? 'cost' : 'tokens';
    const summary = CM.summarize(rows);
    // treeModel is the undrilled model: task spans must not be reshaped by an
    // agent drill (see LogApp.scopeUsage). Falls back to model only so a caller
    // that has not built it yet still renders.
    const tasks = (s.treeModel || s.model || {}).tasks || [];
    const attribution = attributeUsage(rows, tasks);

    const index = agentIndex(attribution);
    const split = (s.drill && s.drill.agent)
      ? agentSplit(rows, index, s.drill.agent, measure) : null;

    return `
      <section class="usage-section">
        ${LogUsage._head(s, rows, measure, split)}
        ${LogUsage._kpis(summary, measure)}
        ${LogUsage._composition(rows, null, measure)}
        <div class="metrics-cols">
          <section class="metrics-col">
            <h4 class="metrics-h">Where it went, by ${measure === 'cost' ? 'cost' : 'tokens'}
              <span class="metric-hint">rows keep their order across both measures</span></h4>
            ${LogUsage._rankTabs(s)}
            ${LogUsage._ranking(s, rows, attribution, measure)}
          </section>
          <section class="metrics-col">
            <h4 class="metrics-h">Sources</h4>
            ${LogUsage._sources(s, status)}
          </section>
        </div>
        <h4 class="metrics-h">Every row behind the charts</h4>
        ${LogUsage._table(s, rows, attribution)}
        ${LogUsage._footnotes(s, summary, attribution)}
      </section>
    `;
  }

  static _empty(s, status) {
    const msg = {
      absent: 'No usage cache yet. The reader builds it by reading the session files your agents already write — nothing has to be logged for it.',
      unreachable: 'token_usage.db could not be fetched. ' + esc(status.detail || ''),
      unreadable: 'token_usage.db could not be read. ' + esc(status.detail || ''),
      unloaded: 'Loading usage…'
    }[status.state] || 'No usage rows match the current filters.';
    const showHow = status.state === 'absent' || status.state === 'unreadable';
    return `
      <section class="usage-section">
        <div class="usage-head"><h3>Token usage and cost</h3></div>
        <div class="usage-empty">
          ${esc(msg)}
          ${showHow ? `<div style="margin-top:10px">Run <code>python usage_reader.py</code>,
             or press <strong>Rebuild usage</strong> on the Maintenance page.</div>` : ''}
          ${status.state === 'ok' ? '<div style="margin-top:10px">Widen the filters, or clear the drill scope.</div>' : ''}
        </div>
      </section>
    `;
  }

  static _head(s, rows, measure, split) {
    const ignored = window.LogApp.usageIgnoredFilters();
    const agentDrill = s.drill && s.drill.agent;
    return `
      <div class="usage-head">
        <h3>Token usage and cost</h3>
        <span class="usage-scope">${rows.length.toLocaleString('en-US')} requests${
          ignored.length ? ' · not filtered by ' + esc(ignored.join(', ')) : ''}</span>
        ${agentDrill && split ? `<span class="usage-scope usage-split"
          title="Rows in scope are ${esc(agentDrill)} and everything it dispatched, matching the tree's row counts. The first figure is its own work only.">
          <strong>${esc(agentDrill)}</strong> own ${fmtMeasure(split.own, measure)}
          of ${fmtMeasure(split.total, measure)}${
            split.pct === null ? '' : ` · ${split.pct < 0.1 && split.pct > 0 ? '<0.1' : split.pct.toFixed(split.pct < 10 ? 1 : 0)}%`}
          ${split.belowRows ? `· subagents ${fmtMeasure(split.below, measure)}` : '· no subagents'}</span>` : ''}
        <span class="usage-spacer"></span>
        <div class="measure-toggle" role="group" aria-label="Measure">
          <button data-measure="tokens" aria-pressed="${measure === 'tokens'}">Tokens</button>
          <button data-measure="cost" aria-pressed="${measure === 'cost'}">Cost</button>
        </div>
      </div>
    `;
  }

  // --- KPI row -------------------------------------------------------------
  static _kpis(sum, measure) {
    const t = sum.tokens;
    const c = sum.cost;
    const partial = !sum.costComplete;

    // Tile 4 holds its slot under both toggle positions and is always a
    // currency value: "saved tokens" is not a meaningful quantity, because the
    // tokens were read either way — only the price of reading them changed.
    const savedTile = `
      <div class="metric-card">
        <div class="metric-value usage">${sum.pricedRows ? CM.fmtCost(c.saved) : '—'}</div>
        <div class="metric-label">Saved by cache</div>
        <div class="metric-note">what ${CM.fmtTokens(t.cache_read_tokens)} cache-read tokens
          would have cost at the full input rate, minus what they did cost.
          Not a discount on the ${CM.fmtCost(c.total)} above — that bill is already net of it.</div>
      </div>`;

    if (measure === 'cost') {
      return `
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-value usage${partial ? ' muted' : ''}">${sum.pricedRows ? CM.fmtCost(c.total) : '—'}</div>
          <div class="metric-label">Total cost${partial ? ' (partial)' : ''}</div>
          <div class="metric-note">modelled at API list prices${partial ?
            ` · ${sum.unpricedRows} row${sum.unpricedRows === 1 ? '' : 's'} unpriced` : ''}</div>
        </div>
        <div class="metric-card">
          <div class="metric-value usage">${sum.pricedRows ? CM.fmtCost(c.input) : '—'}</div>
          <div class="metric-label">Input cost</div>
          <div class="metric-note">fresh input, cache reads and cache writes</div>
        </div>
        <div class="metric-card">
          <div class="metric-value usage">${sum.pricedRows ? CM.fmtCost(c.output) : '—'}</div>
          <div class="metric-label">Output cost</div>
          <div class="metric-note">${CM.fmtTokens(t.output_tokens)} tokens</div>
        </div>
        ${savedTile}
      </div>`;
    }

    return `
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-value usage">${CM.fmtTokens(t.total)}</div>
          <div class="metric-label">Total tokens</div>
          <div class="metric-note">across ${sum.rows.toLocaleString('en-US')} API requests</div>
        </div>
        <div class="metric-card">
          <div class="metric-value usage">${CM.fmtTokens(t.input_total)}</div>
          <div class="metric-label">Input (incl. cache)</div>
          <div class="metric-note">the agent's bare input field reports only
            ${CM.fmtTokens(t.input_tokens)} — the uncached remainder</div>
        </div>
        <div class="metric-card">
          <div class="metric-value usage">${CM.fmtTokens(t.output_tokens)}</div>
          <div class="metric-label">Output</div>
          <div class="metric-note">includes reasoning tokens where an agent reports them separately</div>
        </div>
        ${savedTile}
      </div>`;
  }

  // --- composition bar -----------------------------------------------------
  static _composition(rows, weights, measure) {
    const vals = segmentValues(rows, weights, measure);
    const total = vals.reduce((n, v) => n + (v.value || 0), 0);
    if (!total) {
      return `<div class="usage-empty">Nothing to compose: no ${
        measure === 'cost' ? 'priced rows' : 'counters'} in scope.</div>`;
    }
    // Every segment with a value keeps its slice, in the same order, in both
    // measures — that is what makes the two views comparable, and it is why a
    // tiny segment gets a min-width floor instead of being dropped. A segment
    // that vanished in one view and reappeared in the other would look like
    // the chart had changed shape when only the measure changed.
    //
    // Exact percentages live in the label list below, which is where §8.3 puts
    // anything too thin to label inline.
    const segs = vals.filter((v) => v.value !== null && v.value > 0)
      .map((v) => `<div class="comp-seg ${v.seg.cls}" style="width:${(100 * v.value / total).toFixed(2)}%"
                        title="${esc(v.seg.label)} ${fmtMeasure(v.value, measure)}"></div>`).join('');
    const keys = vals.map((v) => {
      if (v.value === null) {
        return `<span class="comp-key"><span class="comp-dot ${v.seg.cls}"></span>
                ${esc(v.seg.label)} <span class="comp-key-na">not reported</span></span>`;
      }
      const pct = (100 * v.value / total);
      return `<span class="comp-key"><span class="comp-dot ${v.seg.cls}"></span>
              ${esc(v.seg.label)}
              <span class="comp-key-pct">${pct < 0.1 && pct > 0 ? '<0.1' : pct.toFixed(1)}% ·
              ${fmtMeasure(v.value, measure)}</span></span>`;
    }).join('');
    return `<div class="comp-bar">${segs}</div><div class="comp-legend">${keys}</div>`;
  }

  // --- rankings ------------------------------------------------------------
  static _rankTabs(s) {
    const cur = s.usageRank || 'repo';
    return `<div class="usage-rank-tabs">${RANK_LEVELS.map((l) =>
      `<button data-rank="${l.key}" aria-pressed="${cur === l.key}">${esc(l.label)}</button>`
    ).join('')}</div>`;
  }

  static _rankBuckets(s, rows, attribution) {
    const level = s.usageRank || 'repo';
    const out = new Map();
    // The unattributed bucket is flagged, not encoded in its name: a magic
    // string here has to be matched exactly everywhere it is read, and a task
    // could legitimately be called "Unattributed".
    const push = (name, row, w, unattributed) => {
      if (!out.has(name)) out.set(name, { rows: [], weights: [], unattributed: !!unattributed });
      out.get(name).rows.push(row);
      out.get(name).weights.push(w);
    };

    if (level === 'task') {
      attribution.buckets.forEach((b) => {
        if (!b.rows.length) return;
        b.rows.forEach((r, i) => push(b.task.title, r, b.weights[i]));
      });
      attribution.unattributed.rows.forEach((r, i) =>
        push('Unattributed', r, attribution.unattributed.weights[i], true));
      return out;
    }

    if (level === 'agent') {
      // Each agent's OWN requests, never its subagents'. A ranking whose bars
      // do not sum to the total is a ranking that cannot be read - and the
      // parent-contains-child confusion is exactly what sent us here. Drilling
      // to an agent still shows its subtree, because that is what the tree
      // counts do; the two answer different questions and both say which.
      const index = agentIndex(attribution);
      attribution.buckets.forEach((b) => {
        if (!b.rows.length) return;
        b.rows.forEach((r, i) => {
          const a = index.get(r.request_id) || {};
          const name = leafOf(a.path)
            || (a.type ? a.type + ' (not logged)' : 'unknown agent');
          push(name, r, b.weights[i], !a.path);
        });
      });
      attribution.unattributed.rows.forEach((r, i) =>
        push('Unattributed', r, attribution.unattributed.weights[i], true));
      return out;
    }

    const of = level === 'repo' ? (r) => r.repo_name || '—'
      : level === 'branch' ? (r) => r.branch_name || '—'
      : (r) => r.model_id || 'unknown model';
    rows.forEach((r) => push(of(r), r, 1));
    return out;
  }

  static _ranking(s, rows, attribution, measure) {
    const buckets = LogUsage._rankBuckets(s, rows, attribution);
    let entries = [];
    buckets.forEach((b, name) => {
      const sum = CM.summarize(b.rows, b.weights);
      entries.push({
        name,
        value: measure === 'cost' ? (sum.pricedRows ? sum.cost.total : 0) : sum.tokens.total,
        // Position is fixed by TOKENS in both views. Re-sorting each view by
        // its own measure would make every row jump on each toggle, and the
        // comparison the toggle exists for -- this repo is 3% of the tokens
        // and 20% of the bill -- becomes impossible to see. So in the cost
        // view the bars are not always descending, and that is the finding
        // rather than a defect.
        order: sum.tokens.total,
        unattributed: !!b.unattributed,
        complete: sum.costComplete
      });
    });
    entries.sort((a, b) => b.order - a.order);

    // Top 12 descending, the tail folded into Other — a ranking with sixty
    // rows is a table, and §8.5 already provides the table.
    if (entries.length > 12) {
      const tail = entries.slice(12);
      const rest = tail.reduce((n, e) => n + e.value, 0);
      entries = entries.slice(0, 12);
      if (rest > 0) entries.push({ name: `Other (${tail.length})`, value: rest, other: true, complete: true });
    }
    if (!entries.length) return '<div class="empty">Nothing to rank</div>';

    const max = Math.max(1, ...entries.map((e) => e.value));
    return entries.map((e) => {
      // Colour steps with magnitude, not with rank position: a filter that
      // removes the largest row must not repaint the survivors. The step comes
      // from the value's share of the maximum.
      const share = e.value / max;
      const step = Math.min(5, Math.max(1, Math.ceil(share * 5)));
      const cls = e.unattributed ? 'unattributed' : 'rank-' + step;
      const label = e.name;
      return `
        <div class="bar-row${e.unattributed ? ' unattributed' : ''}"
             title="${esc(label)} — ${fmtMeasure(e.value, measure)}${
               e.complete ? '' : ' (some rows unpriced)'}">
          <div class="bar-label">${esc(label)}</div>
          <div style="flex:1"><div class="bar-track"><div class="bar-seg ${cls}"
               style="width:${(share * 100).toFixed(1)}%"></div></div></div>
          <div class="bar-val">${fmtMeasure(e.value, measure)}</div>
        </div>`;
    }).join('');
  }

  // --- source transparency -------------------------------------------------
  static _sources(s, status) {
    const rep = s.usageReport;
    const rows = [];

    if (!rep) {
      rows.push(`<div class="usage-src-row"><span class="usage-src-detail">
        No reader report found. Usage rows may predate it, or the reader has not
        run since this feature was installed.</span></div>`);
    } else {
      (rep.agents || []).forEach((a) => {
        const errs = (a.errors || []).length;
        rows.push(`
          <div class="usage-src-row">
            <span class="usage-src-name">${esc(a.agent_name)}</span>
            <span class="usage-badge ${a.kind === 'fallback' ? 'fallback' : 'native'}">${
              a.kind === 'fallback' ? 'ccusage' : 'native parser'}</span>
            <span class="usage-src-spacer"></span>
            <span class="usage-src-detail">${a.files_seen.toLocaleString('en-US')} files ·
              ${a.records.toLocaleString('en-US')} new · ${a.files_skipped.toLocaleString('en-US')} unchanged${
              errs ? ` · <span class="usage-warn">${errs} unreadable</span>` : ''}</span>
          </div>`);
      });
      (rep.inactive || []).forEach((i) => {
        rows.push(`
          <div class="usage-src-row">
            <span class="usage-src-name">${esc(i.agent_name)}</span>
            <span class="usage-badge off">unavailable</span>
            <span class="usage-src-spacer"></span>
            <span class="usage-src-detail">${esc(i.hint || 'not installed')}</span>
          </div>`);
      });
      // A parser that failed to load is the one thing here that must never be
      // silent: its agent's tokens are missing from every number on the page.
      (rep.failures || []).forEach((f) => {
        rows.push(`
          <div class="usage-src-row">
            <span class="usage-src-name usage-warn">${esc(f.parser)}</span>
            <span class="usage-badge bad">failed to load</span>
            <span class="usage-src-spacer"></span>
            <span class="usage-src-detail usage-warn">${esc(f.stage)}: ${esc(f.error)}</span>
          </div>`);
      });
      rows.push(`
        <div class="usage-src-row">
          <span class="usage-src-detail">${(rep.rows_total || 0).toLocaleString('en-US')} rows cached ·
            last read ${esc(rep.started || '?')} UTC · ${esc(String(rep.elapsed_s))}s</span>
        </div>`);
    }

    if (status.state === 'ok') {
      rows.push(`<div class="usage-src-row"><span class="usage-src-detail">
        ${CM.registrySize()} models priced from the registry</span></div>`);
    }
    return `<div class="usage-src">${rows.join('')}</div>`;
  }

  // --- table ---------------------------------------------------------------
  static _table(s, rows, attribution) {
    const sort = s.usageSort || { key: 'timestamp', dir: -1 };

    // Which task each row landed in, so the table can show the same
    // attribution the rankings use rather than a second, quieter answer.
    const taskOf = new Map();
    attribution.buckets.forEach((b) => b.rows.forEach((r) => {
      const cur = taskOf.get(r.request_id);
      taskOf.set(r.request_id, cur ? cur + ' +1' : b.task.title);
    }));

    const enriched = rows.map((r) => {
      const c = CM.costRow(r);
      return { r, cost: c.known ? c.total : null, task: taskOf.get(r.request_id) || null };
    });

    const val = (e, key) => {
      if (key === 'cost') return e.cost;
      if (key === 'task') return e.task || '';
      if (key === 'source') return e.r.source || '';
      return e.r[key];
    };
    enriched.sort((a, a2) => {
      const x = val(a, sort.key), y = val(a2, sort.key);
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;      // nulls last, both ways
      if (y === null || y === undefined) return -1;
      return (x > y ? 1 : -1) * sort.dir;
    });

    const shown = enriched.slice(0, TABLE_LIMIT);
    const head = TABLE_COLS.map((c) => `
      <th class="${c.num ? 'num' : ''}" data-sort="${c.key}">${esc(c.label)}${
        sort.key === c.key ? ` <span class="usage-sort-arrow">${sort.dir > 0 ? '▲' : '▼'}</span>` : ''}</th>`).join('');

    const num = (v) => v === null || v === undefined
      ? '<span class="na">—</span>' : Number(v).toLocaleString('en-US');

    const body = shown.map((e) => `
      <tr>
        <td>${esc(String(e.r.timestamp || '').replace('T', ' ').replace(/\..*$/, ''))}</td>
        <td>${e.task ? esc(e.task) : '<span class="na">unattributed</span>'}</td>
        <td>${esc(e.r.source || '')}</td>
        <td>${e.r.model_id ? esc(e.r.model_id) : '<span class="na">—</span>'}</td>
        <td class="num">${num(e.r.input_tokens)}</td>
        <td class="num">${num(e.r.cache_read_tokens)}</td>
        <td class="num">${num(e.r.cache_write_5m)}</td>
        <td class="num">${num(e.r.cache_write_1h)}</td>
        <td class="num">${num(e.r.output_tokens)}</td>
        <td class="num">${e.cost === null ? '<span class="na">—</span>' : CM.fmtCost(e.cost)}</td>
      </tr>`).join('');

    return `
      <div class="usage-table-wrap">
        <table class="usage-table">
          <thead><tr>${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      ${enriched.length > TABLE_LIMIT ? `<div class="usage-foot">Showing the first
        ${TABLE_LIMIT.toLocaleString('en-US')} of ${enriched.length.toLocaleString('en-US')} rows in
        this sort order. Narrow the filters to see the rest.</div>` : ''}
    `;
  }

  // --- footnotes -----------------------------------------------------------
  static _footnotes(s, sum, attribution) {
    const unatt = attribution.unattributed.rows.length;
    const parts = [];

    // The one footnote §6 requires, and it goes on the page once.
    parts.push(`<strong>Cost is modelled, not billed.</strong> It is what these
      tokens would cost at the provider's published API prices. On a Pro or Max
      subscription they draw against a plan instead, so this is a comparison
      figure, not an accounting one.`);

    if (unatt) {
      parts.push(`${unatt.toLocaleString('en-US')} of ${sum.rows.toLocaleString('en-US')} requests
        (${(100 * unatt / sum.rows).toFixed(0)}%) fall outside every logged task span
        and are counted as <em>Unattributed</em>. That is agents working without
        bracketing a task, not a gap in the reader.`);
    }
    if (attribution.splitRows) {
      parts.push(`${attribution.splitRows.toLocaleString('en-US')} request${
        attribution.splitRows === 1 ? '' : 's'} fell inside more than one task span
        — concurrent agents on one branch — and ${attribution.splitRows === 1 ? 'was' : 'were'}
        split evenly rather than counted twice.`);
    }
    if (sum.unknownModels.length) {
      parts.push(`No price for ${sum.unknownModels.map((m) => `<code>${esc(m)}</code>`).join(', ')}.
        Tokens are still counted; cost shows —. Add the model to
        <code>script/llm_registry.py</code> and run
        <code>python seed/py2js_registry.py</code>.`);
    }
    return `<div class="usage-foot">${parts.map((p) => `<p style="margin:6px 0">${p}</p>`).join('')}</div>`;
  }

  // --- events --------------------------------------------------------------
  static attach(host) {
    host.querySelectorAll('.measure-toggle button').forEach((el) => {
      el.onclick = () => window.LogApp.setMeasure(el.getAttribute('data-measure'));
    });
    host.querySelectorAll('.usage-rank-tabs button').forEach((el) => {
      el.onclick = () => {
        window.LogApp.state.usageRank = el.getAttribute('data-rank');
        window.LogApp.render();
      };
    });
    host.querySelectorAll('.usage-table thead th').forEach((el) => {
      el.onclick = () => {
        const key = el.getAttribute('data-sort');
        const cur = window.LogApp.state.usageSort || { key: 'timestamp', dir: -1 };
        window.LogApp.state.usageSort = { key, dir: cur.key === key ? -cur.dir : -1 };
        window.LogApp.render();
      };
    });
  }
}

window.LogUsage = LogUsage;
})(window);
