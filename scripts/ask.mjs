#!/usr/bin/env node
// Ask the web a question and get an answer with its sources.
//
//   npm run ask -- "скільки коштує монтаж кондиціонера в Сумах"
//   npm run ask -- --preset medium --recency month "ціни на посудомийні машини в Україні"
//   npm run ask -- --domains rozetka.com.ua,comfy.ua "Gunter&Hauer SL 6014 ціна"
//   npm run ask -- --json "..."        machine-readable: {text, sources, usage}
//
// Needs PERPLEXITY_API_KEY in the environment. Nothing is written to the repo
// and nothing here reaches the published site — see scripts/lib/perplexity.mjs.
import process from 'node:process';
import { askWeb, hasKey, ENV_KEY, PRESETS } from './lib/perplexity.mjs';

const USAGE = `
  node scripts/ask.mjs [опції] "питання"

  --preset <${PRESETS.join('|')}>   глибина пошуку (типово low)
  --model <provider/model>          власна модель замість пресету
  --recency <hour|day|week|month|year>
  --domains <a.com,b.com>           шукати лише на цих сайтах
  --lang <uk|ru|en>                 мова відповіді (типово uk)
  --steps <n>                       ліміт кроків пошуку
  --json                            вивести JSON замість тексту
`.trimEnd();

function parseArgs(argv) {
  const o = { lang: 'uk' };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const take = () => {
      const v = argv[++i];
      if (v === undefined) { throw Object.assign(new Error(`${a} без значення`), { code: 'usage' }); }
      return v;
    };
    if (a === '--preset') o.preset = take();
    else if (a === '--model') o.model = take();
    else if (a === '--recency') o.recency = take();
    else if (a === '--domains') o.domains = take().split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--lang') o.lang = take();
    else if (a === '--steps') o.steps = Number(take());
    else if (a === '--json') o.json = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else if (a.startsWith('--')) throw Object.assign(new Error(`невідома опція ${a}`), { code: 'usage' });
    else rest.push(a);
  }
  o.question = rest.join(' ').trim();
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help || !o.question) {
    console.log(USAGE);
    process.exit(o.help ? 0 : 1);
  }
  if (!hasKey()) {
    console.error(
      `${ENV_KEY} не встановлено.\n` +
      'Створіть ключ на https://console.perplexity.ai і експортуйте його у своєму терміналі:\n' +
      `  PowerShell:  $env:${ENV_KEY} = '...'\n` +
      `  bash:        export ${ENV_KEY}=...`);
    process.exit(2);
  }

  const r = await askWeb(o.question, {
    preset: o.preset ?? 'low',
    model: o.model,
    recency: o.recency,
    domains: o.domains,
    maxSteps: o.steps,
    language: o.lang,
    instructions: 'Відповідай стисло і по суті, мовою запиту. Наводь конкретні числа й дати, '
      + 'коли вони є. Якщо джерела суперечать одне одному — скажи про це.',
  });

  if (o.json) {
    console.log(JSON.stringify({ text: r.text, sources: r.sources, usage: r.usage }, null, 2));
    return;
  }

  console.log(`\n${r.text}\n`);
  if (r.sources.length) {
    console.log('Джерела:');
    r.sources.forEach((s, i) => console.log(`  ${i + 1}. ${s.title || s.url}\n     ${s.url}`));
  }
  const cost = r.usage?.cost?.total_cost;
  console.log(`\n[${r.model} · ${r.usage?.total_tokens ?? '?'} токенів`
    + `${cost != null ? ` · $${cost.toFixed(4)}` : ''}]`);
}

main().catch(e => {
  console.error(e.code === 'usage' ? `${e.message}\n${USAGE}` : `Помилка: ${e.message}`);
  process.exit(e.code === 'no_key' ? 2 : 1);
});
