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
const bt = a => lf(a, 'title');
const bd = a => lf(a, 'desc');
const bg = a => lf(a, 'tag');
const bh = a => linkProducts((L !== 'uk' && a['html_' + L]) || a.html);

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
const catOf = p => CATS[p.category] || CATS['kondicioneri'];
const catList = Object.entries(CATS).map(([key, c]) => ({ key, ...c })).sort((a, b) => (a.order || 99) - (b.order || 99));
const catProducts = key => products.filter(p => p.category === key);
const SPECV = read('spec-values.json');
const BRANDS = read('brands.json');   // per-brand copy for the brand pages
const LANGS = ['uk', 'ru', 'en'];                 // uk at /, others at /ru/ and /en/
let L = 'uk';                                     // current language of the page being rendered
const pfx = () => (L === 'uk' ? '' : '/' + L);
// per-language field on a data object: name → name_ru / name_en, falling back to uk
const lf = (obj, field) => (L !== 'uk' && obj && obj[field + '_' + L]) || (obj ? obj[field] : undefined);
const specVal = v => {
  if (L === 'uk' || typeof v !== 'string') return v;
  const e = SPECV[v];
  return (e && e[L]) || v;
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
const COUNTS = {
  TOTAL: products.length,
  AC: products.filter(p => p.category === 'kondicioneri').length,
  WM: products.filter(p => p.category === 'pralni-mashyny').length,
  PS: products.filter(p => p.category === 'zaryadni-stantsii').length,
  FR: products.filter(p => p.category === 'holodylnyky').length,
  BL: products.filter(p => p.category === 'boylery').length
};
// Slavic plurals: 1 товар / 2-4 товари / 5+ товарів — needed wherever a count
// is followed by a noun, otherwise the copy reads broken at most numbers.
const PLURALS = {
  uk: ['товар', 'товари', 'товарів'],
  ru: ['товар', 'товара', 'товаров'],
  en: ['product', 'products', 'products']
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
  .replace(/\{\{(TOTAL|AC|WM|PS|FR|BL)\}\}/g, (m, k) => COUNTS[k]);
const t = (k) => subCounts((i18n[L] && i18n[L][k]) ?? (i18n.uk && i18n.uk[k]) ?? k);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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
    default: return specVal((raw !== undefined && raw !== null && raw !== '') ? raw : null);
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
/* Assets are served with a one-year immutable cache, so a file whose contents
   change but whose name stays the same would keep serving the old version from
   every browser and the CDN. Stamp each asset URL with a hash of its bytes:
   unchanged files keep their URL (and their cache), changed ones get a new one. */
const hashed = new Map();
function av(u) {
  if (!u || !u.startsWith('/assets/')) return u;
  if (hashed.has(u)) return hashed.get(u);
  let out = u;
  try {
    const bytes = fs.readFileSync(path.join(ROOT, u.replace(/^\//, '')));
    out = `${u}?h=${crypto.createHash('md5').update(bytes).digest('hex').slice(0, 8)}`;
  } catch { /* missing file — leave the plain path so the audit can flag it */ }
  hashed.set(u, out);
  return out;
}
const abs = u => BASE + u.split('?')[0];   // canonical/schema URLs stay clean
/* The favicon was an air-conditioner indoor unit, from when that was all the
   shop sold. Same monogram the PWA icons use — see icon() in gen_images.py. */
const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%230B1A33'/%3E%3Crect x='43.5' y='26' width='13' height='48' rx='3' fill='%237CC4FF'/%3E%3Crect x='24' y='26' width='52' height='13' rx='3' fill='%23ffffff'/%3E%3Crect x='32' y='80' width='36' height='6' rx='3' fill='%232E8BFF'/%3E%3C/svg%3E";
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" media="print" onload="this.media='all'" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap"><noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap"></noscript>`;

const GA = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-HJC1PWRVE9"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-HJC1PWRVE9');gtag('config','AW-765371108');</script>`;
const GTM = `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-W3NLLCQT');</script>
<!-- End Google Tag Manager -->`;
const GTM_NS = `<!-- Google Tag Manager (noscript) --><noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-W3NLLCQT" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`;

function head({ title, desc, canonical, ogTitle, ogDesc, ogImage, jsonld, altPath, altLangs }) {
  const og = ogImage || abs('/assets/og/default.jpg');
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
${GTM}
${GA}
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
${alts}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(ogTitle || title)}">
<meta property="og:description" content="${esc(ogDesc || desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(og)}">
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

function heroCard(p) {
  const s = p.specs || {};
  return `<a class="gauge-card" href="${purl(p)}">
    <div class="gc-tag">${esc(t('gc_stock'))}</div>
    <div class="gc-head"><div class="gc-title">${esc(t('gc_hit'))}</div><div class="gc-live"><i></i> ONLINE</div></div>
    <div class="gc-img"><img src="${esc(av(p.photos[0]))}" alt="${esc(pname(p))}" width="680" height="510" loading="lazy"><div class="gc-airflow" id="airflow"></div></div>
    <div class="gc-name">${esc(pname(p))}</div>
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
    <div class="gc-readout">
      <div class="gc-r"><div class="v">${esc(s.volume_l)}<small> ${esc(t("u_l"))}</small></div><div class="k">${esc(t("hc_volume"))}</div></div>
      <div class="gc-r"><div class="v">${esc(s.height_cm)}<small> ${esc(t("u_cm"))}</small></div><div class="k">${esc(t("hc_height"))}</div></div>
      <div class="gc-r"><div class="v">${esc(String(s.eclass || '').split(' ')[0] || '—')}</div><div class="k">${esc(t("hc_class"))}</div></div>
    </div></a>`;
}

// render current uk i18n text into static HTML (matches runtime applyI18n → correct for SEO/no-JS)
function applyI18nStatic(html) {
  return html.replace(/(<([a-zA-Z0-9]+)((?:[^>]*?)\sdata-i18n="([^"]+)"(?:[^>]*?))>)([\s\S]*?)(<\/\2>)/g,
    (m, open, tag, attrs, key, inner, close) => {
      const v = i18n[L] && i18n[L][key] !== undefined ? i18n[L][key] : i18n.uk[key];
      return v === undefined ? m : open + esc(subCounts(v)) + close;
    });
}
// full-size quiz embedded in the page (category pages + the homepage category tabs)
function quizInline(hidden) {
  return `<section class="quiz-inline"${hidden ? ' id="quiz-inline" style="display:none"' : ' id="quiz-inline"'}>
    <div class="qi-head">
      <div class="quiz-eyebrow" id="qi-eyebrow">${esc(t('quiz_eye'))}</div>
      <h2 class="qi-title" id="qi-title">${esc(t('quiz_h'))}</h2>
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

function faqItems() {
  return (i18n[L].faq || i18n.uk.faq || []).map(([q, a], i) =>
    `<div class="faq-item reveal" style="transition-delay:${Math.min(i, 6) * 45}ms"><div class="faq-q" onclick="toggleFaq(this)">${esc(q)}</div><div class="faq-a">${esc(a)}</div></div>`).join('\n      ');
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
const catalogData = products.map(({ desc_ru, desc_en, desc_uk, srcIndex, photoCount, photos, ...keep }) =>
  ({ ...keep, thumb: av(keep.thumb) }));
/* Ship only the strings this page can actually use: its own language plus the
   Ukrainian fallback the client falls back to. Sending all three put ~48KB of
   dead weight on every one of the 369 pages. The switcher needs to know which
   languages exist, so that list travels separately as a few bytes. */
const injectData = (extraProducts) => {
  const i18nSlim = L === 'uk' ? { uk: i18n.uk } : { uk: i18n.uk, [L]: i18n[L] };
  return `<script>window.__I18N__=${JSON.stringify(i18nSlim)};window.__LANGS__=${JSON.stringify(LANGS)};window.__SITE__=${JSON.stringify(site)};window.__CATS__=${JSON.stringify(CATS)};window.__SPECV__=${JSON.stringify(SPECV)};window.__PRODUCTS__=${JSON.stringify(extraProducts)};</script>`;
};

// ===================== BUILD =====================
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
const bestWasher = products.find(p => p.slug === 'lg-f2y2ns3we') || products.find(p => p.category === 'pralni-mashyny');
/* The Fossibot carries the "Новинка" badge and always leads the hero. */
const stationCard = bestStation ? heroStationCard(bestStation) : '';
const seasonCards = {
  warm: [best && heroCard(best), bestFridge && heroFridgeCard(bestFridge)],
  cold: [bestBoiler && heroBoilerCard(bestBoiler), bestWasher && heroWasherCard(bestWasher)],
  mild: [bestFridge && heroFridgeCard(bestFridge), bestWasher && heroWasherCard(bestWasher)]
}[SEASON].filter(Boolean);
// The Fossibot leads in every season — it is the flagship новинка and the owner
// wants it at the top of the hits all year. The season only picks the two
// cards under it.
const heroSlots = [stationCard, ...seasonCards].filter(Boolean);
// never leave the hero short of a card if a category runs empty
for (const spare of [stationCard, bestFridge && heroFridgeCard(bestFridge), best && heroCard(best)]) {
  if (heroSlots.length >= 3) break;
  if (spare && !heroSlots.includes(spare)) heroSlots.push(spare);
}
body = body.replace('<!--HERO_CARD-->', heroSlots[0] || '');
body = body.replace('<!--HERO_CARD2-->', heroSlots[1] || '');
body = body.replace('<!--HERO_CARD3-->', heroSlots[2] || '');
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
  `<div class="grid" id="catalog-grid">${defaultOrder.map(card).join('')}</div>`);
// brand strip: every brand actually in stock, ordered by how many products it has
{
  const counts = {};
  for (const p of products) counts[p.brand] = (counts[p.brand] || 0) + 1;
  const chips = Object.keys(counts)
    .sort((a, b) => counts[b] - counts[a] || a.localeCompare(b, 'uk'))
    .map(b => `<span class="bs-chip" onclick="jumpBrand('${esc(b)}')">${esc(b)}</span>`).join('\n    ');
  body = body.replace('<!--BRAND_CHIPS-->', chips);
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
        <h2 class="foot-h"><a href="${curl(c)}">${esc(lf(c, 'name'))}</a></h2>
        <ul>
          ${brands}
          <li class="fc-all"><a href="${curl(c)}">${esc(t('foot_all'))} →</a></li>
        </ul>
      </div>`;
  }).join('\n      ');
  body = body.replace('<!--FOOT_CATALOG-->', cols);
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
body = body.replace('<!--DELIVERY_MAP-->', DELIVERY_MAP);
body = body.replace('<!--PICKER-->', pickerSection());
body = body.replace('<!--QUIZ_INLINE-->', quizInline(true));
body = body.replace('<!--FAQ_ITEMS-->', faqItems());
body = applyI18nStatic(body);   // bake the current language into static HTML (SEO)
body = subCounts(body);         // resolve {{TOTAL}}/{{AC}}/{{WM}}/{{PS}} tokens in raw markup
body = body.replace(/src="(\/assets\/img\/(?:site|logo)[^"]*)"/g, (m, u) => `src="${av(u)}"`);

// shared chrome (header before hero; footer+modals+floats from <footer> onward) for product pages
const _heroAt = body.indexOf('<section class="hero"');
const _footAt = body.indexOf('<footer');
// on inner pages (product/blog) homepage-section anchors must point to "/#..." not "#..."
const toHome = h => h.replace(/href="#(?!")/g, 'href="/#');
HEADER = toHome(body.slice(0, _heroAt));
FOOTER = toHome(body.slice(_footAt));

const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: ((i18n[L].faq) || i18n.uk.faq || []).map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
const indexHtml = `<!doctype html><html lang="${L}" data-season="${SEASON}"><head>
${head({
  title: t('seo_home_t'),
  desc: t('seo_home_d'),
  canonical: abs(pfx() + '/'), altPath: '/',
  jsonld: {
    '@context': 'https://schema.org', '@type': 'ElectronicsStore',
    '@id': BASE + '/#store', name: site.name, alternateName: BRAND_ALIASES,
    image: abs('/assets/og/default.jpg'), logo: abs('/assets/img/logo.png'),
    telephone: site.phone, email: site.email,
    address: { '@type': 'PostalAddress', streetAddress: 'вул. Харківська 2/1', addressLocality: site.city, addressCountry: 'UA' },
    url: BASE, priceRange: '₴₴', areaServed: 'Суми'
  }
})}
<script type="application/ld+json">${JSON.stringify(faqLd)}</script>
<script type="application/ld+json">${JSON.stringify(navLd())}</script>
<script type="application/ld+json">${JSON.stringify(searchLd())}</script>
</head><body>${GTM_NS}
${body}
${injectData(catalogData)}
<script>window.__CATALOG_CAT__=${JSON.stringify(homeCatalogCat)};</script>
<script src="${av('/assets/js/main.js')}" defer></script>
</body></html>`;
fs.writeFileSync(path.join(outPath(), 'index.html'), indexHtml, 'utf8');
SITEMAP.push(pfx() + '/');

// ---- product pages ----
function specTable(p) {
  return (catOf(p).specs || []).map(f => {
    const v = fmtVal(p, f);
    return (v === null || v === undefined || v === '') ? '' : `<tr><th>${esc(lf(f,'label'))}</th><td>${esc(v)}</td></tr>`;
  }).join('');
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
  const trustLines = lf(cat, 'trust') || (cat.install
    ? [`${t('trust_install')} — ${fmt(site.installPrice)} ${t('u_uah')}`, t('trust_paylater'), t('trust_warranty5')]
    : [t('trust_delivery'), t('trust_payget'), t('trust_warranty')]);
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Product', name: NAME, sku: p.slug,
    image: p.photos.map(ph => abs(ph)), description: pdesc(p), brand: { '@type': 'Brand', name: p.brand },
    offers: { '@type': 'Offer', price: p.price, priceCurrency: 'UAH', availability: 'https://schema.org/InStock', url: abs(purl(p)), itemCondition: 'https://schema.org/NewCondition' }
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
  const nm = ukPrefix ? NAME.replace(new RegExp('^' + ((cat.productPrefix || {})[L] || ukPrefix) + '\s+', 'i'), '') : NAME;
  const keySpec = (cat.ppChips || cat.chips || []).filter(c => !c.flag).map(c => fmtVal(p, c)).filter(Boolean).slice(0, 2).join(', ');
  const trust = trustLines.join('. ') + '.';
  return head({
    /* Google shows roughly the first 60 characters of a title. A model name
       like "TCL TAC-09CHSD/XA82I Black Inverter R32 Wi-Fi" already fills most
       of that, so the ", монтаж під ключ" tail was never visible — it only
       pushed the title to 97 characters. Add it only when there is room. */
    title: (() => {
      const base = t('pp_buy_t').replace('{name}', nm);
      const tail = cat.install ? t('pp_buy_install') : '';
      const short = t('pp_buy_short').replace('{name}', nm);
      /* Longest form that still fits. Model names like "TAC-09CHSD/XA82I Black
         Inverter R32 Wi-Fi" spend the whole budget on their own; when the full
         "— купити в Сумах" would be cut off mid-phrase, the short form keeps the
         city visible instead of losing it to the ellipsis. */
      for (const c of [base + tail, base, short]) if (c.length <= 65) return c;
      return short;
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
    ogTitle: NAME, ogImage: abs('/assets/og/' + p.slug + '.jpg'), jsonld
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
      <div class="pp-trust">${trustLines.map(x => `<span>${esc(x)}</span>`).join('')}</div>
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
  ${(() => { const rel = related(p); return rel.length ? `<div class="pp-related"><h2>${esc(t('pp_related'))}</h2><div class="grid grid-rel">${rel.map(card).join('')}</div></div>` : ''; })()}
  <div class="recent" id="recent" hidden><h2 class="recent-h">${esc(t('recent_h'))}</h2><div class="recent-row" id="recent-row"></div><button class="recent-clear" id="recent-clear" onclick="clearRecent()">${esc(t('recent_clear'))}</button></div>
  <div class="pp-back"><a href="${curl(cat)}">← ${esc(lf(cat, 'name'))}</a></div>
</div>
<div class="pp-sticky" id="pp-sticky">
  <div class="pps-info"><div class="pps-price">${fmt(p.price)} <span>${esc(t('u_uah'))}</span></div>
    <div class="pps-name">${esc(NAME)}</div></div>
  <button class="btn-primary pps-btn" onclick="ppLead('${esc(NAME)}')">${esc(t('pp_order'))}</button>
</div>
${FOOTER}
${injectData(catalogData)}
<script src="${av('/assets/js/main.js')}" defer></script>
<div class="lbox" id="lbox" onclick="if(event.target.id==='lbox')ppClose()">
  <button class="lbox-x" onclick="ppClose()" aria-label="${esc(t('lb_close'))}">×</button>
  <button class="lbox-nav prev" onclick="ppStep(-1)" aria-label="${esc(t('lb_prev'))}">‹</button>
  <figure class="lbox-fig"><img id="lbox-img" src="" alt="${esc(NAME)}" width="900" height="900"></figure>
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
function ppLead(name){ if(window.openCb){window.openCb(null,name);} else {location.href='tel:${esc(site.phone)}';} }

/* ---- compare / favourite / share / ask, driven by main.js state ---- */
var PP_SLUG=${JSON.stringify(p.slug)},PP_NAME=${JSON.stringify(NAME)};
function TT(k){return window.ppState?window.ppState.t(k):k;}
function ppIndex(){return window.ppState?window.ppState.index(PP_SLUG):-1;}
function ppSyncActs(){
  var i=ppIndex(); if(i<0||!window.ppState) return;
  var S=window.ppState,inC=S.inCmp(i),inF=S.inFav(i);
  var cb=document.getElementById('pp-cmp-btn'),fb=document.getElementById('pp-fav-btn');
  if(cb){cb.classList.toggle('on',inC);document.getElementById('pp-cmp-lbl').textContent=S.t(inC?'pp_cmp_in':'pp_cmp_add');}
  if(fb){fb.classList.toggle('on',inF);document.getElementById('pp-fav-lbl').textContent=S.t(inF?'pp_fav_in':'pp_fav_add');}
}
function ppToggleCmp(){var i=ppIndex();if(i<0)return;window.toggleCmp(i);ppSyncActs();}
function ppToggleFav(){var i=ppIndex();if(i<0)return;window.toggleFav(i);ppSyncActs();}
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
function ppCheaper(){ if(window.openCb)window.openCb('cheaper',PP_NAME); }
function ppAsk(){ if(window.openCb)window.openCb('question',PP_NAME); }

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
  fs.writeFileSync(path.join(dir, 'index.html'), productPage(p), 'utf8');
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
const burl = (cat, brand) => `${pfx()}${cat.urlPrefix}/${brandSlug(brand)}/`;

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
    .replace('{price}', priceText);
  const intro = fill(t('brand_intro'));
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: NAME, url: abs(burl(cat, brand)),
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
  return `<!doctype html><html lang="${L}" data-season="${SEASON}"><head>
${head({
  title: (() => {                       // the brand and city matter, the suffix does not
    const full = t('brand_seo_t').replace('{name}', NAME);
    return full.length <= 65 ? full : full.replace(/\s*\|\s*[^|]+$/, '');
  })(),
  desc: fill(t('brand_seo_d')),
  canonical: abs(burl(cat, brand)), altPath: `${cat.urlPrefix}/${brandSlug(brand)}/`, jsonld
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
  ${lf(cat, 'quizCta') && list.length > 1 ? quizInline(false) : ''}
  <div class="recent" id="recent" hidden><h2 class="recent-h">${esc(t('recent_h'))}</h2><div class="recent-row" id="recent-row"></div><button class="recent-clear" id="recent-clear" onclick="clearRecent()">${esc(t('recent_clear'))}</button></div>
  <section class="section catalog cat-catalog" id="catalog">
    <div class="grid" id="catalog-grid">${list.map(card).join('')}</div>
  </section>
  ${siblings ? `<div class="brand-links"><h2>${esc(t('brand_other').replace('{cat}', (lf(cat, 'nameGen') || CAT).toLowerCase()))}</h2><div class="bl-row">${siblings}</div></div>` : ''}
  <div class="pp-back"><a href="${curl(cat)}">← ${esc(CAT)}</a></div>
</div>
${FOOTER}
${injectData(catalogData)}
<script>window.__CATALOG_CAT__=${JSON.stringify(cat.key)};window.__BRAND__=${JSON.stringify(brand)};</script>
<script src="${av('/assets/js/main.js')}" defer></script>
</body></html>`;
}

/* Two articles that answer what someone browsing this category is weighing up.
   Matched on the tags each category cares about, newest first, so a new article
   joins the rotation without an edit here. */
const CAT_TAGS = {
  kondicioneri: ['Підбір', 'Поради', 'Монтаж', 'Опалення', 'Сервіс'],
  'pralni-mashyny': ['Підбір', 'Поради'],
  holodylnyky: ['Підбір', 'Поради'],
  'zaryadni-stantsii': ['Живлення']
};
const CAT_ARTICLE_MATCH = {
  kondicioneri: /kondicioner|invertor-chy-on-off/i,
  'pralni-mashyny': /pralnu|pralna|prannia/i,
  holodylnyky: /kholodylnyk|no-frost/i,
  'zaryadni-stantsii': /stantsi/i
};
function catArticles(catKey) {
  // English has no articles, and a translated page must not offer headlines
  // in a language the reader did not choose
  if (!BLOG_LANGS.includes(L)) return '';
  const re = CAT_ARTICLE_MATCH[catKey];
  let list = re ? blog.filter(a => re.test(a.slug)) : [];
  if (list.length < 2) {
    // fall back on tags, but never borrow an article that plainly belongs to
    // another category — a washing-machine page offering "what an air
    // conditioner costs to run" reads like a mistake, because it is one
    const others = Object.entries(CAT_ARTICLE_MATCH).filter(([k]) => k !== catKey).map(([, r]) => r);
    const tags = CAT_TAGS[catKey] || [];
    list = list.concat(blog.filter(a =>
      !list.includes(a) && tags.includes(a.tag) && !others.some(r => r.test(a.slug))));
  }
  list = list.slice(0, 2);
  if (!list.length) return '';
  return `<div class="cat-reads">
    <h2>${esc(t('cat_reads'))}</h2>
    <div class="cr-row">${list.map(a => `<a class="cr-card" href="${blogUrl(a)}">
      <span class="cr-tag">${esc(bg(a))}</span>
      <span class="cr-t">${esc(bt(a))}</span>
      <span class="cr-d">${esc(bd(a))}</span></a>`).join('')}</div>
  </div>`;
}

function categoryPage(cat) {
  const list = catProducts(cat.key);
  const NAME = lf(cat, 'name');
  const plural = modelsWord(list.length);
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: NAME, url: abs(curl(cat)),
    mainEntity: { '@type': 'ItemList', numberOfItems: list.length, itemListElement: list.slice(0, 20).map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(purl(p)) })) }
  };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: t('pp_home'), item: abs(pfx() + '/') },
    { '@type': 'ListItem', position: 2, name: NAME, item: abs(curl(cat)) } ] };
  return `<!doctype html><html lang="${L}" data-season="${SEASON}"><head>
${head({
  title: lf(cat, 'seoTitle') || t('seo_cat_t').replace('{name}', NAME),
  desc: subCounts(lf(cat, 'seoDesc') || lf(cat, 'intro') || `${NAME} ${t('cat_in_sumy')}: ${list.length} ${plural} ${t('cat_instock')}.`),
  canonical: abs(curl(cat)), altPath: cat.urlPrefix + '/', jsonld
})}
<script type="application/ld+json">${JSON.stringify(crumbs)}</script>
</head><body>${GTM_NS}
${HEADER}
<div class="cat-wrap">
  <nav class="pp-bc"><a href="${pfx() || '/'}">${esc(t('pp_home'))}</a> › <span>${esc(NAME)}</span></nav>
  <header class="cat-head">
    <h1 class="cat-h1">${esc(NAME)} ${esc(t('cat_in_sumy'))}</h1>
    <p class="cat-sub">${esc(lf(cat, 'intro') || '')}</p>
    <div class="cat-count">${list.length} ${esc(plural)} ${esc(t('cat_instock'))}</div>
  </header>
  ${lf(cat, 'quizCta') ? quizInline(false) : ''}
  <div class="recent" id="recent" hidden><h2 class="recent-h">${esc(t('recent_h'))}</h2><div class="recent-row" id="recent-row"></div><button class="recent-clear" id="recent-clear" onclick="clearRecent()">${esc(t('recent_clear'))}</button></div>
  <section class="section catalog cat-catalog" id="catalog">
    ${filtersFor(cat.key)}
    <div class="grid" id="catalog-grid">${list.map(card).join('')}</div>
  </section>
  ${catArticles(cat.key)}
  <div class="pp-back"><a href="${pfx() || '/'}#catalog">← ${esc(t('pp_back_all'))}</a></div>
</div>
${FOOTER}
${injectData(catalogData)}
<script>window.__CATALOG_CAT__=${JSON.stringify(cat.key)};</script>
<script src="${av('/assets/js/main.js')}" defer></script>
</body></html>`;
}
for (const cat of catList) {
  if (!catProducts(cat.key).length) continue;   // skip empty categories (no thin pages)
  const dir = outPath(cat.urlPrefix.replace(/^\//, ''));
  fs.writeFileSync(path.join(dir, 'index.html'), categoryPage(cat), 'utf8');
  SITEMAP.push(curl(cat));

  /* Brand pages live beside the product pages in the same directory, so a brand
     whose slug matched a product slug would silently overwrite that product.
     Fail the build instead of shipping a missing page. */
  for (const brand of catBrands(cat.key)) {
    const slug = brandSlug(brand);
    const clash = catProducts(cat.key).find(p => p.slug === slug);
    if (clash) throw new Error(`brand page /${cat.urlPrefix}/${slug}/ collides with product ${clash.slug}`);
    const bdir = outPath(cat.urlPrefix.replace(/^\//, ''), slug);
    fs.writeFileSync(path.join(bdir, 'index.html'), brandPage(cat, brand), 'utf8');
    SITEMAP.push(burl(cat, brand));
    n++;
  }
}

// ---- blog ----
function blogCard(a) {
  return `<a class="bl-card" data-tag="${esc(bg(a))}" href="${blogUrl(a)}">
    <div class="bl-tag">${esc(bg(a))}</div>
    <h2 class="bl-card-t">${esc(bt(a))}</h2>
    <p class="bl-card-d">${esc(bd(a))}</p>
    <span class="bl-more">${esc(t("blog_more"))}</span></a>`;
}
function blogIndexPage() {
  return `<!doctype html><html lang="${L}" data-season="${SEASON}"><head>
${head({ title: t('seo_blog_t'), desc: t('seo_blog_d'), canonical: abs(pfx() + '/blog/'), altPath: '/blog/', altLangs: BLOG_LANGS })}
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
  <div class="recent" id="recent" hidden><h2 class="recent-h">${esc(t('recent_h'))}</h2><div class="recent-row" id="recent-row"></div><button class="recent-clear" id="recent-clear" onclick="clearRecent()">${esc(t('recent_clear'))}</button></div>
</div>
${FOOTER}
${injectData(catalogData)}
<script src="${av('/assets/js/main.js')}" defer></script>
</body></html>`;
}
function blogPost(a) {
  const others = blog.filter(x => x.slug !== a.slug).slice(0, 3);
  const jsonld = { '@context': 'https://schema.org', '@type': 'Article', headline: bt(a), description: bd(a),
    datePublished: a.date, dateModified: a.date, author: { '@type': 'Organization', name: site.name },
    publisher: { '@type': 'Organization', name: site.name, logo: { '@type': 'ImageObject', url: abs('/assets/icons/icon-512.png') } },
    mainEntityOfPage: abs(blogUrl(a)), image: abs('/assets/og/default.jpg') };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: t('pp_home'), item: abs(pfx() + '/') },
    { '@type': 'ListItem', position: 2, name: t('nav_blog'), item: abs(pfx() + '/blog/') },
    { '@type': 'ListItem', position: 3, name: bt(a), item: abs(blogUrl(a)) } ] };
  return `<!doctype html><html lang="${L}" data-season="${SEASON}"><head>
${head({ title: (bt(a) + ' | ' + site.name).length <= 65 ? bt(a) + ' | ' + site.name : bt(a), desc: bd(a), canonical: abs(blogUrl(a)), ogTitle: bt(a), altPath: `/blog/${a.slug}/`, altLangs: BLOG_LANGS, jsonld })}
<script type="application/ld+json">${JSON.stringify(crumbs)}</script>
</head><body>${GTM_NS}
${HEADER}
<article class="pp-wrap bl-article">
  <nav class="pp-bc"><a href="${pfx() + '/'}">${esc(t("pp_home"))}</a> › <a href="${pfx()}/blog/">${esc(t("nav_blog"))}</a> › <span>${esc(bg(a))}</span></nav>
  <div class="bl-tag">${esc(bg(a))}</div>
  <h1 class="bl-art-h1">${esc(bt(a))}</h1>
  <div class="bl-meta">${new Date(a.date).toLocaleDateString(L === 'ru' ? 'ru-RU' : 'uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })} · ${a.read} ${esc(t('blog_read'))}</div>
  <div class="bl-body">${bh(a)}</div>
  <div class="bl-cta"><a class="btn-primary" href="${pfx()}/#catalog">${esc(t('blog_cta1'))}</a> <a class="btn-ghost2" href="${pfx()}/kondicioner/">${esc(lf(CATS['kondicioneri'],'name'))}</a></div>
  ${others.length ? `<div class="bl-related"><h2>${esc(t("blog_also"))}</h2><div class="bl-grid">${others.map(blogCard).join('')}</div></div>` : ''}
  <div class="recent" id="recent" hidden><h2 class="recent-h">${esc(t('recent_h'))}</h2><div class="recent-row" id="recent-row"></div><button class="recent-clear" id="recent-clear" onclick="clearRecent()">${esc(t('recent_clear'))}</button></div>
</article>
${FOOTER}
${injectData(catalogData)}
<script src="${av('/assets/js/main.js')}" defer></script>
</body></html>`;
}
// the articles are written in Ukrainian and Russian, so those trees get a blog
if (BLOG_LANGS.includes(L)) {
  const root = outPath('blog');
  fs.writeFileSync(path.join(root, 'index.html'), blogIndexPage(), 'utf8');
  SITEMAP.push(pfx() + '/blog/');
  for (const a of blog) {
    const dir = outPath('blog', a.slug);
    fs.writeFileSync(path.join(dir, 'index.html'), blogPost(a), 'utf8');
    SITEMAP.push(blogUrl(a));
  }
}

// ---- privacy policy page (Ukrainian legal text, generated once) ----
if (L === 'uk') {
  const privacyBody = fs.readFileSync(path.join(ROOT, 'templates/privacy.html'), 'utf8');
  const html = `<!doctype html><html lang="uk"><head>
${head({ title: 'Політика конфіденційності | TexnoPlaza', desc: 'Політика конфіденційності TexnoPlaza: які персональні дані ми збираємо через форми, дзвінки та месенджери, з якою метою, як зберігаємо й захищаємо їх, та ваші права.', canonical: abs('/polityka-konfidentsiynosti/') })}
</head><body>
${HEADER}
${privacyBody}
${FOOTER}
${injectData(catalogData)}
<script src="${av('/assets/js/main.js')}" defer></script>
</body></html>`;
  fs.mkdirSync(path.join(DIST, 'polityka-konfidentsiynosti'), { recursive: true });
  fs.writeFileSync(path.join(DIST, 'polityka-konfidentsiynosti', 'index.html'), html, 'utf8');
  SITEMAP.push('/polityka-konfidentsiynosti/');
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

// ---- Google Merchant Center product feed (RSS 2.0) ----
// Upload/point Merchant Center at https://<site>/feed.xml to list products in
// the Shopping tab. Ukrainian copy, UAH prices, one <item> per product.
{
  const GCAT = {                       // Google product taxonomy ids
    kondicioneri: '605',               // Home & Garden > Household Appliances > Climate Control > Air Conditioners
    'pralni-mashyny': '2706',          // ... > Laundry Appliances > Washing Machines
    holodylnyky: '689',                // ... > Kitchen Appliances > Refrigerators
    'zaryadni-stantsii': '5710',       // Electronics > Electronics Accessories > Power > Portable Power
    boylery: '621'                     // Home & Garden > Household Appliances > Water Heaters
  };
  const xe = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  L = 'uk';
  const items = products.map(p => {
    const cat = catOf(p);
    const desc = (p.desc_uk || '').replace(/\s+/g, ' ').trim();
    return `  <item>
    <g:id>${xe(p.slug)}</g:id>
    <g:title>${xe(p.name)}</g:title>
    <g:description>${xe(desc)}</g:description>
    <g:link>${xe(abs(`${cat.urlPrefix}/${p.slug}/`))}</g:link>
    <g:image_link>${xe(abs(p.photos[0]))}</g:image_link>
${p.photos.slice(1, 11).map(ph => `    <g:additional_image_link>${xe(abs(ph))}</g:additional_image_link>`).join('\n')}
    <g:availability>in_stock</g:availability>
    <g:condition>new</g:condition>
    <g:price>${p.price} UAH</g:price>
    <g:brand>${xe(p.brand)}</g:brand>
    <g:mpn>${xe(p.series || p.slug)}</g:mpn>
    <g:identifier_exists>no</g:identifier_exists>
    <g:google_product_category>${GCAT[p.category] || ''}</g:google_product_category>
    <g:product_type>${xe(cat.name)}</g:product_type>
    <g:shipping><g:country>UA</g:country><g:service>${xe(cat.install ? 'Монтаж під ключ' : 'Доставка по Сумах')}</g:service><g:price>${cat.install ? site.installPrice : 400} UAH</g:price></g:shipping>
  </item>`;
  }).join('\n');
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>${xe(site.name)}</title>
  <link>${xe(BASE)}</link>
  <description>${xe('Техніка для дому у Сумах: кондиціонери, пральні машини, холодильники, зарядні станції')}</description>
${items}
</channel>
</rss>
`;
  fs.writeFileSync(path.join(DIST, 'feed.xml'), feed, 'utf8');
  console.log(`feed.xml → ${products.length} products`);
}

// ---- sitemap + robots ----
const urls = [...new Set(SITEMAP)].map(u => `  <url><loc>${abs(u)}</loc></url>`).join('\n');
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, 'utf8');
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${abs('/sitemap.xml')}\n`, 'utf8');

console.log(`build OK → dist/  (${LANGS.join('/')} · ${n} product pages · ${[...new Set(SITEMAP)].length} urls)`);
console.log(`baseUrl: ${site.baseUrl}${site.baseUrl.includes('REPLACE') ? '  (placeholder!)' : ''}`);
