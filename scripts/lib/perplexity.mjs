// Web-grounded answers from the Perplexity Agent API (POST /v1/agent).
//
// Why this lives in scripts/ and not in api/: an answer here costs money per
// call and takes seconds, so it is a tool the shop owner runs, not something a
// page visitor can trigger. Nothing under api/ imports it, and the deployed
// site never calls it.
//
// The key comes from the PERPLEXITY_API_KEY environment variable and from
// nowhere else. It is never written to a file, printed, or passed on a command
// line — export it in your own shell:
//   export PERPLEXITY_API_KEY=...            (bash)
//   $env:PERPLEXITY_API_KEY = '...'          (PowerShell)
// Create or rotate one at https://console.perplexity.ai
import Perplexity, { APIError, AuthenticationError, RateLimitError } from '@perplexity-ai/perplexity_ai';

export const ENV_KEY = 'PERPLEXITY_API_KEY';

/** Presence only — the value itself is never read out of here. */
export const hasKey = () => Boolean(process.env[ENV_KEY]);

/* Presets bundle model, tools and step limit, so a caller picks a depth rather
   than assembling a model name. fast = one lookup, low = a few pages, medium =
   real multi-step research; high/xhigh cost accordingly. Default is low: enough
   for "what does this cost in Ukraine", cheap enough to run over a list. */
export const PRESETS = ['fast', 'low', 'medium', 'high', 'xhigh'];

/* The SDK defaults to a fifteen-minute timeout, which is fine for a background
   job and useless at a terminal — you cannot tell a slow answer from a hang. */
const TIMEOUT_MS = 120_000;

let client;
function getClient() {
  if (!hasKey()) {
    throw Object.assign(new Error(`${ENV_KEY} не встановлено`), { code: 'no_key' });
  }
  // apiKey is read from the environment by the SDK itself; naming it here keeps
  // the source of the value obvious without ever holding it in our own state.
  client ||= new Perplexity({ apiKey: process.env[ENV_KEY], timeout: TIMEOUT_MS });
  return client;
}

/** Pull the sources out of the response. `output` carries one search_results
    item per search the agent ran, so the lists are concatenated and de-duped
    by url — the same page often comes back for two different queries. */
function collectSources(output = []) {
  const seen = new Map();
  for (const item of output) {
    if (item?.type !== 'search_results') continue;
    for (const r of item.results || []) {
      if (r?.url && !seen.has(r.url)) {
        seen.set(r.url, { url: r.url, title: r.title, snippet: r.snippet, date: r.date ?? null });
      }
    }
  }
  return [...seen.values()];
}

/** URL citations attached to the answer text itself. Present only when the
    model actually cited inline, which is why sources are read separately. */
function collectCitations(output = []) {
  const out = [];
  for (const item of output) {
    if (item?.type !== 'message') continue;
    for (const part of item.content || []) {
      for (const a of part?.annotations || []) {
        if (a?.type === 'url_citation') out.push({ url: a.url, title: a.title ?? null });
      }
    }
  }
  return out;
}

/**
 * Ask a web-grounded question.
 *
 * @param {string|object[]} input   the question, or the full input array for a multi-turn replay
 * @param {object} [opts]
 * @param {string} [opts.preset='low']       one of PRESETS; bundles model, tools and max_steps
 * @param {string} [opts.model]              overrides the preset's model, e.g. 'openai/gpt-5.6-sol'
 * @param {string} [opts.instructions]       system prompt
 * @param {object[]} [opts.tools]            overrides the preset's tools, e.g. [{ type: 'web_search' }]
 * @param {string} [opts.recency]            'hour'|'day'|'week'|'month'|'year' — narrows web_search
 * @param {string[]} [opts.domains]          restrict web_search to these hosts
 * @param {object} [opts.schema]             JSON schema; turns the answer into parseable JSON
 * @param {string} [opts.schemaName='result']
 * @param {string} [opts.previousResponseId] continue an earlier exchange
 * @param {number} [opts.maxSteps]           overrides the preset's research-loop limit
 * @param {string} [opts.language]           ISO 639-1, e.g. 'uk'
 * @returns {Promise<{id:string,status:string,model:string,text:string,json:object|null,
 *                    sources:object[],citations:object[],usage:object|null}>}
 */
export async function askWeb(input, opts = {}) {
  const {
    preset = 'low', model, instructions, tools, recency, domains,
    schema, schemaName = 'result', previousResponseId, maxSteps, language,
  } = opts;

  if (!input || (typeof input === 'string' && !input.trim())) {
    throw Object.assign(new Error('порожній запит'), { code: 'empty_input' });
  }
  if (!model && !PRESETS.includes(preset)) {
    throw Object.assign(new Error(`невідомий preset «${preset}» (${PRESETS.join(', ')})`),
      { code: 'bad_preset' });
  }

  /* Web search is a tool, not a flag. The preset already switches it on, so it
     is only spelled out here when a filter has to ride along with it. */
  let toolList = tools;
  if (!toolList && (recency || domains)) {
    const filters = {};
    if (recency) filters.search_recency_filter = recency;
    if (domains?.length) filters.search_domain_filter = domains;
    toolList = [{ type: 'web_search', filters }];
  }

  const body = { input };
  if (model) body.model = model; else body.preset = preset;
  if (instructions) body.instructions = instructions;
  if (toolList) body.tools = toolList;
  if (maxSteps) body.max_steps = maxSteps;
  if (language) body.language_preference = language;
  if (previousResponseId) body.previous_response_id = previousResponseId;
  if (schema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: schemaName, schema, strict: true },
    };
  }

  let res;
  try {
    res = await getClient().responses.create(body);
  } catch (e) {
    throw translate(e);
  }

  if (res.status === 'failed') {
    throw Object.assign(new Error(res.error?.message || 'запит не виконано'),
      { code: 'failed', status: res.status });
  }

  const text = res.output_text ?? '';
  let json = null;
  if (schema && text) {
    try { json = JSON.parse(text); } catch {
      throw Object.assign(new Error('відповідь не є JSON, хоча просили схему'), { code: 'bad_json' });
    }
  }

  return {
    id: res.id,
    status: res.status,
    model: res.model,
    text,
    json,
    sources: collectSources(res.output),
    citations: collectCitations(res.output),
    usage: res.usage ?? null,
  };
}

/* One shape of error for callers, with the cases worth acting on named. The
   SDK already retries a 429 twice on its own; if one still arrives, Retry-After
   says how long to wait before the next attempt is worth making. */
function translate(e) {
  if (e instanceof AuthenticationError) {
    return Object.assign(new Error(`${ENV_KEY} відхилено (401) — ключ недійсний або відкликаний`),
      { code: 'auth', status: 401, cause: e });
  }
  if (e instanceof RateLimitError) {
    const retryAfter = Number(e.headers?.get?.('retry-after')) || null;
    return Object.assign(
      new Error(`ліміт запитів (429)${retryAfter ? `, повторіть через ${retryAfter} с` : ''}`),
      { code: 'rate_limit', status: 429, retryAfter, cause: e });
  }
  if (e instanceof APIError) {
    return Object.assign(new Error(`Perplexity API ${e.status ?? ''}: ${e.message}`.trim()),
      { code: 'api', status: e.status ?? null, cause: e });
  }
  return Object.assign(new Error(`мережа: ${e.message}`), { code: 'network', cause: e });
}
