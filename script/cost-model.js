(function (window) {
'use strict';

// Cost is derived at render time from script/llm_registry.js. There is no cost
// column in token_usage.db and no second rate table anywhere.
//
// This mirrors the rule the project already holds for time: durations are
// never stored, they are recomputed from the start/end pair each time the page
// is drawn. A stored cost silently becomes a lie the day a provider changes
// its prices, and nothing in the file would say so. A derived one is corrected
// by regenerating the registry.
//
// The registry's tier vocabulary already matches the counters, so this file is
// a lookup rather than a table of its own:
//
//   input_tokens       -> standard
//   cache_read_tokens  -> cache_read -> cached_input -> context_cache
//                         -> context_cache_text -> cached_text -> standard
//   cache_write_5m     -> cache_write_5m -> standard
//   cache_write_1h     -> cache_write_1h -> standard
//   output_tokens      -> standard   (from the output_token group)
//
// The cache-read fallbacks are ordered, not alternatives, because every
// provider named the same thing differently: `cache_read` is Anthropic's,
// `cached_input` is OpenAI's and four others', `context_cache` is Gemini 3.x,
// `context_cache_text` is Gemini 2.x, `cached_text` is the OpenAI realtime
// models. No model in the registry carries two of them, so the order is
// documentation rather than precedence — what matters is that all five sit in
// front of `standard`.
//
// `standard` last is the genuine fallback: a provider that prices cache reads
// at the full input rate has none of the above. It is also why this chain has
// to be kept complete. A missing name does not fail loudly as an unpriced row;
// it silently bills a cache read at up to 10x its real rate. The audit that
// added the three Gemini/realtime names found 1.30B tokens priced that way,
// $1,948 against a true $195.
//
// Deliberately absent: `context_cache_audio` and `cached_audio` (wrong
// modality — every counter here is text), and `context_cache_long` /
// `long_context_cached` (the >200k premium variants; every model carrying one
// also carries its base tier, which is the right default for a counter that
// does not record how long the context actually was).

const REGISTRY = window.LLM_REGISTRY || {};

// Counter -> the price group it is billed under, and the tiers to try in order.
const TIERS = {
  input_tokens:      { group: 'input_token',  chain: ['standard'] },
  cache_read_tokens: { group: 'input_token',  chain: ['cache_read', 'cached_input', 'context_cache',
                                                      'context_cache_text', 'cached_text', 'standard'] },
  cache_write_5m:    { group: 'input_token',  chain: ['cache_write_5m', 'standard'] },
  cache_write_1h:    { group: 'input_token',  chain: ['cache_write_1h', 'standard'] },
  output_tokens:     { group: 'output_token', chain: ['standard'] }
};

const COUNTERS = Object.keys(TIERS);

// A tier named intro_<tier>_until_YYYY_MM_DD is a launch price *for that tier*
// with an end date. Sonnet 5 currently has one, `intro_standard_until_2026_08_31`.
// It applies to work done on or before that date and to nothing after it — an
// old session has to price at what it actually cost, not at today's rate.
//
// The `<tier>` in the middle is the one it replaces, and replacing only that
// tier is the whole of the rule. Prepending an intro price to the front of a
// chain instead lets it win over every tier behind it, which is not a launch
// discount but a different price group: Sonnet 5's cache reads priced at the
// intro *input* rate of $2.00/M rather than the $0.30/M cache-read rate, 6.7x
// over, across 2.04B tokens. Capturing the base name here is also what lets a
// future `intro_cache_read_until_...` be a registry edit and not a code change.
const INTRO_RE = /^intro_(.+)_until_(\d{4})_(\d{2})_(\d{2})$/;

// model_id -> { input_token: {tier: price}, output_token: {...}, _intro: [...] }
let index = null;

function buildIndex() {
  const out = new Map();
  Object.keys(REGISTRY).forEach((providerKey) => {
    const provider = REGISTRY[providerKey];
    (provider.models || []).forEach((m) => {
      if (!m.model_id) return;
      const entry = {
        model_id: m.model_id,
        model_name: m.model_name,
        provider: providerKey,
        provider_name: provider.provider_name,
        status: m.status,
        groups: {},
        intro: []
      };
      Object.keys(m.pricing || {}).forEach((group) => {
        const byTier = {};
        (m.pricing[group] || []).forEach((t) => {
          if (typeof t.price_value !== 'number') return;
          // Everything in the registry is per 1,000,000 tokens, but read the
          // field rather than trusting it: a future provider quoted per 1,000
          // would otherwise be 1000x wrong and look plausible.
          byTier[t.tier_name] = { value: t.price_value, per: t.price_per_qty || 1e6 };
          const mm = INTRO_RE.exec(t.tier_name);
          if (mm) entry.intro.push({ group, tier: t.tier_name, replaces: mm[1],
                                     until: `${mm[2]}-${mm[3]}-${mm[4]}` });
        });
        entry.groups[group] = byTier;
      });
      // Deprecated and legacy models keep their historical prices on purpose,
      // so a six-month-old session still costs correctly. Nothing here filters
      // on status.
      out.set(m.model_id, entry);
    });
  });
  return out;
}

function modelIndex() {
  if (!index) index = buildIndex();
  return index;
}

function lookupModel(modelId) {
  if (!modelId) return null;
  return modelIndex().get(modelId) || null;
}

// The date part of a record's ISO-8601 timestamp, for the intro-tier window.
function dayOf(ts) {
  if (!ts) return null;
  const s = String(ts);
  return s.length >= 10 ? s.slice(0, 10) : null;
}

// Resolve one counter to a price per token, or null when the model is unknown.
// Returns { perToken, tier, group } so the UI can say which tier was applied.
function rateFor(entry, counter, opts) {
  if (!entry) return null;
  const spec = TIERS[counter];
  if (!spec) return null;
  const group = entry.groups[spec.group];
  if (!group) return null;

  const chain = spec.chain.slice();

  // Modifiers come before the table, and both fall back to it rather than
  // replacing it: an agent reporting speed "fast" on a model with no fast_mode
  // tier is priced as standard, not left unpriced.
  if (opts && opts.serviceTier === 'batch') chain.unshift('batch');
  if (opts && opts.speed === 'fast') chain.unshift('fast_mode');

  // An intro tier that is still in force substitutes for the single tier it
  // names, wherever that tier sits — it does not jump the queue. See INTRO_RE.
  // Running after the two modifiers above is deliberate: it lets an
  // `intro_batch_until_...` reach the `batch` they unshifted. An intro tier
  // naming a tier this chain never consults substitutes nothing, which is the
  // correct no-op.
  const day = opts && opts.day;
  if (day) {
    entry.intro.forEach((i) => {
      if (i.group !== spec.group || day > i.until) return;
      for (let k = 0; k < chain.length; k += 1) {
        if (chain[k] === i.replaces) chain[k] = i.tier;
      }
    });
  }

  for (let i = 0; i < chain.length; i += 1) {
    const t = group[chain[i]];
    if (t) return { perToken: t.value / t.per, tier: chain[i], group: spec.group };
  }
  return null;
}

// Cost one usage row. Never guesses: an unknown model_id, or a model with no
// price for a counter that has tokens, comes back priced null — which the UI
// renders as an em dash. A wrong number is worse than an absent one here,
// because the absent one tells the reader to go update the registry.
function costRow(row) {
  const entry = lookupModel(row.model_id);
  const opts = {
    day: dayOf(row.timestamp),
    serviceTier: row.service_tier || null,
    speed: row.speed || null
  };

  const out = {
    model: entry,
    known: !!entry,
    total: entry ? 0 : null,
    input: entry ? 0 : null,     // fresh input + cache read + cache write
    output: entry ? 0 : null,
    parts: {},
    tiers: {},
    unpriced: []
  };

  COUNTERS.forEach((c) => {
    const tokens = row[c];
    // NULL means the agent does not report this counter. It is not zero, and
    // it must not become a zero-cost contribution that looks measured.
    if (tokens === null || tokens === undefined) { out.parts[c] = null; return; }
    if (!entry) { out.parts[c] = null; return; }
    const rate = rateFor(entry, c, opts);
    if (!rate) {
      out.parts[c] = null;
      if (tokens > 0) out.unpriced.push(c);
      return;
    }
    const cost = tokens * rate.perToken;
    out.parts[c] = cost;
    out.tiers[c] = rate.tier;
    out.total += cost;
    if (c === 'output_tokens') out.output += cost;
    else out.input += cost;
  });

  return out;
}

// What the cache actually saved, in money.
//
// This is the only number that justifies the cache, and it is invisible in
// every other view: cache reads are the *majority* of tokens and a rounding
// error in the bill. It is what those tokens would have cost at the model's
// full standard input rate, minus what they did cost at the cache-read rate.
//
//   saved = cache_read_tokens x (standard - cache_read) / 1e6
//
// A model whose cache reads are priced at the standard rate saves nothing and
// correctly returns 0. An unknown model returns null, not 0.
function savedByCache(row) {
  const entry = lookupModel(row.model_id);
  const tokens = row.cache_read_tokens;
  if (!entry || tokens === null || tokens === undefined) return null;
  const full = rateFor(entry, 'input_tokens', { day: dayOf(row.timestamp) });
  const cached = rateFor(entry, 'cache_read_tokens', { day: dayOf(row.timestamp) });
  if (!full || !cached) return null;
  return tokens * Math.max(0, full.perToken - cached.perToken);
}

// Sum a set of rows into the shape the KPI row and the composition bar both
// read. Every field is either a number or null, and null propagates: a bucket
// containing one unpriceable row reports its cost as partial rather than
// quietly reporting the rest as if it were the whole.
// `weights` is optional and parallel to `rows`. A usage row that falls inside
// two overlapping task spans is counted as a half in each rather than once in
// both, so the parts still add up to the whole. Absent weights means 1 each.
function summarize(rows, weights) {
  const out = {
    rows: rows.length,
    tokens: { input_tokens: null, cache_read_tokens: null, cache_write_5m: null,
              cache_write_1h: null, cache_write: null, output_tokens: null, total: 0 },
    cost: { input: 0, output: 0, total: 0, saved: 0 },
    unknownModels: new Set(),
    pricedRows: 0,
    unpricedRows: 0
  };

  rows.forEach((r, i) => {
    const w = weights ? (weights[i] === undefined ? 1 : weights[i]) : 1;
    COUNTERS.forEach((c) => {
      const v = r[c];
      if (v === null || v === undefined) return;   // NULL never becomes 0
      out.tokens[c] = (out.tokens[c] || 0) + v * w;
      out.tokens.total += v * w;
    });

    const c = costRow(r);
    if (!c.known) {
      out.unpricedRows += 1;
      if (r.model_id) out.unknownModels.add(r.model_id);
      return;
    }
    out.pricedRows += 1;
    out.cost.total += c.total * w;
    out.cost.input += c.input * w;
    out.cost.output += c.output * w;
    const s = savedByCache(r);
    if (s !== null) out.cost.saved += s * w;
  });

  const w5 = out.tokens.cache_write_5m;
  const w1 = out.tokens.cache_write_1h;
  out.tokens.cache_write = (w5 === null && w1 === null) ? null : (w5 || 0) + (w1 || 0);

  // Total input is not the input_tokens field. That field is the *uncached
  // remainder*; the real input is it plus everything served from or written to
  // the cache. Reporting the bare field understated input by 753x on a real
  // session in this repository.
  const i = out.tokens.input_tokens;
  const r = out.tokens.cache_read_tokens;
  out.tokens.input_total = (i === null && r === null && out.tokens.cache_write === null)
    ? null : (i || 0) + (r || 0) + (out.tokens.cache_write || 0);

  out.unknownModels = Array.from(out.unknownModels).sort();
  // Cost is partial whenever any row in the bucket could not be priced. The UI
  // has to mark that rather than present the sum as the whole.
  out.costComplete = out.unpricedRows === 0;
  return out;
}

// --- formatting -------------------------------------------------------------

// 1,284 -> 1,284 ; 12,900 -> 12.9K ; 1,110,000 -> 1.11M. Values are compacted
// only above 10,000 so ordinary counts stay exact and readable.
function fmtTokens(n) {
  if (n === null || n === undefined) return '—';
  const v = Number(n);
  if (!isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e9) return (v / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
  if (abs >= 1e6) return (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (abs >= 1e4) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return v.toLocaleString('en-US');
}

function fmtCost(n) {
  if (n === null || n === undefined) return '—';
  const v = Number(n);
  if (!isFinite(v)) return '—';
  if (v === 0) return '$0.00';
  if (Math.abs(v) < 0.01) return '<$0.01';
  if (Math.abs(v) >= 1000) return '$' + Math.round(v).toLocaleString('en-US');
  return '$' + v.toFixed(2);
}

window.CostModel = {
  COUNTERS,
  TIERS,
  lookupModel,
  rateFor,
  costRow,
  savedByCache,
  summarize,
  fmtTokens,
  fmtCost,
  // Exposed for the source panel: how many models the loaded registry knows.
  registrySize: () => modelIndex().size,
  _resetIndex: () => { index = null; }
};
})(window);
