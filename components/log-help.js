(function (window) {
'use strict';
const LogComponent = window.LogComponent;
const { esc } = window.LRC;

/* --- Topic manifest. One HTML fragment per topic under docs/. Only the
   titles and the nav order live here; the prose is edited as HTML. --- */
const TITLES = {
  started: 'Getting started',
  install: 'Installation',
  header: 'The header row',
  sidebar: 'Filters and the tree',
  hierarchy: 'Hierarchy page',
  chronology: 'Chronology page',
  timegoes: 'Where time goes',
  metrics: 'Metrics page',
  models: 'Models & pricing',
  maint: 'Maintenance page',
  detail: 'Entry detail panel',
  architecture: 'Architecture',
  datamodel: 'Data model',
  queries: 'Queries',
  parsers: 'Model parsers',
  timemodel: 'Duration and idle model',
  design: 'Page design',
  dsmaster: 'Master layout',
  dshierarchy: 'Hierarchy layout',
  dschrono: 'Chronology layout',
  dstime: 'Where time goes layout',
  dsmetrics: 'Metrics layout',
  dsmodels: 'Models layout',
  dsmaint: 'Maintenance layout',
  prompts: 'Agent logging prompts'
};

/* --- Nav structure --- */
const USER_GUIDE = ['started', 'install', 'header', 'sidebar', 'hierarchy', 'chronology', 'timegoes', 'metrics', 'models', 'maint', 'detail'];
const DEV_GUIDE = ['architecture', 'datamodel', 'queries', 'parsers', 'timemodel', 'design', 'dsmaster', 'dshierarchy', 'dschrono', 'dstime', 'dsmetrics', 'dsmodels', 'dsmaint', 'prompts'];
const SUB_ITEMS = new Set(['dsmaster', 'dshierarchy', 'dschrono', 'dstime', 'dsmetrics', 'dsmodels', 'dsmaint']);
const FLAT = USER_GUIDE.concat(DEV_GUIDE);
const DOC_VERSION = 31;

// Fragments are fetched once and kept, so revisiting a topic re-renders
// synchronously — both components re-render on every state update. `text` is
// the tag-stripped fragment, which is what the search box matches against.
const cache = new Map();
const text = new Map();
let prefetched = false;

async function loadDoc(id) {
  if (cache.has(id)) return cache.get(id);
  const res = await fetch('docs/' + id + '.html?v=' + DOC_VERSION);
  if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
  const html = await res.text();
  cache.set(id, html);
  const el = document.createElement('div');
  el.innerHTML = html;
  text.set(id, (el.textContent || '').replace(/\s+/g, ' ').toLowerCase());
  return html;
}

// Search matches prose, not just headings, so every fragment has to be in
// memory. They are small and static; fetch them once, one at a time so the
// visible topic is never queued behind twenty others.
async function prefetchAll(onDone) {
  if (prefetched) return;
  prefetched = true;
  for (const id of FLAT) {
    try { await loadDoc(id); } catch (e) { /* a missing file just cannot match */ }
  }
  onDone();
}

// Search state is local to the nav: typing must not re-render the dashboard,
// and the input itself is never rebuilt while the results below it are.
let query = '';
let searchFocused = false;

const currentTopic = () => {
  const id = window.LogApp?.state?.helpTopic;
  return TITLES[id] ? id : 'started';
};

/* --- The outline, shown in the sidebar in place of the filters --- */
class LogHelpNav extends LogComponent {
  render() {
    return `
      <input class="filter-search" placeholder="Search the guide" data-help-search="1" value="${esc(query)}">
      <div class="help-nav-results">${this._resultsHTML()}</div>`;
  }

  _matches() {
    const q = query.trim().toLowerCase();
    if (!q) return null; // no search: show everything
    const hits = new Map();
    for (const id of FLAT) {
      const inTitle = TITLES[id].toLowerCase().includes(q);
      const inBody = (text.get(id) || '').includes(q);
      if (inTitle || inBody) hits.set(id, inTitle ? 'title' : 'text');
    }
    return hits;
  }

  _resultsHTML() {
    const current = currentTopic();
    const hits = this._matches();
    const q = query.trim();

    const navItem = (id) => {
      if (hits && !hits.has(id)) return '';
      const sub = SUB_ITEMS.has(id) ? ' help-nav-sub' : '';
      const active = id === current ? ' active' : '';
      const label = q ? this._mark(TITLES[id], q) : esc(TITLES[id]);
      const hint = hits && hits.get(id) === 'text' ? '<span class="help-nav-hint">in text</span>' : '';
      return `<button class="help-nav-item${sub}${active}" data-topic="${id}">${label}${hint}</button>`;
    };
    const group = (heading, ids) => {
      const items = ids.map(navItem).join('');
      if (!items) return '';
      return `
        <div class="help-nav-group">
          <div class="help-nav-heading">${heading}</div>
          ${items}
        </div>`;
    };

    const groups = group('User Guide', USER_GUIDE) + group('Developer Guide', DEV_GUIDE);
    if (!q) return groups;
    const count = hits.size;
    const pending = prefetched && text.size < FLAT.length ? ' · still indexing' : '';
    return `
      <div class="help-nav-count">
        <span>${count} of ${FLAT.length} topics${pending}</span>
        <button class="help-nav-clear" data-clear-search="1">Clear</button>
      </div>
      ${groups || '<div class="help-nav-empty">Nothing matches “' + esc(q) + '”.</div>'}`;
  }

  // Highlight the hit inside a title. The title is escaped first, so the query
  // is matched against escaped text — fine for words, which is what titles are.
  _mark(title, q) {
    const safe = esc(title);
    const i = safe.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return safe;
    return safe.slice(0, i) + '<mark>' + safe.slice(i, i + q.length) + '</mark>' + safe.slice(i + q.length);
  }

  attach() {
    this._wireResults();

    const search = this.querySelector('[data-help-search]');
    if (search) {
      // Filtering is local, so it can run per keystroke: only the results
      // below the input are repainted, and the caret is never disturbed.
      search.oninput = () => { query = search.value; this._paint(); };
      search.onfocus = () => { searchFocused = true; };
      search.onblur = () => { searchFocused = false; };
      search.onkeydown = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); query = ''; search.value = ''; this._paint(); }
      };
      // A background re-render (poll tick, page switch) rebuilds this input.
      if (searchFocused) {
        search.focus();
        const n = search.value.length;
        search.setSelectionRange(n, n);
      }
    }

    prefetchAll(() => { if (this.isConnected && query.trim()) this._paint(); });
  }

  _paint() {
    const host = this.querySelector('.help-nav-results');
    if (!host) return;
    host.innerHTML = this._resultsHTML();
    this._wireResults();
  }

  _wireResults() {
    this.querySelectorAll('[data-topic]').forEach((el) => {
      el.onclick = () => window.LogApp.setHelpTopic(el.getAttribute('data-topic'));
    });
    const clear = this.querySelector('[data-clear-search]');
    if (clear) clear.onclick = () => {
      query = '';
      const search = this.querySelector('[data-help-search]');
      if (search) search.value = '';
      this._paint();
    };
  }
}

/* --- The article, shown in the content region like any other page --- */
class LogHelp extends LogComponent {
  render() {
    const current = currentTopic();
    return `
      <article class="help-article">
        <h1 class="help-article-title">${esc(TITLES[current])}</h1>
        <div class="help-article-body">${cache.get(current) ?? '<p class="help-loading">Loading…</p>'}</div>
        ${this._footerHTML(current)}
      </article>`;
  }

  _footerHTML(current) {
    const idx = FLAT.indexOf(current);
    const prev = idx > 0 ? FLAT[idx - 1] : null;
    const next = idx < FLAT.length - 1 ? FLAT[idx + 1] : null;
    return `
      <div class="help-article-footer">
        ${prev ? `<button class="help-prev" data-prev="${prev}">← ${esc(TITLES[prev])}</button>` : '<span></span>'}
        ${next ? `<button class="help-next" data-next="${next}">${esc(TITLES[next])} →</button>` : '<span></span>'}
      </div>`;
  }

  attach() {
    const prevBtn = this.querySelector('[data-prev]');
    if (prevBtn) prevBtn.onclick = () => window.LogApp.setHelpTopic(prevBtn.getAttribute('data-prev'));
    const nextBtn = this.querySelector('[data-next]');
    if (nextBtn) nextBtn.onclick = () => window.LogApp.setHelpTopic(nextBtn.getAttribute('data-next'));

    const current = currentTopic();
    // Only a genuine topic change goes back to the top; a poll tick must not
    // yank the page out from under whoever is reading it.
    if (current !== this._lastTopic) {
      const host = this.closest('.page-host');
      if (host) host.scrollTop = 0;
      this._lastTopic = current;
    }

    if (cache.has(current)) return;
    const body = this.querySelector('.help-article-body');
    loadDoc(current).then((html) => {
      // A later topic may have been selected while this fetch was in flight.
      if (!body.isConnected || currentTopic() !== current) return;
      body.innerHTML = html;
    }).catch((e) => {
      if (body.isConnected) body.innerHTML = `<p class="help-loading">Could not load docs/${current}.html (${esc(e.message)}).</p>`;
    });
  }
}

customElements.define('log-help-nav', LogHelpNav);
customElements.define('log-help', LogHelp);
})(window);
