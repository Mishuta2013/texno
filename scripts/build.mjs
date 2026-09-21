// Build: data/*.json + templates → dist/ (static HTML, pre-rendered catalog, 52 product pages, sitemap, robots).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve('.');
const DIST = path.join(ROOT, 'dist');
const DATA = path.join(ROOT, 'data');
const read = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
const products = read('products.json');
const site = read('site.json');
const i18n = read('i18n.json');
const blog = read('blog.json');
const blogUrl = a => `${pfx()}/blog/${a.slug}/`;
const BLOG_LANGS = ['uk', 'ru'];   // languages the articles are actually written in
const INSTALL_LANGS = ['uk', 'ru'];   // the installation page, same two languages
const INSTALL_PATH = '/montazh-kondicionera/';
const bt = a => lf(a, 'title');
const bd = a => lf(a, 'desc');
const bg = a => lf(a, 'tag');
/* An article headline is written to be read, not to fit a SERP: "Як обрати
   пральну машину: 6 критеріїв, які справді важливі" is 58 characters before
   the shop name is even added. The part before the colon is the topic and
   survives on its own; where there is no colon the article carries a
   hand-written seo_title. The full headline stays as the h1 and og:title. */
const btSeo = a => {
  const full = bt(a);
  const room = 65 - TITLE_SUFFIX.length;
  if (full.length <= room) return full;
  const explicit = lf(a, 'seo_title');
  if (explicit) return explicit;
  const topic = full.split(/\s*:\s*/)[0];
  return topic.length <= room ? topic : full;
};
/* Illustrations are written into the article body as plain paths, so they never
   pass through av() the way a template's images do — and /assets/* is served
   with a one-year immutable cache. That combination is exactly what once left a
   replaced photograph stuck in the CDN for a day: same URL, new file, nobody
   asks again. Stamp them here, so a redrawn illustration arrives as a new
   address. */
const stampAssets = html => html.replace(
  /(["\s])(\/assets\/img\/blog\/[A-Za-z0-9@._-]+\.webp)/g, (m, p, u) => p + av(u));
/* subCounts too, so an article can quote {{PRICE}} or {{AC_FROM}} and follow the
   price list instead of going stale with a typed number. */
const bh = a => subCounts(stampAssets(linkProducts((L !== 'uk' && a['html_' + L]) || a.html)));

/* Articles name real models — "Edler ED-120DT", "Beko RCNA406I30XB" — and until
   now they were plain text, so an interested reader had to go hunting in the
   catalogue. Link the first mention of each model to its page.

   The scan walks the html and only touches text nodes that are not already
   inside a link, so existing markup cannot be broken or double-wrapped. */
function linkProducts(html) {
  const targets = products.map(p => {
    const pref = (catOf(p).productPrefix || {}).uk;
    let label = p.name;
    if (pref && label.startsWith(pref)) label = label.slice(pref.length).trim();
    return { label, url: purl(p) };
  }).filter(x => x.label.length >= 8)
    .sort((a, b) => b.label.length - a.label.length);   // longest first, so a model code wins over its prefix
  const used = new Set();
  let out = '', i = 0, depth = 0;
  while (i < html.length) {
    if (html[i] === '<') {
      const end = html.indexOf('>', i);
      const tag = html.slice(i, end + 1);
      if (/^<a[\s>]/i.test(tag)) depth++;
      else if (/^<\/a>/i.test(tag)) depth--;
      out += tag; i = end + 1; continue;
    }
    const next = html.indexOf('<', i);
    let text = html.slice(i, next === -1 ? html.length : next);
    if (depth === 0) {
      for (const t of targets) {
        if (used.has(t.label)) continue;
        const at = text.indexOf(t.label);
        if (at === -1) continue;
        text = text.slice(0, at) + `<a href="${t.url}">${t.label}</a>` + text.slice(at + t.label.length);
        used.add(t.label);
      }
    }
    out += text; i = next === -1 ? html.length : next;
  }
  return out;
}
const CATS = read('categories.json');
const REVIEWS = read('reviews.json');
/* api/reviews.js asks Google for one place and cannot read data/ at run time,
   so it carries the id itself. A shop that moves, or a profile that is
   replaced, must not leave the site showing another place's reviews. */
{
  const api = fs.readFileSync(path.join(ROOT, 'api', 'reviews.js'), 'utf8');
  const m = api.match(/const PLACE_ID = '([^']+)'/);
  if (!m || m[1] !== site.placeId) {
    throw new Error(`api/reviews.js PLACE_ID ${m ? m[1] : '(missing)'} is not data/site.json placeId ${site.placeId}`);
  }
}
const catOf = p => CATS[p.category] || CATS['kondicioneri'];
const catList = Object.entries(CATS).map(([key, c]) => ({ key, ...c })).sort((a, b) => (a.order || 99) - (b.order || 99));
/* A category with nothing in it is worse than no category at all: a nav link to
   an empty page. Everything a visitor can see is built from this list, so a
   category can be defined ahead of its stock and simply stays out of the site
   until the first product lands. */
const catLive = () => catList.filter(c => catProducts(c.key).length);
const catProducts = key => products.filter(p => p.category === key);
/* Thresholds for query pages (see catTags). Up here rather than beside it: the
   catalog panel in the header lists each category's query pages, and the header
   is built long before the page loop gets that far. */
const TAG_MIN = 3, TAG_MAX_SHARE = 0.9;
const SPECV = read('spec-values.json');
const BRANDS = read('brands.json');   // per-brand copy for the brand pages
const LANGS = ['uk', 'ru', 'en'];                 // uk at /, others at /ru/ and /en/
let L = 'uk';                                     // current language of the page being rendered
const pfx = () => (L === 'uk' ? '' : '/' + L);
// per-language field on a data object: name → name_ru / name_en, falling back to uk
const lf = (obj, field) => (L !== 'uk' && obj && obj[field + '_' + L]) || (obj ? obj[field] : undefined);
/* What we promise depends on the category: an air conditioner is installed
   turnkey, a washing machine is hooked up for 500 UAH, a boiler's fitting is
   agreed with the manager, and a fridge or a power station is simply
   delivered. Categories that spell this out carry a `trust` list; the rest
   fall back to the generic pair. Product pages and brand pages must say the
   same thing, so both read it from here. */
const catTrust = cat => lf(cat, 'trust') || (cat.install
  ? [`${t('trust_install')} — ${fmt(site.installPrice)} ${t('u_uah')}`, t('trust_paylater'), t('trust_warranty5')]
  : [t('trust_delivery'), t('trust_payget'), t('trust_warranty')]);
/* Values that are a number and a unit — "550 × 510 мм", "44 л", "58 дБ" — are
   nearly all distinct, one per product, and translating them by dictionary
   would mean a hundred near-identical rows shipped to every page. The unit is
   the only part that changes, so it is translated on its own. Anything with a
   word in it still goes through the dictionary, where a translator can see it. */
const UNIT_TR = {
  ru: [[/ м³\/год$/, ' м³/ч'], [/ год$/, ' ч']],
  en: [[/ мм$/, ' mm'], [/ см$/, ' cm'], [/ л$/, ' l'], [/ дБ$/, ' dB'], [/ Вт·год$/, ' Wh'],
       [/ Вт$/, ' W'], [/ кВт$/, ' kW'], [/ кг$/, ' kg'], [/ м³\/год$/, ' m³/h'], [/ мл$/, ' ml']],
};
const NUMERIC_VAL = /^[\d\s.,×xх*\/+()-]+ ?[^\s]*$/;
const lowerTail = v => { const h = String(v).split(' ')[0];
  return (h.length > 1 && h === h.toUpperCase()) ? v : v.charAt(0).toLowerCase() + v.slice(1); };
const specVal = v => {
  if (L === 'uk' || typeof v !== 'string') return v;
  const e = SPECV[v];
  if (e && e[L]) return e[L];
  for (const [re, to] of (UNIT_TR[L] || [])) {
    const out = v.replace(re, to);
    if (out !== v && NUMERIC_VAL.test(v)) return out;
  }
  return v;
};
const pname = p => {
  if (L !== 'uk' && p['name_' + L]) return p['name_' + L];        // explicit override wins
  const pref = catOf(p).productPrefix;
  if (!pref || L === 'uk' || !pref[L] || !p.name.startsWith(pref.uk)) return p.name;
  return pref[L] + p.name.slice(pref.uk.length);
};
const pdesc = p => p['desc_' + L] || p.desc_uk;
/* One honest superlative per product, worked out from the catalogue itself.
   Only a strict winner is labelled: on a tie nobody gets the badge, because
   "the quietest" stops meaning anything the moment two models share it. The
   result travels on the product, so build.mjs and main.js render the same
   badge from the same number rather than each deciding for itself. */
{
  /* First number in the string, not every digit in it: stripping the
     separators turned "51 / 72 дБ" into 5172 and handed "quietest washing
     machine" to the loudest one in the list. */
  const num = v => {
    const m = String(v ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  };
  const METRICS = [
    ['edge_cheap',    p => p.price,                          'min'],
    /* Air conditioners only. noise_wm is written two ways across the washing
       machines — some list wash/spin, one lists spin alone — so the numbers are
       not comparable and no badge is safer than a wrong one. */
    ['edge_quiet',    p => (p.category === 'kondicioneri' ? num(p.specs?.noise) : null), 'min'],
    ['edge_fast',     p => num(p.specs?.heat_time),          'min'],
    ['edge_roomy',    p => num(p.specs?.volume_l),           'max'],
    ['edge_power',    p => num(p.specs?.output_w ?? p.specs?.capacity_wh), 'max'],
    ['edge_load',     p => num(p.specs?.load_kg),            'max']
  ];
  for (const key of Object.keys(CATS)) {
    const list = products.filter(p => p.category === key);
    if (list.length < 3) continue;             // a superlative needs a field
    for (const [label, get, dir] of METRICS) {
      const vals = list.map(p => [p, get(p)]).filter(([, v]) => v !== null && v > 0);
      if (vals.length < 3) continue;
      const best = dir === 'min' ? Math.min(...vals.map(v => v[1])) : Math.max(...vals.map(v => v[1]));
      const winners = vals.filter(([, v]) => v === best);
      if (winners.length !== 1) continue;      // a tie is not a superlative
      const p = winners[0][0];
      if (!p.edge) p.edge = label;             // first metric in the list wins
    }
  }
}
// live product counts — never hardcode a number in copy, write {{TOTAL}}/{{AC}}/{{WM}}/{{PS}}
/* Each category declares its own short code in categories.json, so the counts,
   the brand lists and the {{XX_…}} tokens all follow from the data. They used to
   be three hand-kept lists here, which is fine at five categories and a bug
   waiting to happen at thirteen. */
const CAT_OF_KEY = Object.fromEntries(catList.filter(c => c.code).map(c => [c.code, c.key]));
const CAT_CODES = Object.keys(CAT_OF_KEY);
const inCat = k => products.filter(p => p.category === CAT_OF_KEY[k]);

const COUNTS = { TOTAL: products.length,
  ...Object.fromEntries(CAT_CODES.map(k => [k, inCat(k).length])) };

/* Brand lists and capacity ranges used to be typed into categories.json by hand,
   and they went stale the moment stock moved: the fridge line still read "9
   models from LG, Samsung, Beko, Grunhelm and Edler" after the range had grown
   to 39 and gained Whirlpool, and the washing machines never mentioned Bosch.
   Derive both from the catalogue so a search result cannot drift from reality
   again. */

/* Ordered by the dearest model each brand has, not by how many we stock. By
   count the washing machines would open "Edler, Grifon, Beko" — true, and no
   reason to click. By flagship price they open "Bosch, Haier, LG", which is the
   same shelf described from the end a buyer recognises. */
function brandList(k, max = 6) {
  const top = new Map();
  for (const p of inCat(k)) top.set(p.brand, Math.max(top.get(p.brand) || 0, p.price));
  const names = [...top].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(x => x[0]);
  const head = names.slice(0, max);
  if (head.length < 2) return head.join('');
  const tail = names.length > max ? '' : ` ${t('u_and')} `;
  return names.length > max
    ? head.join(', ')
    : head.slice(0, -1).join(', ') + tail + head[head.length - 1];
}

const numOf = v => { const m = /[\d.]+/.exec(String(v ?? '')); return m ? +m[0] : null; };
function specRange(k, key, unitKey) {
  const v = inCat(k).map(p => numOf((p.specs || {})[key])).filter(x => x != null);
  if (!v.length) return '';
  const lo = Math.min(...v), hi = Math.max(...v);
  return `${lo}–${hi} ${t(unitKey)}`;
}
const btuRange = () => {
  const v = inCat('AC').map(p => p.btu).filter(Boolean);
  return v.length ? `${Math.min(...v) / 1000}–${Math.max(...v) / 1000}k BTU` : '';
};
const RANGES = {
  AC: btuRange,
  WM: () => specRange('WM', 'load_kg', 'u_kg'),
  PS: () => specRange('PS', 'capacity_wh', 'u_wh'),
  FR: () => specRange('FR', 'volume_l', 'u_l'),
  BL: () => specRange('BL', 'volume_l', 'u_l'),
};
const NOFROST = () => products.filter(p => p.category === 'holodylnyky' && p.nofrost).length;
/* Cheapest model in a category, for the "від X грн" that now leads the category
   titles. Read from the data, so it follows the price list without an edit. */
const FROM = k => {
  const prices = inCat(k).map(p => p.price).filter(Number.isFinite);
  return prices.length ? fmt(Math.min(...prices)) : '';
};
// Slavic plurals: 1 товар / 2-4 товари / 5+ товарів — needed wherever a count
// is followed by a noun, otherwise the copy reads broken at most numbers.
const PLURALS = {
  uk: ['товар', 'товари', 'товарів'],
  ru: ['товар', 'товара', 'товаров'],
  en: ['product', 'products', 'products']
};
/* "52 моделей" is wrong — Ukrainian wants "52 моделі". The category lines quote
   a live count, so the noun has to agree with whatever the count happens to be. */
const MODELS = {
  uk: ['модель', 'моделі', 'моделей'],
  ru: ['модель', 'модели', 'моделей'],
  en: ['model', 'models', 'models']
};
function plural(n, forms) {
  if (L === 'en') return n === 1 ? forms[0] : forms[1];
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return forms[1];
  return forms[2];
}
const subCounts = s => String(s)
  .replace(/\{\{ITEMS\}\}/g, () => `${COUNTS.TOTAL} ${plural(COUNTS.TOTAL, PLURALS[L] || PLURALS.uk)}`)
  .replace(new RegExp(`\{\{(TOTAL|${CAT_CODES.join('|')})_MODELS\}\}`, 'g'),
    (m, k) => `${COUNTS[k]} ${plural(COUNTS[k], MODELS[L] || MODELS.uk)}`)
  .replace(new RegExp(`\{\{(${CAT_CODES.join('|')})_BRANDS\}\}`, 'g'), (m, k) => brandList(k))
  .replace(new RegExp(`\{\{(${CAT_CODES.join('|')})_RANGE\}\}`, 'g'), (m, k) => (RANGES[k] ? RANGES[k]() : ''))
  .replace(/\{\{PRICE\}\}/g, () => fmt(site.installPrice))
  .replace(new RegExp(`\{\{(${CAT_CODES.join('|')})_FROM\}\}`, 'g'), (m, k) => FROM(k))
  .replace(/\{\{FR_NOFROST\}\}/g, () => NOFROST())
  /* The shop's real Google rating, for the one place in a search result we
     actually control — the description text. The star annotation itself is a
     Merchant Center store rating and cannot be produced by markup; Google
     rules out reviews an entity publishes about itself ("ineligible for star
     review feature"). Saying the number in words is honest and allowed.
     Templated rather than typed into the translation, so it cannot drift from
     data/reviews.json, which is the figure read off the Google profile. */
  /* toFixed(1) because JSON's 5.0 stringifies to "5", and "5 ★" reads as a
     count of stars rather than a score out of five. */
  .replace(/\{\{RATING\}\}/g, () => REVIEWS.rating == null ? ''
    : Number(REVIEWS.rating).toFixed(1).replace('.', L === 'en' ? '.' : ','))
  .replace(/\{\{REVIEWS\}\}/g, () => String(REVIEWS.count ?? ''))
  .replace(new RegExp(`\{\{(TOTAL|${CAT_CODES.join('|')})\}\}`, 'g'), (m, k) => COUNTS[k]);
const t = (k) => subCounts((i18n[L] && i18n[L][k]) ?? (i18n.uk && i18n.uk[k]) ?? k);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* site.openHours is indexed by Date.getDay(), Sunday first, so the browser can
   read today's row without a lookup table; schema.org wants day names. Days
   that share an interval are merged, because one entry per day is legal but
   reads as seven near-identical blocks in Google's testing tool. */
const LD_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function openingHoursLd() {
  const rows = [];
  (site.openHours || []).forEach((h, d) => {
    if (!h) return;                                   // null = closed that day
    const last = rows[rows.length - 1];
    if (last && last.opens === h[0] && last.closes === h[1]) last.dayOfWeek.push(LD_DAYS[d]);
    else rows.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: [LD_DAYS[d]], opens: h[0], closes: h[1] });
  });
  return rows;
}
const fmt = n => Number(n).toLocaleString('uk-UA').replace(/ /g, ' ').replace(/,/g, ' ');
const BASE = site.baseUrl.replace(/\/$/, '');
/* Assets are cache-busted by content hash via av(), not by build time: /assets/*
   is served immutable, so a timestamp would re-download the CSS and JS on every
   deploy even when neither file changed. */
const purl = p => `${pfx()}${catOf(p).urlPrefix}/${p.slug}/`;
const curl = c => `${pfx()}${c.urlPrefix}/`;
const ukPath = u => u.replace(/^\/(ru|en)(?=\/|$)/, '') || '/';   // strip the language prefix
const brandSlug = b => b.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---- category-driven spec formatting (works for AC, power stations, future categories) ----
function fmtVal(p, f) {
  const s = p.specs || {};
  if (f.value !== undefined) return f.value;
  const raw = f.key ? (s[f.key] ?? p[f.key]) : undefined;
  switch (f.fmt) {
    case 'kbtu': return p.btu ? (p.btu / 1000).toFixed(0) + 'k BTU' : null;
    case 'kbtu_power': return p.btu ? (p.btu / 1000).toFixed(0) + 'k BTU' + (s.power_w ? ` · ${s.power_w} ${t('u_w')}` : '') : null;
    case 'area': return p.area ? `${t('u_upto')} ${p.area} ${t('u_m2')}` : (f.dash ? '—' : null);
    case 'comp': return p.inverter ? t('u_inverter') : t('u_onoff');
    case 'noise': return s.noise ? `${t('u_from')} ${s.noise} ${t('u_db')}` : null;
    case 'cool_range': return (s.cool_min !== undefined) ? `${s.cool_min}°C … +${s.cool_max}°C` : null;
    case 'celsius': return (raw !== undefined && raw !== null) ? `${raw}°C` : null;
    case 'wifi_yesopt': return p.wifi ? t('u_yes') : t('u_option');
    case 'heat_yesno': return p.heatpump ? t('u_yes') : t('u_no');
    case 'wh': return raw ? `${raw} ${t('u_wh')}` : null;
    case 'watt': return raw ? `${raw} ${t('u_w')}` : null;
    case 'sockets': return raw ? `${raw} ${t('u_sockets')}` : null;
    /* The UPS chip used to be a flag with "UPS 10 мс" written into it, so two
       stations that switch in 15 ms advertised 10, and five that only claim
       "yes" advertised a figure nobody had measured. Read the spec: print the
       time when there is one, and a plain badge when there is not. */
    case 'ups': return p.ups ? (/\d/.test(String(raw ?? '')) ? `UPS ${specVal(raw)}` : 'UPS') : null;
    case 'first': return raw ? String(raw).split(' ')[0] : null;
    case 'litres': return raw ? `${raw} ${t('u_l')}` : null;
    /* heat-up time is stored in minutes so it can be compared and sorted;
       "109" means nothing to a reader, "1 год 49 хв" does. */
    case 'mins': { const n = Number(raw); if (!n) return null;
      const h = Math.floor(n / 60), m = n % 60;
      return h ? (m ? `${h} ${t('rt_hr')} ${m} ${t('rt_min')}` : `${h} ${t('rt_hr')}`)
               : `${m} ${t('rt_min')}`; }
    case 'kg': return raw ? `${raw} ${t('u_kg')}` : null;
    case 'rpm': return raw ? `${raw} ${t('u_rpm')}` : null;
    case 'cm': return raw ? `${raw} ${t('u_cm')}` : null;
    /* A bare number under an icon says nothing: "🚰 1" could be one bowl, one
       tap or one of anything. The field names the noun, and the noun agrees
       with the number — one чаша, two чаші, five чаш. */
    case 'plural': return raw ? `${raw} ${plural(Number(raw), t(f.word).split('|'))}` : null;
    case 'mm': return raw ? `${raw} ${t('u_mm')}` : null;
    case 'lmin': return raw ? `${raw} ${t('u_lmin')}` : null;
    case 'kwh': return raw ? `${raw} ${t('u_kwh')}` : null;
    case 'ml': return raw ? `${raw} ${t('u_ml')}` : null;
    case 'db': return raw ? `${raw} ${t('u_db')}` : null;
    case 'm3h': return raw ? `${raw} ${t('u_m3h')}` : null;
    /* Features are a list, not a value. Joined with a comma they read as a
       sentence, so only the first keeps its capital — "Сифон, Прихований
       перелив" reads as three sentences crammed into one row. An acronym
       keeps its own capitals. */
    default: return Array.isArray(raw)
      ? (raw.length ? raw.map(specVal).map((x, i) => i ? lowerTail(x) : x).join(', ') : null)
      : specVal((raw !== undefined && raw !== null && raw !== '') ? raw : null);
  }
}
function catChips(p) {
  return (catOf(p).chips || []).map(c => {
    if (c.flag) return p[c.flag] ? `<span class="stag">${c.icon} ${esc(lf(c,'label'))}</span>` : '';
    const v = fmtVal(p, c);
    return v ? `<span class="stag">${c.icon} ${esc(v)}</span>` : '';
  }).join('');
}
function ppChips(p) {
  return (catOf(p).ppChips || catOf(p).chips || []).map(c => {
    if (c.flag) return p[c.flag] ? `<span class="pp-chip">${esc(lf(c,'label'))}</span>` : '';
    const v = fmtVal(p, c);
    return v ? `<span class="pp-chip">${c.icon ? c.icon + ' ' : ''}${esc(v)}</span>` : '';
  }).join('');
}
/* How many cards a grid is worth rendering into the HTML.

   The home page shipped all 270 and the browser threw 246 of them away before
   anyone saw a thing: renderCatalog() runs on load, empties the grid and draws
   one page. Measured — 270 cards in the response, 24 in the DOM a moment
   later, ~350KB downloaded to be discarded, on the site's most visited page,
   on phones that are 80% of its traffic.

   Read out of main.js rather than typed here. Two copies of a number that must
   agree is exactly how tagMatch and tagMatchJS drifted apart and left a
   landing page promising sixteen models above an empty grid. */
const PAGE_SIZE = (() => {
  const src = fs.readFileSync(path.join(ROOT, 'assets/js/main.js'), 'utf8');
  const n = Number(/\bconst PAGE_SIZE\s*=\s*(\d+)/.exec(src)?.[1]);
  if (!Number.isInteger(n) || n < 1) throw new Error('cannot read PAGE_SIZE from assets/js/main.js');
  return n;
})();
/* Everything past the first page is left to the sentinel that was already
   there. Category pages keep their whole list: the largest is 52 cards, the
   saving is small, and their raw HTML is where a crawler that does not run
   scripts finds every product. */
const firstPage = list => list.slice(0, PAGE_SIZE);

/* The Google Customer Reviews badge. Google's own snippet reaches the script
   through the bare global its id creates; this asks the DOM for it, which is
   the same thing said out loud.

   mobileBottomMargin, because on a phone the badge centres itself along the
   bottom edge — exactly where .mcta already sits with the call and WhatsApp
   buttons. 86px clears that bar; the default 46 would bury it.

   Before roughly a hundred reviews Google shows the badge with "rating not
   available" rather than a score, which is the honest state of things and not
   a fault to fix. */
const GCR_BADGE = (!site.gcrBadge || !site.gcrMerchantId) ? '' : `
<script id="merchantWidgetScript" src="https://www.gstatic.com/shopping/merchant/merchantwidget.js" defer></script>
<script>document.getElementById('merchantWidgetScript').addEventListener('load',function(){
merchantwidget.start({merchant_id:${Number(site.gcrMerchantId)},position:'RIGHT_BOTTOM',region:'${site.gcrCountry || 'UA'}',mobileBottomMargin:86});});</script>`;

/* Nine page builders wrote their own file. Anything belonging at the foot of
   every page — the badge today, whatever comes next — went into nine templates
   that could drift apart. One door now, and it refuses a page with no </body>
   rather than dropping the tail in silence, the same way fill() refuses a
   template with no marker. */
/* Cloudflare's Email Address Obfuscation rewrites every mailto link into
   /cdn-cgi/l/email-protection#…, and that address answers 404 to anything
   that is not a browser running its decoder. The footer carries the address,
   so Ahrefs reported 1,122 of 1,157 pages as linking to a broken page. The
   email_off comments are Cloudflare's own opt-out; a gmail address gains
   nothing from the obfuscation that its spam filter does not already give. */
const emailOff = html => html.replace(/<a\b[^>]*href="mailto:[^"]*"[^>]*>[\s\S]*?<\/a>/g, m => `<!--email_off-->${m}<!--/email_off-->`);
function writePage(dir, html) {
  const at = html.lastIndexOf('</body>');
  if (at < 0) throw new Error('page has no </body>: ' + dir);
  fs.writeFileSync(path.join(dir, 'index.html'), emailOff(html.slice(0, at) + GCR_BADGE + html.slice(at)), 'utf8');
}

/* Assets are served with a one-year immutable cache, so a file whose contents
   change but whose name stays the same would keep serving the old version from
   every browser and the CDN. Stamp each asset URL with a hash of its bytes:
   unchanged files keep their URL (and their cache), changed ones get a new one. */
const hashed = new Map();
/* Where the hash goes matters. A query string is only a cache key, and a CDN
   entry can be poisoned: a request that arrives mid-deploy gets the new HTML
   and the old bytes, and stores them under the new ?h= URL — then serves that
   for the whole immutable year. It happened here, to one category cover, and
   the owner stared at the old picture for a day while every other copy of the
   site was current. For the files this project regenerates — the stylesheet,
   the script, the covers, the site imagery — the hash goes in the file name
   instead, so new content is a genuinely different path that no stale entry can
   shadow. Product photos and share cards are written once per product and keep
   the query form; hashing 43MB of them into duplicate files is not worth it. */
const HASH_IN_NAME = /^\/assets\/(css|js|img\/covers|img\/site|img\/blog)\//;
const hashedCopies = new Map();   // source path -> hashed path, emitted after the asset copy
function av(u) {
  if (!u || !u.startsWith('/assets/')) return u;
  if (hashed.has(u)) return hashed.get(u);
  let out = u;
  try {
    const bytes = fs.readFileSync(path.join(ROOT, u.replace(/^\//, '')));
    const h = crypto.createHash('md5').update(bytes).digest('hex').slice(0, 8);
    if (HASH_IN_NAME.test(u)) {
      out = u.replace(/(\.[a-z0-9]+)$/i, `.${h}$1`);
      hashedCopies.set(u, out);
    } else {
      out = `${u}?h=${h}`;
    }
  } catch { /* missing file — leave the plain path so the audit can flag it */ }
  hashed.set(u, out);
  return out;
}
const abs = u => BASE + u.split('?')[0];   // canonical/schema URLs stay clean
/* Pictures are the exception. vercel.json serves /assets/* as immutable for a
   year, so redrawing a card that keeps its path leaves Google, Telegram and
   the CDN edge showing the old one indefinitely. Content-hash the URL instead,
   the way the page's own assets are handled. */
const absImg = u => BASE + av(u);
/* An air-conditioner indoor unit with airflow lines — the shop's original mark,
   brought back at the owner's request after a spell as a "T" monogram. The
   catalogue has grown well past air conditioners, so the icon now stands for the
   shop rather than describing the shelves; that is the owner's call to make.
   Same drawing the PWA icons use — see icon() in gen_images.py. */
const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%230B1A33'/%3E%3Cpath d='M22 40h56a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6H22a6 6 0 0 1-6-6v-6a6 6 0 0 1 6-6z' fill='none' stroke='%232E8BFF' stroke-width='5'/%3E%3Cpath d='M30 64v6M50 64v8M70 64v6' stroke='%237CC4FF' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E";
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" media="print" onload="this.media='all'" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap"><noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap"></noscript>`;

/* One container, GTM-KBTGSLKD, supplied by the shop's SEO specialist. GA4
   (G-HJC1PWRVE9) and Google Ads (AW-765371108) used to load here through their
   own gtag snippet as well; they were removed on the owner's instruction so
   everything is configured inside the container instead. Adding them back here
   while the container also fires them would double-count every visit.

   Only on the real domain: the local test server and Vercel preview builds
   loaded the container too, so every test page view landed in the shop's
   Analytics as a visitor from localhost:8099. */
const GTM = `<!-- Google Tag Manager -->
<script>if(location.hostname==='texnoplaza.sumy.ua')(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-KBTGSLKD');</script>
<!-- End Google Tag Manager -->`;
const GTM_NS = `<!-- Google Tag Manager (noscript) --><noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-KBTGSLKD" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`;

/* The words a buyer typed come first, the shop's name last: "Купити
   холодильник у Сумах — від 4 899 грн | TexnoPlaza". Google prints the site
   name above every result on its own, so a title that opened with it spent 13
   of the ~60 visible characters saying twice who the seller is, and pushed the
   product and the price — what earns the click — towards the cut. The home
   page is the one exception: people who type "техноплаза" are looking for the
   shop itself, so there the name stays in front. Applied here rather than at
   the call sites, so a new kind of page cannot be added without it; a
   "| TexnoPlaza" already on the end is not printed twice. */
/* What Google needs to show "Безкоштовне повернення · 14 днів" and a delivery
   price beside a product: the same terms the returns page states and the
   Merchant Center feed declares, written once so the three cannot disagree.
   Returns are free, any product, within 14 days of receipt, brought back to the
   shop; delivery across Sumy is 400 UAH, the same day or the next. */
const RETURN_POLICY = () => ({
  '@type': 'MerchantReturnPolicy',
  applicableCountry: 'UA',
  returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
  merchantReturnDays: 14,
  returnMethod: 'https://schema.org/ReturnInStore',
  returnFees: 'https://schema.org/FreeReturn',
  refundType: 'https://schema.org/FullRefund',
  merchantReturnLink: abs('/povernennya-tovaru/')            // the returns page is Ukrainian only
});
const SHIPPING = () => ({
  '@type': 'OfferShippingDetails',
  shippingRate: { '@type': 'MonetaryAmount', value: 400, currency: 'UAH' },
  /* 400 UAH is the shop's own van around Sumy. Everywhere else goes by Nova
     Poshta at the carrier's rate, which depends on the parcel — so it is not
     declared here rather than declared wrong. */
  shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'UA', addressRegion: 'UA-59' },
  deliveryTime: {
    '@type': 'ShippingDeliveryTime',
    handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 1, unitCode: 'DAY' },
    transitTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 1, unitCode: 'DAY' }
  }
});
const TITLE_SUFFIX = ` | ${site.name}`;          // length budget: the suffix costs what the prefix did
const pageTitle = s => {
  const clean = String(s ?? '').replace(/\s*[|·—–-]\s*TexnoPlaza\s*$/i, '').trim();
  return clean.startsWith(site.name)
    ? `${site.name} — ` + clean.slice(site.name.length).replace(/^\s*[|·—–-]?\s*/, '')
    : clean + TITLE_SUFFIX;
};

function head({ title, desc, canonical, ogTitle, ogDesc, ogImage, jsonld, altPath, altLangs }) {
  const og = ogImage || absImg(`/assets/og/default${L === 'uk' ? '' : '-' + L}.jpg`);
  // hreflang: altPath is the uk-form path; each language lives under its own prefix
  // altLangs narrows the set for pages that do not exist in every language —
  // the blog is written in Ukrainian and Russian only
  const alts = altPath ? (altLangs || LANGS).map(l => {
    const u = abs((l === 'uk' ? '' : '/' + l) + (altPath === '/' ? '/' : altPath));
    return `<link rel="alternate" hreflang="${l === 'uk' ? 'uk' : l}" href="${esc(u)}">`;
  }).join('\n') + `\n<link rel="alternate" hreflang="x-default" href="${esc(abs(altPath))}">` : '';
  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#0B1A33">
<meta name="robots" content="max-image-preview:large">
${GTM}
<title>${esc(pageTitle(title))}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
${alts}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(ogTitle || pageTitle(title))}">
<meta property="og:description" content="${esc(ogDesc || desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(og)}">
<!-- Every card in assets/og is 1200x630. Stating it saves the crawler a
     second fetch just to measure the file, which is what makes a freshly
     shared link sometimes preview with no picture at all. -->
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(ogTitle || pageTitle(title))}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${FAVICON}">
<link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
${FONTS}
<link rel="stylesheet" href="${av('/assets/css/main.css')}">
<script>document.documentElement.className+=' js';(function(){var t=null;try{t=localStorage.getItem('tp_theme')}catch(e){}document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light')})();if('serviceWorker'in navigator){addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}</script>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}`;
}

// ---- card (mirrors assets/js/main.js cardHTML, uk static) ----
function card(p) {
  const url = purl(p);
  const badge = p.heatpump ? `<span class="cbadge heat">${esc(t('sp_hp'))}</span>`
    : p.inverter ? `<span class="cbadge inv">${esc(t("c_inverter"))}</span>` : '';
  const edge = p.edge ? `<span class="cedge">${esc(t(p.edge))}</span>` : '';
  return `<div class="card">
    <a class="card-img" href="${url}">${badge}<span class="cstock"><i></i>${esc(t('c_instock'))}</span>
      <img src="${esc(av(p.thumb || p.photos[0]))}" alt="${esc(pname(p))}" loading="lazy" width="400" height="300"></a>
    <div class="card-body"><a class="card-brand" href="${pfx()}${catOf(p).urlPrefix}/${brandSlug(p.brand)}/">${esc(p.brand)}</a>
      <a class="card-name" href="${url}">${esc(pname(p))}</a>
      <div class="card-specs">${catChips(p)}</div>${edge}
      <div class="card-foot"><div class="card-price">${fmt(p.price)} <small>${esc(t("u_uah"))}</small></div>
        <div class="card-act"><div class="row2">
          <a class="btn-order" href="${url}">${esc(t('c_order'))}</a>
          <a class="btn-det" href="${url}">${esc(t('c_det'))}</a>
        </div></div>
      </div></div></div>`;
}

/* The five «Хіт продажів» cards carried a photo, a name and three specs — and
   no price, which is the one number a visitor is actually deciding on. It sat
   four screens down in the catalogue. Same markup as .card-price, so the two
   read as the same thing in two places. */
const gcPrice = p => `<div class="gc-price">${fmt(p.price)} <small>${esc(t('u_uah'))}</small></div>`;

function heroCard(p) {
  const s = p.specs || {};
  return `<a class="gauge-card" href="${purl(p)}">
    <div class="gc-tag">${esc(t('gc_stock'))}</div>
    <div class="gc-head"><div class="gc-title">${esc(t('gc_hit'))}</div><div class="gc-live"><i></i> ONLINE</div></div>
    <div class="gc-img"><img src="${esc(av(p.photos[0]))}" alt="${esc(pname(p))}" width="680" height="510" loading="lazy"><div class="gc-airflow" id="airflow"></div></div>
    <div class="gc-name">${esc(pname(p))}</div>
    ${gcPrice(p)}
    <div class="gc-readout">
      <div class="gc-r"><div class="v">${fmt(p.btu)}<small> BTU</small></div><div class="k">${esc(t('gc_power'))}</div></div>
      <div class="gc-r"><div class="v">${esc(s.eclass || 'A++')}</div><div class="k">${esc(t('gc_class'))}</div></div>
      <div class="gc-r"><div class="v">${esc(s.noise || 22)}<small> ${esc(t("u_db"))}</small></div><div class="k">${esc(t('gc_noise'))}</div></div>
    </div></a>`;
}

function heroStationCard(p) {
  const s = p.specs || {};
  return `<a class="gauge-card gc-station" href="${purl(p)}">
    <div class="gc-tag gc-tag-new">${esc(t("badge_new"))}</div>
    <div class="gc-head"><div class="gc-title">${esc(t('gc_hit'))}</div><div class="gc-live"><i></i> ONLINE</div></div>
    <div class="gc-img"><img src="${esc(av(p.photos[0]))}" alt="${esc(pname(p))}" width="680" height="510" fetchpriority="high"><div class="gc-charge" id="charge"></div></div>
    <div class="gc-name">${esc(pname(p))}</div>
    ${gcPrice(p)}
    <div class="gc-readout">
      <div class="gc-r"><div class="v">${fmt(s.capacity_wh)}<small> ${esc(t("u_wh"))}</small></div><div class="k">${esc(t("hc_capacity"))}</div></div>
      <div class="gc-r"><div class="v">${fmt(s.output_w)}<small> ${esc(t("u_w"))}</small></div><div class="k">${esc(t("hc_power"))}</div></div>
      <div class="gc-r"><div class="v">10<small> ${esc(t("u_ms"))}</small></div><div class="k">UPS</div></div>
    </div></a>`;
}

function heroBoilerCard(p) {
  const s = p.specs || {};
  return `<a class="gauge-card gc-station" href="${purl(p)}">
    <div class="gc-tag">${esc(t('gc_stock'))}</div>
    <div class="gc-head"><div class="gc-title">${esc(t('gc_hit'))}</div><div class="gc-live"><i></i> ONLINE</div></div>
    <div class="gc-img"><img src="${esc(av(p.photos[0]))}" alt="${esc(pname(p))}" width="680" height="510" loading="lazy"><div class="gc-warm"></div></div>
    <div class="gc-name">${esc(pname(p))}</div>
    ${gcPrice(p)}
    <div class="gc-readout">
      <div class="gc-r"><div class="v">${esc(s.volume_l)}<small> ${esc(t("u_l"))}</small></div><div class="k">${esc(t("hc_volume"))}</div></div>
      <div class="gc-r"><div class="v">${esc(s.power_w)}<small> ${esc(t("u_w"))}</small></div><div class="k">${esc(t("hc_power"))}</div></div>
      <div class="gc-r"><div class="v">${esc(String(s.warranty_tank || '').split(' ')[0] || '—')}<small> ${esc(t('hc_yr'))}</small></div><div class="k">${esc(t("hc_tank"))}</div></div>
    </div></a>`;
}
function heroWasherCard(p) {
  const s = p.specs || {};
  return `<a class="gauge-card gc-station" href="${purl(p)}">
    <div class="gc-tag">${esc(t('gc_stock'))}</div>
    <div class="gc-head"><div class="gc-title">${esc(t('gc_hit'))}</div><div class="gc-live"><i></i> ONLINE</div></div>
    <div class="gc-img"><img src="${esc(av(p.photos[0]))}" alt="${esc(pname(p))}" width="680" height="510" loading="lazy"><div class="gc-drum"></div></div>
    <div class="gc-name">${esc(pname(p))}</div>
    ${gcPrice(p)}
    <div class="gc-readout">
      <div class="gc-r"><div class="v">${esc(s.load_kg)}<small> ${esc(t("u_kg"))}</small></div><div class="k">${esc(t("hc_load"))}</div></div>
      <div class="gc-r"><div class="v">${fmt(s.rpm)}<small> ${esc(t("u_rpm"))}</small></div><div class="k">${esc(t("hc_spin"))}</div></div>
      <div class="gc-r"><div class="v">${esc(String(s.eclass || '').split(' ')[0])}</div><div class="k">${esc(t("hc_class"))}</div></div>
    </div></a>`;
}

function heroFridgeCard(p) {
  const s = p.specs || {};
  return `<a class="gauge-card gc-station" href="${purl(p)}">
    <div class="gc-tag">${esc(t('gc_stock'))}</div>
    <div class="gc-head"><div class="gc-title">${esc(t('gc_hit'))}</div><div class="gc-live"><i></i> ONLINE</div></div>
    <div class="gc-img"><img src="${esc(av(p.photos[0]))}" alt="${esc(pname(p))}" width="680" height="510" loading="lazy"><div class="gc-chill" id="chill"></div></div>
    <div class="gc-name">${esc(pname(p))}</div>
    ${gcPrice(p)}
    <div class="gc-readout">
      <div class="gc-r"><div class="v">${esc(s.volume_l)}<small> ${esc(t("u_l"))}</small></div><div class="k">${esc(t("hc_volume"))}</div></div>
      <div class="gc-r"><div class="v">${esc(s.height_cm)}<small> ${esc(t("u_cm"))}</small></div><div class="k">${esc(t("hc_height"))}</div></div>
      <div class="gc-r"><div class="v">${esc(String(s.eclass || '').split(' ')[0] || '—')}</div><div class="k">${esc(t("hc_class"))}</div></div>
    </div></a>`;
}

// render current uk i18n text into static HTML (matches runtime applyI18n → correct for SEO/no-JS)
function applyI18nStatic(html) {
  /* An <img> has no closing tag, so the element rule below cannot reach it and
     the hero's alt stayed Ukrainian on the Russian and English pages. This
     rewrites the alt in place for anything carrying data-i18n-alt. */
  html = html.replace(/<[a-zA-Z0-9]+[^>]*\sdata-i18n-alt="([^"]+)"[^>]*>/g, (tag, key) => {
    const v = i18n[L] && i18n[L][key] !== undefined ? i18n[L][key] : i18n.uk[key];
    return v === undefined ? tag : tag.replace(/\salt="[^"]*"/, ` alt="${esc(subCounts(v))}"`);
  });
  /* Attributes nobody sees but a screen reader and a search engine read first.
     aria-label, placeholder and title stayed Ukrainian on every Russian and
     English page — "Обране", "Швидкі дії", "Пошук моделі…" — because only the
     text inside an element was baked in here, and main.js put the rest right
     later, if it ran. A function replacement, so a "$" in a translation is not
     read as a pattern. */
  for (const [marker, attr] of [['data-i18n-aria', 'aria-label'], ['data-i18n-ph', 'placeholder'], ['data-i18n-title', 'title']]) {
    html = html.replace(new RegExp(`<[a-zA-Z0-9]+[^>]*\\s${marker}="([^"]+)"[^>]*>`, 'g'), (tag, key) => {
      const v = i18n[L] && i18n[L][key] !== undefined ? i18n[L][key] : i18n.uk[key];
      const re = new RegExp(`\\s${attr}="[^"]*"`);
      return v === undefined || !re.test(tag) ? tag : tag.replace(re, () => ` ${attr}="${esc(subCounts(v))}"`);
    });
  }
  return html.replace(/(<([a-zA-Z0-9]+)((?:[^>]*?)\sdata-i18n="([^"]+)"(?:[^>]*?))>)([\s\S]*?)(<\/\2>)/g,
    (m, open, tag, attrs, key, inner, close) => {
      const v = i18n[L] && i18n[L][key] !== undefined ? i18n[L][key] : i18n.uk[key];
      return v === undefined ? m : open + esc(subCounts(v)) + close;
    });
}
// full-size quiz embedded in the page (category pages + the homepage category tabs)
/* `cat` is optional because the home page renders the picker hidden, with no
   category chosen yet. Where there is one, its own heading goes in: the static
   markup used to read "Підберемо ідеальний кондиціонер" on the washing
   machine, fridge, boiler and power-station pages, and only JS put that right
   — after the visitor pressed a button they had every reason not to press.
   main.js keeps its own table of these keys for the running quiz; this is the
   one that has to be true before anybody clicks. */
function quizInline(hidden, cat) {
  const eyeKey = (cat && cat.quizEyeKey) || 'quiz_eye';
  const titleKey = (cat && cat.quizTitleKey) || 'quiz_h';
  return `<section class="quiz-inline"${hidden ? ' id="quiz-inline" style="display:none"' : ' id="quiz-inline"'}>
    <div class="qi-head">
      <div class="quiz-eyebrow" id="qi-eyebrow">${esc(t(eyeKey))}</div>
      <h2 class="qi-title" id="qi-title">${esc(t(titleKey))}</h2>
      <div class="quiz-prog"><div class="quiz-prog-bar" id="qi-prog"></div></div>
    </div>
    <div class="quiz-body" id="qi-body"></div>
    <div class="quiz-foot">
      <button class="quiz-back" id="qi-back" type="button" onclick="quizBack()">${esc(t('quiz_back'))}</button>
      <button class="quiz-next btn-primary" id="qi-next" type="button" onclick="quizNext()">${esc(t('quiz_next'))}</button>
    </div>
  </section>`;
}
// tells Google the shop's sections, which is what it uses for the links under a result
function navLd() {
  return catList.filter(c => catProducts(c.key).length).map(c => ({
    '@context': 'https://schema.org', '@type': 'SiteNavigationElement',
    name: lf(c, 'name'), url: abs(curl(c))
  }));
}
// lets Google offer a search box for the site
/* Every way a customer might type the shop's name — Latin or Cyrillic, one word
   or two. Search engines match a query against these, so a person googling
   "техноплаза суми" or "texno plaza" lands on us and not on a namesake. */
const BRAND_ALIASES = [
  'TexnoPlaza', 'Texno Plaza', 'TEXNOPLAZA', 'Texnoplaza', 'TechnoPlaza', 'Techno Plaza',
  'ТехноПлаза', 'Техно Плаза', 'Техноплаза', 'ТЕХНОПЛАЗА',
  'ТехноПлаза Суми', 'ТехноПлаза Сумы', 'TexnoPlaza Sumy',
  'texnoplaza.sumy.ua'
];
function searchLd() {
  return {
    '@context': 'https://schema.org', '@type': 'WebSite',
    name: site.name, alternateName: BRAND_ALIASES, url: abs(pfx() + '/'),
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: abs(pfx() + '/?q={search_term_string}#catalog') },
      'query-input': 'required name=search_term_string'
    }
  };
}
// FAQ list + FAQPage schema, both from the current language
/* Staggered on reveal, but the delay is capped: across 16 questions an
   uncapped ramp would leave the last row arriving half a second late. */
/* "модель / моделі / моделей" — the brand page and the category page each
   worked this out inline, and the picker needs the same answer, so it lives in
   one place now. */
/* "54 відгуків" was wrong Ukrainian: 54 takes відгуки. rev_on_google holds the
   three forms, one|few|many, the same as u_digits. */
function reviewsWord(n) {
  const [one, few, many] = t('rev_on_google').split('|');
  if (L === 'en') return n === 1 ? one : few;
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
function modelsWord(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return t('cat_models1');
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return t('cat_models2');
  return t('cat_models5');
}

/* "Підбір за 30 секунд": one door per category that ships a picker, built from
   the data — a new category shows up here the day it is added, which is what
   the hardcoded tab strip failed to do when water heaters arrived. */
function pickerSection() {
  const open = catList.filter(c => c.quiz && catProducts(c.key).length);
  if (!open.length) return '';
  const cards = open.map(c => {
    const n = catProducts(c.key).length;
    return `<button class="pick-card reveal" type="button" onclick="openQuiz('${esc(c.key)}')" aria-label="${esc(lf(c, 'quizCta'))}">
        <span class="pick-ic" aria-hidden="true">${esc(c.emoji || '•')}</span>
        <span class="pick-tx"><span class="pick-t">${esc(lf(c, 'name'))}</span><span class="pick-s">${n} ${esc(modelsWord(n))}</span></span>
        <span class="pick-go" aria-hidden="true">&rarr;</span>
      </button>`;
  }).join(`
      `);
  return `<section class="section picker" id="picker">
  <div class="wrap">
    <div class="reveal picker-head">
      <div class="eyebrow">${esc(t('pick_eye'))}</div>
      <h2 class="sec-title">${esc(t('pick_h'))}</h2>
      <p class="sec-sub">${esc(t('pick_sub'))}</p>
    </div>
    <div class="pick-grid">
      ${cards}
    </div>
  </div>
</section>`;
}

/* Thirty questions, all collapsed, still ran to a screen and a half of
   headings before the contacts came into view. Each one names its topic and the
   page shows a single topic at a time, so the block stays five or six rows
   however many questions there are.

   Everything is still in the markup and in the FAQPage schema — the filter is
   display only. The tab row is hidden until the script that drives it runs, so
   a reader without JavaScript gets all thirty questions rather than one topic
   and no way to reach the rest. */
const FAQ_TOPIC_ORDER = ['general', 'kitchen', 'sink', 'ac', 'wm', 'fr', 'bl', 'ps'];
const faqList = () => i18n[L].faq || i18n.uk.faq || [];
const faqTopicOf = it => it[2] || 'general';
function faqTopics() {
  const present = FAQ_TOPIC_ORDER.filter(k => faqList().some(it => faqTopicOf(it) === k));
  if (present.length < 2) return '';
  return '<div class="faq-tabs" id="faq-tabs" hidden>' + present.map((k, i) =>
    `<button type="button" class="faq-tab${i ? '' : ' active'}" data-topic="${k}">` +
    `${esc(t('faq_t_' + k))}</button>`).join('') + '</div>';
}
function faqItems() {
  const list = faqList();
  const first = FAQ_TOPIC_ORDER.find(k => list.some(it => faqTopicOf(it) === k));
  return list.map((it, i) =>
    `<div class="faq-item reveal" data-topic="${esc(faqTopicOf(it))}"` +
    ` style="transition-delay:${Math.min(i, 6) * 45}ms">` +
    `<div class="faq-q" onclick="toggleFaq(this)">${esc(it[0])}</div>` +
    `<div class="faq-a">${esc(it[1])}</div></div>`).join('\n      ')
    + `\n      <script>window.__FAQ_TOPIC__=${JSON.stringify(first || 'general')};</script>`;
}

// ---- catalog dataset injected for client hydration (no heavy desc fields) ----
const DELIVERY_MAP = fs.existsSync(path.join(ROOT, 'templates/map.svg'))
  ? fs.readFileSync(path.join(ROOT, 'templates/map.svg'), 'utf8') : '';
/* The catalogue the browser gets. The photo arrays used to travel with it —
   757 URLs, 52KB of the 104KB payload, on every one of the 417 pages — and the
   only thing that ever read past photos[0] was a quick-view modal nothing could
   open. The cards, the compare table, the picker results and the recently-seen
   strip all want the thumbnail, and every product has one. */
const missingThumb = products.filter(p => !p.thumb);
if (missingThumb.length) throw new Error('no thumb: ' + missingThumb.map(p => p.slug).join(', '));
/* A spec value with no entry in spec-values.json falls back to the Ukrainian
   text, which on the English page reads "Charging time: 100% приблизно за 2
   години" under an English label. Nothing caught that — it was found by
   opening the page. So: refuse to build.

   Unit abbreviations are one or two Cyrillic letters and are spelled the same
   in Ukrainian and Russian, so "555 × 585 × 560 мм" needs no Russian entry;
   three letters or more is prose, and prose needs a translator. English has no
   such luck — any Cyrillic at all has to be either translated or declared
   identical on purpose. */
{
  const CYR = /[А-Яа-яЇїІіЄєҐґ]/, WORD = /[А-Яа-яЇїІіЄєҐґ]{3,}/;
  const bad = new Map();
  for (const p of products) {
    const keys = new Set(((CATS[p.category] || {}).specs || []).map(s => s.key));
    for (const [k, v] of Object.entries(p.specs || {})) {
      if (!keys.has(k) || typeof v !== 'string') continue;
      for (const lang of ['ru', 'en']) {
        if (SPECV[v] && SPECV[v][lang]) continue;
        const unitOnly = (UNIT_TR[lang] || []).some(([re]) => re.test(v) && NUMERIC_VAL.test(v));
        if (unitOnly) continue;
        if (lang === 'ru' ? WORD.test(v) : CYR.test(v))
          bad.set(`${lang} · ${v}`, (bad.get(`${lang} · ${v}`) || p.slug));
      }
    }
  }
  if (bad.size) throw new Error('spec values with no translation in data/spec-values.json:\n  '
    + [...bad].map(([k, slug]) => `[${k}]  first seen on ${slug}`).join('\n  '));
}
const catalogData = products.map(({ desc_ru, desc_en, desc_uk, srcIndex, photoCount, photos, ...keep }) =>
  ({ ...keep, thumb: av(keep.thumb) }));
/* The browser reads five things out of a category: its code for the {{XX}}
   counts, its url prefix and product prefix for building links and names, its
   chips for the cards and its spec list for the compare table. The rest —
   three languages of SEO title, description, intro, FAQ, card subtitle and
   cover alt — is written for the page builder and never leaves it. Thirteen
   categories made that 44KB of dead weight on every page; this is a tenth of
   it. */
const CAT_CLIENT_FIELDS = ['code', 'urlPrefix', 'productPrefix', 'chips', 'specs',
  'filters', 'name', 'name_ru', 'name_en'];
const catsSlim = Object.fromEntries(Object.entries(CATS).map(([k, c]) =>
  [k, Object.fromEntries(CAT_CLIENT_FIELDS.filter(f => c[f] !== undefined).map(f => [f, c[f]]))]));
/* Ship only the strings this page can actually use: its own language plus the
   Ukrainian fallback the client falls back to. Sending all three put ~48KB of
   dead weight on every one of the 369 pages. The switcher needs to know which
   languages exist, so that list travels separately as a few bytes. */
/* Same reasoning for the product names. Switching language is a navigation, not
   a re-render, so a Ukrainian page can only ever show the Ukrainian name and an
   English page falls back to it. Carrying all three meant a third of the name
   bytes on every page were for a language that page cannot display. */
const slimNames = new Map();
const namesFor = (lang) => {
  if (!slimNames.has(lang)) {
    slimNames.set(lang, catalogData.map(({ name_ru, name_en, ...keep }) => {
      const other = lang === 'ru' ? name_ru : lang === 'en' ? name_en : undefined;
      return other === undefined ? keep : { ...keep, [`name_${lang}`]: other };
    }));
  }
  return slimNames.get(lang);
};
/* Two things used to travel with every page and be read by nobody.

   The thirty questions and their answers: the page renders them itself and the
   script that switches topics works off the rendered markup, so the copy in
   this blob was carried a thousand times and opened never.

   And the free-text spec dictionary: specVal returns its argument untouched
   the moment the language is Ukrainian, so on the pages Google treats as
   canonical those forty-nine kilobytes answered no question at all. */
/* The catalogue used to ride inline on every page — 295 KB in Ukrainian, 420 KB
   in Russian — and with it the photo path of every product in the shop. Search
   reads image URLs out of inline scripts, and it used them: "Варильні поверхні
   60 см" went out in results under a picture of an air conditioner, the first
   product in the list, and "Індукційні варильні поверхні" under a water heater.
   Nothing visible on either page showed one.

   The block is identical on every page of a language, so it is now one file per
   language, content-hashed like the stylesheet: a page's HTML names only the
   pictures it shows, and the data is downloaded once and cached across pages
   instead of on every one. defer keeps the order main.js depends on — deferred
   scripts run in document order, and this tag comes first. */
const DATA_FILES = new Map();   // url -> script text, written after the asset copy
const DATA_TAGS = new Map();    // language -> the <script> tag that loads it
/* Tag and brand share cards — filled per language by collectionOg(), written with
   the data files. Module scope, because the pages are built inside the language
   loop and the list has to outlive it. */
const COLLECTION_OG = new Map();   // file -> what gen_images.py puts on it
const injectData = () => {
  if (DATA_TAGS.has(L)) return DATA_TAGS.get(L);
  const strip = ({ faq, ...rest }) => rest;
  /* Russian and English pages carried the whole Ukrainian dictionary as well —
     about 14 KB gzipped on a first visit — though t() in main.js only reaches
     for Ukrainian when the page's own language lacks a key. Send just those. */
  const own = L === 'uk' ? null : strip(i18n[L]);
  const i18nSlim = L === 'uk' ? { uk: strip(i18n.uk) }
    : { uk: Object.fromEntries(Object.entries(strip(i18n.uk)).filter(([k]) => own[k] === undefined)), [L]: own };
  const specv = L === 'uk' ? {} : SPECV;
  const js = `window.__I18N__=${JSON.stringify(i18nSlim)};window.__LANGS__=${JSON.stringify(LANGS)};window.__SITE__=${JSON.stringify(site)};window.__CATS__=${JSON.stringify(catsSlim)};window.__SPECV__=${JSON.stringify(specv)};window.__PRODUCTS__=${JSON.stringify(namesFor(L))};`;
  const url = `/assets/js/data-${L}.${crypto.createHash('md5').update(js).digest('hex').slice(0, 8)}.js`;
  DATA_FILES.set(url, js);
  const tag = `<script src="${url}" defer></script>`;
  DATA_TAGS.set(L, tag);
  return tag;
};

// ===================== BUILD =====================
/* A stray "}" in the stylesheet is invisible until something is written after
   it: the browser then reads the next selector as "} .catpanel", drops that one
   rule and carries on. That is how the catalog panel lost position:fixed and
   opened off-screen on every scrolled phone. Count the braces outside comments
   and strings, and refuse to build a stylesheet that does not balance. */
{
  const css = fs.readFileSync(path.join(ROOT, 'assets/css/main.css'), 'utf8');
  let depth = 0, line = 1, i = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === '\n') line++;
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      const chunk = css.slice(i, end < 0 ? css.length : end + 2);
      line += (chunk.match(/\n/g) || []).length;
      i += chunk.length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== c && css[j] !== '\n') j += css.charCodeAt(j) === 92 ? 2 : 1;   // 92: backslash escape
      i = j + 1;
      continue;
    }
    if (c === '{') depth++;
    if (c === '}' && --depth < 0) throw new Error(`assets/css/main.css:${line}: "}" with no block to close`);
    i++;
  }
  if (depth !== 0) throw new Error(`assets/css/main.css: ${depth} block(s) left open at the end of the file`);
}
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const TEMPLATE = fs.readFileSync(path.join(ROOT, 'templates/body.html'), 'utf8');
const SITEMAP = [];                 // {loc} collected across languages
let body, HEADER, FOOTER, FILTERS_HTML, n = 0;

for (const lang of LANGS) {
  L = lang;
  buildLanguage();
}

function outPath(...parts) {
  const dir = path.join(DIST, ...(L === 'uk' ? [] : [L]), ...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function buildLanguage() {
body = TEMPLATE;
const best = products.find(p => p.bestseller) || products[0];
const bestStation = products.find(p => p.slug === 'fossibot-f1800-1800w-1024wh')
  || products.find(p => p.category === 'zaryadni-stantsii');
const bestFridge = products.find(p => p.slug === 'edler-ed-118wh') || products.find(p => p.category === 'holodylnyky');
/* Seasonal accent. Sumy buys air conditioners in the summer and power for the
   heating season in the winter, so the three hero cards rotate rather than
   showing the same trio all year. The month comes from the build, which is
   right as long as the site is deployed now and then; the decorative half
   (snowflakes) is re-checked in the browser against the real date, because
   snow over the hero in July reads as a broken page rather than a stale one. */
const SEASON = ['warm', 'cold', 'mild'].includes(process.env.TP_SEASON) ? process.env.TP_SEASON
  : (m => m >= 4 && m <= 7 ? 'warm' : (m >= 10 || m <= 1 ? 'cold' : 'mild'))(new Date().getMonth());
//   TP_SEASON=cold node scripts/build.mjs   — to preview another season
const bestBoiler = products.find(p => p.category === 'boylery');
const bestWasher = products.find(p => p.slug === 'bosch-wan28281ua') || products.find(p => p.category === 'pralni-mashyny');
/* The Fossibot carries the "Новинка" badge and always leads the hero. */
const stationCard = bestStation ? heroStationCard(bestStation) : '';
const seasonCards = {
  warm: [bestWasher && heroWasherCard(bestWasher), bestFridge && heroFridgeCard(bestFridge)],
  cold: [bestBoiler && heroBoilerCard(bestBoiler), bestWasher && heroWasherCard(bestWasher)],
  mild: [bestFridge && heroFridgeCard(bestFridge), bestWasher && heroWasherCard(bestWasher)]
}[SEASON].filter(Boolean);
// The Fossibot leads in every season — it is the flagship новинка and the owner
// wants it at the top of the hits all year. The season only picks the two
// cards under it.
const heroSlots = [stationCard, ...seasonCards].filter(Boolean);
// never leave the hero short of a card if a category runs empty
for (const spare of [stationCard, bestFridge && heroFridgeCard(bestFridge),
                     bestWasher && heroWasherCard(bestWasher)]) {
  if (heroSlots.length >= 3) break;
  if (spare && !heroSlots.includes(spare)) heroSlots.push(spare);
}
/* String.replace on a marker that is not there returns the string unchanged
   and says nothing. That is how <!--QUIZ_INLINE--> disappeared: an edit to the
   tab strip above it ate the first five characters of the comment, so the whole
   picker quietly vanished from the home page while "UIZ_INLINE-->" sat on it as
   visible text. A missing marker is a bug in the template, so say so. */
const fill = (marker, html) => {
  if (!body.includes(marker)) throw new Error(`templates/body.html has no ${marker}`);
  body = body.replace(marker, html);
};
fill('<!--HERO_CARD-->', heroSlots[0] || '');
fill('<!--HERO_CARD2-->', heroSlots[1] || '');
fill('<!--HERO_CARD3-->', heroSlots[2] || '');
if (bestStation && bestWasher) body = body.replace('class="hero-vis two"', 'class="hero-vis two hv3"');
// pre-render catalog grid for SEO (client re-renders on filter) — default tab shows ALL products
const homeCatalogCat = 'all';
// pinned products lead the default "Всі товари" view (mirrors getFiltered in main.js)
/* "Всі товари" used to run 51 air conditioners in a row before anything else
   appeared, because the list simply followed the order of the data file. Spread
   each category evenly across the whole list instead, in proportion to its size:
   a product's place is decided by how far through its own category it sits, so
   52 air conditioners and 9 fridges both stretch from the top to the bottom.
   Pinned products still come first, and the order is the same for every visitor
   and every crawl. mixedOrder() is mirrored by the same function in main.js. */
function mixedOrder(list) {
  const seen = {}, size = {};
  for (const p of list) size[p.category] = (size[p.category] || 0) + 1;
  return list.map((p, i) => {
    const n = (seen[p.category] = (seen[p.category] || 0) + 1) - 1;
    return { p, i, pin: p.pin || 99, k: (n + 0.5) / size[p.category] };
  }).sort((a, b) => a.pin - b.pin || a.k - b.k || a.i - b.i).map(x => x.p);
}
const defaultOrder = mixedOrder(products);
body = body.replace('<div class="grid" id="catalog-grid"></div>',
  `<div class="grid" id="catalog-grid">${firstPage(defaultOrder).map(card).join('')}</div>`);
// brand strip: every brand actually in stock, ordered by how many products it has
{
  const counts = {};
  /* The strip is headed "Бренди:" and lists manufacturers. The made-to-order
     bundles carry the shop's own name because the shop is who assembles and
     warrants them — true on their page, out of place in a row of TCL, LG and
     Bosch. */
  for (const p of products) {
    if (p.brand === site.name) continue;
    counts[p.brand] = (counts[p.brand] || 0) + 1;
  }
  const chips = Object.keys(counts)
    .sort((a, b) => counts[b] - counts[a] || a.localeCompare(b, 'uk'))
    .map(b => `<span class="bs-chip" onclick="jumpBrand('${esc(b)}')">${esc(b)}</span>`).join('\n    ');
  fill('<!--BRAND_CHIPS-->', chips);
}
// footer catalog columns generated from the data, so new categories/brands never go stale
{
  const brandsOf = key => [...new Set(products.filter(p => p.category === key).map(p => p.brand))]
    .sort((a, b) => a.localeCompare(b, 'uk'));
  /* One column per category, each headed by the category itself and listing its
     own brands. The old layout grew by accident — washing machines had a column
     while air conditioners, fridges and stations were stacked into a single
     28-item list, which is what made the footer look lopsided. */
  const cols = catList.filter(c => catProducts(c.key).length).map(c => {
    // point at the brand's own page — these are the links that let it be found.
    // pfx() keeps /ru/ and /en/ visitors inside their own tree.
    const brands = brandsOf(c.key).map(b =>
      `<li><a href="${pfx()}${c.urlPrefix}/${brandSlug(b)}/">${esc(b)}</a></li>`).join('\n          ');
    return `<div class="foot-col">
        <p class="foot-h"><a href="${curl(c)}">${esc(lf(c, 'name'))}</a></p>
        <ul>
          ${brands}
          <li class="fc-all"><a href="${curl(c)}">${esc(t('foot_all'))} →</a></li>
        </ul>
      </div>`;
  }).join('\n      ');
  fill('<!--FOOT_CATALOG-->', cols);
}
/* The template writes its own links root-relative (/kondicioner/), which is
   only correct on the Ukrainian tree — on /ru/ and /en/ the category cards were
   quietly dropping visitors back into Ukrainian. Rewrite the paths that really
   do have a page in this language: every category does, the blog only in
   BLOG_LANGS, and the privacy policy exists in Ukrainian alone — so those two
   are decided explicitly instead of by a blanket rule that would 404.
   split/join, not replace: replace(string) only swaps the first hit. */
if (pfx()) {
  for (const c of catList)
    body = body.split(`href="${c.urlPrefix}/"`).join(`href="${pfx()}${c.urlPrefix}/"`);
  if (BLOG_LANGS.includes(L))
    body = body.split('href="/blog/"').join(`href="${pfx()}/blog/"`);
}
/* The delivery map is generated by scripts/make_map.py from OpenStreetMap
   extracts — real streets, rivers, districts and landmarks, ~4KB compressed.
   Its labels carry data-i18n, so applyI18nStatic translates them below. */
fill('<!--DELIVERY_MAP-->', DELIVERY_MAP);
/* "Маршрут" in the hero opens navigation, not a pin: destination_place_id ties
   it to the Business Profile, so Maps names the shop instead of a bare point. */
fill('<!--MAP_DIR-->', esc(`https://www.google.com/maps/dir/?api=1&destination=${site.coords.lat},${site.coords.lng}&destination_place_id=${site.placeId}`));
fill('<!--PICKER-->', pickerSection());
fill('<!--QUIZ_INLINE-->', quizInline(true));
/* The phone menu used to hold nothing but anchors into the homepage. Most
   visitors come to pick an appliance, so the five categories go in first, each
   with how many models it holds — one tap from anywhere on the site. */
/* The catalog panel, opened by every "Каталог" on the page — the header button,
   the phone's top-bar button, the bottom bar and the home page's "all
   categories" card.

   On a desktop it is a mega menu: the shop's fourteen shelves down the left as
   a plain list in two groups, and beside them the one under the pointer — its
   cover at full quality, how many models and from what price, the query pages
   and brand pages it actually has, and four of its models with their prices.
   The first version was a list of 40px icons; the owner called it wooden, and
   the icons were too small to tell a hob from a hood. The pictures now live in
   the preview, at a size that can be read.

   On a phone and a tablet the same list becomes tiles with square photographs,
   three to five to a row, in a sheet with its own close button.

   Built here, in the page's language; every trigger stays a link to #catalog
   for anyone without JavaScript. */
const GRID_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7.4" height="7.4" rx="1.6"/><rect x="13.6" y="3" width="7.4" height="7.4" rx="1.6"/><rect x="3" y="13.6" width="7.4" height="7.4" rx="1.6"/><rect x="13.6" y="13.6" width="7.4" height="7.4" rx="1.6"/></svg>';
/* 320px squares for the tiles — see scripts/make_cat_thumbs.py */
const catSquare = (c, size) => av(c.cover.replace(/\.webp$/, `@${size}.webp`));
function catPanel() {
  const live = catLive();
  const ordered = ['home', 'kitchen'].flatMap(g => live.filter(c => (c.group || 'home') === g));
  const first = ordered[0] && ordered[0].key;
  const icon = c => c.cover
    ? `<img class="cp-ic" src="${esc(catSquare(c, 'tile'))}" alt="" width="320" height="320" loading="lazy" decoding="async">`
    : `<span class="cp-ic cp-emoji" aria-hidden="true">${esc(c.emoji || '')}</span>`;
  const item = c => `<a class="cp-item${c.key === first ? ' is-on' : ''}" href="${curl(c)}" data-cp="${esc(c.key)}">${icon(c)}` +
    `<span class="cp-name">${esc(lf(c, 'name'))}</span><em class="cp-n">${catProducts(c.key).length}</em>` +
    `<svg class="cp-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></a>`;
  const rail = [['home', 'cp_home'], ['kitchen', 'cp_kitchen']].map(([g, key]) => {
    const cs = ordered.filter(c => (c.group || 'home') === g);
    return cs.length ? `<p class="cp-h">${esc(t(key))}</p><div class="cp-list">${cs.map(item).join('')}</div>` : '';
  }).join('');
  const pane = c => {
    const ps = catProducts(c.key);
    const meta = `${ps.length} ${modelsWord(ps.length)} · ${t('cp_from').replace('{price}', fmt(Math.min(...ps.map(p => p.price))))}`;
    /* Four models under the links, so the preview is a shop window rather than
       a caption over empty space. */
    /* Inside the hob shelf "Варильна поверхня" in front of every name is noise
       that pushed the model itself past the two lines a card has room for. */
    const pre = (c.productPrefix || {})[L];
    const shortName = p => {
      const n = pname(p);
      if (!pre || !n.startsWith(pre)) return n;
      const rest = n.slice(pre.length).replace(/^[\s:·,–-]+/, '');
      return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : n;
    };
    /* Pinned models, then bestsellers, then catalogue order — one per brand
       first, so the air conditioners are not four near-identical TCL units. */
    const ranked = ps.map((p, i) => ({ p, i }))
      .sort((a, b) => (a.p.pin || 99) - (b.p.pin || 99) || (b.p.bestseller ? 1 : 0) - (a.p.bestseller ? 1 : 0) || a.i - b.i)
      .map(x => x.p);
    const seenBrand = new Set();
    const picks = ranked.filter(p => !seenBrand.has(p.brand) && seenBrand.add(p.brand)).slice(0, 4);
    for (const p of ranked) { if (picks.length >= 4) break; if (!picks.includes(p)) picks.push(p); }
    const prods = picks.length ? `<div class="cp-prods"><p class="cp-h">${esc(t('cp_models'))}</p><div class="cp-prod-grid">` +
      picks.map(p => `<a class="cp-prod" href="${purl(p)}"><span class="cp-prod-img"><img src="${esc(av(p.thumb))}" alt="" width="400" height="400" loading="lazy" decoding="async"></span>` +
        `<span class="cp-prod-name">${esc(shortName(p))}</span><span class="cp-prod-price">${fmt(p.price)} ${esc(t('u_uah'))}</span></a>`).join('') +
      `</div></div>` : '';
    const tags = catTags(c.key).map(tg => `<a class="cp-chip" href="${turl(c, tg)}">${esc(lf(tg, 'label'))}</a>`).join('');
    const brands = catBrands(c.key).filter(b => !brandIsShelf(c.key, b))
      .map(b => `<a class="cp-chip" href="${burl(c, b)}">${esc(b)}</a>`).join('');
    const col = (label, chips) => chips ? `<div class="cp-col"><p class="cp-h">${esc(t(label))}</p><div class="cp-chips">${chips}</div></div>` : '';
    const cover = c.cover ? (() => {
      const w = n => esc(av(c.cover.replace(/\.webp$/, `@${n}.webp`)));
      return `<img src="${esc(av(c.cover))}" srcset="${w(400)} 400w, ${esc(av(c.cover))} 800w, ${w(1200)} 1200w"` +
        ` sizes="(min-width:1001px) 480px, 1px" alt="${esc(lf(c, 'coverAlt') || lf(c, 'name'))}" width="800" height="340" loading="lazy" decoding="async">`;
    })() : '';
    return `<section class="cp-pane${c.key === first ? ' is-on' : ''}" data-cp="${esc(c.key)}"${c.key === first ? '' : ' hidden'}>` +
      `<div class="cp-lead"><a class="cp-cover" href="${curl(c)}" tabindex="-1" aria-hidden="true">${cover}</a>` +
      `<div class="cp-info"><p class="cp-title">${esc(lf(c, 'name'))}</p><p class="cp-meta">${esc(meta)}</p>` +
      `<p class="cp-desc">${esc(lf(c, 'cardSub') || '')}</p>` +
      `<a class="cp-go" href="${curl(c)}">${esc(t('cp_go'))} <span aria-hidden="true">→</span></a></div></div>` +
      (tags || brands ? `<div class="cp-links">${col('cp_popular', tags)}${col('cp_brands', brands)}</div>` : '') +
      prods + `</section>`;
  };
  return `<div class="catpanel" id="catpanel" hidden data-nosnippet><nav class="cp-box" aria-label="${esc(t('cp_label'))}">` +
    `<div class="cp-top"><p class="cp-top-t">${esc(t('nav_catalog'))}</p>` +
    `<button type="button" class="cp-close" aria-label="${esc(t('cp_close'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>` +
    `<div class="cp-body"><div class="cp-rail">${rail}</div><div class="cp-stage">${ordered.map(pane).join('')}</div></div>` +
    `<div class="cp-foot"><span>${esc(t('cp_stock'))}</span><a class="cp-all" href="${pfx()}/#catalog">${esc(t('cp_all'))} <span aria-hidden="true">→</span></a></div>` +
    `</nav></div>`;
}
function navCats() {
  return '<div class="nav-cats">' + catLive().map(c =>
    `<a class="nav-cat" href="${curl(c)}"><span>${esc(lf(c, 'name'))}</span><em>${catProducts(c.key).length}</em></a>`
  ).join('') + '</div>';
}
/* Category cards carry an optional cover. Without one they render exactly as
   before — an emoji tile beside the name — so the section is never half-dressed
   while the pictures are still being made. */
/* The category grid used to be thirteen — well, five — hand-written cards in the
   template, each with its own emoji and its own i18n keys for the label. Adding a
   category meant editing markup in three places. It is generated from
   categories.json now: order, emoji, name, subtitle and cover all come from the
   data, so a new category is a data change and nothing else.

   A category without a cover renders exactly as it did before — an emoji tile
   beside the name — so the section is never half-dressed while artwork is made. */
{
  /* Five categories carry the shop — air conditioners, washing machines,
     fridges, power stations, water heaters — and the section showed all
     fourteen, 1631px of cards on a phone. The featured five stay; the rest are
     one card that opens the catalog panel, with a few of their thumbnails so it
     reads as "and more" rather than as a sixth category. */
  const every = catLive();
  const live = every.some(c => c.featured) ? every.filter(c => c.featured) : every;
  const rest = every.filter(c => !live.includes(c));
  const withCover = live.filter(c => c.cover);
  const cards = live.map(c => {
    const cover = c.cover ? (() => {
      const w = n => esc(av(c.cover.replace(/\.webp$/, `@${n}.webp`)));
      /* Two widths. On a phone the grid is 2-up, so a card is about 46vw — a 400px
         file covers that at 2x, and the odd last card, which spans the row, gets a
         sizes of its own rather than a soft picture. */
      const last = !rest.length && withCover.length % 2 === 1 && c === withCover[withCover.length - 1];
      const sizes = last ? '(max-width:640px) 92vw, (max-width:1000px) 46vw, 380px'
                         : '(max-width:1000px) 46vw, 380px';
      return `<img class="cat-cover" src="${esc(av(c.cover))}" srcset="${w(400)} 400w, ${esc(av(c.cover))} 800w"` +
        ` sizes="${sizes}" alt="" width="800" height="340" loading="lazy" decoding="async">`;
    })() : '';
    return `<a class="cat-card${c.cover ? ' cat-card-cover' : ''} reveal" href="${curl(c)}">${cover}` +
      `<span class="cat-ic" aria-hidden="true">${esc(c.emoji || '')}</span>` +
      `<span class="cat-tx"><span class="cat-t">${esc(lf(c, 'name'))}</span>` +
      `<span class="cat-s">${esc(lf(c, 'cardSub') || '')}</span></span>` +
      `<span class="cat-go">${esc(t('cats_more'))}</span></a>`;
  }).join('\n      ');
  /* The 2-up phone layout used to be selected with :has(). A browser without it
     silently fell back to one tall card per row — which is exactly the endless
     scrolling this was meant to fix — so the grid is told here instead. */
  const allTile = rest.length ? (() => {
    const names = rest.map((c, i) => (i ? lf(c, 'name').toLowerCase() : lf(c, 'name')));
    const sub = names.length > 3
      ? `${names.slice(0, 3).join(', ')} ${t('cats_all_more').replace('{n}', names.length - 3)}` : names.join(', ');
    const shown = rest.filter(c => c.cover).slice(0, 4);
    const more = rest.length - shown.length;
    return `<a class="cat-card cat-card-cover cat-card-all reveal" href="#catalog" data-catpanel aria-controls="catpanel" aria-expanded="false">` +
      `<span class="cat-all-art" aria-hidden="true">${shown.map(c => `<img src="${esc(catSquare(c, 'tile'))}" alt="" width="320" height="320" loading="lazy" decoding="async">`).join('')}` +
      `${more > 0 ? `<b>+${more}</b>` : ''}</span>` +
      `<span class="cat-ic" aria-hidden="true">${GRID_SVG}</span>` +
      `<span class="cat-tx"><span class="cat-t">${esc(t('cats_all_t'))}</span><span class="cat-s">${esc(sub)}</span></span>` +
      `<span class="cat-go">${esc(t('cats_all_go'))}</span></a>`;
  })() : '';
  fill('<!--CAT_CARDS-->',
    `<div class="cats-grid${withCover.length ? ' has-covers' : ''}${rest.length ? ' cats-main' : ''}">\n      ${cards}${allTile ? '\n      ' + allTile : ''}\n    </div>`);
}
fill('<!--INSTALL_MORE-->', INSTALL_LANGS.includes(L)
  ? `<a class="pc-more" href="${pfx()}${INSTALL_PATH}">${esc(t('inst_more'))} →</a>` : '');
/* The catalogue tab strip was thirteen — well, six — hand-written buttons in
   the template, each with its own emoji and i18n key, and the eight new
   categories were simply missing from it. Same source as the grid and the menu
   now: a category that has products gets a tab. */
fill('<!--CAT_TABS-->',
  `<button class="ctab active" data-cat="all" onclick="switchCat('all')" type="button">`
  + `<span class="ctab-ic">☰</span><span data-i18n="ctab_all">${esc(t('ctab_all'))}</span>`
  + `<b class="ctab-n"></b></button>
      `
  + catLive().map(c =>
    `<button class="ctab" data-cat="${esc(c.key)}" onclick="switchCat('${esc(c.key)}')" type="button">`
    + `<span class="ctab-ic">${esc(c.emoji || '')}</span><span>${esc(lf(c, 'name'))}</span>`
    + `<b class="ctab-n"></b></button>`).join('\n      '));
/* Cloudflare Turnstile. Without a site key in site.json the slot is empty and
   nothing about the form changes — the site keeps working while the owner
   fetches the keys, and the server-side check stays off to match. */
fill('<!--TURNSTILE-->', site.turnstileKey
  ? `<div class="cf-turnstile" data-sitekey="${esc(site.turnstileKey)}"`
    + ` data-theme="auto" data-size="flexible" data-language="${L}"></div>`
  : '');
fill('<!--NAV_CATS-->', navCats());
fill('<!--CAT_PANEL-->', catPanel());
/* Reviews were a third-party embed: a 704px-tall iframe from elfsightcdn that
   loaded on every page, could not be styled and read as somebody else's box
   dropped into the page. This renders the same reviews as our own markup, from
   data/reviews.json — and links out to Google so anyone can check them.
   Nothing here is written on the shop's behalf: an empty items list simply
   shows the rating and the link. */
function starRow(n) {
  return '<div class="rev-stars" aria-label="' + n + '/5">' + Array.from({ length: 5 }, (_, i) =>
    `<svg viewBox="0 0 24 24"${i < n ? '' : ' class="rev-star-off"'}><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>`
  ).join('') + '</div>';
}
/* The 5,0 from 54 Google reviews sat in a section five screens down, where a
   visitor deciding whether to trust an unfamiliar shop never reaches it. This
   puts it beside the hero badge, linked to the profile so anyone can check.
   Renders nothing when the figures are absent — data/reviews.json is allowed
   to hold null rather than something plausible. */
function heroRating() {
  const R = REVIEWS || {};
  if (!R.rating || !R.count) return '';
  const score = Number(R.rating).toFixed(1).replace('.', L === 'en' ? '.' : ',');
  /* One star, not five: the row shares a line with the opening hours, and five
     of them crowd it out on a phone. The full "N reviews on Google" is the
     accessible name and the tooltip, so nothing is hidden — only shortened. */
  const label = `${score} · ${R.count} ${reviewsWord(R.count)}`;
  const star = '<svg class="hr-star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>';
  const inner = `${star}<b>${score}</b><span>Google</span>`;
  return R.googleUrl
    ? `<a class="hero-rate" href="${esc(R.googleUrl)}" target="_blank" rel="noopener nofollow" title="${esc(label)}" aria-label="${esc(label)}">${inner}</a>`
    : `<span class="hero-rate" title="${esc(label)}">${inner}</span>`;
}

function reviewsSection() {
  const R = REVIEWS || {};
  const items = Array.isArray(R.items) ? R.items : [];
  const url = R.googleUrl || '';
  const head = (R.rating && R.count)
    ? `<div class="rev-score">
         <div class="rev-score-n">${Number(R.rating).toFixed(1).replace('.', ',')}</div>
         <div>${starRow(Math.round(R.rating))}
           <div class="rev-score-c">${R.count} ${esc(reviewsWord(R.count))}</div></div>
       </div>` : '';
  /* No author line when we have no name: a blank avatar over an empty name reads
     as a broken card, and inventing one would misattribute a real review. */
  const cards = items.map(r => `<figure class="rev-card">
      ${starRow(r.rating || 5)}
      <blockquote class="rev-text">${esc(lf(r, 'text'))}</blockquote>
      ${r.name ? `<figcaption class="rev-who">
        <span class="rev-av" aria-hidden="true">${esc(r.name.trim().charAt(0))}</span>
        <span><span class="rev-name">${esc(r.name)}</span>${r.date ? `<span class="rev-date">${esc(r.date)}</span>` : ''}</span>
      </figcaption>` : ''}</figure>`).join('');
  const arrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M17 7H9M17 7v8"/></svg>';
  const links = (url ? `<a class="rev-link" href="${esc(url)}" target="_blank" rel="noopener nofollow">${esc(t('rev_all_google'))}${arrow}</a>` : '')
    + (R.reviewUrl ? `<a class="rev-link rev-link-2" href="${esc(R.reviewUrl)}" target="_blank" rel="noopener nofollow">${esc(t('rev_leave'))}${arrow}</a>` : '');
  return `<div class="rev-top reveal">${head}<div class="rev-links">${links}</div></div>`
    + (cards ? `<div class="rev-grid">${cards}</div>` : '');
}
/* Every link to the shop on the map went to a place URL built around the old
   listing name, "КОНДИЦІОНЕРИ - ТЕХНОПЛАЗА". Google no longer resolves it: it
   dropped the pin on an empty spot near Vinnytsia, 400 km from the shop. The
   place_id form is the one Google documents as stable, and it lives in
   site.json so the three copies cannot drift apart again. */
body = body.split('{{MAP_URL}}').join(esc(site.mapUrl));
fill('<!--HERO_RATING-->', heroRating());
fill('<!--REVIEWS-->', reviewsSection());
fill('<!--FAQ_ITEMS-->', faqTopics() + faqItems());
body = applyI18nStatic(body);   // bake the current language into static HTML (SEO)
/* The logo linked to "/" on every page, so the one link everybody clicks took a
   reader of the English site to the Ukrainian home page. The map embed asked
   Google for Ukrainian labels whatever the page was in.
   The embed in templates/body.html looks the shop up by name and address, not
   by coordinates: a coordinate query draws a bare pin, while a place query
   draws Google's own card — name, 5,0 ★ with the review count, and a
   directions button. "ТехноПлаза, Харківська 2/1, Суми" still resolves if the
   profile's long name is ever shortened. */
body = body.replace('<a href="/" class="logo"', `<a href="${pfx()}/" class="logo"`)
  .replace('&hl=uk&', `&hl=${L}&`);
body = subCounts(body);         // resolve {{TOTAL}}/{{AC}}/{{WM}}/{{PS}} tokens in raw markup
body = body.replace(/src="(\/assets\/img\/(?:site|logo)[^"]*)"/g, (m, u) => `src="${av(u)}"`);

// shared chrome (header before hero; footer+modals+floats from <footer> onward) for product pages
const _heroAt = body.indexOf('<section class="hero"');
/* Cut at </main>, not at <footer>: the main landmark opens inside HEADER, so
   the slice that becomes FOOTER has to carry the tag that closes it. Cutting a
   line later left every inner page with an unclosed <main>. */
const _footAt = body.indexOf('</main>');
/* On inner pages the homepage-section anchors must point at "/#…" — and at the
   language's own home page: a Russian visitor clicking "Монтаж" was being sent
   to the Ukrainian one. */
const toHome = h => h.replace(/href="#(?!")/g, `href="${pfx()}/#`);
/* Installation now has a page of its own, so the header and footer links point
   there rather than scrolling the home page. It is the service people search
   for by name, and a link from every page is what makes it findable. */
const toInstall = h => INSTALL_LANGS.includes(L)
  ? h.split(`href="${pfx()}/#installation"`).join(`href="${pfx()}${INSTALL_PATH}"`)
  : h;
HEADER = toInstall(toHome(body.slice(0, _heroAt)));
FOOTER = toInstall(toHome(body.slice(_footAt)));

const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: ((i18n[L].faq) || i18n.uk.faq || []).map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
const indexHtml = `<!doctype html><html lang="${L}" data-season="${SEASON}"><head>
${head({
  title: t('seo_home_t'),
  desc: t('seo_home_d'),
  canonical: abs(pfx() + '/'), altPath: '/',
  jsonld: {
    '@context': 'https://schema.org', '@type': 'ElectronicsStore',
    '@id': BASE + '/#store', name: site.name, alternateName: BRAND_ALIASES,
    /* Google picks the picture beside the result from these, and it wants the
       same shot in several shapes so it can fit whichever layout it renders.
       All three show what the shop actually stocks — home appliances and the
       kitchen range, in one row, each shape fitted rather than cropped. */
    image: [absImg('/assets/img/site/shop-16x9.jpg'), absImg('/assets/img/site/shop-4x3.jpg'),
            absImg('/assets/img/site/shop-1x1.jpg')],
    logo: absImg('/assets/img/logo.png'),
    telephone: site.phone, email: site.email,
    address: { '@type': 'PostalAddress', streetAddress: 'вул. Харківська 2/1', addressLocality: site.city, addressCountry: 'UA' },
    url: BASE, priceRange: '₴₴', areaServed: 'Суми',
    /* Ties the site to the Business Profile: the same coordinates and the same
       place the address links open, so Google is not left matching them by the
       street line alone. */
    geo: { '@type': 'GeoCoordinates', latitude: site.coords.lat, longitude: site.coords.lng },
    hasMap: site.mapUrl,
    /* Same table the hero's "Відчинено / Зачинено" line reads, so the two can
       never drift apart. It is what lets a local result say "Open · closes
       18:00" instead of nothing at all. */
    openingHoursSpecification: openingHoursLd(),
    /* The Google Business Profile this site belongs to, stated rather than
       left for Google to infer from a matching address. */
    sameAs: [site.googleReviewsUrl].filter(Boolean),
    hasMerchantReturnPolicy: RETURN_POLICY()
  }
})}
<script type="application/ld+json">${JSON.stringify(faqLd)}</script>
<script type="application/ld+json">${JSON.stringify(navLd())}</script>
<script type="application/ld+json">${JSON.stringify(searchLd())}</script>
</head><body>${GTM_NS}
${body}
${injectData()}
<script>window.__CATALOG_CAT__=${JSON.stringify(homeCatalogCat)};</script>
<script src="${av('/assets/js/main.js')}" defer></script>
</body></html>`;
writePage(path.join(outPath()), indexHtml);
SITEMAP.push(pfx() + '/');

// ---- product pages ----
function specTable(p) {
  return (catOf(p).specs || []).map(f => {
    const v = fmtVal(p, f);
    return (v === null || v === undefined || v === '') ? '' : `<tr><th>${esc(lf(f,'label'))}</th><td>${esc(v)}</td></tr>`;
  }).join('');
}
/* A sink, its tap and its dispenser are one purchase in three boxes, and the
   catalogue kept them in three different aisles. Every sink in stock has a tap
   in its colour — seven of them on average — and a dispenser too, so this is
   the one recommendation on the site that is never empty and never a guess.

   Colours are compared by component: a tap described as "Нержавіюча сталь +
   чорний" belongs beside a black sink and beside a steel one, because it is
   both. */
const COLOUR_PARTS = v => new Set(String(v || '').replace(/[()]/g, ' ')
  .split('+').map(x => x.trim().toLowerCase()).filter(Boolean));
/* Category, then how many of it. Somebody looking at a sink wants the tap
   first; sorting the whole pool by price put two dispensers in front of it,
   because a dispenser costs seven hundred hryvnia and a tap five thousand. */
const MATCH_TO = { myyky: [['zmishuvachi', 2], ['dozatory', 1]],
                   zmishuvachi: [['myyky', 3]], dozatory: [['myyky', 3]] };
function matching(p) {
  const want = COLOUR_PARTS((p.specs || {}).color);
  if (!want.size) return [];
  /* An exact colour first — "Чорний" before "Нержавіюча сталь + чорний" — then
     the cheaper one, because the pairing is a suggestion, not an upsell. */
  const byFit = (a, b) => {
    const exact = x => String((x.specs || {}).color) === String((p.specs || {}).color) ? 0 : 1;
    return exact(a) - exact(b) || a.price - b.price;
  };
  const out = [];
  for (const [cat, take] of (MATCH_TO[p.category] || [])) {
    out.push(...products
      .filter(x => x.category === cat
        && [...COLOUR_PARTS((x.specs || {}).color)].some(c => want.has(c)))
      .sort(byFit).slice(0, take));
  }
  return out.slice(0, 3);
}
function related(p) {
  const same = products.filter(x => x.slug !== p.slug && x.category === p.category);
  const ranked = same.slice().sort((a, b) => {
    const score = x => (x.brand === p.brand ? 2 : 0) + (x.btu && x.btu === p.btu ? 1 : 0);
    return score(b) - score(a);
  });
  return ranked.slice(0, 3);
}
/* "How long will it run" — the question every power-station buyer actually has.
   Typical draws are conservative: a fridge is averaged over its compressor
   cycle, a gas-boiler pump is its running figure. Only rendered where the
   product has a usable capacity. */
const RUNTIME_LOADS = [
  { key: 'rt_fridge', w: 120, on: true }, { key: 'rt_router', w: 15, on: true },
  { key: 'rt_light', w: 40, on: true }, { key: 'rt_tv', w: 100 },
  { key: 'rt_laptop', w: 65 }, { key: 'rt_boiler', w: 120 },
  { key: 'rt_phone', w: 20 }, { key: 'rt_pump', w: 800 }
];
function runtimeCalc(p) {
  const wh = Number((p.specs || {}).capacity_wh);
  if (p.category !== 'zaryadni-stantsii' || !wh) return '';
  const items = RUNTIME_LOADS.map((l, i) =>
    `<label class="rt-item"><input type="checkbox" data-w="${l.w}"${l.on ? ' checked' : ''} onchange="rtCalc()">
      <span class="rt-name">${esc(t(l.key))}</span><span class="rt-w">${l.w} ${esc(t('u_w'))}</span></label>`).join('');
  return `<div class="pp-runtime" id="pp-runtime" data-wh="${wh}" data-max="${Number((p.specs || {}).output_w) || 0}">
    <h2>${esc(t('rt_h'))}</h2>
    <p class="rt-sub">${esc(t('rt_sub'))}</p>
    <div class="rt-grid">${items}</div>
    <div class="rt-out">
      <div class="rt-cell"><span class="rt-lbl">${esc(t('rt_load'))}</span><b id="rt-load">—</b></div>
      <div class="rt-cell rt-main"><span class="rt-lbl">${esc(t('rt_time'))}</span><b id="rt-time">—</b></div>
    </div>
    <p class="rt-note" id="rt-note">${esc(t('rt_note'))}</p>
  </div>`;
}

function productPage(p) {
  const s = p.specs || {};
  const NAME = pname(p);
  /* The strip draws these at about 80x60, so serving the 900px originals meant
     half a megabyte to render a row of postage stamps. Use the 240px copies from
     make_thumbs.py, falling back to the original if one has not been generated. */
  const smallOf = src => {
    const sm = src.replace(/\/([^/]+)$/, '/sm/$1');
    return fs.existsSync(path.join(ROOT, sm.replace(/^\//, ''))) ? sm : src;
  };
  const thumbs = p.photos.map((src, i) => `<button class="pp-thumb${i === 0 ? ' active' : ''}" onclick="ppShow(${i})"><img src="${esc(av(smallOf(src)))}" alt="${esc(NAME)} ${i + 1}" loading="lazy" width="240" height="180"></button>`).join('');
  const cat = catOf(p);
  const chips = ppChips(p);
  const trustLines = catTrust(cat);
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Product', name: NAME, sku: p.slug,
    image: p.photos.map(ph => abs(ph)), description: pdesc(p), brand: { '@type': 'Brand', name: p.brand },
    offers: { '@type': 'Offer', price: p.price, priceCurrency: 'UAH', availability: 'https://schema.org/InStock', url: abs(purl(p)), itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', '@id': BASE + '/#store', name: site.name },
      shippingDetails: SHIPPING(), hasMerchantReturnPolicy: RETURN_POLICY() }
  };
  const crumbs = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: t('pp_home'), item: abs(pfx() + '/') },
      { '@type': 'ListItem', position: 2, name: lf(cat, 'name'), item: abs(curl(cat)) },
      { '@type': 'ListItem', position: 3, name: NAME, item: abs(purl(p)) }
    ]
  };
  const ukPrefix = (cat.productPrefix || {}).uk;
  return `<!doctype html><html lang="${L}" data-season="${SEASON}"><head>
${(() => {
  /* The name opens with the category word — "Мийка Gunter&Hauer Mindel 5522".
     Keep it: that word is half of what the title is found by. Drop it only when
     the model repeats it, as "Dispenser Gunter&Hauer SOAP DISPENSER Steel Gun
     Metal" does, where it costs six characters and says nothing twice.

     (This line used to try to strip the prefix always, and never did: the '\s+'
     sat in a single-quoted string, so the pattern asked for "Dispensers" and
     matched nothing. The accident was kinder than the intent.) */
  const nm = (() => {
    const pre = (cat.productPrefix || {})[L] || ukPrefix;
    if (!pre) return NAME;
    const re = new RegExp('^' + pre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+', 'i');
    if (!re.test(NAME)) return NAME;
    const rest = NAME.replace(re, '');
    return rest.toLowerCase().includes(pre.toLowerCase()) ? rest : NAME;
  })();
  const keySpec = (cat.ppChips || cat.chips || []).filter(c => !c.flag).map(c => fmtVal(p, c)).filter(Boolean).slice(0, 2).join(', ');
  const trust = trustLines.join('. ') + '.';
  return head({
    /* Google shows roughly the first 60 characters of a title, and Search
       Console says the shop is losing people exactly there: washing machines
       sat at position 8.7 for three months — first page — and took one click
       in 110 impressions. What a buyer scanning that page wants first is the
       price, so the price leads, and the descriptive tail of the model name
       gives way to make room for it. Brand and model code are never touched:
       they are what the query matched on. */
    title: (() => {
      /* Only these words may be dropped, and only from the end. Colour,
         refrigerant, Wi-Fi, wattage — never a model code. */
      const DROP = /^(wi-?fi|ready|r-?32|r-?410a?|inverter|inv|rotary|інверторний|инверторный|heatpump|heat|pump|ai|black|white|silver|grey|gray|чорний|білий|сірий|черный|белый|серый|\d+(w|вт|kw|квт))$/i;
      const room = 65 - TITLE_SUFFIX.length;
      const price = fmt(p.price);
      const shorten = (form) => {
        let w = nm.split(' ');
        for (;;) {
          const out = form(w.join(' '));
          if (out.length <= room) return out;
          /* Drop the right-most droppable word, wherever it sits — "Кондиціонер
             інверторний Ardesto ARD-ACS09-I" carries its descriptor in the
             middle. Never the first word, which names the appliance. */
          let i = -1;
          for (let k = w.length - 1; k >= 1; k--) if (DROP.test(w[k])) { i = k; break; }
          if (i < 0) {
            /* Last resort before giving up on this form: Atlantic writes its
               packaging variant onto the end of the model code — D400S-2-BC.
               Nobody searches for the "-2-BC"; the shelf code stays whole in
               the heading, the specs and the schema, only the tab title
               loses it. */
            const v = w[w.length - 1].match(/^(.*\d.*)-\d+-[A-Z]{2,3}$/);
            if (!v) return null;
            w = w.slice(0, -1).concat(v[1]);
            continue;
          }
          if (w.length <= 2) return null;
          w = w.slice(0, i).concat(w.slice(i + 1));
        }
      };
      /* Best form that fits, richest first: price with the city, price alone,
         then the older "buy in Sumy" wording, then the bare name. */
      const forms = [
        n => t('pp_buy_price').replace('{name}', n).replace('{price}', price),
        n => t('pp_buy_price_only').replace('{name}', n).replace('{price}', price),
        n => t('pp_buy_t').replace('{name}', n) + (cat.install ? t('pp_buy_install') : ''),
        n => t('pp_buy_t').replace('{name}', n),
        n => t('pp_buy_short').replace('{name}', n),
        n => n,
      ];
      for (const f of forms) { const out = shorten(f); if (out) return out; }
      /* Nothing fits even as a bare name — a few long English boiler names.
         Trim what the list allows and let it overrun rather than handing back
         the untrimmed name, which is longer still. */
      let w = nm.split(' ');
      while (w.length > 2 && w.join(' ').length > room) {
        let i = -1;
        for (let k = w.length - 1; k >= 1; k--) if (DROP.test(w[k])) { i = k; break; }
        if (i < 0) break;
        w = w.slice(0, i).concat(w.slice(i + 1));
      }
      return w.join(' ');
    })(),
    /* The model, the city and the price must survive truncation; the trust
       lines are the tail Google cuts. Drop them one at a time until the whole
       description fits in the ~165 characters that actually get shown. */
    desc: (() => {
      const lead = `${nm} ${t('cat_in_sumy')} — ${fmt(p.price)} ${t('u_uah')}.${keySpec ? ' ' + keySpec + '.' : ''}`;
      const lines = trustLines.slice();
      while (lines.length && (lead + ' ' + lines.join('. ') + '.').length > 165) lines.pop();
      return lines.length ? `${lead} ${lines.join('. ')}.` : lead;
    })(),
    canonical: abs(purl(p)), altPath: `${cat.urlPrefix}/${p.slug}/`,
    ogTitle: NAME, ogImage: absImg('/assets/og/' + p.slug + '.jpg'), jsonld
  });
})()}
<script type="application/ld+json">${JSON.stringify(crumbs)}</script>
</head><body>${GTM_NS}
${HEADER}
<div class="pp-wrap" data-print-contact="${esc(`${site.phoneDisplay} · ${lf(site, 'address') || site.address} · ${BASE.replace(/^https?:\/\//, '')}`)}">
  <nav class="pp-bc"><a href="${pfx() || '/'}">${esc(t('pp_home'))}</a> › <a href="${curl(cat)}">${esc(lf(cat, 'name'))}</a> › <span>${esc(p.brand)}</span></nav>
  <div class="pp-top">
    <div class="pp-gallery">
      <div class="pp-main" onclick="ppZoom()" title="${esc(t('pp_zoom'))}"><img id="pp-main-img" src="${esc(av(p.photos[0]))}" alt="${esc(NAME)}" width="680" height="510"><span class="pp-zoom-hint" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M11 8v6M8 11h6"/></svg></span></div>
      <div class="pp-thumbs">${thumbs}</div>
    </div>
    <div class="pp-info">
      <a class="pp-brand" href="${pfx()}${cat.urlPrefix}/${brandSlug(p.brand)}/">${esc(p.brand)}</a>
      <h1 class="pp-title">${esc(NAME)}</h1>
      <div class="pp-chips">${chips}</div>
      <div class="pp-price">${fmt(p.price)} <span>${esc(t('u_uah'))}</span></div>
      <div class="pp-instal">${esc(t('pp_instal'))} <b>${fmt(Math.round(p.price / 24))} ${esc(t('pp_instal2'))}</b> ${esc(t('pp_instal3'))}</div>
      <div class="pp-cta">
        <button class="btn-primary" onclick="ppLead('${esc(NAME)}')">${esc(t('pp_order'))}</button>
        <a class="btn-wa" href="${esc(site.whatsapp)}&text=${encodeURIComponent(NAME)}" target="_blank" rel="noopener">WhatsApp</a>
        <a class="btn-ghost2" href="tel:${esc(site.phone)}">${esc(site.phoneDisplay)}</a>
      </div>
      <div class="pp-acts">
        <button class="pp-act" id="pp-cmp-btn" onclick="ppToggleCmp()">
          <svg viewBox="0 0 24 24"><path d="M3 6h7M14 6h7M6.5 6v12M17.5 6v12M3 12l3.5-6 3.5 6a3.5 3.5 0 0 1-7 0zM14 12l3.5-6 3.5 6a3.5 3.5 0 0 1-7 0z"/></svg>
          <span id="pp-cmp-lbl">${esc(t('pp_cmp_add'))}</span></button>
        <button class="pp-act" id="pp-fav-btn" onclick="ppToggleFav()">
          <svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
          <span id="pp-fav-lbl">${esc(t('pp_fav_add'))}</span></button>
        <div class="pp-share-wrap">
          <button class="pp-act" onclick="ppShare(event)" aria-haspopup="true" aria-expanded="false" id="pp-share-btn">
            <svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>
            <span>${esc(t('pp_share'))}</span></button>
          <div class="pp-share-menu" id="pp-share-menu" hidden>
            <a href="#" id="sh-vb" target="_blank" rel="noopener">Viber</a>
            <a href="#" id="sh-tg" target="_blank" rel="noopener">Telegram</a>
            <a href="#" id="sh-wa" target="_blank" rel="noopener">WhatsApp</a>
            <button type="button" onclick="ppCopyLink()">${esc(t('pp_copy'))}</button>
          </div>
        </div>
        <button class="pp-act" onclick="ppAsk()">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.7-.8 1.2v.6M12 17h.01"/></svg>
          <span>${esc(t('pp_ask'))}</span></button>
        <button class="pp-act pp-act-price" onclick="ppCheaper()">
          <svg viewBox="0 0 24 24"><path d="M12 2v20M17 6.5A4 4 0 0 0 13 4h-2a3.5 3.5 0 0 0 0 7h2a3.5 3.5 0 0 1 0 7h-2a4 4 0 0 1-4-2.5"/></svg>
          <span>${esc(t('pp_cheaper'))}</span></button>
      </div>
      <div class="pp-trust">${trustLines.map(x => `<span>${esc(x)}</span>`).join('')}<span>${esc(t('trust_np'))}</span><span><a href="/povernennya-tovaru/">${esc(t('trust_return'))}</a></span></div>
    </div>
  </div>
  <div class="pp-cols">
    <div class="pp-specs"><h2>${esc(t('pp_specs'))}</h2>
      <div class="pp-table-wrap" id="pp-table-wrap"><table class="pp-table">${specTable(p)}</table></div>
      <button class="pp-specs-more" id="pp-specs-more" onclick="ppSpecsToggle()" hidden>${esc(t('pp_specs_all'))}</button>
    </div>
    <div class="pp-desc"><h2>${esc(t('pp_desc'))}</h2><p>${esc(pdesc(p))}</p></div>
  </div>
  ${runtimeCalc(p)}
  ${(() => { const m = matching(p); return m.length ? `<div class="pp-related pp-match"><h2>${esc(t('pp_match_' + p.category))}</h2>${p.category === 'myyky' ? `<p class="pp-match-sub">${esc(t('pp_match_sub'))}</p>` : ''}<div class="grid grid-rel">${m.map(card).join('')}</div></div>` : ''; })()}
  ${(() => { const rel = related(p); return rel.length ? `<div class="pp-related"><h2>${esc(t('pp_related'))}</h2><div class="grid grid-rel">${rel.map(card).join('')}</div></div>` : ''; })()}
  <div class="recent" id="recent" data-nosnippet hidden><h2 class="recent-h">${esc(t('recent_h'))}</h2><div class="recent-row" id="recent-row"></div><button class="recent-clear" id="recent-clear" onclick="clearRecent()">${esc(t('recent_clear'))}</button></div>
  <div class="pp-back"><a href="${curl(cat)}">← ${esc(lf(cat, 'name'))}</a></div>
</div>
<div class="pp-sticky" id="pp-sticky">
  <div class="pps-info"><div class="pps-price">${fmt(p.price)} <span>${esc(t('u_uah'))}</span></div>
    <div class="pps-name">${esc(NAME)}</div></div>
  <button class="btn-primary pps-btn" onclick="ppLead('${esc(NAME)}')">${esc(t('pp_order'))}</button>
</div>
${FOOTER}
${injectData()}
<script src="${av('/assets/js/main.js')}" defer></script>
<div class="lbox" id="lbox" onclick="if(event.target.id==='lbox')ppClose()">
  <button class="lbox-x" onclick="ppClose()" aria-label="${esc(t('lb_close'))}">×</button>
  <button class="lbox-nav prev" onclick="ppStep(-1)" aria-label="${esc(t('lb_prev'))}">‹</button>
  <!-- No src until a photo is opened. src="" is not "no picture": the browser
       resolves it against the document and fetches the whole page again, on
       every product page, for an image nobody has asked to see yet. -->
  <figure class="lbox-fig"><img id="lbox-img" alt="${esc(NAME)}" width="900" height="900"></figure>
  <button class="lbox-nav next" onclick="ppStep(1)" aria-label="${esc(t('lb_next'))}">›</button>
  <div class="lbox-count"><span id="lbox-n">1</span> / ${p.photos.length}</div>
</div>
<script>
var PP_PHOTOS=${JSON.stringify(p.photos.map(av))},ppIdx=0;
function ppShow(i){ppIdx=i;document.getElementById('pp-main-img').src=PP_PHOTOS[i];document.querySelectorAll('.pp-thumb').forEach((b,j)=>b.classList.toggle('active',j===i));}
function ppZoom(){var b=document.getElementById('lbox');document.getElementById('lbox-img').src=PP_PHOTOS[ppIdx];document.getElementById('lbox-n').textContent=ppIdx+1;b.classList.add('open');document.body.style.overflow='hidden';}
function ppClose(){document.getElementById('lbox').classList.remove('open');document.body.style.overflow='';}
function ppStep(d){ppIdx=(ppIdx+d+PP_PHOTOS.length)%PP_PHOTOS.length;ppShow(ppIdx);document.getElementById('lbox-img').src=PP_PHOTOS[ppIdx];document.getElementById('lbox-n').textContent=ppIdx+1;}
document.addEventListener('keydown',function(e){if(!document.getElementById('lbox').classList.contains('open'))return;
  if(e.key==='Escape')ppClose();if(e.key==='ArrowRight')ppStep(1);if(e.key==='ArrowLeft')ppStep(-1);});
(function(){var sx=0,el=document.getElementById('lbox');
  el.addEventListener('touchstart',function(e){sx=e.touches[0].clientX;},{passive:true});
  el.addEventListener('touchend',function(e){var dx=e.changedTouches[0].clientX-sx;if(Math.abs(dx)>50)ppStep(dx<0?1:-1);},{passive:true});})();
function ppLead(name){ if(window.openCb){window.openCb(null,name,PP_SLUG);} else {location.href='tel:${esc(site.phone)}';} }

/* ---- compare / favourite / share / ask, driven by main.js state ---- */
var PP_SLUG=${JSON.stringify(p.slug)},PP_NAME=${JSON.stringify(NAME)};
function TT(k){return window.ppState?window.ppState.t(k):k;}
/* Favourites and comparison are keyed by slug, not by a position in the
   catalogue array — a position moves every time a product is added ahead of
   it. This page already knows its slug; ppState just hands it back. */
function ppKey(){return window.ppState?window.ppState.index(PP_SLUG):null;}
function ppSyncActs(){
  var i=ppKey(); if(!i||!window.ppState) return;
  var S=window.ppState,inC=S.inCmp(i),inF=S.inFav(i);
  var cb=document.getElementById('pp-cmp-btn'),fb=document.getElementById('pp-fav-btn');
  if(cb){cb.classList.toggle('on',inC);document.getElementById('pp-cmp-lbl').textContent=S.t(inC?'pp_cmp_in':'pp_cmp_add');}
  if(fb){fb.classList.toggle('on',inF);document.getElementById('pp-fav-lbl').textContent=S.t(inF?'pp_fav_in':'pp_fav_add');}
}
function ppToggleCmp(){var i=ppKey();if(!i)return;window.toggleCmp(i);ppSyncActs();}
function ppToggleFav(){var i=ppKey();if(!i)return;window.toggleFav(i);ppSyncActs();}
function ppShare(e){
  e.stopPropagation();
  var url=location.href,txt=PP_NAME+' — '+url;
  if(navigator.share){navigator.share({title:PP_NAME,url:url}).catch(function(){});return;}
  var m=document.getElementById('pp-share-menu');
  document.getElementById('sh-vb').href='viber://forward?text='+encodeURIComponent(txt);
  document.getElementById('sh-tg').href='https://t.me/share/url?url='+encodeURIComponent(url)+'&text='+encodeURIComponent(PP_NAME);
  document.getElementById('sh-wa').href='https://wa.me/?text='+encodeURIComponent(txt);
  m.hidden=!m.hidden;
  document.getElementById('pp-share-btn').setAttribute('aria-expanded',String(!m.hidden));
}
document.addEventListener('click',function(e){
  var m=document.getElementById('pp-share-menu');
  if(m&&!m.hidden&&!e.target.closest('.pp-share-wrap'))m.hidden=true;
});
function ppCopyLink(){
  var done=function(){document.getElementById('pp-share-menu').hidden=true;
    if(window.toast)window.toast(TT('pp_copied'));else alert(TT('pp_copied'));};
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(location.href).then(done,done);
  else{var ta=document.createElement('textarea');ta.value=location.href;document.body.appendChild(ta);ta.select();
       try{document.execCommand('copy');}catch(err){}ta.remove();done();}
}
function ppCheaper(){ if(window.openCb)window.openCb('cheaper',PP_NAME,PP_SLUG); }
function ppAsk(){ if(window.openCb)window.openCb('question',PP_NAME,PP_SLUG); }

/* ---- long spec tables collapse on phones ---- */
function ppSpecsToggle(){
  var w=document.getElementById('pp-table-wrap'),b=document.getElementById('pp-specs-more');
  var open=w.classList.toggle('open');
  b.textContent=TT(open?'pp_specs_less':'pp_specs_all');
}
(function(){
  var rows=document.querySelectorAll('.pp-table tr').length,b=document.getElementById('pp-specs-more');
  // only worth hiding when there is a real tail to hide
  if(b&&rows>8){document.getElementById('pp-table-wrap').classList.add('clip');b.hidden=false;}
})();

/* ---- runtime calculator (power stations) ---- */
function rtCalc(){
  var box=document.getElementById('pp-runtime'); if(!box) return;
  var wh=+box.dataset.wh, max=+box.dataset.max||0, w=0;
  box.querySelectorAll('input:checked').forEach(function(c){w+=+c.dataset.w;});
  var lo=document.getElementById('rt-load'),ti=document.getElementById('rt-time'),nt=document.getElementById('rt-note');
  lo.textContent=w?w+' '+TT('u_w'):'—';
  if(!w){ti.textContent='—';nt.textContent=TT('rt_pick');return;}
  if(max&&w>max){ti.textContent='—';nt.textContent=TT('rt_over');box.classList.add('over');return;}
  box.classList.remove('over');
  var hours=wh*0.85/w, h=Math.floor(hours), m=Math.round((hours-h)*60);
  if(m===60){h++;m=0;}
  ti.textContent=(h?h+' '+TT('rt_hr')+' ':'')+(m?m+' '+TT('rt_min'):(h?'':'0 '+TT('rt_min')));
  nt.textContent=TT('rt_note');
}

addEventListener('load',function(){ppSyncActs();rtCalc();});
</script>
</body></html>`;
}

for (const p of products) {
  const dir = outPath(catOf(p).urlPrefix.replace(/^\//, ''), p.slug);
  writePage(path.join(dir), productPage(p));
  SITEMAP.push(purl(p));
  n++;
}

// ---- category landing pages (generated only for categories that have products) ----
// reuse the homepage filter UI verbatim (same ids → main.js drives it unchanged)
FILTERS_HTML = (() => {
  const a = body.indexOf('<div class="filters" id="filters">');
  const b = body.indexOf('<div class="grid" id="catalog-grid">');
  return a === -1 || b === -1 ? '' : body.slice(a, b);
})();
function filtersFor(catKey) {
  if (!FILTERS_HTML) return '';
  const ac = catKey === 'kondicioneri', wm = catKey === 'pralni-mashyny', fr = catKey === 'holodylnyky',
        ps = catKey === 'zaryadni-stantsii', bl = catKey === 'boylery';
  return FILTERS_HTML
    .replace('id="frow-area" style="display:none"', `id="frow-area"${ac ? '' : ' style="display:none"'}`)
    .replace('id="frow-wm" style="display:none"', `id="frow-wm"${wm ? '' : ' style="display:none"'}`)
    .replace('id="frow-fr" style="display:none"', `id="frow-fr"${fr ? '' : ' style="display:none"'}`)
    .replace('id="frow-ps" style="display:none"', `id="frow-ps"${ps ? '' : ' style="display:none"'}`)
    .replace('id="frow-bl" style="display:none"', `id="frow-bl"${bl ? '' : ' style="display:none"'}`)
    .replace('<option value="area-asc"', `<option value="area-asc"${ac ? '' : ' hidden'}`);
}
/* Brand pages. People search "кондиціонер Ardesto Суми", not "каталог" — but a
   brand was only ever a filter here, with no address of its own to rank. Each
   brand that a category actually stocks gets a page at /<category>/<brand>/,
   built from the same data as everything else so it can never go stale. */
function catBrands(catKey) {
  return [...new Set(catProducts(catKey).map(p => p.brand))]
    .sort((a, b) => a.localeCompare(b, 'uk'));
}
/* Declarations, not arrow constants: the catalog panel in the header calls
   these before the page loop reaches this line. */
function burl(cat, brand) { return `${pfx()}${cat.urlPrefix}/${brandSlug(brand)}/`; }
/* A brand that is the whole shelf — every hob here is Gunter&Hauer, every water
   heater Atlantic — got a page identical to its category, product for product.
   Tag pages already refuse to exist past 90% of a category, "the definition of
   a duplicate"; brand pages were never held to it, and thirty of them sat in the
   sitemap as rivals to their own category. They stay online for anyone who has
   the address — search may already know them — but canonical, hreflang and the
   sitemap now send search to the category. */
function brandIsShelf(catKey, brand) {
  return catProducts(catKey).filter(p => p.brand === brand).length >= catProducts(catKey).length * TAG_MAX_SHARE;
}

/* ---- query landing pages ------------------------------------------------
   A brand has an address of its own, so "кондиціонер Ardesto Суми" has
   something to rank. The way people describe what they want — "чорна мийка",
   "індукційна поверхня", "витяжка 60 см" — did not: those were filter states
   with no URL. Each tag in categories.json names a filter over the category's
   own specs and gets a page.

   Two rules keep these from becoming spam. A tag needs at least three products,
   because two under a headline reads as a mistake. And a tag that matches
   almost the whole category is skipped: "мийки з нержавіючої сталі" matched all
   thirty-two, so its page would have been the category page under a different
   address, which is the definition of a duplicate. */
function tagMatch(p, m) {
  /* Half of what a shopper filters on is not in specs: area, btu and the
     inverter/heat-pump/No-Frost flags sit on the product itself, the way
     fmtVal already reads them. Without this fallback the five original
     categories could not have a tag page at all. */
  const v = (p.specs || {})[m.key] ?? p[m.key];
  if (m.is !== undefined) return Boolean(v) === m.is;
  if (v === undefined || v === null || v === '') return false;
  if (m.eq !== undefined) return String(v) === m.eq;
  if (m.has !== undefined) return String(v).toLowerCase().includes(m.has.toLowerCase());
  const n = parseFloat(String(v).replace(',', '.'));
  if (isNaN(n)) return false;
  if (m.min !== undefined && n < m.min) return false;
  if (m.max !== undefined && n > m.max) return false;
  return true;
}
function tagProducts(catKey, tag) { return catProducts(catKey).filter(p => tagMatch(p, tag.match)); }
function catTags(catKey) {
  const cat = CATS[catKey];
  const total = catProducts(catKey).length;
  return (cat.tags || []).filter(tg => {
    const n = tagProducts(catKey, tg).length;
    return n >= TAG_MIN && n < total * TAG_MAX_SHARE;
  });
}
function turl(cat, tg) { return `${pfx()}${cat.urlPrefix}/${tg.slug}/`; }

/* Tag and brand pages went out with the generic share card: the whole shop in
   a line-up, an air conditioner in the corner. Search is free to ignore
   og:image, and on these pages it did — but a card about hobs, on a page about
   hobs, named in both og:image and the JSON-LD, leaves it one fewer wrong answer.

   Each page names its own card and records what belongs on it; gen_images.py
   draws them from scripts/.og-collections.json in the same hand as the product
   cards. Until a card has been drawn the category's own card stands in, so no
   page ever points at a file that is not there. The photo is the page's first
   product, so the card and the top of the grid show the same thing. */
function collectionOg(kind, cat, key, list, title) {
  const file = `/assets/og/${kind}-${cat.key}-${key}${L === 'uk' ? '' : '-' + L}.jpg`;
  const prices = list.map(p => p.price);
  const lead = list.find(p => (p.photos || []).length) || list[0];
  COLLECTION_OG.set(file, {
    lang: L, cat: cat.key, title,
    lo: Math.min(...prices), hi: Math.max(...prices),
    count: `${list.length} ${modelsWord(list.length)} ${t('cat_instock')}`,
    trust: catTrust(cat).slice(0, 2).join(' · '),
    photo: lead && lead.photos ? lead.photos[0] : null,
  });
  if (fs.existsSync(path.join(ROOT, file.slice(1)))) return absImg(file);
  return cat.cover ? absImg(`/assets/og/cat-${cat.key}.jpg`) : undefined;
}
/* ---- "що є в наявності": the shelf in numbers --------------------------
   A tag or brand page was a heading, one sentence and a grid — under a hundred
   words of its own, and the same sentence shape on seventy pages. What a buyer
   comparing "кондиціонери на 35 м²" wants next is the spread: how big, how
   quiet, how many have a heat pump, which is the cheapest. Every figure here
   is read from products.json, so it is different on every page and cannot
   drift from the grid above it — nothing is typed in by hand. */
const FACT_RANGES = {
  kondicioneri: [
    { key: 'area', label: 'Площа приміщення', label_ru: 'Площадь помещения', label_en: 'Room size', unit: 'м²', unit_en: 'm²' },
    { key: 'btu', label: 'Потужність', label_ru: 'Мощность', label_en: 'Capacity', unit: 'BTU' },
    { key: 'noise', label: 'Шум на найнижчій швидкості', label_ru: 'Шум на минимальной скорости', label_en: 'Noise at the lowest fan speed', unit: 'дБ', unit_en: 'dB' },
  ],
  'pralni-mashyny': [
    { key: 'load_kg', label: 'Завантаження', label_ru: 'Загрузка', label_en: 'Drum load', unit: 'кг', unit_en: 'kg' },
    { key: 'depth', label: 'Глибина', label_ru: 'Глубина', label_en: 'Depth', unit: 'см', unit_en: 'cm' },
    { key: 'rpm', label: 'Віджим', label_ru: 'Отжим', label_en: 'Spin', unit: 'об/хв', unit_ru: 'об/мин', unit_en: 'rpm' },
  ],
  holodylnyky: [
    { key: 'volume_l', label: 'Загальний об’єм', label_ru: 'Общий объём', label_en: 'Total volume', unit: 'л', unit_en: 'l' },
    { key: 'height_cm', label: 'Висота', label_ru: 'Высота', label_en: 'Height', unit: 'см', unit_en: 'cm' },
  ],
  boylery: [
    { key: 'volume_l', label: 'Об’єм бака', label_ru: 'Объём бака', label_en: 'Tank size', unit: 'л', unit_en: 'l' },
    { key: 'power_w', label: 'Потужність ТЕНа', label_ru: 'Мощность ТЭНа', label_en: 'Element power', unit: 'Вт', unit_en: 'W' },
  ],
  'zaryadni-stantsii': [
    { key: 'capacity_wh', label: 'Ємність', label_ru: 'Ёмкость', label_en: 'Capacity', unit: 'Вт·год', unit_ru: 'Вт·ч', unit_en: 'Wh' },
    { key: 'output_w', label: 'Вихідна потужність', label_ru: 'Выходная мощность', label_en: 'Output', unit: 'Вт', unit_en: 'W' },
  ],
  'duhovi-shafy': [
    { key: 'volume_l', label: 'Об’єм камери', label_ru: 'Объём камеры', label_en: 'Cavity', unit: 'л', unit_en: 'l' },
    { key: 'functions', label: 'Режимів', label_ru: 'Режимов', label_en: 'Cooking modes', unit: '' },
  ],
  'varylni-poverhni': [
    { key: 'width_cm', label: 'Ширина', label_ru: 'Ширина', label_en: 'Width', unit: 'см', unit_en: 'cm' },
    { key: 'burners', label: 'Конфорок', label_ru: 'Конфорок', label_en: 'Cooking zones', unit: '' },
  ],
  vytyazhky: [
    { key: 'airflow', label: 'Продуктивність', label_ru: 'Производительность', label_en: 'Extraction', unit: 'м³/год', unit_ru: 'м³/ч', unit_en: 'm³/h' },
    { key: 'noise_db', label: 'Рівень шуму', label_ru: 'Уровень шума', label_en: 'Noise', unit: 'дБ', unit_en: 'dB' },
    { key: 'width_cm', label: 'Ширина', label_ru: 'Ширина', label_en: 'Width', unit: 'см', unit_en: 'cm' },
  ],
  myyky: [
    { key: 'width_cm', label: 'Ширина', label_ru: 'Ширина', label_en: 'Width', unit: 'см', unit_en: 'cm' },
    { key: 'depth_mm', label: 'Глибина чаші', label_ru: 'Глубина чаши', label_en: 'Bowl depth', unit: 'мм', unit_en: 'mm' },
  ],
  zmishuvachi: [
    { key: 'height_mm', label: 'Висота', label_ru: 'Высота', label_en: 'Height', unit: 'мм', unit_en: 'mm' },
    { key: 'spout_l_mm', label: 'Виліт носика', label_ru: 'Вылет излива', label_en: 'Spout reach', unit: 'мм', unit_en: 'mm' },
  ],
  'posudomyyni-mashyny': [
    { key: 'sets', label: 'Комплектів посуду', label_ru: 'Комплектов посуды', label_en: 'Place settings', unit: '' },
    { key: 'noise_db', label: 'Рівень шуму', label_ru: 'Уровень шума', label_en: 'Noise', unit: 'дБ', unit_en: 'dB' },
  ],
  'mikrohvylovi-pechi': [
    { key: 'volume_l', label: 'Об’єм камери', label_ru: 'Объём камеры', label_en: 'Cavity', unit: 'л', unit_en: 'l' },
    { key: 'power_mw', label: 'Потужність мікрохвиль', label_ru: 'Мощность микроволн', label_en: 'Microwave power', unit: 'Вт', unit_en: 'W' },
  ],
  dozatory: [
    { key: 'volume_ml', label: 'Об’єм пляшки', label_ru: 'Объём бутылки', label_en: 'Bottle', unit: 'мл', unit_en: 'ml' },
  ],
};
/* Flags that sit on the product itself (see tagMatch): a count only means
   something against the total, so it is always written as "5 з 14". */
const FACT_FLAGS = {
  kondicioneri: [
    { key: 'inverter', label: 'Інверторні', label_ru: 'Инверторные', label_en: 'Inverter' },
    { key: 'heatpump', label: 'З тепловим насосом', label_ru: 'С тепловым насосом', label_en: 'With a heat pump' },
    { key: 'wifi', label: 'З Wi-Fi', label_ru: 'С Wi-Fi', label_en: 'With Wi-Fi' },
  ],
  holodylnyky: [
    { key: 'nofrost', label: 'З No Frost', label_ru: 'С No Frost', label_en: 'No Frost' },
    { key: 'inverter', label: 'З інверторним компресором', label_ru: 'С инверторным компрессором', label_en: 'Inverter compressor' },
  ],
  'pralni-mashyny': [
    { key: 'inverter', label: 'З інверторним мотором', label_ru: 'С инверторным мотором', label_en: 'Inverter motor' },
  ],
  'zaryadni-stantsii': [
    { key: 'ups', label: 'З режимом ДБЖ (UPS)', label_ru: 'С режимом ИБП (UPS)', label_en: 'With UPS mode' },
  ],
};
const factNum = p => k => {
  const v = (p.specs || {})[k] ?? p[k];
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(n) ? null : n;
};
const numOut = n => Number.isInteger(n) ? fmt(n) : String(n).replace('.', L === 'en' ? '.' : ',');
/* extra: a line of <a> links the page adds of its own — the brands in a tag,
   or the tags a brand turns up in. */
function shelfFacts(cat, list, name, extra) {
  const rows = [];
  if (list.length >= 2) {
    const byPrice = list.slice().sort((a, b) => a.price - b.price);
    const lo = byPrice[0], hi = byPrice[byPrice.length - 1];
    const link = p => `<a href="${purl(p)}">${esc(pname(p))}</a>`;
    rows.push(`<li><b>${esc(t('f_cheap'))}:</b> ${link(lo)} <span class="sf-p">— ${fmt(lo.price)} ${esc(t('u_uah'))}</span></li>`);
    if (hi.price > lo.price) rows.push(`<li><b>${esc(t('f_dear'))}:</b> ${link(hi)} <span class="sf-p">— ${fmt(hi.price)} ${esc(t('u_uah'))}</span></li>`);
  }
  for (const f of FACT_RANGES[cat.key] || []) {
    const vals = list.map(p => factNum(p)(f.key)).filter(v => v !== null);
    if (vals.length < Math.max(1, Math.ceil(list.length / 2))) continue;   // too patchy to summarise
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const u = lf(f, 'unit') ? ' ' + lf(f, 'unit') : '';
    const val = lo === hi ? `${numOut(lo)}${u}`
      : t('f_range').replace('{lo}', numOut(lo)).replace('{hi}', numOut(hi)).replace('{u}', u);
    rows.push(`<li><b>${esc(lf(f, 'label'))}:</b> ${esc(val)}</li>`);
  }
  for (const f of FACT_FLAGS[cat.key] || []) {
    const n = list.filter(p => p[f.key]).length;
    if (!n) continue;
    rows.push(`<li><b>${esc(lf(f, 'label'))}:</b> ${n === list.length ? esc(t('f_every')) : `${n} ${esc(t('f_of'))} ${list.length}`}</li>`);
  }
  if (extra) rows.push(extra);
  if (rows.length < 2) return '';
  return `<section class="shelf-facts">
    <h2>${esc(t('f_h').replace('{name}', name))}</h2>
    <ul>${rows.join('')}</ul>
  </section>`;
}
function tagPage(cat, tg) {
  const list = tagProducts(cat.key, tg);
  const CAT = lf(cat, 'name');
  const NAME = lf(tg, 'h1');
  const prices = list.map(p => p.price);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const plural = modelsWord(list.length);
  const priceText = t(lo === hi ? 'brand_price_one' : 'brand_price_range')
    .replace('{lo}', fmt(lo)).replace('{hi}', fmt(hi));
  const fill = str => str.replace('{name}', NAME).replace('{n}', list.length)
    .replace('{plural}', plural).replace('{price}', priceText);
  const OG = collectionOg('tag', cat, tg.slug, list, `${NAME} ${t('cat_in_sumy')}`);
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: NAME, url: abs(turl(cat, tg)), image: OG,
    mainEntity: {
      '@type': 'ItemList', numberOfItems: list.length,
      itemListElement: list.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(purl(p)), name: pname(p) }))
    }
  };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: t('pp_home'), item: abs(pfx() + '/') },
    { '@type': 'ListItem', position: 2, name: CAT, item: abs(curl(cat)) },
    { '@type': 'ListItem', position: 3, name: NAME, item: abs(turl(cat, tg)) } ] };
  const siblings = catTags(cat.key).filter(x => x.slug !== tg.slug)
    .map(x => `<a class="bl-chip" href="${turl(cat, x)}">${esc(lf(x, 'label'))}</a>`).join('');
  // which brands make up this selection, each linked to its own shelf
  const tagBrands = [...new Set(list.map(p => p.brand))].sort((a, b) => a.localeCompare(b, 'uk'));
  const brandsRow = tagBrands.length > 1 ? `<li><b>${esc(t('f_brands'))}:</b> ` + tagBrands.map(b => {
    const n = list.filter(p => p.brand === b).length;
    const label = `${esc(b)} (${n})`;
    return brandIsShelf(cat.key, b) ? label : `<a href="${burl(cat, b)}">${label}</a>`;
  }).join(', ') + '</li>' : '';
  return `<!doctype html><html lang="${L}" data-season="${SEASON}"><head>
${head({
  title: (() => {
    const full = fill(t('tag_seo_t'));
    const room = 65 - TITLE_SUFFIX.length;
    return full.length <= room ? full : NAME;
  })(),
  /* The lead alone is about seventy characters, which is right on the floor of
     what Google will show. Add as much of the intro as fits — the whole thing,
     else its first sentence — rather than dropping it and leaving a stub. */
  desc: (() => {
    const lead = fill(t('tag_seo_d'));
    const extra = (lf(tg, 'intro') || '').trim();
    const first = extra.split(/(?<=\.)\s+/)[0] || '';
    // a one-sentence intro that is too long leaves nothing to fall back on;
    // the first tip is the next most useful line for the snippet
    const tip = (lf(tg, 'tips') || '').trim().split(/(?<=\.)\s+/)[0] || '';
    for (const tail of [extra, first, tip, '']) {
      const cand = `${lead} ${tail}`.trim();
      if (cand.length <= 165) return cand;
    }
    return lead;
  })(),
  canonical: abs(turl(cat, tg)), altPath: `${cat.urlPrefix}/${tg.slug}/`, ogImage: OG, jsonld
})}
<script type="application/ld+json">${JSON.stringify(crumbs)}</script>
</head><body>${GTM_NS}
${HEADER}
<div class="cat-wrap">
  <nav class="pp-bc"><a href="${pfx() || '/'}">${esc(t('pp_home'))}</a> › <a href="${curl(cat)}">${esc(CAT)}</a> › <span>${esc(NAME)}</span></nav>
  <header class="cat-head">
    <h1 class="cat-h1">${esc(NAME)} ${esc(t('cat_in_sumy'))}</h1>
    <p class="cat-sub">${esc(lf(tg, 'intro') || '')}</p>
    <div class="cat-count">${list.length} ${esc(plural)} ${esc(t('cat_instock'))}</div>
  </header>
  <div class="recent" id="recent" data-nosnippet hidden><h2 class="recent-h">${esc(t('recent_h'))}</h2><div class="recent-row" id="recent-row"></div><button class="recent-clear" id="recent-clear" onclick="clearRecent()">${esc(t('recent_clear'))}</button></div>
  <section class="section catalog cat-catalog" id="catalog">
    <div class="grid" id="catalog-grid">${list.map(card).join('')}</div>
  </section>
  ${shelfFacts(cat, list, NAME, brandsRow)}
  ${lf(tg, 'tips') ? `<section class="tag-tips"><h2>${esc(t('tips_h').replace('{name}', NAME.charAt(0).toLowerCase() + NAME.slice(1)))}</h2>` +
    `<p>${esc(lf(tg, 'tips'))}</p></section>` : ''}
  ${siblings ? `<div class="brand-links"><h2>${esc(t('tag_other'))}</h2><div class="bl-row">${siblings}</div></div>` : ''}
  <div class="pp-back"><a href="${curl(cat)}">← ${esc(CAT)}</a></div>
</div>
${FOOTER}
${injectData()}
<script>window.__CATALOG_CAT__=${JSON.stringify(cat.key)};window.__TAG__=${JSON.stringify(tg.match)};</script>
<script src="${av('/assets/js/main.js')}" defer></script>
</body></html>`;
}

function brandPage(cat, brand) {
  const list = catProducts(cat.key).filter(p => p.brand === brand);
  const CAT = lf(cat, 'name');
  const NAME = `${CAT} ${brand}`;
  const prices = list.map(p => p.price);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const plural = modelsWord(list.length);
  // a brand with one model would otherwise read "від 83 999 до 83 999 грн"
  const priceKey = lo === hi ? 'brand_price_one' : 'brand_price_range';
  const priceText = t(priceKey).replace('{lo}', fmt(lo)).replace('{hi}', fmt(hi));
  const fill = str => str
    .replace('{brand}', brand).replace('{cat}', (lf(cat, 'nameGen') || CAT).toLowerCase())
    .replace('{n}', list.length).replace('{plural}', plural)
    .replace('{price}', priceText).replace('{from}', fmt(lo));
  /* People type the brand the way it sounds — "бош суми", "стиральная машина
     либертон", "грифон" — and a page that only ever spells it in Latin letters
     does not match. The Cyrillic spelling goes into the intro and the snippet;
     the title keeps the Latin name, which is what the rest of the page shows. */
  const alias = (BRANDS[brand] || {})['alias_' + L];
  const fillA = str => fill(str.replace('{brand}', alias ? `${brand} (${alias})` : brand));
  const intro = fillA(t('brand_intro'));
  const OG = collectionOg('brand', cat, brandSlug(brand), list, `${NAME} ${t('cat_in_sumy')}`);
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: NAME, url: abs(burl(cat, brand)), image: OG,
    about: { '@type': 'Brand', name: brand },
    mainEntity: {
      '@type': 'ItemList', numberOfItems: list.length,
      itemListElement: list.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(purl(p)), name: pname(p) }))
    }
  };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: t('pp_home'), item: abs(pfx() + '/') },
    { '@type': 'ListItem', position: 2, name: CAT, item: abs(curl(cat)) },
    { '@type': 'ListItem', position: 3, name: brand, item: abs(burl(cat, brand)) } ] };
  // a couple of sentences about the brand itself, if we have them
  const about = (BRANDS[brand] || {})[L] || (BRANDS[brand] || {}).uk || '';
  const siblings = catBrands(cat.key).filter(b => b !== brand)
    .map(b => `<a class="bl-chip" href="${burl(cat, b)}">${esc(b)}</a>`).join('');
  // the selections this brand turns up in: "Ardesto на 25 м²" is one click away
  const inTags = catTags(cat.key).map(tg => [tg, tagProducts(cat.key, tg).filter(p => p.brand === brand).length])
    .filter(([, n]) => n);
  const tagsRow = inTags.length ? `<li><b>${esc(t('f_tags'))}:</b> ` +
    inTags.map(([tg, n]) => `<a href="${turl(cat, tg)}">${esc(lf(tg, 'label'))}</a> (${n})`).join(', ') + '</li>' : '';
  return `<!doctype html><html lang="${L}" data-season="${SEASON}"><head>
${head({
  /* head() already puts "TexnoPlaza" in front, so the "| TexnoPlaza" the
     template ends with goes first — otherwise its 13 characters count against
     the budget and every brand page overflows. What is left is "<brand> у
     Сумах — ціни, наявність, доставка"; the promises after the dash are the
     expendable part, so drop them one at a time until the line fits. */
  title: (() => {
    const full = fill(t('brand_seo_t').replace('{name}', NAME))
      .replace(/\s*[|·—–-]\s*TexnoPlaza\s*$/i, '').trim();
    const room = 65 - TITLE_SUFFIX.length;
    if (full.length <= room) return full;
    const m = full.match(/^(.*?)\s+—\s+(.*)$/);
    if (!m) return full;
    const promises = m[2].split(/,\s*/);
    while (promises.length > 1) {
      promises.pop();
      const cand = `${m[1]} — ${promises.join(', ')}`;
      if (cand.length <= room) return cand;
    }
    return m[1];                        // just "<brand> у Сумах"
  })(),
  /* The tail is a fixed list of promises, so a long brand name or a wide price
     range pushes the whole line past what Google shows. Drop promises from the
     end until it fits — the brand, the count and the price come first. */
  desc: (() => {
    const lead = fillA(t('brand_seo_d'));
    const lines = catTrust(cat).slice();
    while (lines.length && `${lead} ${lines.join('. ')}.`.length > 165) lines.pop();
    return lines.length ? `${lead} ${lines.join('. ')}.` : lead;
  })(),
  canonical: brandIsShelf(cat.key, brand) ? abs(curl(cat)) : abs(burl(cat, brand)),
  altPath: brandIsShelf(cat.key, brand) ? `${cat.urlPrefix}/` : `${cat.urlPrefix}/${brandSlug(brand)}/`, ogImage: OG, jsonld
})}
<script type="application/ld+json">${JSON.stringify(crumbs)}</script>
</head><body>${GTM_NS}
${HEADER}
<div class="cat-wrap">
  <nav class="pp-bc"><a href="${pfx() || '/'}">${esc(t('pp_home'))}</a> › <a href="${curl(cat)}">${esc(CAT)}</a> › <span>${esc(brand)}</span></nav>
  <header class="cat-head">
    <h1 class="cat-h1">${esc(NAME)} ${esc(t('cat_in_sumy'))}</h1>
    <p class="cat-sub">${esc(intro)}</p>
    <div class="cat-count">${list.length} ${esc(plural)} ${esc(t('cat_instock'))}</div>
  </header>
  ${about ? `<div class="brand-about"><p>${esc(about)}</p></div>` : ''}
  ${lf(cat, 'quizCta') && list.length > 1 ? quizInline(false, cat) : ''}
  <div class="recent" id="recent" data-nosnippet hidden><h2 class="recent-h">${esc(t('recent_h'))}</h2><div class="recent-row" id="recent-row"></div><button class="recent-clear" id="recent-clear" onclick="clearRecent()">${esc(t('recent_clear'))}</button></div>
  <section class="section catalog cat-catalog" id="catalog">
    <div class="grid" id="catalog-grid">${list.map(card).join('')}</div>
  </section>
  ${shelfFacts(cat, list, NAME, tagsRow)}
  ${siblings ? `<div class="brand-links"><h2>${esc(t('brand_other').replace('{cat}', (lf(cat, 'nameGen') || CAT).toLowerCase()))}</h2><div class="bl-row">${siblings}</div></div>` : ''}
  <div class="pp-back"><a href="${curl(cat)}">← ${esc(CAT)}</a></div>
</div>
${FOOTER}
${injectData()}
<script>window.__CATALOG_CAT__=${JSON.stringify(cat.key)};window.__BRAND__=${JSON.stringify(brand)};</script>
<script src="${av('/assets/js/main.js')}" defer></script>
</body></html>`;
}

/* The articles that answer what someone browsing this category is weighing up.
   Each one names its category in data/blog.json, so this is a lookup rather
   than the slug-pattern guessing it replaces: a new article reaches the right
   category page by filling in one field, and can never land on the wrong one. */
/* An article always has a shelf behind it. Falls back to air conditioners only
   so an article added without the field still renders something sensible. */
const artCat = a => CATS[a.cat] || CATS['kondicioneri'];
/* A reader who has just worked out what to look for should not have to go
   hunting for the shelf, so the article ends on products from its own category,
   in the order the catalogue itself shows them. Three, because that is what
   .grid-rel lays out in one row and what the product pages already show. */
function artProducts(a) {
  const cat = artCat(a);
  const list = mixedOrder(catProducts(a.cat)).slice(0, 3);
  if (!list.length) return '';
  return `<section class="bl-prods">
    <h2>${esc(t('bl_prods_h'))}</h2>
    <div class="grid grid-rel">${list.map(card).join('')}</div>
    <a class="bl-prods-all" href="${curl(cat)}">${esc(t('bl_prods_all'))} ${esc(lf(cat, 'name').toLowerCase())} →</a>
  </section>`;
}
function catArticles(catKey) {
  // English has no articles, and a translated page must not offer headlines
  // in a language the reader did not choose
  if (!BLOG_LANGS.includes(L)) return '';
  const list = blog.filter(a => a.cat === catKey).slice(0, 3);
  if (!list.length) return '';
  return `<div class="cat-reads">
    <h2>${esc(t('cat_reads'))}</h2>
    <div class="cr-row">${list.map(a => `<a class="cr-card" href="${blogUrl(a)}">
      <span class="cr-tag">${esc(bg(a))}</span>
      <span class="cr-t">${esc(bt(a))}</span>
      <span class="cr-d">${esc(bd(a))}</span></a>`).join('')}</div>
  </div>`;
}

/* Questions that belong to one shelf rather than to the shop. The homepage FAQ
   answers what everybody asks — delivery, payment, warranty — and none of what
   someone typing "скільки тримає акумулятор" wants to know, so a category can
   carry its own list and it renders here, in the same accordion.

   No data-topic on these items on purpose: the topic filter on the homepage
   hides every .faq-item[data-topic] that is not the active tab, and a category
   page has no tabs for it to be filtered by.

   subCounts runs over the text so a price inside an answer is written as
   {{KT_FROM}} and cannot drift from products.json the way a typed number would. */
const catFaq = cat => {
  const list = lf(cat, 'faq');
  return Array.isArray(list) ? list.filter(it => Array.isArray(it) && it.length >= 2) : [];
};
function catFaqBlock(cat) {
  const items = catFaq(cat);
  if (!items.length) return '';
  return `<section class="section faq cat-faq" id="cat-faq">
    <h2 class="cat-faq-h">${esc(t('cat_faq_h'))}</h2>
    <div class="faq-list">
      ${items.map((it, i) =>
        `<div class="faq-item reveal" style="transition-delay:${Math.min(i, 6) * 45}ms">` +
        `<div class="faq-q" onclick="toggleFaq(this)">${esc(subCounts(it[0]))}</div>` +
        `<div class="faq-a">${esc(subCounts(it[1]))}</div></div>`).join('\n      ')}
    </div>
  </section>`;
}
function catFaqLd(cat) {
  const items = catFaq(cat);
  if (!items.length) return '';
  return `
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: items.map(it => ({ '@type': 'Question', name: subCounts(it[0]),
      acceptedAnswer: { '@type': 'Answer', text: subCounts(it[1]) } })),
  })}</script>`;
}
function categoryPage(cat) {
  const list = catProducts(cat.key);
  const NAME = lf(cat, 'name');
  const plural = modelsWord(list.length);
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: NAME, url: abs(curl(cat)),
    image: cat.cover ? absImg(`/assets/og/cat-${cat.key}.jpg`) : undefined,
    mainEntity: { '@type': 'ItemList', numberOfItems: list.length, itemListElement: list.slice(0, 20).map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(purl(p)) })) }
  };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: t('pp_home'), item: abs(pfx() + '/') },
    { '@type': 'ListItem', position: 2, name: NAME, item: abs(curl(cat)) } ] };
  return `<!doctype html><html lang="${L}" data-season="${SEASON}"><head>
${head({
  title: subCounts(lf(cat, 'seoTitle') || t('seo_cat_t').replace('{name}', NAME)),
  /* The brand list and the ranges inside this line grow with the catalogue, so
     the sentence can outgrow the ~165 characters Google shows. Drop trailing
     sentences until it fits rather than letting it be cut mid-word. */
  desc: (() => {
    let s = subCounts(lf(cat, 'seoDesc') || lf(cat, 'intro')
      || `${NAME} ${t('cat_in_sumy')}: ${list.length} ${plural} ${t('cat_instock')}.`);
    while (s.length > 165) {
      const cut = s.slice(0, -1).lastIndexOf('. ');
      if (cut < 60) break;
      s = s.slice(0, cut + 1);
    }
    return s;
  })(),
  canonical: abs(curl(cat)), altPath: cat.urlPrefix + '/',
  /* Every category used to share one generic share card, so a link to
     "Кондиціонери у Сумах" in Viber showed the same picture as a link to
     boilers. Each category now has its own. */
  ogImage: cat.cover ? absImg(`/assets/og/cat-${cat.key}.jpg`) : undefined, jsonld
})}
<script type="application/ld+json">${JSON.stringify(crumbs)}</script>${catFaqLd(cat)}
</head><body>${GTM_NS}
${HEADER}
<div class="cat-wrap">
  <nav class="pp-bc"><a href="${pfx() || '/'}">${esc(t('pp_home'))}</a> › <span>${esc(NAME)}</span></nav>
  <div class="cat-top">
    <header class="cat-head">
      <h1 class="cat-h1">${esc(lf(cat, 'h1') || `${NAME} ${t('cat_in_sumy')}`)}</h1>
      <p class="cat-sub">${esc(lf(cat, 'intro') || '')}</p>
      <div class="cat-count">${list.length} ${esc(plural)} ${esc(t('cat_instock'))}</div>
    </header>
    ${cat.cover ? (() => {
      const w = n => esc(av(cat.cover.replace(/\.webp$/, `@${n}.webp`)));
      return `<img class="cat-hero" src="${esc(av(cat.cover))}" srcset="${w(400)} 400w, ${esc(av(cat.cover))} 800w, ${w(1200)} 1200w"` +
        ` sizes="(max-width:860px) 94vw, 44vw" alt="${esc(lf(cat, 'coverAlt') || NAME)}" width="800" height="340" fetchpriority="high" decoding="async">`;
    })() : ''}
  </div>
  ${lf(cat, 'quizCta') ? quizInline(false, cat) : ''}
  <div class="recent" id="recent" data-nosnippet hidden><h2 class="recent-h">${esc(t('recent_h'))}</h2><div class="recent-row" id="recent-row"></div><button class="recent-clear" id="recent-clear" onclick="clearRecent()">${esc(t('recent_clear'))}</button></div>
  <section class="section catalog cat-catalog" id="catalog">
    ${filtersFor(cat.key)}
    <div class="grid" id="catalog-grid">${list.map(card).join('')}</div>
  </section>
  ${catTags(cat.key).length ? `<div class="brand-links cat-tags"><h2>${esc(t('cat_tags_h'))}</h2>` +
    `<div class="bl-row">` + catTags(cat.key).map(tg =>
      `<a class="bl-chip" href="${turl(cat, tg)}">${esc(lf(tg, 'label'))}</a>`).join('') +
    `</div></div>` : ''}
  ${cat.illustration ? `<figure class="cat-art">` +
    `<img src="${esc(av(cat.illustration))}" srcset="${esc(av(cat.illustration))} 800w, ` +
    `${esc(av(cat.illustration.replace(/\.webp$/, '@1200.webp')))} 1200w" ` +
    `sizes="(max-width:1000px) 94vw, 960px" alt="${esc(lf(cat, 'illustrationAlt') || NAME)}" ` +
    `width="1200" height="675" loading="lazy" decoding="async"></figure>` : ''}
  ${catFaqBlock(cat)}
  ${catArticles(cat.key)}
  <div class="pp-back"><a href="${pfx() || '/'}#catalog">← ${esc(t('pp_back_all'))}</a></div>
</div>
${FOOTER}
${injectData()}
<script>window.__CATALOG_CAT__=${JSON.stringify(cat.key)};</script>
<script src="${av('/assets/js/main.js')}" defer></script>
</body></html>`;
}
for (const cat of catList) {
  if (!catProducts(cat.key).length) continue;   // skip empty categories (no thin pages)
  const dir = outPath(cat.urlPrefix.replace(/^\//, ''));
  writePage(path.join(dir), categoryPage(cat));
  SITEMAP.push(curl(cat));

  /* Brand pages live beside the product pages in the same directory, so a brand
     whose slug matched a product slug would silently overwrite that product.
     Fail the build instead of shipping a missing page. */
  for (const brand of catBrands(cat.key)) {
    const slug = brandSlug(brand);
    const clash = catProducts(cat.key).find(p => p.slug === slug);
    if (clash) throw new Error(`brand page /${cat.urlPrefix}/${slug}/ collides with product ${clash.slug}`);
    const bdir = outPath(cat.urlPrefix.replace(/^\//, ''), slug);
    writePage(path.join(bdir), brandPage(cat, brand));
    if (!brandIsShelf(cat.key, brand)) SITEMAP.push(burl(cat, brand));
    n++;
  }

  /* Query pages share the directory with products and brands, so the same
     collision check applies — a silent overwrite would take a product page
     off the site. */
  const taken = new Set([...catProducts(cat.key).map(p => p.slug),
                         ...catBrands(cat.key).map(brandSlug)]);
  for (const tg of catTags(cat.key)) {
    if (taken.has(tg.slug)) {
      throw new Error(`tag page ${cat.urlPrefix}/${tg.slug}/ collides with an existing page`);
    }
    const tdir = outPath(cat.urlPrefix.replace(/^\//, ''), tg.slug);
    writePage(path.join(tdir), tagPage(cat, tg));
    SITEMAP.push(turl(cat, tg));
    n++;
  }
}

// ---- blog ----
function blogCard(a) {
  return `<a class="bl-card${a.cover ? ' has-cover' : ''}" data-tag="${esc(bg(a))}" href="${blogUrl(a)}">
    ${a.cover ? `<img class="bl-cover" src="${esc(av(a.cover))}" alt="" width="800" height="450" loading="lazy" decoding="async">` : ''}
    <div class="bl-chips"><span class="bl-tag">${esc(bg(a))}</span><span class="bl-ccat">${esc(lf(artCat(a), 'name'))}</span></div>
    <h2 class="bl-card-t">${esc(bt(a))}</h2>
    <p class="bl-card-d">${esc(bd(a))}</p>
    <span class="bl-more">${esc(t("blog_more"))}</span></a>`;
}
/* The index was the one page type with no structured data at all: search saw
   a list of links, not a blog with dated posts by the shop. */
function blogIndexPage() {
  const jsonld = { '@context': 'https://schema.org', '@type': 'Blog', name: t('blog_h1'), description: t('seo_blog_d'),
    url: abs(pfx() + '/blog/'), inLanguage: L,
    publisher: { '@type': 'Organization', '@id': BASE + '/#store', name: site.name },
    blogPost: blog.map(a => ({ '@type': 'BlogPosting', headline: bt(a), url: abs(blogUrl(a)),
      datePublished: a.date, dateModified: a.updated || a.date })) };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: t('pp_home'), item: abs(pfx() + '/') },
    { '@type': 'ListItem', position: 2, name: t('nav_blog'), item: abs(pfx() + '/blog/') } ] };
  return `<!doctype html><html lang="${L}" data-season="${SEASON}"><head>
${head({ title: t('seo_blog_t'), desc: t('seo_blog_d'), canonical: abs(pfx() + '/blog/'), altPath: '/blog/', altLangs: BLOG_LANGS, jsonld })}
<script type="application/ld+json">${JSON.stringify(crumbs)}</script>
</head><body>${GTM_NS}
${HEADER}
<div class="pp-wrap">
  <nav class="pp-bc"><a href="${pfx() + '/'}">${esc(t("pp_home"))}</a> › <span>${esc(t("nav_blog"))}</span></nav>
  <h1 class="bl-h1">${esc(t("blog_h1"))}</h1>
  <p class="bl-sub">${esc(t("blog_sub"))}</p>
  <div class="bl-tags" id="bl-tags">
    <button class="bl-tbtn active" data-tag="all">${esc(t('blog_all'))}</button>
    ${[...new Set(blog.map(bg))].map(tg => `<button class="bl-tbtn" data-tag="${esc(tg)}">${esc(tg)}</button>`).join('')}
  </div>
  <div class="bl-grid" id="bl-grid">${blog.map(blogCard).join('')}</div>
  <div class="recent" id="recent" data-nosnippet hidden><h2 class="recent-h">${esc(t('recent_h'))}</h2><div class="recent-row" id="recent-row"></div><button class="recent-clear" id="recent-clear" onclick="clearRecent()">${esc(t('recent_clear'))}</button></div>
</div>
${FOOTER}
${injectData()}
<script src="${av('/assets/js/main.js')}" defer></script>
</body></html>`;
}
function blogPost(a) {
  const others = blog.filter(x => x.slug !== a.slug).slice(0, 3);
  const jsonld = { '@context': 'https://schema.org', '@type': 'Article', headline: bt(a), description: bd(a),
    datePublished: a.date, dateModified: a.updated || a.date, author: { '@type': 'Organization', name: site.name },
    publisher: { '@type': 'Organization', name: site.name, logo: { '@type': 'ImageObject', url: absImg('/assets/icons/icon-512.png') } },
    mainEntityOfPage: abs(blogUrl(a)),
    image: absImg(a.cover ? `/assets/og/blog-${a.slug}.jpg` : `/assets/og/default${L === 'uk' ? '' : '-' + L}.jpg`) };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: t('pp_home'), item: abs(pfx() + '/') },
    { '@type': 'ListItem', position: 2, name: t('nav_blog'), item: abs(pfx() + '/blog/') },
    { '@type': 'ListItem', position: 3, name: bt(a), item: abs(blogUrl(a)) } ] };
  return `<!doctype html><html lang="${L}" data-season="${SEASON}"><head>
${head({ title: btSeo(a), desc: bd(a), canonical: abs(blogUrl(a)), ogTitle: bt(a), ogImage: a.cover ? absImg(`/assets/og/blog-${a.slug}.jpg`) : undefined, altPath: `/blog/${a.slug}/`, altLangs: BLOG_LANGS, jsonld })}
<script type="application/ld+json">${JSON.stringify(crumbs)}</script>
</head><body>${GTM_NS}
${HEADER}
<article class="pp-wrap bl-article">
  <nav class="pp-bc"><a href="${pfx() + '/'}">${esc(t("pp_home"))}</a> › <a href="${pfx()}/blog/">${esc(t("nav_blog"))}</a> › <span>${esc(bg(a))}</span></nav>
  ${a.cover ? `<img class="bl-art-cover" src="${esc(av(a.cover))}" alt="" width="800" height="450" fetchpriority="high" decoding="async">` : ''}
  <div class="bl-chips"><span class="bl-tag">${esc(bg(a))}</span><a class="bl-cat" href="${curl(artCat(a))}">${esc(lf(artCat(a), 'name'))}</a></div>
  <h1 class="bl-art-h1">${esc(bt(a))}</h1>
  <div class="bl-meta">${new Date(a.date).toLocaleDateString(L === 'ru' ? 'ru-RU' : 'uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}${a.updated && a.updated !== a.date ? ` · ${esc(t('blog_updated'))} ${new Date(a.updated).toLocaleDateString(L === 'ru' ? 'ru-RU' : 'uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''} · ${a.read} ${esc(t('blog_read'))}</div>
  <div class="bl-body">${bh(a)}</div>
  ${artProducts(a)}
  <div class="bl-cta"><a class="btn-primary" href="${pfx()}/#catalog">${esc(t('blog_cta1'))}</a> <a class="btn-ghost2" href="${curl(artCat(a))}">${esc(lf(artCat(a), 'name'))}</a></div>
  ${others.length ? `<div class="bl-related"><h2>${esc(t("blog_also"))}</h2><div class="bl-grid">${others.map(blogCard).join('')}</div></div>` : ''}
  <div class="recent" id="recent" data-nosnippet hidden><h2 class="recent-h">${esc(t('recent_h'))}</h2><div class="recent-row" id="recent-row"></div><button class="recent-clear" id="recent-clear" onclick="clearRecent()">${esc(t('recent_clear'))}</button></div>
</article>
${FOOTER}
${injectData()}
<script src="${av('/assets/js/main.js')}" defer></script>
</body></html>`;
}
// the articles are written in Ukrainian and Russian, so those trees get a blog
if (BLOG_LANGS.includes(L)) {
  const root = outPath('blog');
  writePage(path.join(root), blogIndexPage());
  SITEMAP.push(pfx() + '/blog/');
  for (const a of blog) {
    const dir = outPath('blog', a.slug);
    writePage(path.join(dir), blogPost(a));
    SITEMAP.push(blogUrl(a));
  }
}

/* ---- installation page ----
   Search Console showed people looking for "монтаж кондиціонера суми" with
   nowhere to land: installation lived only as a block on the home page, which
   ranks for the shop, not for the service. This is that block's subject given a
   page of its own — the same facts, told at the length someone deciding on a
   fitter actually wants: what is included, how the day goes, what can move the
   price, who turns up. Ukrainian and Russian only, the two languages Sumy
   searches in. */
function installPage() {
  const inc = ['inst_i1','inst_i2','inst_i3','inst_i4','inst_i5','inst_i6','inst_i7','inst_i8','inst_i9'].map(k => t(k));
  const extras = ['inst_e1','inst_e2','inst_e3','inst_e4'].map(k => t(k));
  const steps = [1,2,3,4].map(n => [t(`mp_s${n}t`), t(`mp_s${n}p`)]);
  const faqs = [1,2,3,4].map(n => [t(`mp_q${n}`), t(`mp_a${n}`)]);
  const url = pfx() + INSTALL_PATH;
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Service',
    name: t('mp_h1'), serviceType: t('mp_h1'), url: abs(url),
    description: t('mp_lead'),
    provider: { '@type': 'LocalBusiness', name: site.name, telephone: site.phone,
      address: { '@type': 'PostalAddress', streetAddress: site.address, addressLocality: 'Суми', addressCountry: 'UA' } },
    areaServed: { '@type': 'City', name: 'Суми' },
    offers: { '@type': 'Offer', price: site.installPrice, priceCurrency: 'UAH',
      availability: 'https://schema.org/InStock', url: abs(url) }
  };
  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q,
      acceptedAnswer: { '@type': 'Answer', text: a } })) };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: t('pp_home'), item: abs(pfx() + '/') },
    { '@type': 'ListItem', position: 2, name: t('mp_h1'), item: abs(url) } ] };
  return `<!doctype html><html lang="${L}" data-season="${SEASON}"><head>
${head({ title: t('mp_title'), desc: t('mp_desc'), canonical: abs(url),
  ogImage: absImg('/assets/og/montazh.jpg'), altPath: INSTALL_PATH, altLangs: INSTALL_LANGS, jsonld })}
<script type="application/ld+json">${JSON.stringify(faqLd)}</script>
<script type="application/ld+json">${JSON.stringify(crumbs)}</script>
</head><body>${GTM_NS}
${HEADER}
<div class="cat-wrap mp">
  <nav class="pp-bc"><a href="${pfx() || '/'}">${esc(t('pp_home'))}</a> › <span>${esc(t('mp_h1'))}</span></nav>
  <div class="cat-top">
    <header class="cat-head">
      <h1 class="cat-h1">${esc(t('mp_h1'))}</h1>
      <p class="cat-sub">${esc(t('mp_lead'))}</p>
      <div class="mp-price"><span class="mp-price-l">${esc(t('mp_price_l'))}</span>
        <b>${esc(t('inst_from'))} ${fmt(site.installPrice)} <small>${esc(t('u_uah'))}</small></b>
        <span class="mp-price-n">${esc(t('mp_price_n'))}</span></div>
    </header>
    <img class="cat-hero" src="${esc(av('/assets/img/site/install.webp'))}" alt="${esc(t('mp_h1'))}" width="1000" height="1500" fetchpriority="high" decoding="async">
  </div>

  <section class="mp-sec">
    <h2>${esc(t('mp_inc_h'))}</h2>
    <ul class="ilist mp-inc">${inc.map(i => `<li><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg><span>${esc(i)}</span></li>`).join('')}</ul>
    <p class="mp-note">${esc(t('mp_inc_n'))}</p>
  </section>

  <section class="mp-sec">
    <h2>${esc(t('mp_how_h'))}</h2>
    <ol class="mp-steps">${steps.map(([h, p], i) => `<li><span class="mp-n">${i + 1}</span><div><b>${esc(h)}</b><p>${esc(p)}</p></div></li>`).join('')}</ol>
  </section>

  <section class="mp-sec">
    <h2>${esc(t('mp_ex_h'))}</h2>
    <ul class="mp-extras">${extras.map(e => `<li>${esc(e)}</li>`).join('')}</ul>
    <p class="mp-note">${esc(t('mp_ex_n'))}</p>
  </section>

  <section class="mp-sec">
    <h2>${esc(t('mp_who_h'))}</h2>
    <p class="mp-who">${esc(t('mp_who_p'))}</p>
  </section>

  <section class="mp-sec">
    <h2>${esc(t('faq_h'))}</h2>
    <div class="mp-faq">${faqs.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>
  </section>

  <div class="bl-cta mp-cta">
    <div><b>${esc(t('mp_cta_h'))}</b><p>${esc(t('mp_cta_p'))}</p></div>
    <a class="btn-primary" href="#" onclick="openCb();return false">${esc(t('inst_btn'))}</a>
    <a class="btn-ghost2" href="${pfx()}/kondicioner/">${esc(lf(CATS['kondicioneri'], 'name'))}</a>
  </div>
</div>
${FOOTER}
${injectData()}
<script src="${av('/assets/js/main.js')}" defer></script>
</body></html>`;
}
if (INSTALL_LANGS.includes(L)) {
  const dir = outPath('montazh-kondicionera');
  writePage(path.join(dir), installPage());
  SITEMAP.push(pfx() + INSTALL_PATH);
}

/* ---- 404 ----
   Vercel serves 404.html from the output root for a static site, and until now
   there was none: a dead link — an old Google result for a product that was
   renamed, a mistyped address — landed on a bare "NOT_FOUND" screen with no way
   back into the shop. One page, Ukrainian, with the categories on it. */
if (L === 'uk') {
  const html = `<!doctype html><html lang="uk" data-season="${SEASON}"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#0B1A33">
<meta name="robots" content="noindex, follow">
<title>${esc(t('e404_t'))}</title>
<link rel="icon" href="${FAVICON}">
<link rel="stylesheet" href="${av('/assets/css/main.css')}">
</head><body>${GTM_NS}
${HEADER}
<div class="cat-wrap e404">
  <h1 class="cat-h1">${esc(t('e404_h'))}</h1>
  <p class="cat-sub">${esc(t('e404_p'))}</p>
  <div class="e404-links">
    <a class="btn-primary" href="/">${esc(t('e404_home'))}</a>
    ${catLive().map(c => `<a class="e404-cat" href="${c.urlPrefix}/">${esc(lf(c, 'name'))}</a>`).join('')}
  </div>
</div>
${FOOTER}
${injectData()}
<script src="${av('/assets/js/main.js')}" defer></script>
</body></html>`;
  fs.writeFileSync(path.join(DIST, '404.html'), emailOff(html), 'utf8');
}

// ---- privacy policy page (Ukrainian legal text, generated once) ----
if (L === 'uk') {
  const privacyBody = fs.readFileSync(path.join(ROOT, 'templates/privacy.html'), 'utf8');
  const html = `<!doctype html><html lang="uk"><head>
${head({ title: 'Політика конфіденційності | TexnoPlaza', desc: 'Політика конфіденційності TexnoPlaza: які персональні дані ми збираємо через форми, дзвінки та месенджери, з якою метою, як зберігаємо й захищаємо їх, та ваші права.', canonical: abs('/polityka-konfidentsiynosti/') })}
</head><body>${GTM_NS}
${HEADER}
${privacyBody}
${FOOTER}
${injectData()}
<script src="${av('/assets/js/main.js')}" defer></script>
</body></html>`;
  fs.mkdirSync(path.join(DIST, 'polityka-konfidentsiynosti'), { recursive: true });
  writePage(path.join(DIST, 'polityka-konfidentsiynosti'), html);
  SITEMAP.push('/polityka-konfidentsiynosti/');

  /* The return policy, the address Google Merchant Center is given. Written from
     the owner's own terms, not a template: 14 days to return a working item,
     replacement or refund for a fault within 14 days and warranty repair after,
     returns in the shop only, money back in the shop the same day, no exchange.
     The phone and opening hours come from site.json, so they cannot drift from
     the rest of the site. */
  const returnsBody = fs.readFileSync(path.join(ROOT, 'templates/returns.html'), 'utf8')
    .replaceAll('{{PHONE_DISPLAY}}', esc(site.phoneDisplay))
    .replaceAll('{{PHONE}}', esc(site.phone))
    .replaceAll('{{HOURS}}', esc(site.hours));
  const returnsHtml = `<!doctype html><html lang="uk"><head>
${head({ title: 'Безкоштовне повернення товару — 14 днів | TexnoPlaza', desc: 'Повернення товару в TexnoPlaza (Суми): будь-яку техніку можна повернути безкоштовно протягом 14 днів. Гроші — одразу в магазині, повну суму без утримань.', canonical: abs('/povernennya-tovaru/') })}
</head><body>${GTM_NS}
${HEADER}
${returnsBody}
${FOOTER}
${injectData()}
<script src="${av('/assets/js/main.js')}" defer></script>
</body></html>`;
  fs.mkdirSync(path.join(DIST, 'povernennya-tovaru'), { recursive: true });
  writePage(path.join(DIST, 'povernennya-tovaru'), returnsHtml);
  SITEMAP.push('/povernennya-tovaru/');

  /* Most sales are taken by phone or in Viber, never pass through the site's
     order form, and so never met the Google Customer Reviews opt-in. The
     manager sends this link to every such buyer after the sale — every one,
     not only the happy ones: choosing who gets asked is what gets a merchant
     thrown out of the programme. Kept out of the index and the sitemap: it is
     a step in an order, not a page anyone should land on from search. */
  const confirmBody = fs.readFileSync(path.join(ROOT, 'templates/confirm.html'), 'utf8')
    .replaceAll('{{PHONE_DISPLAY}}', esc(site.phoneDisplay))
    .replaceAll('{{PHONE}}', esc(site.phone))
    .replaceAll('{{HOURS}}', esc(site.hours));
  const confirmHtml = `<!doctype html><html lang="uk"><head>
${head({ title: 'Підтвердження замовлення | TexnoPlaza', desc: 'Дякуємо за покупку в TexnoPlaza. Оцініть покупку в Google — це допоможе іншим покупцям.', canonical: abs('/pidtverdzhennya/') })
  .replace('<meta name="robots" content="max-image-preview:large">', '<meta name="robots" content="noindex, nofollow">')}
</head><body>${GTM_NS}
${HEADER}
${confirmBody}
${FOOTER}
${injectData()}
<script src="${av('/assets/js/main.js')}" defer></script>
</body></html>`;
  fs.mkdirSync(path.join(DIST, 'pidtverdzhennya'), { recursive: true });
  writePage(path.join(DIST, 'pidtverdzhennya'), confirmHtml);
}
}   // ← end of buildLanguage()

// ---- copy assets/ and public/ ----
function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}
copyDir(path.join(ROOT, 'assets'), path.join(DIST, 'assets'));
copyDir(path.join(ROOT, 'public'), DIST);

/* The name-hashed copies. Originals stay where they are: main.css reaches
   install.webp by its plain path, and the manifest names the icons. */
for (const [src, dst] of hashedCopies) {
  const from = path.join(ROOT, src.replace(/^\//, ''));
  const to = path.join(DIST, dst.replace(/^\//, ''));
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}
/* The per-language catalogue files injectData named, and the list of tag and
   brand cards for gen_images.py to draw. */
for (const [url, js] of DATA_FILES) {
  const to = path.join(DIST, url.replace(/^\//, ''));
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, js, 'utf8');
}
fs.writeFileSync(path.join(ROOT, 'scripts', '.og-collections.json'),
  JSON.stringify([...COLLECTION_OG].map(([file, v]) => ({ file, ...v })), null, 1) + '\n', 'utf8');

/* The service worker keeps its cache under one fixed name, and its activate
   handler only deletes caches whose name differs. With the name never changing,
   a page it cached once could be served for ever: an owner's desktop kept
   showing a category cover three deploys old while the same site on a phone was
   current. Stamp the name with what this build actually produced, so every
   deploy lands in a new cache and the activate handler drops the last one. */
{
  const swFile = path.join(DIST, 'sw.js');
  if (fs.existsSync(swFile)) {
    const stamp = crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(DIST, 'index.html')))
      .update(fs.readFileSync(path.join(DIST, 'assets/css/main.css')))
      .update(fs.readFileSync(path.join(DIST, 'assets/js/main.js')))
      .digest('hex').slice(0, 8);
    const sw = fs.readFileSync(swFile, 'utf8');
    const stamped = sw.replace(/const C = 'tp-v1';/, `const C = 'tp-${stamp}';`);
    if (stamped === sw) throw new Error('sw.js cache name not found — the stamp would silently do nothing');
    fs.writeFileSync(swFile, stamped, 'utf8');
  }
}

// ---- Google Merchant Center product feed (RSS 2.0) ----
// Upload/point Merchant Center at https://<site>/feed.xml to list products in
// the Shopping tab. Ukrainian copy, UAH prices, one <item> per product.
{
  /* Ids from Google's own taxonomy (taxonomy-with-ids.en-US.txt, 2021-09-21),
     looked up rather than remembered: three of the five that were here pointed
     somewhere else entirely — refrigerators were filed under "Lawn & Garden"
     and power stations under "Hobbies & Creative Arts" — and the nine kitchen
     categories added since had no id at all, so half the feed went out
     uncategorised. */
  const GCAT = {
    kondicioneri: '605',               // Household Appliances > Climate Control Appliances > Air Conditioners
    'pralni-mashyny': '2549',          // Household Appliances > Laundry Appliances > Washing Machines
    holodylnyky: '686',                // Kitchen & Dining > Kitchen Appliances > Refrigerators
    boylery: '621',                    // Household Appliances > Water Heaters
    'zaryadni-stantsii': '1218',       // Hardware > Power & Electrical Supplies > Generators
    komplekty: '5142',                 // Hardware > Power & Electrical Supplies > Power Inverters
    'duhovi-shafy': '683',             // Kitchen & Dining > Kitchen Appliances > Ovens
    'varylni-poverhni': '679',         // Kitchen & Dining > Kitchen Appliances > Cooktops
    vytyazhky: '684',                  // Kitchen & Dining > Kitchen Appliances > Range Hoods
    'posudomyyni-mashyny': '680',      // Kitchen & Dining > Kitchen Appliances > Dishwashers
    'mikrohvylovi-pechi': '753',       // Kitchen & Dining > Kitchen Appliances > Microwave Ovens
    myyky: '2757',                     // Hardware > Plumbing > Plumbing Fixtures > Sinks > Kitchen & Utility Sinks
    zmishuvachi: '2032',               // Hardware > Plumbing > Plumbing Fixtures > Faucets
    dozatory: '4971'                   // Home & Garden > Bathroom Accessories > Soap & Lotion Dispensers
  };
  /* Nova Poshta charges by size, and the shop's own figures run from 150–250 UAH
     for a tap to 1 500 for a fridge — one flat rate would either understate the
     big items (which Google treats as a violation) or frighten off buyers of the
     small ones. Each item carries the group it belongs to, and Merchant Center
     prices the groups separately. Stations are split by their own weight: a
     4.8 kg Pecron and a 42 kg Aferiy are not the same parcel. */
  const SHIP_TIER = {
    zmishuvachi: 'small', dozatory: 'small', myyky: 'small', 'mikrohvylovi-pechi': 'small',
    'varylni-poverhni': 'small', vytyazhky: 'small',
    boylery: 'medium', 'duhovi-shafy': 'medium', 'posudomyyni-mashyny': 'medium', kondicioneri: 'medium',
    holodylnyky: 'large', 'pralni-mashyny': 'large', komplekty: 'large'
  };
  const shipTier = p => {
    if (p.category === 'zaryadni-stantsii') {
      const w = parseFloat(String((p.specs || {}).weight || '').replace(',', '.'));
      return w >= 20 ? 'medium' : 'small';
    }
    return SHIP_TIER[p.category] || 'medium';
  };
  const xe = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  /* One feed per language. Merchant Center fixes a data source's language when
     it is created and will not let it be changed afterwards, so a Ukrainian
     file sitting in a source declared Russian stays wrong forever: the shop's
     own feed was in exactly that state. The Russian feed carries the Russian
     titles and descriptions the site already has, and links to /ru/ pages, so
     a Russian-speaking shopper lands on the page in their language. */
  for (const lang of ['uk', 'ru']) {
    L = lang;
    /* No g:shipping here on purpose. A price in the feed overrides the account's
       own rules, and one number cannot be right for both a 250 UAH tap and a
       1 500 UAH fridge. Merchant Center prices the three shipping_label groups
       separately instead. (Before that it was worse still: air conditioners
       declared the 6 000 UAH installation price as delivery.) */
    const items = products.map(p => {
      const cat = catOf(p);
      const desc = (pdesc(p) || '').replace(/\s+/g, ' ').trim();
      return `  <item>
    <g:id>${xe(p.slug)}</g:id>
    <g:title>${xe(pname(p))}</g:title>
    <g:description>${xe(desc)}</g:description>
    <g:link>${xe(abs(purl(p)))}</g:link>
    <g:image_link>${xe(abs(p.photos[0]))}</g:image_link>
${p.photos.slice(1, 11).map(ph => `    <g:additional_image_link>${xe(abs(ph))}</g:additional_image_link>`).join('\n')}
    <g:availability>in_stock</g:availability>
    <g:condition>new</g:condition>
    <g:price>${p.price} UAH</g:price>
    <g:brand>${xe(p.brand)}</g:brand>
    <!-- identifier_exists=no and an mpn in the same item contradict each other,
         and the mpn was the series name ("ISR Rotary"), not a part number. -->
    <g:identifier_exists>no</g:identifier_exists>
    <g:google_product_category>${GCAT[p.category] || ''}</g:google_product_category>
    <g:product_type>${xe(lf(cat, 'name'))}</g:product_type>
    <g:shipping_label>${shipTier(p)}</g:shipping_label>
  </item>`;
    }).join('\n');
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>${xe(site.name)}</title>
  <link>${xe(abs(pfx() + '/'))}</link>
  <description>${xe(t('seo_home_d'))}</description>
${items}
</channel>
</rss>
`;
    const file = lang === 'uk' ? 'feed.xml' : `feed-${lang}.xml`;
    fs.writeFileSync(path.join(DIST, file), feed, 'utf8');
    console.log(`${file} → ${products.length} products (${lang})`);
  }
  L = 'uk';
}

// ---- sitemap + robots ----
/* lastmod only where the date is real. Articles carry their own; everything
   else is regenerated wholesale on each deploy, so stamping today's date on
   all 518 urls would be a claim the build cannot back — and Google learns to
   ignore a lastmod that always says "just now". */
const LASTMOD = new Map();
for (const a of blog) for (const l of BLOG_LANGS)
  LASTMOD.set(`${l === 'uk' ? '' : '/' + l}/blog/${a.slug}/`, a.updated || a.date);
const urls = [...new Set(SITEMAP)].map(u => {
  const d = LASTMOD.get(u);
  return `  <url><loc>${abs(u)}</loc>${d ? `<lastmod>${d}</lastmod>` : ''}</url>`;
}).join('\n');
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, 'utf8');
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${abs('/sitemap.xml')}\n`, 'utf8');

{
  const missing = [];
  const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f);
    else if (e.name === 'index.html') {
      const h = fs.readFileSync(f, 'utf8');
      if (!h.includes('Google Tag Manager (noscript)') || !h.includes('<!-- Google Tag Manager -->'))
        missing.push('/' + path.relative(DIST, dir).split(path.sep).join('/'));
    } } };
  walk(DIST);
  if (missing.length) {
    console.error(`GTM missing on ${missing.length} page(s): ${missing.slice(0, 5).join(', ')}`);
    process.exit(1);
  }
}

console.log(`build OK → dist/  (${LANGS.join('/')} · ${n} product pages · ${[...new Set(SITEMAP)].length} urls)`);
console.log(`baseUrl: ${site.baseUrl}${site.baseUrl.includes('REPLACE') ? '  (placeholder!)' : ''}`);
