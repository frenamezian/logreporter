(function (window) {
'use strict';

// A reference view over the generated registry in script/llm_registry.js.
//
// cost-model.js reads the same file, and the two must not be merged. That one
// resolves a counter to the single rate that applies, walking a fallback chain
// until something matches — an OpenAI cache read priced as `cached_input`, an
// Anthropic one as `cache_read`, and a provider that does not discount cache
// reads at all priced at `standard`. That is right for costing a request.
//
// It is wrong for a catalogue. Here the absence of a tier is the fact worth
// reporting: a cache column that quietly fell back to the standard rate would
// tell the reader this provider caches for free. So this file reads the tiers
// as they are stored, and renders a missing tier as an em dash — never as a
// fallback, and never as $0.00, because six models in the registry genuinely
// cost nothing and that zero has to keep meaning "free".

const REGISTRY = window.LLM_REGISTRY || {};

// Providers disagree about what a cache is called. The catalogue shows each
// provider its own vocabulary rather than a normalised label, which is only
// possible because the table lives inside a provider panel.
// Kept in step with cost-model.js's cache_read_tokens chain: a provider whose
// name is missing here loses its cache-read column entirely, which reads as
// "this model has no cache discount" rather than "we did not look". The audio
// and >200k variants are out for the same reasons they are out there.
const CACHE_READ_TIERS = ['cache_read', 'cached_input', 'context_cache',
                          'context_cache_text', 'cached_text'];
const CACHE_WRITE_TIERS = ['cache_write_5m', 'cache_write_1h'];

// A tier named intro_<something>_until_YYYY_MM_DD is a launch price with an end
// date, and it displaces `standard` until that date passes. Sonnet 5 has one
// today: its stored standard is $3.00 but nobody pays that before 2026-09-01.
// A pricing page that ignored this would be wrong about the present.
const INTRO_RE = /_until_(\d{4})_(\d{2})_(\d{2})$/;

const STATUSES = ['active', 'preview', 'legacy', 'deprecated'];
const CAPABILITIES = ['coding', 'reasoning', 'vision', 'long-context', 'tools'];
const LATENCY = ['fastest', 'fast', 'medium', 'slow'];

const today = () => new Date().toISOString().slice(0, 10);

// --- tier access -------------------------------------------------------------

// { tier_name: {value, per, order} } for one price group of one model.
function tiers(model, group) {
  const out = {};
  ((model.pricing || {})[group] || []).forEach((t) => {
    if (typeof t.price_value !== 'number') return;
    // Read price_per_qty rather than trusting the 1,000,000 convention: a
    // future provider quoted per 1,000 would otherwise be 1000x wrong and look
    // entirely plausible on screen.
    out[t.tier_name] = { value: t.price_value, per: t.price_per_qty || 1e6, order: t.tier_order || 0 };
  });
  return out;
}

// Price per 1M tokens for one tier, or null when the model has no such tier.
function priceOf(map, name) {
  const t = map[name];
  if (!t) return null;
  return (t.value / t.per) * 1e6;
}

// The first tier of `names` this model actually prices. Order matters: it is a
// preference list over synonyms, not a fallback to something cheaper.
function firstTier(map, names) {
  for (let i = 0; i < names.length; i += 1) if (map[names[i]]) return names[i];
  return null;
}

// The end date encoded in an intro tier's name, or null for an ordinary tier.
function introUntil(tierName) {
  const m = INTRO_RE.exec(tierName);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// The intro tier in force on `day`, if any.
function introTier(map, day) {
  const names = Object.keys(map);
  for (let i = 0; i < names.length; i += 1) {
    const until = introUntil(names[i]);
    if (until && day <= until) return { tier: names[i], until, value: priceOf(map, names[i]) };
  }
  return null;
}

// What a standard-tier token costs today, and whether that is the stored
// standard price or a launch price still in force.
function standardToday(map, day) {
  const std = priceOf(map, 'standard');
  const intro = introTier(map, day);
  if (intro && intro.value !== null) {
    return { value: intro.value, intro: true, until: intro.until, listed: std };
  }
  return { value: std, intro: false, until: null, listed: std };
}

// --- headline columns --------------------------------------------------------

// Which price columns a provider's table shows, derived from the tier names its
// own models use. Four price columns is the ceiling: past that the model id
// starts getting truncated, and everything else is one click away in the tier
// panel.
//
//   input   standard, then cache read, then cache write (Anthropic only)
//   output  standard, then batch — but batch only when the provider has no
//           cache-write column, so the table never grows a fifth price column.
function columnsFor(models) {
  const inNames = {}, outNames = {};
  models.forEach((m) => {
    Object.keys(tiers(m, 'input_token')).forEach((n) => { inNames[n] = 1; });
    Object.keys(tiers(m, 'output_token')).forEach((n) => { outNames[n] = 1; });
  });

  const cols = [{ key: 'in_std', group: 'input_token', tier: 'standard', label: 'std', side: 'in' }];

  const read = firstTier(inNames, CACHE_READ_TIERS);
  if (read) cols.push({ key: 'in_cache', group: 'input_token', tier: read, label: read.replace(/_/g, ' '), side: 'in' });

  const write = CACHE_WRITE_TIERS.filter((t) => inNames[t]);
  if (write.length) {
    cols.push({ key: 'in_write', group: 'input_token', tiers: write, side: 'in',
                label: 'cache write ' + write.map((t) => t.replace('cache_write_', '')).join(' / ') });
  }

  cols.push({ key: 'out_std', group: 'output_token', tier: 'standard', label: 'std', side: 'out' });
  if (!write.length && outNames.batch) {
    cols.push({ key: 'out_batch', group: 'output_token', tier: 'batch', label: 'batch', side: 'out' });
  }
  return cols;
}

// The value shown in one headline cell: an array so the cache-write column can
// render "6.25 / 10.00" without a second code path.
function cellValues(model, col, day) {
  const map = tiers(model, col.group);
  if (col.tiers) return col.tiers.map((t) => priceOf(map, t));
  if (col.tier === 'standard') {
    const s = standardToday(map, day);
    return [s.value, s.intro ? s : null];
  }
  return [priceOf(map, col.tier)];
}

// --- the tier panel ----------------------------------------------------------

// Every tier of one model, as rows keyed by tier name with an input and an
// output price. The registry stores the two directions as independent lists,
// but their tier names overlap heavily — joining on the name turns nine
// scattered numbers into six comparable lines, and makes the asymmetry legible:
// no provider in the registry prices cached output, because caching is an
// input-side concept.
function tierRows(model) {
  const inMap = tiers(model, 'input_token');
  const outMap = tiers(model, 'output_token');
  const inStd = priceOf(inMap, 'standard');
  const outStd = priceOf(outMap, 'standard');

  const names = Object.keys(inMap).sort((a, b) => inMap[a].order - inMap[b].order);
  Object.keys(outMap)
    .sort((a, b) => outMap[a].order - outMap[b].order)
    .forEach((n) => { if (!inMap[n]) names.push(n); });

  // Ratio against the same direction's standard rate. Kept per direction on
  // purpose: gpt-5.4's long-context tier is +100% on input and +50% on output,
  // so a single "vs standard" column would have to pick one and be wrong about
  // the other.
  const ratio = (v, std) => (v === null || std === null || !std ? null : v / std - 1);

  return names.map((n) => {
    const i = priceOf(inMap, n);
    const o = priceOf(outMap, n);
    return {
      tier: n,
      input: i,
      output: o,
      ratioIn: n === 'standard' ? null : ratio(i, inStd),
      ratioOut: n === 'standard' ? null : ratio(o, outStd),
      until: introUntil(n)
    };
  });
}

// How many of a model's tiers the headline columns do not already show. This is
// the "+N" chip, and it counts distinct tier names rather than price cells:
// "+2 more tiers" is a promise about what opening the row reveals.
function hiddenTierCount(model, cols) {
  const shown = {};
  cols.forEach((c) => (c.tiers || [c.tier]).forEach((t) => { shown[t] = 1; }));
  const all = {};
  tierRows(model).forEach((r) => { all[r.tier] = 1; });
  return Object.keys(all).filter((t) => !shown[t]).length;
}

// 19 models in the registry have no standard input tier — the realtime family
// is priced per modality, and the retired deep-research models were batch-only.
// Their headline row is all em dashes, so the row says what it is priced by
// instead of leaving the reader to open it and guess.
function noStandardNote(model) {
  const inMap = tiers(model, 'input_token');
  if (inMap.standard) return null;
  const outMap = tiers(model, 'output_token');
  const list = (map) => Object.keys(map)
    .sort((a, b) => map[a].order - map[b].order)
    .slice(0, 3)
    .map((n) => n.replace(/_/g, ' ') + ' ' + fmtPrice(priceOf(map, n)))
    .join(', ');
  const parts = [];
  if (Object.keys(inMap).length) parts.push(list(inMap) + ' in');
  if (Object.keys(outMap).length) parts.push(list(outMap) + ' out');
  return 'no standard tier — priced by ' + parts.join(' · ');
}

// --- the catalogue -----------------------------------------------------------

let cache = null;

function build() {
  const day = today();
  return Object.keys(REGISTRY).map((key) => {
    const p = REGISTRY[key];
    const models = (p.models || []).map((m) => ({ ...m, _provider: key }));
    const cols = columnsFor(models);

    const counts = {};
    STATUSES.forEach((s) => { counts[s] = 0; });
    const ins = [], outs = [];
    models.forEach((m) => {
      counts[m.status] = (counts[m.status] || 0) + 1;
      const i = standardToday(tiers(m, 'input_token'), day).value;
      const o = standardToday(tiers(m, 'output_token'), day).value;
      if (i !== null) ins.push(i);
      if (o !== null) outs.push(o);
    });

    return {
      key,
      name: p.provider_name || key,
      url: p.provider_url || '',
      models,
      cols,
      counts,
      // The one fact that makes a closed panel worth reading: which provider to
      // open. Free models are in here, so an empty range is possible.
      range: {
        inMin: ins.length ? Math.min(...ins) : null, inMax: ins.length ? Math.max(...ins) : null,
        outMin: outs.length ? Math.min(...outs) : null, outMax: outs.length ? Math.max(...outs) : null
      }
    };
  });
}

function providers() {
  if (!cache) cache = build();
  return cache;
}

// --- filtering ---------------------------------------------------------------

function matches(model, f) {
  if ((f.status || []).length && !f.status.includes(model.status)) return false;
  if ((f.capability || []).length) {
    const caps = model.capabilities || [];
    if (!f.capability.every((c) => caps.includes(c))) return false;
  }
  if (f.minContext && (model.context_window || 0) < Number(f.minContext)) return false;
  const q = (f.search || '').trim().toLowerCase();
  if (q) {
    const hay = [model.model_name, model.model_id, model.description, (model.capabilities || []).join(' ')]
      .join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

// Providers with their models filtered, plus the counts needed to say what was
// hidden. A provider filtered down to nothing is dropped; a provider whose
// models are all hidden by the status filter keeps its panel and says so.
function view(f) {
  const sort = f.sort || 'registry';
  return providers()
    .filter((p) => !(f.provider || []).length || f.provider.includes(p.key))
    .map((p) => {
      const shown = p.models.filter((m) => matches(m, f));
      return { ...p, shown: sortModels(shown, sort), hidden: p.models.length - shown.length };
    })
    .filter((p) => p.shown.length || !(f.search || '').trim());
}

function sortModels(models, sort) {
  if (sort === 'registry') return models;
  const day = today();
  const price = (m, group) => standardToday(tiers(m, group), day).value;
  const key = {
    input: (m) => price(m, 'input_token'),
    output: (m) => price(m, 'output_token'),
    context: (m) => m.context_window || 0,
    name: (m) => m.model_name || ''
  }[sort];
  if (!key) return models;
  const dir = sort === 'context' ? -1 : 1;
  return models.slice().sort((a, b) => {
    const x = key(a), y = key(b);
    // A model with no price for the sort key sorts last rather than as zero.
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    if (typeof x === 'string') return x.localeCompare(y);
    return (x - y) * dir;
  });
}

// --- formatting --------------------------------------------------------------

// CostModel.fmtCost is for money already spent and rounds below a cent to
// "<$0.01". A rate card cannot do that: $0.0375 per million is a real published
// price, not a rounding error.
// Trailing zeros are trimmed, but never below two decimals: $5.00 and $0.0375
// are both published prices and both have to survive intact.
function fmtPrice(v) {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  if (v === 0) return '$0';
  let s = v.toFixed(4).replace(/0+$/, '');
  if ((s.split('.')[1] || '').length < 2) s = v.toFixed(2);
  return '$' + s;
}

function fmtRatio(r) {
  if (r === null || r === undefined || !isFinite(r)) return '';
  if (Math.abs(r) < 0.005) return '±0%';
  const pct = Math.round(r * 100);
  return (r > 0 ? '+' : '−') + Math.abs(pct) + '%';
}

function fmtContext(n) {
  if (!n) return '—';
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'k';
  return String(n);
}

window.ModelCatalog = {
  STATUSES, CAPABILITIES, LATENCY,
  providers, view, tiers, priceOf, tierRows, hiddenTierCount, noStandardNote,
  columnsFor, cellValues, standardToday, introUntil, today,
  fmtPrice, fmtRatio, fmtContext,
  _reset: () => { cache = null; }
};
})(window);
