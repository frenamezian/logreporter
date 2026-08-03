// GENERATED FILE - do not edit by hand.
// Source: script/llm_registry.py   Regenerate: python seed/py2js_registry.py
//
// Edit the Python file (it is the one the UPDATE PROMPT below refers to), then
// re-run the generator. Editing this file directly means the next refresh
// silently discards your change.

/*
LLM Registry — Structured model data extracted from official provider sources.
Sources fetched: July 30, 2026.

Providers covered:
  - OpenAI        → https://developers.openai.com/api/docs/pricing
  - Anthropic     → https://platform.claude.com/docs/en/about-claude/models/overview
                    https://platform.claude.com/docs/en/about-claude/pricing
  - Google Gemini → https://ai.google.dev/gemini-api/docs/pricing.md.txt
  - Mistral       → https://docs.mistral.ai/getting-started/models  (+ cross-reference pricing trackers)
  - xAI Grok      → https://docs.x.ai/developers/models
  - Moonshot Kimi → https://platform.kimi.ai/docs/pricing/chat  (+ cross-reference pricing trackers)
  - DeepSeek      → https://api-docs.deepseek.com/quick_start/pricing
  - Zhipu GLM     → https://docs.z.ai/guides/overview/pricing

Pricing normalization:
  - All prices are per 1,000,000 tokens (price_per_qty = 1_000_000) in USD.
  - Batch / cached tiers are listed as separate tier entries where available.
  - Context windows are in tokens.

─────────────────────────────────────────────────────────────────────────────
UPDATE PROMPT — paste the text below into Claude (Cowork / Claude Code) to
refresh this registry. Last run: July 30, 2026.
─────────────────────────────────────────────────────────────────────────────

Update the LLM registry in script/llm_registry.py, then regenerate the
JavaScript the dashboard reads with `python seed/py2js_registry.py`. Today's data may
be newer than your training data, so verify everything by browsing the web —
never rely on memory for models or prices.

1. SOURCES. For each provider in `llm_registry`, fetch its official pricing
   and model-overview pages as of today (start from each provider_url and the
   URLs in this docstring; follow redirects). Also fetch the provider's
   deprecation/retirement page if one exists. Third-party pricing trackers
   (BenchLM, PricePerToken, OpenRouter, ...) may be used only to cross-check,
   never as the primary source. If official and tracker values conflict, use
   the official page and note the conflict.

2. SCOPE. For every provider identify: (a) models released since the
   "Sources fetched" date above, (b) price or context-window changes,
   (c) models deprecated/retired since then. Also consider whether a major
   new API provider should be added as a new top-level block.

3. DATA STRUCTURE — keep it EXACTLY. Each provider: provider_name,
   provider_url, models. Each model: model_name, model_id, description,
   capabilities, latency_class, regional_availability, context_window,
   pricing, status, expiration_date. Each pricing tier: tier_order,
   tier_name, price_value, price_currency ("USD"), price_per_qty
   (1_000_000). Enums: latency_class in {fastest, fast, medium, slow};
   status in {active, preview, legacy, deprecated}. Reuse existing
   tier_name values (standard, cached_input, batch, free, ...) before
   inventing new ones.

4. RULES.
   - Never delete a model. Superseded → status "legacy"; officially
     deprecated/retired → status "deprecated" with expiration_date
     "YYYY-MM-DD" when a date is published. Keep historical prices on
     retired models.
   - Never invent a number. Any value you cannot verify on a fetched
     official page keeps its existing value; flag derived or uncertain
     values in your summary.
   - Skip models priced per page/minute/character (OCR, TTS, ...) — this
     registry only covers per-token pricing.

5. VALIDATE. Execute the file with Python AND regenerate + `node --check`
   script/llm_registry.js; assert every model has all
   required fields, enums are valid, there are no duplicate (provider,
   model_id) pairs, and every tier has price_per_qty == 1_000_000 and
   price_currency == "USD".

6. FINISH. Update the "Sources fetched" date and the provider URL list in
   this docstring (including the "Last run" date above), then report a
   change summary: models added, prices changed (old → new), status
   changes, and the exact source URLs used.
*/

(function (window) {
'use strict';

const llmRegistry = {

    // =========================================================================
    // OPENAI
    // =========================================================================
    "openai": {
        "provider_name": "OpenAI",
        "provider_url": "https://developers.openai.com/api/docs/pricing",
        "models": [

            // ── GPT-5.6 family (Sol / Terra / Luna) ─────────────────────────
            {
                "model_name": "GPT-5.6 Sol",
                "model_id": "gpt-5.6-sol",
                "description": (
                    "OpenAI's current frontier model for complex professional work. " +
                    "GA July 9, 2026. 1.05 M token context, 128 k max output, knowledge " +
                    "cutoff Feb 16, 2026. Regional endpoints carry a 10 % uplift."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "medium",
                "regional_availability": ["us-east-1", "eu-central-1"],
                "context_window": 1050000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 2.50,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.25,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "batch",        "price_value": 1.25,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 15.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 7.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "GPT-5.6 Terra",
                "model_id": "gpt-5.6-terra",
                "description": (
                    "Mid-tier GPT-5.6 model balancing intelligence and cost. " +
                    "1.05 M token context, 128 k max output, knowledge cutoff Feb 16, 2026. " +
                    "Recommended replacement for gpt-5-mini and computer-use workloads."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "fast",
                "regional_availability": ["us-east-1", "eu-central-1"],
                "context_window": 1050000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 1.25,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.125, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "batch",        "price_value": 0.625, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 7.50, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 3.75, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "GPT-5.6 Luna",
                "model_id": "gpt-5.6-luna",
                "description": (
                    "Smallest GPT-5.6 model, optimized for cost-sensitive high-volume " +
                    "workloads. 1.05 M token context, 128 k max output, knowledge cutoff " +
                    "Feb 16, 2026."
                ),
                "capabilities": ["coding", "vision", "long-context", "tools"],
                "latency_class": "fastest",
                "regional_availability": ["us-east-1", "eu-central-1"],
                "context_window": 1050000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 0.50,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.05,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "batch",        "price_value": 0.25,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 3.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 1.50, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },

            // ── GPT-5.5 family ──────────────────────────────────────────────
            {
                "model_name": "GPT-5.5",
                "model_id": "gpt-5.5",
                "description": (
                    "Frontier model released April 23, 2026 (snapshot gpt-5.5-2026-04-23), " +
                    "positioned for coding and professional work. 1.05 M token context, " +
                    "128 k max output, knowledge cutoff Dec 1, 2025. Superseded by the " +
                    "GPT-5.6 family but still fully supported."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "medium",
                "regional_availability": ["us-east-1", "eu-central-1"],
                "context_window": 1050000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 2.50,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.25,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "batch",        "price_value": 1.25,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 15.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 7.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "GPT-5.5 Pro",
                "model_id": "gpt-5.5-pro",
                "description": (
                    "Premium GPT-5.5 variant for the hardest agentic and reasoning tasks. " +
                    "Very high cost; not suitable for low-latency or cost-sensitive apps."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "slow",
                "regional_availability": ["us-east-1", "eu-central-1"],
                "context_window": 1050000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 15.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 7.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 90.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 45.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },

            // ── GPT-5.4 family ──────────────────────────────────────────────
            // July 2026: uniform ~50 % price cut across the family per the
            // official pricing page (standard/cached/output anchors verified;
            // batch/flex/priority/long-context tiers halved to match).
            {
                "model_name": "GPT-5.4",
                "model_id": "gpt-5.4",
                "description": (
                    "Former flagship multimodal model, superseded by GPT-5.5/5.6 but still " +
                    "sold at reduced rates. Excels at complex reasoning, coding, creative " +
                    "writing, and vision. Supports long-context (>270 k tokens) at premium " +
                    "rates. Data-residency endpoints carry a 10 % uplift."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "medium",
                "regional_availability": ["us-east-1", "eu-central-1"],
                "context_window": 270000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",      "price_value": 1.25,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input",  "price_value": 0.13,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "batch",         "price_value": 0.625, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "flex",          "price_value": 0.625, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "priority",      "price_value": 2.50,  "price_currency": "USD", "price_per_qty": 1000000},
                        // Long-context (>270 k) standard
                        {"tier_order": 6, "tier_name": "long_context_standard", "price_value": 2.50, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 7, "tier_name": "long_context_cached",   "price_value": 0.25, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard",            "price_value": 7.50,   "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",               "price_value": 3.75,   "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "flex",                "price_value": 3.75,   "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "priority",            "price_value": 15.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "long_context_standard","price_value": 11.25, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "GPT-5.4 Mini",
                "model_id": "gpt-5.4-mini",
                "description": (
                    "Efficient mid-tier model in the GPT-5.4 family. Good speed/cost balance " +
                    "for high-volume production workloads. No long-context pricing tier."
                ),
                "capabilities": ["coding", "reasoning", "vision", "tools"],
                "latency_class": "fast",
                "regional_availability": ["us-east-1", "eu-central-1"],
                "context_window": 270000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 0.375,   "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.0375,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "batch",        "price_value": 0.1875,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "flex",         "price_value": 0.1875,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 2.25,   "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 1.125,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "flex",     "price_value": 1.125,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "GPT-5.4 Nano",
                "model_id": "gpt-5.4-nano",
                "description": (
                    "Smallest and cheapest GPT-5.4 model. Good at classification, extraction, " +
                    "and simple text tasks. Not good at deep multi-step reasoning."
                ),
                "capabilities": ["coding", "tools"],
                "latency_class": "fastest",
                "regional_availability": ["us-east-1", "eu-central-1"],
                "context_window": 270000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 0.10,   "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.01,   "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "batch",        "price_value": 0.05,   "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "flex",         "price_value": 0.05,   "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.625,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 0.3125, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "flex",     "price_value": 0.3125, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "GPT-5.4 Pro",
                "model_id": "gpt-5.4-pro",
                "description": (
                    "Premium GPT-5.4 variant optimized for the hardest agentic and reasoning " +
                    "tasks. Very high cost; not suitable for low-latency or cost-sensitive apps."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "slow",
                "regional_availability": ["us-east-1", "eu-central-1"],
                "context_window": 270000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",          "price_value": 15.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",             "price_value": 7.50,   "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "flex",              "price_value": 7.50,   "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "long_context",      "price_value": 30.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 90.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",        "price_value": 45.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "flex",         "price_value": 45.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "long_context", "price_value": 135.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },

            // ── GPT-5.3 / ChatGPT / Codex specialized ───────────────────────
            {
                "model_name": "Chat Latest",
                "model_id": "chat-latest",
                "description": (
                    "Rolling alias that points to the latest Instant model used in ChatGPT; " +
                    "underlying snapshot is regularly updated. Replaces the versioned " +
                    "gpt-5.x-chat-latest aliases. 400 k context, 128 k max output."
                ),
                "capabilities": ["coding", "reasoning", "vision"],
                "latency_class": "medium",
                "regional_availability": ["us-east-1"],
                "context_window": 400000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 5.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.50, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 30.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "GPT-5.3 Chat (Latest)",
                "model_id": "gpt-5.3-chat-latest",
                "description": (
                    "ChatGPT-tuned general-purpose model. Deprecated May 8, 2026 in favor of " +
                    "the chat-latest alias / GPT-5.6; shuts down Aug 10, 2026."
                ),
                "capabilities": ["coding", "reasoning", "vision"],
                "latency_class": "medium",
                "regional_availability": ["us-east-1"],
                "context_window": 128000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 1.75,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.175, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 14.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": "2026-08-10",
            },
            {
                "model_name": "GPT-5.3 Codex",
                "model_id": "gpt-5.3-codex",
                "description": (
                    "Specialized coding-agent model for Codex workflows. Excellent at " +
                    "long-horizon code tasks, repository understanding, and refactoring."
                ),
                "capabilities": ["coding", "tools", "reasoning"],
                "latency_class": "medium",
                "regional_availability": ["us-east-1"],
                "context_window": 128000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 1.75,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.175, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "priority",     "price_value": 3.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard",  "price_value": 14.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "priority",  "price_value": 28.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },

            // ── GPT-4.1 family ───────────────────────────────────────────────
            {
                "model_name": "GPT-4.1",
                "model_id": "gpt-4.1",
                "description": (
                    "Former production workhorse that replaced GPT-4o. Superseded by the " +
                    "GPT-5.x line and no longer on the models overview page, but no shutdown " +
                    "has been announced. 1 M token context window."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "medium",
                "regional_availability": ["us-east-1", "eu-central-1"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 2.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.50,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "batch",        "price_value": 1.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 8.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 4.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "legacy",
                "expiration_date": null,
            },
            {
                "model_name": "GPT-4.1 Mini",
                "model_id": "gpt-4.1-mini",
                "description": (
                    "Cost-efficient GPT-4.1 variant with 1 M context window. Superseded by " +
                    "GPT-5.x mini-class models; no shutdown announced."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "fast",
                "regional_availability": ["us-east-1", "eu-central-1"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 0.40,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.10,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "batch",        "price_value": 0.20,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 1.60, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 0.80, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "legacy",
                "expiration_date": null,
            },
            {
                "model_name": "GPT-4.1 Nano",
                "model_id": "gpt-4.1-nano",
                "description": (
                    "Cheapest GPT-4.1-generation model. Handles classification, extraction, " +
                    "and simple summarization. Superseded by GPT-5.x nano-class models."
                ),
                "capabilities": ["coding", "tools"],
                "latency_class": "fastest",
                "regional_availability": ["us-east-1", "eu-central-1"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 0.10,   "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.025,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "batch",        "price_value": 0.05,   "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.40,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 0.20,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "legacy",
                "expiration_date": null,
            },

            // ── GPT-4o (legacy, still available) ────────────────────────────
            {
                "model_name": "GPT-4o",
                "model_id": "gpt-4o",
                "description": (
                    "Previous-generation flagship model. Still available but legacy; " +
                    "GPT-5.6 is the recommended replacement for most tasks."
                ),
                "capabilities": ["coding", "reasoning", "vision", "tools"],
                "latency_class": "medium",
                "regional_availability": ["us-east-1", "eu-central-1"],
                "context_window": 128000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 2.50,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 1.25,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "batch",        "price_value": 1.25,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 10.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 5.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "legacy",
                "expiration_date": null,
            },

            // ── o-series reasoning models ────────────────────────────────────
            {
                "model_name": "o3",
                "model_id": "o3",
                "description": (
                    "Chain-of-thought reasoning model. Deprecated June 11, 2026 " +
                    "(snapshot o3-2025-04-16); shuts down Dec 11, 2026. Recommended " +
                    "replacement: gpt-5.6-sol."
                ),
                "capabilities": ["reasoning", "coding", "vision"],
                "latency_class": "slow",
                "regional_availability": ["us-east-1"],
                "context_window": 200000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 2.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.50,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "batch",        "price_value": 1.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 8.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 4.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": "2026-12-11",
            },
            {
                "model_name": "o4-mini",
                "model_id": "o4-mini",
                "description": (
                    "Compact reasoning model. Superseded by the GPT-5.x line and no longer " +
                    "listed on the current pricing/models pages; no shutdown announced."
                ),
                "capabilities": ["reasoning", "coding", "vision"],
                "latency_class": "medium",
                "regional_availability": ["us-east-1"],
                "context_window": 200000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 1.10,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.275, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "batch",        "price_value": 0.55,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 4.40, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 2.20, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "legacy",
                "expiration_date": null,
            },
            {
                "model_name": "o3-Deep Research",
                "model_id": "o3-deep-research",
                "description": (
                    "Specialized deep-research agent model. Deprecated April 22, 2026 " +
                    "(snapshot o3-deep-research-2025-06-26); shutdown July 23, 2026. " +
                    "Recommended replacement: gpt-5.6-sol."
                ),
                "capabilities": ["reasoning", "long-context", "tools"],
                "latency_class": "slow",
                "regional_availability": ["us-east-1"],
                "context_window": 200000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "batch", "price_value": 5.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "batch", "price_value": 20.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": "2026-07-23",
            },
            {
                "model_name": "o4-mini Deep Research",
                "model_id": "o4-mini-deep-research",
                "description": (
                    "Cost-efficient deep-research model. Deprecated April 22, 2026 " +
                    "(snapshot o4-mini-deep-research-2025-06-26); shutdown July 23, 2026. " +
                    "Recommended replacement: gpt-5.6-sol."
                ),
                "capabilities": ["reasoning", "long-context", "tools"],
                "latency_class": "slow",
                "regional_availability": ["us-east-1"],
                "context_window": 200000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "batch", "price_value": 1.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "batch", "price_value": 4.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": "2026-07-23",
            },

            // ── Computer-use ─────────────────────────────────────────────────
            {
                "model_name": "Computer Use Preview",
                "model_id": "computer-use-preview",
                "description": (
                    "Specialized model for browser/desktop computer-use agents. Deprecated " +
                    "April 22, 2026 (snapshot computer-use-preview-2025-03-11); shutdown " +
                    "July 23, 2026. Recommended replacement: gpt-5.6-terra."
                ),
                "capabilities": ["vision", "tools", "reasoning"],
                "latency_class": "slow",
                "regional_availability": ["us-east-1"],
                "context_window": 128000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "batch", "price_value": 1.50, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "batch", "price_value": 6.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": "2026-07-23",
            },

            // ── Realtime / Audio ─────────────────────────────────────────────
            {
                "model_name": "GPT Realtime 2.1",
                "model_id": "gpt-realtime-2.1",
                "description": (
                    "Current low-latency voice/audio model for real-time speech-to-speech " +
                    "interactions. Successor to gpt-realtime-1.5."
                ),
                "capabilities": ["vision", "tools"],
                "latency_class": "fastest",
                "regional_availability": ["us-east-1"],
                "context_window": 128000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "audio",        "price_value": 32.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "text",         "price_value": 4.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "cached_audio", "price_value": 0.40,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "cached_text",  "price_value": 0.40,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "audio", "price_value": 64.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "text",  "price_value": 24.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "GPT Realtime 2.1 Mini",
                "model_id": "gpt-realtime-2.1-mini",
                "description": (
                    "Smaller, lower-cost realtime voice model. Successor to " +
                    "gpt-realtime-mini; recommended replacement for that model."
                ),
                "capabilities": ["tools"],
                "latency_class": "fastest",
                "regional_availability": ["us-east-1"],
                "context_window": 128000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "audio",       "price_value": 10.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "text",        "price_value": 0.60,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "cached_audio","price_value": 0.30,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "cached_text", "price_value": 0.06,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "audio", "price_value": 20.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "text",  "price_value": 2.40,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "GPT Realtime 1.5",
                "model_id": "gpt-realtime-1.5",
                "description": (
                    "Low-latency voice/audio model for real-time speech-to-speech interactions. " +
                    "Superseded by gpt-realtime-2.1 but still listed; no shutdown announced."
                ),
                "capabilities": ["vision", "tools"],
                "latency_class": "fastest",
                "regional_availability": ["us-east-1"],
                "context_window": 128000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "audio",        "price_value": 32.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "text",         "price_value": 4.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "image",        "price_value": 5.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "cached_audio", "price_value": 0.40,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "cached_text",  "price_value": 0.40,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "audio", "price_value": 64.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "text",  "price_value": 16.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "legacy",
                "expiration_date": null,
            },
            {
                "model_name": "GPT Realtime Mini",
                "model_id": "gpt-realtime-mini",
                "description": (
                    "Smaller, lower-cost realtime voice model. Deprecated July 20, 2026 in " +
                    "favor of gpt-realtime-2.1-mini; shuts down Jan 20, 2027."
                ),
                "capabilities": ["tools"],
                "latency_class": "fastest",
                "regional_availability": ["us-east-1"],
                "context_window": 128000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "audio",       "price_value": 10.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "text",        "price_value": 0.60,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "image",       "price_value": 0.80,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "cached_audio","price_value": 0.30,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "cached_text", "price_value": 0.06,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "audio", "price_value": 20.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "text",  "price_value": 2.40,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": "2027-01-20",
            },
        ],
    },

    // =========================================================================
    // ANTHROPIC
    // =========================================================================
    "anthropic": {
        "provider_name": "Anthropic",
        "provider_url": "https://platform.claude.com/docs/en/about-claude/pricing",
        "models": [

            // ── Claude 5 generation (GA June–July 2026) ─────────────────────
            {
                "model_name": "Claude Fable 5",
                "model_id": "claude-fable-5",
                "description": (
                    "Anthropic's most capable model. Adaptive thinking is always on. " +
                    "1 M token context, 128 k max output. Best for the hardest reasoning, " +
                    "research, and long-horizon agentic work."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "slow",
                "regional_availability": ["us-east-1", "eu-west-1"],  // global + us-only (1.1x)
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",       "price_value": 10.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cache_write_5m", "price_value": 12.50, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "cache_write_1h", "price_value": 20.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "cache_read",     "price_value": 1.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "batch",          "price_value": 5.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 50.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 25.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "Claude Mythos 5",
                "model_id": "claude-mythos-5",
                "description": (
                    "Invitation-only variant of Claude Fable 5 (Project Glasswing). " +
                    "Same specs and pricing as Fable 5; limited availability."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "slow",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",       "price_value": 10.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cache_write_5m", "price_value": 12.50, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "cache_write_1h", "price_value": 20.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "cache_read",     "price_value": 1.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "batch",          "price_value": 5.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 50.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 25.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "preview",
                "expiration_date": null,
            },
            {
                "model_name": "Claude Opus 5",
                "model_id": "claude-opus-5",
                "description": (
                    "Flagship for complex agentic coding and enterprise work at half the " +
                    "price of Fable 5. Adaptive thinking enabled (effort defaults to high). " +
                    "1 M token context, 128 k max output. Fast mode (2x rates) available on " +
                    "the Claude API."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "medium",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",       "price_value": 5.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cache_write_5m", "price_value": 6.25,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "cache_write_1h", "price_value": 10.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "cache_read",     "price_value": 0.50,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "batch",          "price_value": 2.50,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 6, "tier_name": "fast_mode",      "price_value": 10.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard",  "price_value": 25.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",     "price_value": 12.50, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "fast_mode", "price_value": 50.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "Claude Sonnet 5",
                "model_id": "claude-sonnet-5",
                "description": (
                    "Best balance of speed and intelligence. Adaptive thinking supported. " +
                    "1 M token context, 128 k max output. Introductory pricing ($2 in / " +
                    "$10 out, all tiers ~33% off) through 2026-08-31; standard pricing " +
                    "($3 / $15) from 2026-09-01."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "fast",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",       "price_value": 3.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cache_write_5m", "price_value": 3.75, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "cache_write_1h", "price_value": 6.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "cache_read",     "price_value": 0.30, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "batch",          "price_value": 1.50, "price_currency": "USD", "price_per_qty": 1000000},
                        // Introductory pricing in effect through 2026-08-31
                        {"tier_order": 6, "tier_name": "intro_standard_until_2026_08_31", "price_value": 2.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 15.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 7.50,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "intro_standard_until_2026_08_31", "price_value": 10.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },

            // ── Claude 4.7 / 4.8 (Opus point releases, 2026) ────────────────
            {
                "model_name": "Claude Opus 4.8",
                "model_id": "claude-opus-4-8",
                "description": (
                    "Opus point release; recommended replacement for Opus 4.x. Effort " +
                    "parameter defaults to high. 1 M token context at standard pricing. " +
                    "Fast mode (2x rates) available on the Claude API."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "medium",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",       "price_value": 5.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cache_write_5m", "price_value": 6.25,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "cache_write_1h", "price_value": 10.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "cache_read",     "price_value": 0.50,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "batch",          "price_value": 2.50,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 6, "tier_name": "fast_mode",      "price_value": 10.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard",  "price_value": 25.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",     "price_value": 12.50, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "fast_mode", "price_value": 50.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "Claude Opus 4.7",
                "model_id": "claude-opus-4-7",
                "description": (
                    "Opus point release between 4.6 and 4.8. Deprecates non-default " +
                    "temperature/top_p/top_k sampling parameters. 1 M token context at " +
                    "standard pricing."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "medium",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",       "price_value": 5.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cache_write_5m", "price_value": 6.25,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "cache_write_1h", "price_value": 10.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "cache_read",     "price_value": 0.50,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "batch",          "price_value": 2.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 25.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 12.50, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },

            // ── Claude 4.6 generation ────────────────────────────────────────
            {
                "model_name": "Claude Opus 4.6",
                "model_id": "claude-opus-4-6",
                "description": (
                    "Former flagship (pre-Opus 5). Strong for complex agents, " +
                    "long-horizon coding, and reasoning. Supports 1 M token context at standard " +
                    "pricing. Fast mode no longer offered (now Opus 5 / 4.8 only)."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "medium",
                "regional_availability": ["us-east-1", "eu-west-1"],  // global + us-only (1.1x)
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",        "price_value": 5.00,   "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cache_write_5m",  "price_value": 6.25,   "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "cache_write_1h",  "price_value": 10.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "cache_read",      "price_value": 0.50,   "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "batch",           "price_value": 2.50,   "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard",  "price_value": 25.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",     "price_value": 12.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "Claude Sonnet 4.6",
                "model_id": "claude-sonnet-4-6",
                "description": (
                    "Previous-generation balanced Sonnet (superseded by Sonnet 5). " +
                    "High-throughput developer and production use. 1 M context at standard pricing."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "fast",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",       "price_value": 3.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cache_write_5m", "price_value": 3.75,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "cache_write_1h", "price_value": 6.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "cache_read",     "price_value": 0.30,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "batch",          "price_value": 1.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 15.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 7.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "Claude Haiku 4.5",
                "model_id": "claude-haiku-4-5-20251001",
                "description": (
                    "Fastest model with near-frontier intelligence. Good at speed, " +
                    "classification, extraction, and high-throughput tasks. " +
                    "200 k context window."
                ),
                "capabilities": ["coding", "vision", "tools"],
                "latency_class": "fastest",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 200000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",       "price_value": 1.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cache_write_5m", "price_value": 1.25,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "cache_write_1h", "price_value": 2.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "cache_read",     "price_value": 0.10,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "batch",          "price_value": 0.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 5.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 2.50, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },

            // ── Claude 4.5 generation ────────────────────────────────────────
            {
                "model_name": "Claude Opus 4.5",
                "model_id": "claude-opus-4-5-20251101",
                "description": (
                    "Older Opus generation, still active (retirement not sooner than " +
                    "2026-11-24). Strong at complex multi-step reasoning, agentic " +
                    "workflows, and coding."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "medium",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 200000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",       "price_value": 5.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cache_write_5m", "price_value": 6.25,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "cache_write_1h", "price_value": 10.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "cache_read",     "price_value": 0.50,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "batch",          "price_value": 2.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 25.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 12.50, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "Claude Sonnet 4.5",
                "model_id": "claude-sonnet-4-5",
                "description": (
                    "Older balanced Sonnet, still active (retirement not sooner than " +
                    "2026-09-29). Strong at instruction following, coding, and customer " +
                    "support workflows. 200 k standard; 1 M context in beta (usage tier 4+)."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "fast",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 200000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",             "price_value": 3.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cache_write_5m",       "price_value": 3.75,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "cache_write_1h",       "price_value": 6.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "cache_read",           "price_value": 0.30,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "batch",                "price_value": 1.50,  "price_currency": "USD", "price_per_qty": 1000000},
                        // Long-context beta (>200 k)
                        {"tier_order": 6, "tier_name": "long_context_input",   "price_value": 6.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard",           "price_value": 15.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",              "price_value": 7.50,   "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "long_context_output","price_value": 22.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },

            // ── Claude 4 / 4.1 (Opus) — deprecated/retired ──────────────────
            {
                "model_name": "Claude Opus 4.1",
                "model_id": "claude-opus-4-1",
                "description": (
                    "Upgraded Opus 4 focusing on agentic reliability and real-world coding. " +
                    "Deprecated 2026-06-05; retires 2026-08-05. Migrate to claude-opus-4-8."
                ),
                "capabilities": ["coding", "reasoning", "vision", "tools"],
                "latency_class": "medium",
                "regional_availability": ["us-east-1"],
                "context_window": 200000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",       "price_value": 15.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cache_write_5m", "price_value": 18.75,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "cache_write_1h", "price_value": 30.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "cache_read",     "price_value": 1.50,   "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "batch",          "price_value": 7.50,   "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 75.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 37.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": "2026-08-05",
            },
            {
                "model_name": "Claude Opus 4",
                "model_id": "claude-opus-4-0",
                "description": (
                    "Original Claude 4 Opus. Retired from the Claude API on 2026-06-15 " +
                    "(still served on Google Cloud). Migrate to claude-opus-4-8."
                ),
                "capabilities": ["coding", "reasoning", "vision", "tools"],
                "latency_class": "medium",
                "regional_availability": ["us-east-1"],
                "context_window": 200000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",       "price_value": 15.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cache_write_5m", "price_value": 18.75,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "cache_write_1h", "price_value": 30.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "cache_read",     "price_value": 1.50,   "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "batch",          "price_value": 7.50,   "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 75.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 37.50, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": "2026-06-15",
            },
            {
                "model_name": "Claude Sonnet 4",
                "model_id": "claude-sonnet-4-0",
                "description": (
                    "Balanced SaaS workhorse. Retired from the Claude API on 2026-06-15 " +
                    "(still served on Bedrock and Google Cloud). Migrate to claude-sonnet-4-6."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "fast",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 200000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",           "price_value": 3.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cache_write_5m",     "price_value": 3.75,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "cache_write_1h",     "price_value": 6.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "cache_read",         "price_value": 0.30,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "batch",              "price_value": 1.50,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 6, "tier_name": "long_context_input", "price_value": 6.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard",            "price_value": 15.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",               "price_value": 7.50,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "long_context_output", "price_value": 22.50, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": "2026-06-15",
            },

            // ── Claude 3.7 / 3.x (legacy/deprecated) ────────────────────────
            {
                "model_name": "Claude Sonnet 3.7",
                "model_id": "claude-sonnet-3-7",
                "description": (
                    "Blends fast responses with deeper reasoning. Retired 2026-02-19; " +
                    "migrate to claude-sonnet-4-6."
                ),
                "capabilities": ["coding", "reasoning", "vision", "tools"],
                "latency_class": "medium",
                "regional_availability": ["us-east-1"],
                "context_window": 200000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",       "price_value": 3.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cache_write_5m", "price_value": 3.75,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "cache_write_1h", "price_value": 6.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "cache_read",     "price_value": 0.30,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "batch",          "price_value": 1.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 15.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 7.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": "2026-02-19",
            },
            {
                "model_name": "Claude Haiku 3.5",
                "model_id": "claude-haiku-3-5",
                "description": (
                    "Fast, cost-efficient model for simple tasks. Retired from the Claude API " +
                    "on 2026-02-19 (still served on Bedrock and Google Cloud). " +
                    "Migrate to claude-haiku-4-5."
                ),
                "capabilities": ["coding", "vision", "tools"],
                "latency_class": "fastest",
                "regional_availability": ["us-east-1"],
                "context_window": 200000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",       "price_value": 0.80,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cache_write_5m", "price_value": 1.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "cache_write_1h", "price_value": 1.60,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "cache_read",     "price_value": 0.08,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "batch",          "price_value": 0.40,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 4.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 2.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": "2026-02-19",
            },
            {
                "model_name": "Claude Opus 3",
                "model_id": "claude-3-opus-20240229",
                "description": "Legacy Claude 3 flagship. Retired 2026-01-05; use Opus 4.8+ instead.",
                "capabilities": ["coding", "reasoning", "vision"],
                "latency_class": "slow",
                "regional_availability": ["us-east-1"],
                "context_window": 200000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",       "price_value": 15.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cache_write_5m", "price_value": 18.75,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "cache_write_1h", "price_value": 30.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "cache_read",     "price_value": 1.50,   "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "batch",          "price_value": 7.50,   "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 75.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 37.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": "2026-01-05",
            },
            {
                "model_name": "Claude Haiku 3",
                "model_id": "claude-3-haiku-20240307",
                "description": (
                    "Cheapest legacy Claude model. Deprecated 2026-02-19, retired 2026-04-20. " +
                    "Migrate to claude-haiku-4-5."
                ),
                "capabilities": ["tools"],
                "latency_class": "fastest",
                "regional_availability": ["us-east-1"],
                "context_window": 200000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",       "price_value": 0.25,   "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cache_write_5m", "price_value": 0.30,   "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "cache_write_1h", "price_value": 0.50,   "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "cache_read",     "price_value": 0.03,   "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "batch",          "price_value": 0.125,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 1.25,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 0.625, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": "2026-04-20",
            },
        ],
    },

    // =========================================================================
    // GOOGLE GEMINI
    // =========================================================================
    "google_gemini": {
        "provider_name": "Google Gemini",
        "provider_url": "https://ai.google.dev/gemini-api/docs/pricing",
        "models": [

            // ── Gemini 3.6 / 3.5 (latest) ────────────────────────────────────
            {
                "model_name": "Gemini 3.6 Flash",
                "model_id": "gemini-3.6-flash",
                "description": (
                    "Latest GA Flash model balancing speed with intelligence. Unified " +
                    "pricing across text, image, video, and audio input. No long-context " +
                    "surcharge."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "fast",
                "regional_availability": ["us-central1", "europe-west4", "asia-northeast1"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",      "price_value": 1.50, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "context_cache", "price_value": 0.15, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "batch",         "price_value": 0.75, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 7.50, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 3.75, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "Gemini 3.5 Flash",
                "model_id": "gemini-3.5-flash",
                "description": (
                    "Most intelligent Flash model for sustained frontier performance. " +
                    "GA replacement for Gemini 2.5 Flash previews and Gemini 2.0 Flash. " +
                    "Unified pricing across modalities; no long-context surcharge."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "fast",
                "regional_availability": ["us-central1", "europe-west4", "asia-northeast1"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",      "price_value": 1.50, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "context_cache", "price_value": 0.15, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "batch",         "price_value": 0.75, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 9.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 4.50, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "Gemini 3.5 Flash-Lite",
                "model_id": "gemini-3.5-flash-lite",
                "description": (
                    "Fastest, most cost-effective model of the 3.5 generation. Single " +
                    "input price across text, image, video, and audio."
                ),
                "capabilities": ["vision", "tools"],
                "latency_class": "fastest",
                "regional_availability": ["us-central1", "europe-west4"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",      "price_value": 0.30, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "context_cache", "price_value": 0.03, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "batch",         "price_value": 0.15, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 2.50, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 1.25, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },

            // ── Gemini 3.1 ───────────────────────────────────────────────────
            {
                "model_name": "Gemini 3.1 Pro Preview",
                "model_id": "gemini-3.1-pro-preview",
                "description": (
                    "Google's most powerful multimodal model for advanced intelligence " +
                    "and complex problem-solving. Successor to gemini-3-pro-preview. " +
                    "Long-context surcharge applies above 200 k tokens."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "medium",
                "regional_availability": ["us-central1", "europe-west4", "asia-northeast1"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",           "price_value": 2.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "long_context",       "price_value": 4.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "context_cache",      "price_value": 0.20,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "context_cache_long", "price_value": 0.40,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "batch",              "price_value": 1.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 6, "tier_name": "batch_long_context", "price_value": 2.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard",           "price_value": 12.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "long_context",       "price_value": 18.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "batch",              "price_value": 6.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "batch_long_context", "price_value": 9.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "preview",
                "expiration_date": null,
            },
            {
                "model_name": "Gemini 3.1 Flash-Lite",
                "model_id": "gemini-3.1-flash-lite",
                "description": (
                    "Frontier-class performance at Lite pricing. GA replacement for " +
                    "Gemini 2.0 Flash-Lite. Separate audio input rate."
                ),
                "capabilities": ["vision", "tools"],
                "latency_class": "fastest",
                "regional_availability": ["us-central1", "europe-west4"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard_text_image_video", "price_value": 0.25,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "standard_audio",            "price_value": 0.50,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "batch_text_image_video",    "price_value": 0.125, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "batch_audio",               "price_value": 0.25,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 1.50, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 0.75, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "Gemini 3.1 Flash Live Preview",
                "model_id": "gemini-3.1-flash-live-preview",
                "description": (
                    "Live API model for real-time bidirectional speech and video " +
                    "interaction. Per-modality token pricing."
                ),
                "capabilities": ["tools", "vision"],
                "latency_class": "fastest",
                "regional_availability": ["us-central1"],
                "context_window": 128000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "text",        "price_value": 0.75, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "audio",       "price_value": 3.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "image_video", "price_value": 1.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "text",  "price_value": 4.50,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "audio", "price_value": 12.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "preview",
                "expiration_date": null,
            },

            // ── Gemini 3 ─────────────────────────────────────────────────────
            {
                "model_name": "Gemini 3 Pro Preview",
                "model_id": "gemini-3-pro-preview",
                "description": (
                    "Google's most powerful multimodal model of the initial Gemini 3 " +
                    "launch. Retired March 9, 2026 — replaced by gemini-3.1-pro-preview. " +
                    "Long-context surcharge applied above 200 k tokens."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "medium",
                "regional_availability": ["us-central1", "europe-west4", "asia-northeast1"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",           "price_value": 2.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "long_context",       "price_value": 4.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "context_cache",      "price_value": 0.20,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "context_cache_long", "price_value": 0.40,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "batch",              "price_value": 1.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 6, "tier_name": "batch_long_context", "price_value": 2.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard",           "price_value": 12.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "long_context",       "price_value": 18.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "batch",              "price_value": 6.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "batch_long_context", "price_value": 9.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": "2026-03-09",
            },
            {
                "model_name": "Gemini 3 Flash Preview",
                "model_id": "gemini-3-flash-preview",
                "description": (
                    "Fast, search-grounded model combining frontier intelligence with superior " +
                    "search. Good at speed, real-time tasks, and extraction. " +
                    "Not suited for deep multi-step reasoning."
                ),
                "capabilities": ["coding", "vision", "tools", "reasoning"],
                "latency_class": "fast",
                "regional_availability": ["us-central1", "europe-west4"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard_text_image_video", "price_value": 0.50,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "standard_audio",            "price_value": 1.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "context_cache_text",        "price_value": 0.05,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "context_cache_audio",       "price_value": 0.10,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "batch_text_image_video",    "price_value": 0.25,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 6, "tier_name": "batch_audio",               "price_value": 0.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 3.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 1.50, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "preview",
                "expiration_date": null,
            },

            // ── Gemini 2.5 ───────────────────────────────────────────────────
            {
                "model_name": "Gemini 2.5 Pro",
                "model_id": "gemini-2.5-pro",
                "description": (
                    "State-of-the-art multipurpose model excelling at coding and complex " +
                    "reasoning. Long-context surcharge above 200 k tokens."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "medium",
                "regional_availability": ["us-central1", "europe-west4", "asia-northeast1"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",           "price_value": 1.25,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "long_context",       "price_value": 2.50,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "context_cache",      "price_value": 0.125, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "context_cache_long", "price_value": 0.25,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "batch",              "price_value": 0.625, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 6, "tier_name": "batch_long_context", "price_value": 1.25,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard",           "price_value": 10.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "long_context",       "price_value": 15.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "batch",              "price_value": 5.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "batch_long_context", "price_value": 7.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "Gemini 2.5 Flash",
                "model_id": "gemini-2.5-flash",
                "description": (
                    "First hybrid reasoning model with 1 M token context and thinking budgets. " +
                    "Good for large-scale processing and high-volume tasks with reasoning."
                ),
                "capabilities": ["reasoning", "vision", "long-context", "tools"],
                "latency_class": "fast",
                "regional_availability": ["us-central1", "europe-west4"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard_text_image_video", "price_value": 0.30,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "standard_audio",            "price_value": 1.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "context_cache_text",        "price_value": 0.03,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "context_cache_audio",       "price_value": 0.10,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "batch_text_image_video",    "price_value": 0.15,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 6, "tier_name": "batch_audio",               "price_value": 0.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 2.50, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 1.25, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "Gemini 2.5 Flash Preview",
                "model_id": "gemini-2.5-flash-preview-09-2025",
                "description": (
                    "September 2025 2.5 Flash snapshot. Retired February 17, 2026 — " +
                    "replaced by gemini-3.5-flash."
                ),
                "capabilities": ["reasoning", "vision", "long-context", "tools"],
                "latency_class": "fast",
                "regional_availability": ["us-central1"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard_text_image_video", "price_value": 0.30,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "standard_audio",            "price_value": 1.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "context_cache_text",        "price_value": 0.03,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "context_cache_audio",       "price_value": 0.10,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "batch_text_image_video",    "price_value": 0.15,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 6, "tier_name": "batch_audio",               "price_value": 0.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 2.50, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 1.25, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": "2026-02-17",
            },
            {
                "model_name": "Gemini 2.5 Flash-Lite",
                "model_id": "gemini-2.5-flash-lite",
                "description": (
                    "Smallest and most cost-effective Gemini 2.5 model. Good at speed, " +
                    "classification, extraction, and at-scale usage. Not good at complex reasoning."
                ),
                "capabilities": ["vision", "tools"],
                "latency_class": "fastest",
                "regional_availability": ["us-central1", "europe-west4"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard_text_image_video", "price_value": 0.10,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "standard_audio",            "price_value": 0.30,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "context_cache_text",        "price_value": 0.01,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "context_cache_audio",       "price_value": 0.03,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "batch_text_image_video",    "price_value": 0.05,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 6, "tier_name": "batch_audio",               "price_value": 0.15,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.40, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 0.20, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "Gemini 2.5 Flash Native Audio (Live API)",
                "model_id": "gemini-2.5-flash-native-audio-preview-12-2025",
                "description": (
                    "Optimized for high-quality audio outputs with better pacing, voice " +
                    "naturalness, and mood. Live API model for real-time speech."
                ),
                "capabilities": ["tools"],
                "latency_class": "fastest",
                "regional_availability": ["us-central1"],
                "context_window": 128000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "text",  "price_value": 0.50, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "audio", "price_value": 3.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "video", "price_value": 3.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "text",  "price_value": 2.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "audio", "price_value": 12.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "preview",
                "expiration_date": null,
            },

            // ── Gemini 2.0 (retired June 1, 2026) ────────────────────────────
            {
                "model_name": "Gemini 2.0 Flash",
                "model_id": "gemini-2.0-flash",
                "description": (
                    "Balanced multimodal model for agents. 1 M context window. " +
                    "Retired June 1, 2026 — replaced by gemini-3.5-flash."
                ),
                "capabilities": ["vision", "tools", "long-context"],
                "latency_class": "fast",
                "regional_availability": ["us-central1", "europe-west4", "asia-northeast1"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard_text_image_video", "price_value": 0.10,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "standard_audio",            "price_value": 0.70,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "context_cache_text",        "price_value": 0.025, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "context_cache_audio",       "price_value": 0.175, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "batch_text_image_video",    "price_value": 0.05,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 6, "tier_name": "batch_audio",               "price_value": 0.35,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.40, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 0.20, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": "2026-06-01",
            },
            {
                "model_name": "Gemini 2.0 Flash-Lite",
                "model_id": "gemini-2.0-flash-lite",
                "description": (
                    "Ultra-cheap model for at-scale simple tasks. No context caching. " +
                    "Retired June 1, 2026 — replaced by gemini-3.1-flash-lite."
                ),
                "capabilities": ["vision"],
                "latency_class": "fastest",
                "regional_availability": ["us-central1"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.075,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 0.0375, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.30, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 0.15, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": "2026-06-01",
            },

            // ── Gemini Embedding ─────────────────────────────────────────────
            {
                "model_name": "Gemini Embedding 2",
                "model_id": "gemini-embedding-2",
                "description": (
                    "Multimodal embedding model covering text, image, audio, and video " +
                    "input with per-modality token pricing. No output tokens."
                ),
                "capabilities": ["vision"],
                "latency_class": "fast",
                "regional_availability": ["us-central1"],
                "context_window": 8192,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard_text",  "price_value": 0.20,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "standard_image", "price_value": 0.45,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "standard_audio", "price_value": 6.50,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 4, "tier_name": "standard_video", "price_value": 12.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 5, "tier_name": "batch_text",     "price_value": 0.10,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 6, "tier_name": "batch_image",    "price_value": 0.225, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 7, "tier_name": "batch_audio",    "price_value": 3.25,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 8, "tier_name": "batch_video",    "price_value": 6.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "Gemini Embedding",
                "model_id": "gemini-embedding-001",
                "description": (
                    "Stable embedding model for semantic search, clustering, and recommendation. " +
                    "Text input only; no output tokens."
                ),
                "capabilities": [],
                "latency_class": "fast",
                "regional_availability": ["us-central1"],
                "context_window": 8192,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.15,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 0.075, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [],
                },
                "status": "active",
                "expiration_date": null,
            },

            // ── Computer Use ─────────────────────────────────────────────────
            {
                "model_name": "Gemini 2.5 Computer Use Preview",
                "model_id": "gemini-2.5-computer-use-preview-10-2025",
                "description": (
                    "Specialized model for building browser-control agents that automate tasks. " +
                    "Long-context surcharge applies above 200 k tokens."
                ),
                "capabilities": ["vision", "tools", "reasoning"],
                "latency_class": "medium",
                "regional_availability": ["us-central1"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 1.25, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "long_context",  "price_value": 2.50, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 10.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "long_context",  "price_value": 15.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "preview",
                "expiration_date": null,
            },

            // ── Gemma (open-source, free API access) ─────────────────────────
            {
                "model_name": "Gemma 3",
                "model_id": "gemma-3",
                "description": "Open-weight lightweight model. Free via Gemini API. No paid tier.",
                "capabilities": ["coding", "vision"],
                "latency_class": "fast",
                "regional_availability": ["us-central1"],
                "context_window": 128000,
                "pricing": {
                    "input_token":  [{"tier_order": 1, "tier_name": "free", "price_value": 0.00, "price_currency": "USD", "price_per_qty": 1000000}],
                    "output_token": [{"tier_order": 1, "tier_name": "free", "price_value": 0.00, "price_currency": "USD", "price_per_qty": 1000000}],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "Gemma 3n",
                "model_id": "gemma-3n",
                "description": "Open-weight model built for on-device inference on mobile/laptop. Free via API.",
                "capabilities": ["coding"],
                "latency_class": "fastest",
                "regional_availability": ["us-central1"],
                "context_window": 32000,
                "pricing": {
                    "input_token":  [{"tier_order": 1, "tier_name": "free", "price_value": 0.00, "price_currency": "USD", "price_per_qty": 1000000}],
                    "output_token": [{"tier_order": 1, "tier_name": "free", "price_value": 0.00, "price_currency": "USD", "price_per_qty": 1000000}],
                },
                "status": "active",
                "expiration_date": null,
            },
        ],
    },

    // =========================================================================
    // MISTRAL
    // =========================================================================
    "mistral": {
        "provider_name": "Mistral AI",
        "provider_url": "https://mistral.ai/pricing#api",
        "models": [

            // ── Frontier Generalist ──────────────────────────────────────────
            {
                "model_name": "Mistral Medium 3.5",
                "model_id": "mistral-medium-3-5-2604",
                "description": (
                    "Frontier-class 128B dense multimodal model released April 2026. " +
                    "Unifies chat, reasoning, and code in a single model; optimized for " +
                    "agentic and coding use cases. Supersedes Magistral and Devstral 2. " +
                    "256 k context window. Open weights (modified MIT)."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "medium",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 262144,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 1.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 7.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "Mistral Large 3",
                "model_id": "mistral-large-2512",
                "description": (
                    "State-of-the-art open-weight general-purpose multimodal model. " +
                    "Good at complex reasoning, multilingual tasks, and native multimodal inputs. " +
                    "262 k context window."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "medium",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 262144,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 1.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "Mistral Medium 3.1",
                "model_id": "mistral-medium-3-1-2508",
                "description": (
                    "Frontier-class multimodal model released August 2025. Good balance of " +
                    "intelligence and price. Supports vision and function calling. " +
                    "Superseded by Mistral Medium 3.5."
                ),
                "capabilities": ["coding", "reasoning", "vision", "tools"],
                "latency_class": "medium",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 131072,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.40,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 2.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": null,
            },
            {
                "model_name": "Mistral Medium 3",
                "model_id": "mistral-medium-3-2505",
                "description": (
                    "Frontier-class multimodal model released May 2025. At or above 90 % of " +
                    "Claude Sonnet 3.7 on benchmarks at a fraction of the cost. " +
                    "Superseded by Mistral Medium 3.1 / 3.5."
                ),
                "capabilities": ["coding", "reasoning", "vision", "tools"],
                "latency_class": "medium",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 131072,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.40,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 2.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "legacy",
                "expiration_date": null,
            },
            {
                "model_name": "Mistral Small 4",
                "model_id": "mistral-small-4-0-2603",
                "description": (
                    "Hybrid model unifying instruct, reasoning, and coding in a single efficient " +
                    "model. Released March 2026."
                ),
                "capabilities": ["coding", "reasoning", "vision", "tools"],
                "latency_class": "fast",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 128000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.15,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.60,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "Mistral Small 3.2",
                "model_id": "mistral-small-2506",
                "description": (
                    "Update to Mistral Small released June 2025. Good for classification, " +
                    "extraction, and high-volume tasks. Not good at deep reasoning. " +
                    "Superseded by Mistral Small 4."
                ),
                "capabilities": ["coding", "vision", "tools"],
                "latency_class": "fast",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 128000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.07,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.20,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": null,
            },

            // ── Mistral Ministral ────────────────────────────────────────────
            {
                "model_name": "Ministral 3 14B",
                "model_id": "ministral-3-14b-2512",
                "description": "Powerful 14B model with best-in-class text and vision capabilities.",
                "capabilities": ["coding", "vision", "tools"],
                "latency_class": "fast",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 128000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.20,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.20,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "Ministral 3 8B",
                "model_id": "ministral-3-8b-2512",
                "description": "Efficient 8B model. Good at speed and extraction. Not good at complex reasoning.",
                "capabilities": ["coding", "vision", "tools"],
                "latency_class": "fastest",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 128000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.15,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.15,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "Ministral 3 3B",
                "model_id": "ministral-3-3b-2512",
                "description": "Tiny, efficient 3B model. Best-in-class for on-device or cost-sensitive inference.",
                "capabilities": ["tools"],
                "latency_class": "fastest",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 128000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.10,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.10,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },

            // ── Magistral (Reasoning) ────────────────────────────────────────
            {
                "model_name": "Magistral Medium 1.2",
                "model_id": "magistral-medium-2509",
                "description": (
                    "Frontier-class multimodal reasoning model. Good at multi-step logic, " +
                    "transparent reasoning, and complex problem-solving in multiple languages. " +
                    "Superseded by Mistral Medium 3.5 (unified reasoning)."
                ),
                "capabilities": ["reasoning", "vision", "tools", "long-context"],
                "latency_class": "slow",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 131072,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 2.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 5.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": null,
            },
            {
                "model_name": "Magistral Small 1.2",
                "model_id": "magistral-small-2509",
                "description": (
                    "Small multimodal reasoning model. Cost-efficient reasoning for structured " +
                    "analysis tasks. Superseded by Mistral Small 4 (hybrid reasoning)."
                ),
                "capabilities": ["reasoning", "vision", "tools"],
                "latency_class": "medium",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 131072,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 1.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": null,
            },

            // ── Codestral / Devstral (Coding Specialist) ─────────────────────
            {
                "model_name": "Codestral",
                "model_id": "codestral-2508",
                "description": (
                    "Cutting-edge language model for code completion, FIM, and debugging. " +
                    "Released end of July 2025."
                ),
                "capabilities": ["coding", "tools"],
                "latency_class": "fast",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 262144,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.30,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.90,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "Devstral 2",
                "model_id": "devstral-2-2512",
                "description": (
                    "Open-weight frontier code-agents model for solving SWE tasks. " +
                    "262 k context window; excels at multi-file editing and codebase exploration. " +
                    "Superseded by Mistral Medium 3.5."
                ),
                "capabilities": ["coding", "tools", "long-context"],
                "latency_class": "medium",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 262144,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.40,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 2.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": null,
            },
            {
                "model_name": "Devstral Medium 1.0",
                "model_id": "devstral-medium-1-0-2507",
                "description": "Enterprise-grade text model excelling at SWE use cases.",
                "capabilities": ["coding", "tools"],
                "latency_class": "medium",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 131072,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.40,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 2.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": null,
            },
            {
                "model_name": "Devstral Small 1.1",
                "model_id": "devstral-small-1-1-2507",
                "description": "Open-source SWE model; good for agentic coding on limited budgets.",
                "capabilities": ["coding", "tools"],
                "latency_class": "fast",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 131072,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.07,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.28,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": null,
            },

            // ── Leanstral (Labs / Formal Proofs) ─────────────────────────────
            {
                "model_name": "Leanstral 1.5",
                "model_id": "labs-leanstral-1-5",
                "description": (
                    "Mistral Labs experimental model for Lean 4 formal proof engineering, " +
                    "automated theorem proving, and autoformalization. 119B total / 6.5B active " +
                    "parameters. Released June 30, 2026; free on the API until retirement on " +
                    "September 30, 2026. 256 k context window."
                ),
                "capabilities": ["reasoning", "long-context", "tools"],
                "latency_class": "medium",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 262144,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "preview",
                "expiration_date": "2026-09-30",
            },

            // ── Mistral Nemo ─────────────────────────────────────────────────
            {
                "model_name": "Mistral Nemo 12B",
                "model_id": "open-mistral-nemo",
                "description": "Best multilingual open-source model; cheapest Mistral option.",
                "capabilities": ["coding", "tools"],
                "latency_class": "fast",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 128000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.15,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.15,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": null,
            },

            // ── Mistral Embed ────────────────────────────────────────────────
            {
                "model_name": "Mistral Embed",
                "model_id": "mistral-embed",
                "description": "State-of-the-art semantic embedding model for code and text.",
                "capabilities": [],
                "latency_class": "fast",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 8192,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.10,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [],
                },
                "status": "active",
                "expiration_date": null,
            },
            {
                "model_name": "Codestral Embed",
                "model_id": "codestral-embed-2505",
                "description": "State-of-the-art semantic embedding for code extracts.",
                "capabilities": [],
                "latency_class": "fast",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 8192,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.15,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [],
                },
                "status": "active",
                "expiration_date": null,
            },
        ],
    },

    // =========================================================================
    // XAI GROK
    // =========================================================================
    "xai_grok": {
        "provider_name": "xAI Grok",
        "provider_url": "https://docs.x.ai/developers/models#model-pricing",
        "models": [

            // ── Grok 4.5 (latest flagship) ───────────────────────────────────
            {
                "model_name": "Grok 4.5",
                "model_id": "grok-4.5",
                "description": (
                    "Current xAI flagship (mid-2026). Coding-focused model with " +
                    "configurable reasoning effort (low/medium/high), function calling, " +
                    "web/X search, and code execution. 500 k context; knowledge cutoff " +
                    "Feb 1, 2026. Long-context requests (above the model's threshold) " +
                    "bill at 2x: $4.00 input / $0.60 cached / $12.00 output per 1 M. " +
                    "No batch discount."
                ),
                "capabilities": ["coding", "reasoning", "long-context", "tools"],
                "latency_class": "fast",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 500000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",      "price_value": 2.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input",  "price_value": 0.30,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard",  "price_value": 6.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },

            // ── Grok 4.3 ─────────────────────────────────────────────────────
            {
                "model_name": "Grok 4.3",
                "model_id": "grok-4.3",
                "description": (
                    "Workhorse flagship that leads the industry in non-hallucination " +
                    "rate and agentic tool calling. Supports both reasoning and " +
                    "non-reasoning modes. 1 M token context. Long-context requests bill " +
                    "at 2x: $2.50 input / $0.40 cached / $5.00 output per 1 M. Batch API " +
                    "gets a 20% discount. Designated migration target for the models " +
                    "retired on 2026-05-15 (old slugs auto-redirect here)."
                ),
                "capabilities": ["coding", "reasoning", "long-context", "tools"],
                "latency_class": "fast",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 1.25,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.20,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "batch",        "price_value": 1.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 2.50,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 2.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },

            // ── Grok Build 0.1 (early access) ────────────────────────────────
            {
                "model_name": "Grok Build 0.1",
                "model_id": "grok-build-0.1",
                "description": (
                    "xAI's fast coding model trained specifically for agentic coding, " +
                    "currently in early access. Recommended replacement for code " +
                    "workloads after Grok Code Fast 1's retirement. 256 k context. " +
                    "Long-context requests bill at 2x: $2.00 input / $0.40 cached / " +
                    "$4.00 output per 1 M. No batch discount."
                ),
                "capabilities": ["coding", "tools"],
                "latency_class": "fast",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 256000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 1.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.20,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 2.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "preview",
                "expiration_date": null,
            },

            // ── Grok 4.20 ────────────────────────────────────────────────────
            {
                "model_name": "Grok 4.20",
                "model_id": "grok-4-20",
                "description": (
                    "Former flagship, superseded by Grok 4.5 / 4.3 but still served. " +
                    "Current official slugs are dated snapshots: " +
                    "grok-4.20-0309-reasoning, grok-4.20-0309-non-reasoning, and " +
                    "grok-4.20-multi-agent-0309, all priced identically to Grok 4.3. " +
                    "1 M token context on the pricing page (previously listed at 2 M). " +
                    "Long-context requests bill at 2x: $2.50 input / $0.40 cached / " +
                    "$5.00 output per 1 M. Batch API gets a 20% discount."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "fast",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",      "price_value": 1.25,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input",  "price_value": 0.20,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "batch",         "price_value": 1.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard",  "price_value": 2.50,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",     "price_value": 2.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },

            // ── Grok 4 (retired 2026-05-15) ──────────────────────────────────
            {
                "model_name": "Grok 4",
                "model_id": "grok-4",
                "description": (
                    "xAI flagship reasoning model. Always-on reasoning; best for complex " +
                    "analysis, tool use, and real-time search. 256 k context. " +
                    "Note: no presencePenalty, frequencyPenalty, or stop parameters. " +
                    "Retired 2026-05-15 (grok-4-0709 snapshot); the slug auto-redirects " +
                    "to grok-4.3 at grok-4.3 pricing."
                ),
                "capabilities": ["coding", "reasoning", "vision", "tools"],
                "latency_class": "medium",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 256000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 3.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.75,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "batch",        "price_value": 1.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 15.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 7.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": "2026-05-15",
            },

            // ── Grok 4.1 Fast (Reasoning) (retired 2026-05-15) ───────────────
            {
                "model_name": "Grok 4.1 Fast (Reasoning)",
                "model_id": "grok-4-1-fast-reasoning",
                "description": (
                    "Near-frontier reasoning at $0.20/$0.50 per 1 M tokens — cheapest " +
                    "capable frontier model available. 2 M token context. Good for high-volume " +
                    "agentic workloads where cost matters. Retired 2026-05-15; the slug " +
                    "auto-redirects to grok-4.3 (low reasoning effort) at grok-4.3 pricing."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "fast",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 2000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 0.20,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.05,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "batch",        "price_value": 0.10,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.50,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 0.25,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": "2026-05-15",
            },
            {
                "model_name": "Grok 4.1 Fast (Non-Reasoning)",
                "model_id": "grok-4-1-fast-non-reasoning",
                "description": (
                    "Non-reasoning variant of Grok 4.1 Fast for latency-sensitive use cases. " +
                    "Lower capability score than reasoning variant; best for simple tasks " +
                    "where speed is paramount. Retired 2026-05-15; the slug auto-redirects " +
                    "to grok-4.3 (no reasoning effort) at grok-4.3 pricing."
                ),
                "capabilities": ["coding", "vision", "tools", "long-context"],
                "latency_class": "fastest",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 2000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 0.20,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.05,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "batch",        "price_value": 0.10,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.50,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 0.25,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": "2026-05-15",
            },

            // ── Grok Code Fast 1 (retired 2026-05-15) ────────────────────────
            {
                "model_name": "Grok Code Fast 1",
                "model_id": "grok-code-fast-1",
                "description": (
                    "Specialized agentic coding model from xAI. Tuned for code generation, " +
                    "refactoring, and CI/CD automation. Retired 2026-05-15; recommended " +
                    "replacement for code workloads is grok-build-0.1."
                ),
                "capabilities": ["coding", "tools"],
                "latency_class": "fast",
                "regional_availability": ["us-east-1", "eu-west-1"],
                "context_window": 2000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 0.20,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.05,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "batch",        "price_value": 0.10,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.50,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 0.25,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": "2026-05-15",
            },

            // ── Grok 3 (retired 2026-05-15) ──────────────────────────────────
            {
                "model_name": "Grok 3",
                "model_id": "grok-3",
                "description": (
                    "Previous flagship model (Feb 2025). Competitive with GPT-4o/Claude 3.5 on " +
                    "benchmarks. Retired 2026-05-15; the slug auto-redirects to grok-4.3 " +
                    "at grok-4.3 pricing."
                ),
                "capabilities": ["coding", "reasoning", "vision", "tools"],
                "latency_class": "medium",
                "regional_availability": ["us-east-1"],
                "context_window": 131072,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 3.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.75,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 3, "tier_name": "batch",        "price_value": 1.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 15.00, "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "batch",    "price_value": 7.50,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "deprecated",
                "expiration_date": "2026-05-15",
            },
        ],
    },

    // =========================================================================
    // MOONSHOT AI (KIMI)
    // =========================================================================
    // Note: Moonshot serves a single global API endpoint (no per-cloud regions),
    // hence regional_availability = ["global"]. Thinking and non-thinking modes
    // run under the same model at the same price — no reasoning surcharge.
    "moonshot": {
        "provider_name": "Moonshot AI (Kimi)",
        "provider_url": "https://platform.kimi.ai/docs/pricing/chat",
        "models": [

            // ── Kimi K3 (flagship) ──────────────────────────────────────────
            {
                "model_name": "Kimi K3",
                "model_id": "kimi-k3",
                "description": (
                    "Moonshot's flagship reasoning model with a 1M-token context window and " +
                    "native vision. Thinking is always enabled (reasoning_effort supports only " +
                    "'max' at launch), so every request pays for a full reasoning trace."
                ),
                "capabilities": ["coding", "reasoning", "vision", "long-context", "tools"],
                "latency_class": "slow",
                "regional_availability": ["global"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 3.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.30,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 15.00, "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },

            // ── Kimi K2.7 Code ──────────────────────────────────────────────
            {
                "model_name": "Kimi K2.7 Code",
                "model_id": "kimi-k2.7-code",
                "description": (
                    "Coding-specialized variant optimized for coding agents. Supports " +
                    "multimodal input; thinking mode must be enabled explicitly."
                ),
                "capabilities": ["coding", "reasoning", "vision", "tools"],
                "latency_class": "medium",
                "regional_availability": ["global"],
                "context_window": 256000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 0.95,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.19,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 4.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },

            // ── Kimi K2.6 ───────────────────────────────────────────────────
            {
                "model_name": "Kimi K2.6",
                "model_id": "kimi-k2.6",
                "description": (
                    "Previous-generation flagship general model; accepts visual and text " +
                    "content. Top open-weight coding performer of its generation."
                ),
                "capabilities": ["coding", "reasoning", "vision", "tools"],
                "latency_class": "medium",
                "regional_availability": ["global"],
                "context_window": 256000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.95,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 4.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },

            // ── Kimi K2.5 (value tier) ──────────────────────────────────────
            {
                "model_name": "Kimi K2.5",
                "model_id": "kimi-k2.5",
                "description": (
                    "Value tier. Supports thinking and non-thinking modes at the same rate."
                ),
                "capabilities": ["coding", "reasoning", "tools"],
                "latency_class": "fast",
                "regional_availability": ["global"],
                "context_window": 256000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.60,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 3.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
        ],
    },

    // =========================================================================
    // DEEPSEEK
    // =========================================================================
    // Note: DeepSeek prices its context cache as "cache hit" input; mapped here
    // to the cached_input tier. Both models support thinking and non-thinking
    // modes, JSON output, and tool calls. Max output: 384K tokens.
    "deepseek": {
        "provider_name": "DeepSeek",
        "provider_url": "https://api-docs.deepseek.com/quick_start/pricing",
        "models": [

            // ── DeepSeek-V4-Flash ───────────────────────────────────────────
            {
                "model_name": "DeepSeek-V4-Flash",
                "model_id": "deepseek-v4-flash",
                "description": (
                    "High-throughput workhorse (concurrency limit 2,500). Supports thinking " +
                    "and non-thinking modes with JSON output and tool calling. Chat Prefix " +
                    "Completion and FIM available in non-thinking mode only."
                ),
                "capabilities": ["coding", "reasoning", "long-context", "tools"],
                "latency_class": "fast",
                "regional_availability": ["global"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 0.14,    "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.0028,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.28,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },

            // ── DeepSeek-V4-Pro ─────────────────────────────────────────────
            {
                "model_name": "DeepSeek-V4-Pro",
                "model_id": "deepseek-v4-pro",
                "description": (
                    "Higher-capacity model with the same feature set as V4-Flash " +
                    "(concurrency limit 500). Stronger reasoning at ~3x the token price."
                ),
                "capabilities": ["coding", "reasoning", "long-context", "tools"],
                "latency_class": "medium",
                "regional_availability": ["global"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 0.435,     "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.003625,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.87,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
        ],
    },

    // =========================================================================
    // ZHIPU AI (GLM / Z.AI)
    // =========================================================================
    // Note: pricing from the global Z.ai endpoint (docs.z.ai); a separate
    // China-mainland endpoint exists at bigmodel.cn. Vision models (GLM-5V-Turbo,
    // GLM-4.6V, ...) are omitted: context windows not published on pricing page.
    "zhipu": {
        "provider_name": "Zhipu AI (GLM / Z.ai)",
        "provider_url": "https://docs.z.ai/guides/overview/pricing",
        "models": [

            // ── GLM-5.2 (flagship) ──────────────────────────────────────────
            {
                "model_name": "GLM-5.2",
                "model_id": "glm-5.2",
                "description": (
                    "Current flagship large-scale reasoning model (June 2026). 1M-token " +
                    "context, 128K max output. Strong at software engineering and multi-step " +
                    "agentic workflows; supports thinking mode, function calling, context " +
                    "caching, and structured (JSON) output."
                ),
                "capabilities": ["coding", "reasoning", "long-context", "tools"],
                "latency_class": "medium",
                "regional_availability": ["global"],
                "context_window": 1000000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 1.40,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.26,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 4.40,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },

            // ── GLM-5 ───────────────────────────────────────────────────────
            {
                "model_name": "GLM-5",
                "model_id": "glm-5",
                "description": (
                    "Open-weight foundation model (Feb 2026) for complex systems design and " +
                    "long-horizon agent workflows. 200K context, 128K max output."
                ),
                "capabilities": ["coding", "reasoning", "tools"],
                "latency_class": "medium",
                "regional_availability": ["global"],
                "context_window": 200000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 1.00,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.20,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 3.20,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },

            // ── GLM-4.7 ─────────────────────────────────────────────────────
            {
                "model_name": "GLM-4.7",
                "model_id": "glm-4.7",
                "description": (
                    "Full-featured mid-tier production model. 200K context, 128K max output. " +
                    "Improved programming, multi-step reasoning, and agentic capabilities; " +
                    "targets coding environments and agent work."
                ),
                "capabilities": ["coding", "reasoning", "tools"],
                "latency_class": "fast",
                "regional_availability": ["global"],
                "context_window": 200000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 0.60,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.11,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 2.20,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },

            // ── GLM-4.7-FlashX ──────────────────────────────────────────────
            {
                "model_name": "GLM-4.7-FlashX",
                "model_id": "glm-4.7-flashx",
                "description": (
                    "Lightweight, high-speed, low-cost paid variant of GLM-4.7. " +
                    "200K context, 128K max output, text only."
                ),
                "capabilities": ["coding", "tools"],
                "latency_class": "fastest",
                "regional_availability": ["global"],
                "context_window": 200000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "standard",     "price_value": 0.07,  "price_currency": "USD", "price_per_qty": 1000000},
                        {"tier_order": 2, "tier_name": "cached_input", "price_value": 0.01,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "standard", "price_value": 0.40,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },

            // ── GLM-4.7-Flash (free) ────────────────────────────────────────
            {
                "model_name": "GLM-4.7-Flash",
                "model_id": "glm-4.7-flash",
                "description": (
                    "Lightweight, completely free variant of GLM-4.7 (rate-limited). " +
                    "200K context, 128K max output, text only."
                ),
                "capabilities": ["coding", "tools"],
                "latency_class": "fastest",
                "regional_availability": ["global"],
                "context_window": 200000,
                "pricing": {
                    "input_token": [
                        {"tier_order": 1, "tier_name": "free", "price_value": 0.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                    "output_token": [
                        {"tier_order": 1, "tier_name": "free", "price_value": 0.00,  "price_currency": "USD", "price_per_qty": 1000000},
                    ],
                },
                "status": "active",
                "expiration_date": null,
            },
        ],
    },
};

window.LLM_REGISTRY = llmRegistry;
})(window);
