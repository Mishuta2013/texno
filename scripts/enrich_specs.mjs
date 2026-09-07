#!/usr/bin/env node
// Fill in the specs the supplier feed does not state, from the web.
//
//   node scripts/enrich_specs.mjs --cat myyky            research, write a report
//   node scripts/enrich_specs.mjs --cat myyky --apply    also write data/products.json
//   node scripts/enrich_specs.mjs --limit 5 --cat vytyazhky
//
// Needs PERPLEXITY_API_KEY. Costs money per product, so it runs one category at
// a time and always writes scratch/enrich-<cat>.json for review first.
//
// The rules this works under, because a wrong spec on a shop page sends a buyer
// home with a hob that does not fit the hole they cut:
//
//   1. A value the feed already states always wins. The web is only asked about
//      fields that are missing.
//   2. Every value must come back with the URL it was read from, and the search
//      is pointed at the manufacturer and the official distributor first. A
//      value without a source is dropped.
//   3. The model is told to return null rather than guess, and the schema makes
//      every field nullable so that is a legal answer.
//   4. Anything the web contradicts the feed on is reported, never written.
//
// What this cannot do is verify that the page it read is about the same model.
// Read the report before --apply.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { askWeb, hasKey, ENV_KEY } from './lib/perplexity.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));

/* Official sources first. The supplier's own product pages carry the
   manufacturer's spec table; the rest are the distributors that copy it. */
const DOMAINS = ['gunter-hauer.kyiv.ua', 'gunter-hauer.com.ua', 'gunterhauer.com'];

/* Which fields are worth asking about, per category, with the unit the answer
   must be in. Keys match data/categories.json so the spec table renders them
   without any further work. */
const WANTED = {
  'duhovi-shafy': [
    ['volume_l', 'total cavity volume in litres, number only'],
    ['functions', 'number of heating functions, number only'],
    ['eclass', 'energy efficiency class, e.g. A or A+'],
    ['power_w', 'connected power in watts, number only'],
  ],
  'varylni-poverhni': [
    ['burners', 'number of cooking zones, number only'],
    ['power_w', 'total connected power in watts, number only'],
    ['control', 'how it is controlled: touch, knobs, or both'],
  ],
  vytyazhky: [
    ['noise_db', 'noise level at maximum speed in dB, number only'],
    ['motor_w', 'motor power in watts, number only'],
    ['lamps', 'lighting type, e.g. LED'],
  ],
  myyky: [
    ['depth_mm', 'bowl depth in millimetres, number only'],
    ['material', 'body material'],
    ['thickness_mm', 'steel thickness in millimetres, e.g. 3.0'],
  ],
  zmishuvachi: [
    ['height_cm', 'overall height in centimetres, number only'],
    ['cartridge_mm', 'ceramic cartridge diameter in millimetres, number only'],
    ['material', 'body material'],
  ],
  'posudomyyni-mashyny': [
    ['water_l', 'water use per cycle in litres, number only'],
    ['energy_kwh', 'energy use per cycle in kWh, e.g. 0.93'],
    ['baskets', 'number of baskets, number only'],
  ],
  'mikrohvylovi-pechi': [
    ['volume_l', 'cavity volume in litres, number only'],
    ['eclass', 'energy efficiency class'],
  ],
  dozatory: [],
};

function args(argv) {
  const o = { limit: Infinity };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--cat') o.cat = argv[++i];
    else if (argv[i] === '--limit') o.limit = Number(argv[++i]);
    else if (argv[i] === '--apply') o.apply = true;
    else if (argv[i] === '--preset') o.preset = argv[++i];
    else if (argv[i] === '-h' || argv[i] === '--help') o.help = true;
  }
  return o;
}

const schemaFor = fields => ({
  type: 'object',
  additionalProperties: false,
  required: fields.map(([k]) => k),
  properties: Object.fromEntries(fields.map(([k, hint]) => [k, {
    type: ['object', 'null'],
    description: hint + ' — null if you cannot find it stated for this exact model',
    additionalProperties: false,
    required: ['value', 'source'],
    properties: {
      value: { type: 'string', description: hint },
      source: { type: 'string', description: 'the URL the value was read from' },
    },
  }])),
});

async function main() {
  const o = args(process.argv.slice(2));
  if (o.help || !o.cat) {
    console.log('node scripts/enrich_specs.mjs --cat <категорія> [--limit N] [--preset medium] [--apply]');
    console.log('категорії:', Object.keys(WANTED).join(', '));
    process.exit(o.help ? 0 : 1);
  }
  const fields = WANTED[o.cat];
  if (!fields) { console.error(`невідома категорія ${o.cat}`); process.exit(1); }
  if (!fields.length) { console.error(`для ${o.cat} нема чого шукати`); process.exit(0); }
  if (!hasKey()) {
    console.error(`${ENV_KEY} не встановлено. Створіть ключ на https://console.perplexity.ai\n`
      + `і експортуйте його у своєму терміналі:  $env:${ENV_KEY} = '...'`);
    process.exit(2);
  }

  const products = read('products.json').filter(p => p.category === o.cat).slice(0, o.limit);
  if (!products.length) { console.error(`немає товарів у ${o.cat}`); process.exit(1); }
  console.log(`${products.length} товарів, шукаємо: ${fields.map(f => f[0]).join(', ')}\n`);

  const out = [];
  for (const [i, p] of products.entries()) {
    const known = Object.keys(p.specs || {});
    const ask = fields.filter(([k]) => !known.includes(k));
    if (!ask.length) { console.log(`  ${p.series}: усе вже є`); continue; }
    const question =
      `Technical specifications of the ${p.brand} ${p.series} — a ${o.cat.replace(/-/g, ' ')}. `
      + `Find the manufacturer's own specification table for this exact model code and read `
      + `these values from it: ${ask.map(([k, h]) => `${k} (${h})`).join('; ')}. `
      + `Return null for any value you cannot find stated for this exact model code. `
      + `Do not infer, do not average, do not take a value from a similar model.`;
    let r;
    try {
      r = await askWeb(question, {
        preset: o.preset || 'medium',
        domains: DOMAINS,
        schema: schemaFor(ask),
        schemaName: 'specs',
        instructions: 'You are reading a manufacturer specification table. Accuracy matters '
          + 'more than completeness: an invented number is worse than a missing one. Every '
          + 'value you return must appear verbatim on the page you cite.',
      });
    } catch (e) {
      console.log(`  !! ${p.series}: ${e.message}`);
      if (e.code === 'auth') process.exit(1);
      if (e.code === 'rate_limit' && e.retryAfter) {
        await new Promise(s => setTimeout(s, (e.retryAfter + 1) * 1000));
      }
      continue;
    }
    const found = {}, dropped = [], conflicts = [];
    for (const [k] of ask) {
      const v = r.json?.[k];
      if (!v || v.value == null || v.value === '') continue;
      if (!v.source || !/^https?:\/\//.test(v.source)) { dropped.push(`${k} (без джерела)`); continue; }
      if (p.specs?.[k] !== undefined && String(p.specs[k]) !== String(v.value)) {
        conflicts.push(`${k}: у стрічці «${p.specs[k]}», у мережі «${v.value}»`);
        continue;
      }
      found[k] = { value: String(v.value).trim(), source: v.source };
    }
    out.push({ slug: p.slug, name: p.name, asked: ask.map(f => f[0]), found, dropped, conflicts,
      cost: r.usage?.cost?.total_cost ?? null });
    const list = Object.entries(found).map(([k, v]) => `${k}=${v.value}`).join(' ');
    console.log(`  ${String(i + 1).padStart(3)} ${p.series.padEnd(24)} ${list || '—'}`
      + (conflicts.length ? `  ⚠ ${conflicts.length}` : ''));
  }

  const dir = path.join(ROOT, 'scratch');
  fs.mkdirSync(dir, { recursive: true });
  const report = path.join(dir, `enrich-${o.cat}.json`);
  fs.writeFileSync(report, JSON.stringify(out, null, 2), 'utf8');
  const total = out.reduce((s, x) => s + (x.cost || 0), 0);
  const filled = out.reduce((s, x) => s + Object.keys(x.found).length, 0);
  const conf = out.reduce((s, x) => s + x.conflicts.length, 0);
  console.log(`\nзнайдено значень: ${filled}, розбіжностей зі стрічкою: ${conf}`);
  console.log(`звіт: ${path.relative(ROOT, report)}`
    + (total ? `  ($${total.toFixed(3)})` : ''));

  if (!o.apply) { console.log('нічого не записано — перегляньте звіт і запустіть із --apply'); return; }
  const file = path.join(ROOT, 'data', 'products.json');
  const all = JSON.parse(fs.readFileSync(file, 'utf8'));
  let n = 0;
  for (const row of out) {
    const p = all.find(x => x.slug === row.slug);
    if (!p) continue;
    p.specs = p.specs || {};
    for (const [k, v] of Object.entries(row.found)) {
      if (p.specs[k] === undefined) { p.specs[k] = v.value; n++; }
    }
  }
  fs.writeFileSync(file, JSON.stringify(all, null, 2) + '\n', 'utf8');
  console.log(`записано характеристик: ${n}`);
}

main().catch(e => { console.error(`Помилка: ${e.message}`); process.exit(1); });
