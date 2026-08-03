(function (window) {
'use strict';
const LogComponent = window.LogComponent;
const { esc } = window.LRC;
const MC = window.ModelCatalog;

// The Models page: the LLM registry as a rate card.
//
// Three levels of disclosure, because the registry is 102 models across eight
// providers and nobody reads that as one table. A closed provider panel carries
// its price range — the one fact that tells you which panel to open. An open
// one shows the prices you actually compare on: standard and cache, input and
// output. Everything else — batch, flex, priority, long-context, fast mode —
// lives one click further in, per model.
//
// Prices come from ModelCatalog, never from CostModel: see the note at the top
// of script/model-catalog.js for why a rate card must not use a fallback chain.

const STATUS_GLYPH = { active: '●', preview: '◐', legacy: '○', deprecated: '⚠' };
const CONTEXT_STEPS = [
  ['', 'any'], ['128000', '128k+'], ['200000', '200k+'], ['400000', '400k+'], ['1000000', '1M+']
];
const SORTS = [
  ['registry', 'Provider order'], ['name', 'Name'],
  ['input', 'Input price'], ['output', 'Output price'], ['context', 'Context window']
];

// Search focus is tracked here rather than on LogApp.state: every keystroke
// re-renders the shell, which rebuilds the input, and the caret has to be put
// back. Nothing outside this file needs to know that.
let searchFocused = false;

const filterState = () => window.LogApp.state.modelsFilter;

/* --- the sidebar panel, shown in place of the log filters --- */
class LogModelsFilters extends LogComponent {
  render() {
    const f = filterState();
    const providers = MC.providers();
    const active = window.LogApp.modelsFilterCount();

    const boxes = (label, options) => `
      <div class="filter-group mp-filter-group">
        <h4>${label}</h4>
        <div class="filter-body">${options}</div>
      </div>`;

    const providerBoxes = providers.map((p) => option('provider', p.key, p.name,
      (f.provider || []).includes(p.key), p.models.length)).join('');
    const statusBoxes = MC.STATUSES.map((s) => option('status', s, STATUS_GLYPH[s] + ' ' + s,
      (f.status || []).includes(s), countStatus(providers, s))).join('');
    const capBoxes = MC.CAPABILITIES.map((c) => option('capability', c, c,
      (f.capability || []).includes(c), null)).join('');

    return `
      <div class="filter-group">
        <h4 class="section-head">
          Model filters
          ${active ? `<span class="filter-count-pill">${active}</span>` : ''}
          <button class="section-head-btn" data-clear-models="1"${active ? '' : ' disabled'}
                  title="Reset every model filter">Reset</button>
        </h4>
        <input class="filter-search" placeholder="Search name, id, description"
               data-model-search="1" value="${esc(f.search || '')}">
      </div>
      ${boxes('Provider', providerBoxes)}
      ${boxes('Status', statusBoxes)}
      ${boxes('Capability', capBoxes)}
      <div class="filter-group mp-filter-group">
        <h4>Context window</h4>
        <div class="filter-row">
          <select data-model-context="1">
            ${CONTEXT_STEPS.map(([v, l]) =>
              `<option value="${v}"${String(f.minContext || '') === v ? ' selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="filter-group mp-filter-group">
        <h4>Sort models by</h4>
        <div class="filter-body">
          ${SORTS.map(([v, l]) => `
            <label class="ms-option">
              <input type="radio" name="mp-sort" value="${v}"${(f.sort || 'registry') === v ? ' checked' : ''}
                     data-model-sort="1">${esc(l)}
            </label>`).join('')}
        </div>
      </div>`;
  }

  attach() {
    this.querySelectorAll('[data-model-key]').forEach((el) => {
      el.onchange = () => window.LogApp.toggleModelsFilter(el.getAttribute('data-model-key'), el.value);
    });
    this.querySelectorAll('[data-model-sort]').forEach((el) => {
      el.onchange = () => window.LogApp.setModelsFilter('sort', el.value);
    });
    const ctx = this.querySelector('[data-model-context]');
    if (ctx) ctx.onchange = () => window.LogApp.setModelsFilter('minContext', ctx.value);
    const clear = this.querySelector('[data-clear-models]');
    if (clear) clear.onclick = () => window.LogApp.clearModelsFilter();

    const search = this.querySelector('[data-model-search]');
    if (!search) return;
    search.oninput = () => window.LogApp.setModelsFilter('search', search.value);
    search.onfocus = () => { searchFocused = true; };
    search.onblur = () => { searchFocused = false; };
    search.onkeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); window.LogApp.setModelsFilter('search', ''); }
    };
    // Typing re-rendered the shell and rebuilt this input; put the caret back.
    if (searchFocused) {
      search.focus();
      const n = search.value.length;
      search.setSelectionRange(n, n);
    }
  }
}

function option(key, value, label, checked, count) {
  return `<label class="ms-option">
    <input type="checkbox" value="${esc(value)}" ${checked ? 'checked' : ''} data-model-key="${key}">
    <span class="mp-opt-label">${esc(label)}</span>
    ${count === null ? '' : `<span class="mp-opt-count">${count}</span>`}
  </label>`;
}

function countStatus(providers, status) {
  return providers.reduce((n, p) => n + (p.counts[status] || 0), 0);
}

/* --- the page --- */
class LogModels extends LogComponent {
  render() {
    if (!MC) return '<div class="empty">script/model-catalog.js did not load.</div>';
    const s = window.LogApp.state;
    const f = filterState();
    const view = MC.view(f);
    const shown = view.reduce((n, p) => n + p.shown.length, 0);
    const total = MC.providers().reduce((n, p) => n + p.models.length, 0);

    if (!shown) {
      return `<div class="empty">No model matches these filters.
        <button class="small" data-clear-models="1">Reset filters</button></div>`;
    }

    return `
      <div class="mp-summary">
        <span><strong>${shown}</strong> of ${total} models · ${view.length} provider${view.length === 1 ? '' : 's'}</span>
        <span class="mp-summary-note">US$ per 1,000,000 tokens · generated from
          script/llm_registry.py</span>
      </div>
      ${view.map((p) => this._provider(p, s, f)).join('')}
      <div class="mp-legend">
        ${MC.STATUSES.map((k) => `<span><span class="mp-dot ${k}">${STATUS_GLYPH[k]}</span> ${k}</span>`).join('')}
        <span class="mp-legend-note">Ranges are the standard tier. An em dash is a tier the
          provider does not price — never a zero.</span>
      </div>`;
  }

  _provider(p, s, f) {
    // A search says what to look at more precisely than a saved open/closed
    // state does, so a matching panel opens itself for as long as it matches.
    const open = (f.search || '').trim() ? true : s.modelsOpen.has(p.key);
    const counts = MC.STATUSES
      .filter((k) => p.counts[k])
      .map((k) => `<span class="mp-dot ${k}" title="${p.counts[k]} ${k}">${STATUS_GLYPH[k]}${p.counts[k]}</span>`)
      .join('');
    const r = p.range;
    const range = r.inMin === null ? '' :
      `in ${MC.fmtPrice(r.inMin)}–${MC.fmtPrice(r.inMax)} · out ${MC.fmtPrice(r.outMin)}–${MC.fmtPrice(r.outMax)}`;

    return `
      <section class="mp-provider${open ? ' open' : ''}">
        <div class="mp-provider-head">
          <button class="mp-provider-toggle" data-provider="${esc(p.key)}">
            <span class="caret">${open ? '▾' : '▸'}</span>
            <span class="mp-provider-name">${esc(p.name)}</span>
            <span class="mp-provider-count">${p.shown.length}${p.hidden ? ` of ${p.models.length}` : ''} models</span>
            <span class="mp-provider-status">${counts}</span>
            <span class="mp-provider-range">${range}</span>
          </button>
          ${p.url ? `<a class="mp-provider-src" href="${esc(p.url)}" target="_blank" rel="noopener"
                        title="${esc(p.url)}">↗ pricing</a>` : ''}
        </div>
        ${open ? `<div class="mp-provider-body">${this._table(p, s)}</div>` : ''}
      </section>`;
  }

  _table(p, s) {
    const cols = p.cols;
    const ins = cols.filter((c) => c.side === 'in');
    const outs = cols.filter((c) => c.side === 'out');
    const span = 4 + cols.length + 1;

    const rows = p.shown.map((m) => this._modelRows(m, p, cols, s, span)).join('');
    const hidden = p.hidden
      ? `<div class="mp-more">${p.hidden} model${p.hidden === 1 ? '' : 's'} hidden by the
           status filter <button class="mp-link" data-show-all="1">show every status</button></div>`
      : '';

    return `
      <table class="mp-table">
        <thead>
          <tr class="mp-group-row">
            <th colspan="4"></th>
            <th colspan="${ins.length}" class="mp-group in">Input — US$ / 1M</th>
            <th colspan="${outs.length}" class="mp-group out">Output</th>
            <th></th>
          </tr>
          <tr>
            <th>Model</th><th>Model id</th><th class="mp-num">Ctx</th><th></th>
            ${cols.map((c) => `<th class="mp-num">${esc(c.label)}</th>`).join('')}
            <th class="mp-num" title="tiers not shown above">tiers</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${hidden}`;
  }

  _modelRows(m, p, cols, s, span) {
    const id = p.key + '/' + m.model_id;
    const open = s.modelRowOpen.has(id);
    const day = MC.today();
    const extra = MC.hiddenTierCount(m, cols);

    const cells = cols.map((c) => {
      const vals = MC.cellValues(m, c, day);
      if (c.tiers) {
        // The cache-write pair reads as one price with two retentions.
        const txt = vals.map((v) => MC.fmtPrice(v)).join(' / ');
        return `<td class="mp-num">${vals.every((v) => v === null) ? '—' : esc(txt)}</td>`;
      }
      const intro = vals[1];
      const price = MC.fmtPrice(vals[0]);
      if (!intro) return `<td class="mp-num">${price}</td>`;
      return `<td class="mp-num">${price}<sup class="mp-intro"
        title="introductory price until ${esc(intro.until)}; ${MC.fmtPrice(intro.listed)} after">intro</sup></td>`;
    }).join('');

    const note = MC.noStandardNote(m);
    const noteRow = note
      ? `<tr class="mp-note"><td colspan="${span}">${esc(note)}</td></tr>` : '';
    const expiryRow = m.expiration_date
      ? `<tr class="mp-note warn"><td colspan="${span}">⚠ retires ${esc(m.expiration_date)}</td></tr>` : '';

    return `
      <tr class="mp-row${open ? ' open' : ''}" data-model="${esc(id)}">
        <td class="mp-name"><span class="caret">${open ? '▾' : '▸'}</span>${esc(m.model_name)}</td>
        <td class="mp-id">${esc(m.model_id)}</td>
        <td class="mp-num">${MC.fmtContext(m.context_window)}</td>
        <td class="mp-status"><span class="mp-dot ${m.status}" title="${esc(m.status)}">${STATUS_GLYPH[m.status] || ''}</span></td>
        ${cells}
        <td class="mp-num">${extra ? `<span class="mp-chip">+${extra}</span>` : ''}</td>
      </tr>
      ${noteRow}${expiryRow}
      ${open ? `<tr class="mp-drawer-row"><td colspan="${span}">${this._drawer(m, p)}</td></tr>` : ''}`;
  }

  _drawer(m, p) {
    const rows = MC.tierRows(m);
    const day = MC.today();

    const tierRow = (r, i) => {
      // A launch price is the rate that actually applies until its end date, so
      // the row says which side of that date today falls on.
      const label = r.until
        ? `${esc(r.tier)} <span class="mp-tag">${day <= r.until ? 'in force' : 'expired'}</span>`
        : esc(r.tier);
      return `
        <tr>
          <td class="mp-num mp-tier-n">${i + 1}</td>
          <td class="mp-tier">${label}</td>
          <td class="mp-num">${MC.fmtPrice(r.input)}</td>
          <td class="mp-num mp-ratio">${MC.fmtRatio(r.ratioIn)}</td>
          <td class="mp-num">${MC.fmtPrice(r.output)}</td>
          <td class="mp-num mp-ratio">${MC.fmtRatio(r.ratioOut)}</td>
        </tr>`;
    };

    const caps = (m.capabilities || []).map((c) => `<span class="tag">${esc(c)}</span>`).join('');
    const regions = (m.regional_availability || []).join(', ');

    return `
      <div class="mp-drawer">
        <p class="mp-desc">${esc(m.description || '')}</p>
        <div class="mp-meta">
          <span><span class="mp-meta-k">context</span> ${Number(m.context_window || 0).toLocaleString('en-US')}</span>
          <span><span class="mp-meta-k">latency</span> ${esc(m.latency_class || '—')}</span>
          <span><span class="mp-meta-k">status</span> ${esc(m.status)}${m.expiration_date ? ' until ' + esc(m.expiration_date) : ''}</span>
          <span><span class="mp-meta-k">regions</span> ${esc(regions || '—')}</span>
        </div>
        <div class="mp-caps">${caps}</div>
        <div class="mp-tiers-head">
          <h5>All pricing tiers</h5>
          <span class="mp-tiers-note">US$ per 1,000,000 tokens · % is against that direction's standard rate</span>
        </div>
        <table class="mp-tier-table">
          <thead>
            <tr><th class="mp-num">#</th><th>tier</th>
                <th class="mp-num">input</th><th class="mp-num">vs std</th>
                <th class="mp-num">output</th><th class="mp-num">vs std</th></tr>
          </thead>
          <tbody>${rows.map(tierRow).join('')}</tbody>
        </table>
        <div class="mp-drawer-foot">
          <span class="mp-drawer-hint">An em dash is a tier this model does not have in that
            direction. No provider prices cached output — caching is an input-side concept.</span>
          <span class="mp-drawer-actions">
            <button class="small" data-copy="${esc(m.model_id)}">Copy model id</button>
            ${p.url ? `<a class="small mp-btn-link" href="${esc(p.url)}" target="_blank" rel="noopener">↗ source</a>` : ''}
          </span>
        </div>
      </div>`;
  }

  attach() {
    this.querySelectorAll('[data-provider]').forEach((b) => {
      b.onclick = () => window.LogApp.toggleModelProvider(b.getAttribute('data-provider'));
    });
    this.querySelectorAll('[data-model]').forEach((tr) => {
      tr.onclick = (e) => {
        if (e.target.closest('a,button')) return;
        window.LogApp.toggleModelRow(tr.getAttribute('data-model'));
      };
    });
    this.querySelectorAll('[data-show-all]').forEach((b) => {
      b.onclick = () => window.LogApp.setModelsFilter('status', MC.STATUSES.slice());
    });
    this.querySelectorAll('[data-clear-models]').forEach((b) => {
      b.onclick = () => window.LogApp.clearModelsFilter();
    });
    this.querySelectorAll('[data-copy]').forEach((b) => {
      b.onclick = async () => {
        const text = b.getAttribute('data-copy');
        try {
          await navigator.clipboard.writeText(text);
          const was = b.textContent;
          b.textContent = 'Copied';
          setTimeout(() => { if (b.isConnected) b.textContent = was; }, 1200);
        } catch (err) {
          // Clipboard access is denied over file:// in some browsers. Say so
          // rather than leaving a button that silently does nothing.
          b.textContent = 'Copy blocked';
        }
      };
    });
  }
}

customElements.define('log-models-filters', LogModelsFilters);
customElements.define('log-models', LogModels);
})(window);
