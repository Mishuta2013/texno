// Build: data/*.json + templates → dist/ (static HTML, pre-rendered catalog, 52 product pages, sitemap, robots).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const DIST = path.join(ROOT, 'dist');
const DATA = path.join(ROOT, 'data');
const read = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
const products = read('products.json');
const site = read('site.json');
const i18n = read('i18n.json');
const blog = read('blog.json');
const blogUrl = a => `/blog/${a.slug}/`;
const CATS = read('categories.json');
const catOf = p => CATS[p.category] || CATS['kondicioneri'];
const catList = Object.entries(CATS).map(([key, c]) => ({ key, ...c })).sort((a, b) => (a.order || 99) - (b.order || 99));
const catProducts = key => products.filter(p => p.category === key);
const SPECV = read('spec-values.json');
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
// live product counts — never hardcode a number in copy, write {{TOTAL}}/{{AC}}/{{WM}}/{{PS}}
const COUNTS = {
  TOTAL: products.length,
  AC: products.filter(p => p.category === 'kondicioneri').length,
  WM: products.filter(p => p.category === 'pralni-mashyny').length,
  PS: products.filter(p => p.category === 'zaryadni-stantsii').length,
  FR: products.filter(p => p.category === 'holodylnyky').length
};
const subCounts = s => String(s).replace(/\{\{(TOTAL|AC|WM|PS|FR)\}\}/g, (m, k) => COUNTS[k]);
const t = (k) => subCounts((i18n[L] && i18n[L][k]) ?? (i18n.uk && i18n.uk[k]) ?? k);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => Number(n).toLocaleString('uk-UA').replace(/ /g, ' ').replace(/,/g, ' ');
const BASE = site.baseUrl.replace(/\/$/, '');
const VER = Date.now();   // cache-bust assets on each build
const purl = p => `${pfx()}${catOf(p).urlPrefix}/${p.slug}/`;
const curl = c => `${pfx()}${c.urlPrefix}/`;
const ukPath = u => u.replace(/^\/(ru|en)(?=\/|$)/, '') || '/';   // strip the language prefix

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
const abs = u => BASE + u;
const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%230B1A33'/%3E%3Cpath d='M22 40h56a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6H22a6 6 0 0 1-6-6v-6a6 6 0 0 1 6-6z' fill='none' stroke='%232E8BFF' stroke-width='5'/%3E%3Cpath d='M30 64v6M50 64v8M70 64v6' stroke='%237CC4FF' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E";
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet">`;

const GA = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-HJC1PWRVE9"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-HJC1PWRVE9');gtag('config','AW-765371108');</script>`;
const GTM = `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-W3NLLCQT');</script>
<!-- End Google Tag Manager -->`;
const GTM_NS = `<!-- Google Tag Manager (noscript) --><noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-W3NLLCQT" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`;

function head({ title, desc, canonical, ogTitle, ogDesc, ogImage, jsonld, altPath }) {
  const og = ogImage || abs('/assets/og/default.jpg');
  // hreflang: altPath is the uk-form path; each language lives under its own prefix
  const alts = altPath ? LANGS.map(l => {
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
<link rel="stylesheet" href="/assets/css/main.css?v=${VER}">
<script>if('serviceWorker'in navigator){addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}</script>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}`;
}

// ---- card (mirrors assets/js/main.js cardHTML, uk static) ----
function card(p) {
  const url = purl(p);
  const badge = p.heatpump ? `<span class="cbadge hp">${esc(t('sp_hp'))}</span>`
    : p.inverter ? `<span class="cbadge inv">${esc(t("c_inverter"))}</span>` : '';
  return `<div class="card">
    <a class="card-img" href="${url}">${badge}<span class="cstock"><i></i>${esc(t('c_instock'))}</span>
      <img src="${esc(p.thumb || p.photos[0])}" alt="${esc(pname(p))}" loading="lazy" width="400" height="300"></a>
    <div class="card-body"><div class="card-brand">${esc(p.brand)}</div>
      <a class="card-name" href="${url}">${esc(pname(p))}</a>
      <div class="card-specs">${catChips(p)}</div>
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
    <div class="gc-img"><img src="${esc(p.photos[0])}" alt="${esc(pname(p))}" width="680" height="510" loading="lazy"><div class="gc-airflow" id="airflow"></div></div>
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
    <div class="gc-img"><img src="${esc(p.photos[0])}" alt="${esc(pname(p))}" width="680" height="510" fetchpriority="high"><div class="gc-charge" id="charge"></div></div>
    <div class="gc-name">${esc(pname(p))}</div>
    <div class="gc-readout">
      <div class="gc-r"><div class="v">${fmt(s.capacity_wh)}<small> ${esc(t("u_wh"))}</small></div><div class="k">${esc(t("hc_capacity"))}</div></div>
      <div class="gc-r"><div class="v">${fmt(s.output_w)}<small> ${esc(t("u_w"))}</small></div><div class="k">${esc(t("hc_power"))}</div></div>
      <div class="gc-r"><div class="v">10<small> ${esc(t("u_ms"))}</small></div><div class="k">UPS</div></div>
    </div></a>`;
}

function heroWasherCard(p) {
  const s = p.specs || {};
  return `<a class="gauge-card gc-station" href="${purl(p)}">
    <div class="gc-tag">${esc(t('gc_stock'))}</div>
    <div class="gc-head"><div class="gc-title">${esc(t('gc_hit'))}</div><div class="gc-live"><i></i> ONLINE</div></div>
    <div class="gc-img"><img src="${esc(p.photos[0])}" alt="${esc(pname(p))}" width="680" height="510" loading="lazy"><div class="gc-drum"></div></div>
    <div class="gc-name">${esc(pname(p))}</div>
    <div class="gc-readout">
      <div class="gc-r"><div class="v">${esc(s.load_kg)}<small> ${esc(t("u_kg"))}</small></div><div class="k">${esc(t("hc_load"))}</div></div>
      <div class="gc-r"><div class="v">${fmt(s.rpm)}<small> ${esc(t("u_rpm"))}</small></div><div class="k">${esc(t("hc_spin"))}</div></div>
      <div class="gc-r"><div class="v">${esc(String(s.eclass || '').split(' ')[0])}</div><div class="k">${esc(t("hc_class"))}</div></div>
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
// FAQ list + FAQPage schema, both from the current language
function faqItems() {
  return (i18n[L].faq || i18n.uk.faq || []).map(([q, a]) =>
    `<div class="faq-item"><div class="faq-q" onclick="toggleFaq(this)">${esc(q)}</div><div class="faq-a">${esc(a)}</div></div>`).join('\n      ');
}

// ---- catalog dataset injected for client hydration (no heavy desc fields) ----
const catalogData = products.map(({ desc_ru, desc_en, desc_uk, srcIndex, photoCount, ...keep }) => keep);
const injectData = (extraProducts) => `<script>window.__I18N__=${JSON.stringify(i18n)};window.__SITE__=${JSON.stringify(site)};window.__CATS__=${JSON.stringify(CATS)};window.__SPECV__=${JSON.stringify(SPECV)};window.__PRODUCTS__=${JSON.stringify(extraProducts)};</script>`;

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
const bestStation = products.find(p => p.category === 'zaryadni-stantsii');
// hero hits: station first (eager LCP image), AC second
body = body.replace('<!--HERO_CARD-->', bestStation ? heroStationCard(bestStation) : heroCard(best));
body = body.replace('<!--HERO_CARD2-->', bestStation ? heroCard(best) : '');
const bestWasher = products.find(p => p.slug === 'lg-f2y2ns3we') || products.find(p => p.category === 'pralni-mashyny');
body = body.replace('<!--HERO_CARD3-->', bestWasher ? heroWasherCard(bestWasher) : '');
if (bestStation && bestWasher) body = body.replace('class="hero-vis two"', 'class="hero-vis two hv3"');
// pre-render catalog grid for SEO (client re-renders on filter) — default tab shows ALL products
const homeCatalogCat = 'all';
// pinned products lead the default "Всі товари" view (mirrors getFiltered in main.js)
const defaultOrder = products.slice().sort((a, b) => (a.pin || 99) - (b.pin || 99));
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
  const catLinks = catList.filter(c => catProducts(c.key).length)
    .map(c => `<li><a href="${curl(c)}"><b>${esc(lf(c, 'name'))}</b></a></li>`).join('\n        ');
  const acKey = 'kondicioneri', wmKey = 'pralni-mashyny';
  const brandLi = (key, prefix) => brandsOf(key)
    .map(b => `<li><a href="#catalog" onclick="jumpBrand('${esc(b)}','${key}')">${esc(prefix)} ${esc(b)}</a></li>`).join('\n        ');
  const otherBrands = catList.filter(c => c.key !== acKey && c.key !== wmKey && catProducts(c.key).length)
    .map(c => brandLi(c.key, lf(c, 'name'))).join('\n        ');
  const col1 = `<div class="foot-col">
      <h4>${esc(t('cat_eye'))}</h4>
      <ul>
        ${catLinks}
        ${brandLi(acKey, lf(CATS[acKey],'name'))}
        ${otherBrands}
      </ul>
    </div>`;
  const wmBrands = brandLi(wmKey, (CATS[wmKey].productPrefix||{})[L] || 'Пральна машина');
  const col2 = wmBrands ? `<div class="foot-col">
      <h4>${esc(lf(CATS[wmKey],'name'))}</h4>
      <ul>
        ${wmBrands}
      </ul>
    </div>` : '';
  body = body.replace('<!--FOOT_CATALOG-->', col1 + '\n    ' + col2);
  if (col2) body = body.replace('<div class="foot-in">', '<div class="foot-in foot-in-5">');
}
body = body.replace('<!--QUIZ_INLINE-->', quizInline(true));
body = body.replace('<!--FAQ_ITEMS-->', faqItems());
body = applyI18nStatic(body);   // bake the current language into static HTML (SEO)
body = subCounts(body);         // resolve {{TOTAL}}/{{AC}}/{{WM}}/{{PS}} tokens in raw markup

// shared chrome (header before hero; footer+modals+floats from <footer> onward) for product pages
const _heroAt = body.indexOf('<section class="hero"');
const _footAt = body.indexOf('<footer');
// on inner pages (product/blog) homepage-section anchors must point to "/#..." not "#..."
const toHome = h => h.replace(/href="#(?!")/g, 'href="/#');
HEADER = toHome(body.slice(0, _heroAt));
FOOTER = toHome(body.slice(_footAt));

const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: ((i18n[L].faq) || i18n.uk.faq || []).map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
const indexHtml = `<!doctype html><html lang="${L}"><head>
${head({
  title: t('seo_home_t'),
  desc: t('seo_home_d'),
  canonical: abs(pfx() + '/'), altPath: '/',
  jsonld: {
    '@context': 'https://schema.org', '@type': 'ElectronicsStore', name: site.name,
    image: abs('/assets/og/default.jpg'), telephone: site.phone, email: site.email,
    address: { '@type': 'PostalAddress', streetAddress: 'вул. Харківська 2/1', addressLocality: site.city, addressCountry: 'UA' },
    url: BASE, priceRange: '₴₴', areaServed: 'Суми'
  }
})}
<script type="application/ld+json">${JSON.stringify(faqLd)}</script>
</head><body>${GTM_NS}
${body}
${injectData(catalogData)}
<script>window.__CATALOG_CAT__=${JSON.stringify(homeCatalogCat)};</script>
<script src="/assets/js/main.js?v=${VER}" defer></script>
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
function productPage(p) {
  const s = p.specs || {};
  const NAME = pname(p);
  const thumbs = p.photos.map((src, i) => `<button class="pp-thumb${i === 0 ? ' active' : ''}" onclick="ppShow(${i})"><img src="${esc(src)}" alt="${esc(NAME)} ${i + 1}" loading="lazy" width="800" height="600"></button>`).join('');
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
  return `<!doctype html><html lang="${L}"><head>
${(() => {
  const nm = ukPrefix ? NAME.replace(new RegExp('^' + ((cat.productPrefix || {})[L] || ukPrefix) + '\s+', 'i'), '') : NAME;
  const keySpec = (cat.ppChips || cat.chips || []).filter(c => !c.flag).map(c => fmtVal(p, c)).filter(Boolean).slice(0, 2).join(', ');
  const trust = trustLines.join('. ') + '.';
  return head({
    title: t('pp_buy_t').replace('{name}', nm) + (cat.install ? t('pp_buy_install') : ''),
    desc: `${nm} ${t('cat_in_sumy')} — ${fmt(p.price)} ${t('u_uah')}.${keySpec ? ' ' + keySpec + '.' : ''} ${trust}`,
    canonical: abs(purl(p)), altPath: `${cat.urlPrefix}/${p.slug}/`,
    ogTitle: NAME, ogImage: abs('/assets/og/' + p.slug + '.jpg'), jsonld
  });
})()}
<script type="application/ld+json">${JSON.stringify(crumbs)}</script>
</head><body>${GTM_NS}
${HEADER}
<div class="pp-wrap">
  <nav class="pp-bc"><a href="${pfx() || '/'}">${esc(t('pp_home'))}</a> › <a href="${curl(cat)}">${esc(lf(cat, 'name'))}</a> › <span>${esc(p.brand)}</span></nav>
  <div class="pp-top">
    <div class="pp-gallery">
      <div class="pp-main"><img id="pp-main-img" src="${esc(p.photos[0])}" alt="${esc(NAME)}" width="680" height="510"></div>
      <div class="pp-thumbs">${thumbs}</div>
    </div>
    <div class="pp-info">
      <div class="pp-brand">${esc(p.brand)}</div>
      <h1 class="pp-title">${esc(NAME)}</h1>
      <div class="pp-chips">${chips}</div>
      <div class="pp-price">${fmt(p.price)} <span>${esc(t('u_uah'))}</span></div>
      <div class="pp-instal">${esc(t('pp_instal'))} <b>${fmt(Math.round(p.price / 24))} ${esc(t('pp_instal2'))}</b> ${esc(t('pp_instal3'))}</div>
      <div class="pp-cta">
        <button class="btn-primary" onclick="ppLead('${esc(NAME)}')">${esc(t('pp_order'))}</button>
        <a class="btn-wa" href="${esc(site.whatsapp)}&text=${encodeURIComponent(NAME)}" target="_blank" rel="noopener">WhatsApp</a>
        <a class="btn-ghost2" href="tel:${esc(site.phone)}">${esc(site.phoneDisplay)}</a>
      </div>
      <div class="pp-trust">${trustLines.map(x => `<span>${esc(x)}</span>`).join('')}</div>
    </div>
  </div>
  <div class="pp-cols">
    <div class="pp-specs"><h2>${esc(t('pp_specs'))}</h2><table class="pp-table">${specTable(p)}</table></div>
    <div class="pp-desc"><h2>${esc(t('pp_desc'))}</h2><p>${esc(pdesc(p))}</p></div>
  </div>
  ${(() => { const rel = related(p); return rel.length ? `<div class="pp-related"><h2>${esc(t('pp_related'))}</h2><div class="grid grid-rel">${rel.map(card).join('')}</div></div>` : ''; })()}
  <div class="pp-back"><a href="${curl(cat)}">← ${esc(lf(cat, 'name'))}</a></div>
</div>
${FOOTER}
${injectData(catalogData)}
<script src="/assets/js/main.js?v=${VER}" defer></script>
<script>
function ppShow(i){var ph=${JSON.stringify(p.photos)};document.getElementById('pp-main-img').src=ph[i];document.querySelectorAll('.pp-thumb').forEach((b,j)=>b.classList.toggle('active',j===i));}
function ppLead(name){ if(window.openCb){var f=document.getElementById('cb-product');if(f){f.value=name;var w=document.getElementById('cb-product-wrap');if(w)w.style.display='block';}window.openCb();} else {location.href='tel:${esc(site.phone)}';} }
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
  const ac = catKey === 'kondicioneri', wm = catKey === 'pralni-mashyny';
  return FILTERS_HTML
    .replace('id="frow-area" style="display:none"', `id="frow-area"${ac ? '' : ' style="display:none"'}`)
    .replace('id="frow-wm" style="display:none"', `id="frow-wm"${wm ? '' : ' style="display:none"'}`)
    .replace('<option value="area-asc"', `<option value="area-asc"${ac ? '' : ' hidden'}`);
}
function categoryPage(cat) {
  const list = catProducts(cat.key);
  const NAME = lf(cat, 'name');
  const plural = list.length % 10 === 1 && list.length % 100 !== 11 ? t('cat_models1')
    : (list.length % 10 >= 2 && list.length % 10 <= 4 && (list.length % 100 < 10 || list.length % 100 >= 20) ? t('cat_models2') : t('cat_models5'));
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: NAME, url: abs(curl(cat)),
    mainEntity: { '@type': 'ItemList', numberOfItems: list.length, itemListElement: list.slice(0, 20).map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(purl(p)) })) }
  };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: t('pp_home'), item: abs(pfx() + '/') },
    { '@type': 'ListItem', position: 2, name: NAME, item: abs(curl(cat)) } ] };
  return `<!doctype html><html lang="${L}"><head>
${head({
  title: lf(cat, 'seoTitle') || t('seo_cat_t').replace('{name}', NAME),
  desc: lf(cat, 'seoDesc') || lf(cat, 'intro') || `${NAME} ${t('cat_in_sumy')}: ${list.length} ${plural} ${t('cat_instock')}.`,
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
  <section class="section catalog cat-catalog" id="catalog">
    ${filtersFor(cat.key)}
    <div class="grid" id="catalog-grid">${list.map(card).join('')}</div>
  </section>
  <div class="pp-back"><a href="${pfx() || '/'}#catalog">← ${esc(t('pp_back_all'))}</a></div>
</div>
${FOOTER}
${injectData(catalogData)}
<script>window.__CATALOG_CAT__=${JSON.stringify(cat.key)};</script>
<script src="/assets/js/main.js?v=${VER}" defer></script>
</body></html>`;
}
for (const cat of catList) {
  if (!catProducts(cat.key).length) continue;   // skip empty categories (no thin pages)
  const dir = outPath(cat.urlPrefix.replace(/^\//, ''));
  fs.writeFileSync(path.join(dir, 'index.html'), categoryPage(cat), 'utf8');
  SITEMAP.push(curl(cat));
}

// ---- blog ----
function blogCard(a) {
  return `<a class="bl-card" href="${blogUrl(a)}">
    <div class="bl-tag">${esc(a.tag)}</div>
    <h3 class="bl-card-t">${esc(a.title)}</h3>
    <p class="bl-card-d">${esc(a.desc)}</p>
    <span class="bl-more">${esc(t("blog_more"))}</span></a>`;
}
function blogIndexPage() {
  return `<!doctype html><html lang="uk"><head>
${head({ title: t('seo_blog_t'), desc: t('seo_blog_d'), canonical: abs('/blog/') })}
</head><body>${GTM_NS}
${HEADER}
<div class="pp-wrap">
  <nav class="pp-bc"><a href="/">${esc(t("pp_home"))}</a> › <span>${esc(t("nav_blog"))}</span></nav>
  <h1 class="bl-h1">${esc(t("blog_h1"))}</h1>
  <p class="bl-sub">${esc(t("blog_sub"))}</p>
  <div class="bl-grid">${blog.map(blogCard).join('')}</div>
</div>
${FOOTER}
${injectData(catalogData)}
<script src="/assets/js/main.js?v=${VER}" defer></script>
</body></html>`;
}
function blogPost(a) {
  const others = blog.filter(x => x.slug !== a.slug).slice(0, 3);
  const jsonld = { '@context': 'https://schema.org', '@type': 'Article', headline: a.title, description: a.desc,
    datePublished: a.date, dateModified: a.date, author: { '@type': 'Organization', name: site.name },
    publisher: { '@type': 'Organization', name: site.name, logo: { '@type': 'ImageObject', url: abs('/assets/icons/icon-512.png') } },
    mainEntityOfPage: abs(blogUrl(a)), image: abs('/assets/og/default.jpg') };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: t('pp_home'), item: BASE + '/' },
    { '@type': 'ListItem', position: 2, name: t('nav_blog'), item: abs('/blog/') },
    { '@type': 'ListItem', position: 3, name: a.title, item: abs(blogUrl(a)) } ] };
  return `<!doctype html><html lang="uk"><head>
${head({ title: a.title + ' | ' + site.name, desc: a.desc, canonical: abs(blogUrl(a)), ogTitle: a.title, jsonld })}
<script type="application/ld+json">${JSON.stringify(crumbs)}</script>
</head><body>${GTM_NS}
${HEADER}
<article class="pp-wrap bl-article">
  <nav class="pp-bc"><a href="/">${esc(t("pp_home"))}</a> › <a href="/blog/">${esc(t("nav_blog"))}</a> › <span>${esc(a.tag)}</span></nav>
  <div class="bl-tag">${esc(a.tag)}</div>
  <h1 class="bl-art-h1">${esc(a.title)}</h1>
  <div class="bl-meta">${new Date(a.date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })} · ${a.read} ${esc(t('blog_read'))}</div>
  <div class="bl-body">${a.html}</div>
  <div class="bl-cta"><a class="btn-primary" href="/#catalog">${esc(t('blog_cta1'))}</a> <a class="btn-ghost2" href="/kondicioner/">${esc(lf(CATS['kondicioneri'],'name'))}</a></div>
  ${others.length ? `<div class="bl-related"><h2>${esc(t("blog_also"))}</h2><div class="bl-grid">${others.map(blogCard).join('')}</div></div>` : ''}
</article>
${FOOTER}
${injectData(catalogData)}
<script src="/assets/js/main.js?v=${VER}" defer></script>
</body></html>`;
}
// the blog is written in Ukrainian only — generate it once, on the uk pass
if (L === 'uk') {
  fs.mkdirSync(path.join(DIST, 'blog'), { recursive: true });
  fs.writeFileSync(path.join(DIST, 'blog', 'index.html'), blogIndexPage(), 'utf8');
  SITEMAP.push('/blog/');
  for (const a of blog) {
    const dir = path.join(DIST, 'blog', a.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), blogPost(a), 'utf8');
    SITEMAP.push(blogUrl(a));
  }
}

// ---- privacy policy page (Ukrainian legal text, generated once) ----
if (L === 'uk') {
  const privacyBody = fs.readFileSync(path.join(ROOT, 'templates/privacy.html'), 'utf8');
  const html = `<!doctype html><html lang="uk"><head>
${head({ title: 'Політика конфіденційності | TEXNO PLAZA', desc: 'Політика конфіденційності TEXNO PLAZA: які персональні дані ми збираємо через форми, дзвінки та месенджери, з якою метою, як зберігаємо й захищаємо їх, та ваші права.', canonical: abs('/polityka-konfidentsiynosti/') })}
</head><body>
${HEADER}
${privacyBody}
${FOOTER}
${injectData(catalogData)}
<script src="/assets/js/main.js?v=${VER}" defer></script>
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

// ---- sitemap + robots ----
const urls = [...new Set(SITEMAP)].map(u => `  <url><loc>${abs(u)}</loc></url>`).join('\n');
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, 'utf8');
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${abs('/sitemap.xml')}\n`, 'utf8');

console.log(`build OK → dist/  (${LANGS.join('/')} · ${n} product pages · ${[...new Set(SITEMAP)].length} urls)`);
console.log(`baseUrl: ${site.baseUrl}${site.baseUrl.includes('REPLACE') ? '  (placeholder!)' : ''}`);
