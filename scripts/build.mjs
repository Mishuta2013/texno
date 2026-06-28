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
const L = 'uk';                                   // static pages render in default language
const t = (k) => (i18n[L] && i18n[L][k]) ?? (i18n.uk && i18n.uk[k]) ?? k;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => Number(n).toLocaleString('uk-UA').replace(/ /g, ' ').replace(/,/g, ' ');
const BASE = site.baseUrl.replace(/\/$/, '');
const VER = Date.now();   // cache-bust assets on each build
const purl = p => `${site.productUrlPrefix}/${p.slug}/`;
const abs = u => BASE + u;
const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%230B1A33'/%3E%3Cpath d='M22 40h56a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6H22a6 6 0 0 1-6-6v-6a6 6 0 0 1 6-6z' fill='none' stroke='%232E8BFF' stroke-width='5'/%3E%3Cpath d='M30 64v6M50 64v8M70 64v6' stroke='%237CC4FF' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E";
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet">`;

const GA = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-HJC1PWRVE9"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-HJC1PWRVE9');</script>`;
const GTM = `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-W3NLLCQT');</script>
<!-- End Google Tag Manager -->`;
const GTM_NS = `<!-- Google Tag Manager (noscript) --><noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-W3NLLCQT" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`;

function head({ title, desc, canonical, ogTitle, ogDesc, ogImage, jsonld }) {
  const og = ogImage || abs('/assets/og/default.jpg');
  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#0B1A33">
${GTM}
${GA}
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
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
  const btu = p.btu ? (p.btu / 1000).toFixed(0) + 'k BTU' : '';
  const area = p.area ? `до ${p.area} м²` : '';
  const badge = p.heatpump ? `<span class="cbadge hp">${esc(t('sp_hp'))}</span>`
    : p.inverter ? `<span class="cbadge inv">Інвертор</span>` : '';
  const wifi = p.wifi ? `<span class="stag">⌁ Wi-Fi</span>` : '';
  return `<div class="card">
    <a class="card-img" href="${url}">${badge}<span class="cstock"><i></i>${esc(t('c_instock'))}</span>
      <img src="${esc(p.thumb || p.photos[0])}" alt="${esc(p.name)}" loading="lazy" width="400" height="300"></a>
    <div class="card-body"><div class="card-brand">${esc(p.brand)}</div>
      <a class="card-name" href="${url}">${esc(p.name)}</a>
      <div class="card-specs">${btu ? `<span class="stag">❄ ${btu}</span>` : ''}${area ? `<span class="stag">⌖ ${area}</span>` : ''}${wifi}</div>
      <div class="card-foot"><div class="card-price">${fmt(p.price)} <small>грн</small></div>
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
    <div class="gc-img"><img src="${esc(p.photos[0])}" alt="${esc(p.name)}" width="680" height="510"><div class="gc-airflow" id="airflow"></div></div>
    <div class="gc-name">${esc(p.name)}</div>
    <div class="gc-readout">
      <div class="gc-r"><div class="v">${fmt(p.btu)}<small> BTU</small></div><div class="k">${esc(t('gc_power'))}</div></div>
      <div class="gc-r"><div class="v">${esc(s.eclass || 'A++')}</div><div class="k">${esc(t('gc_class'))}</div></div>
      <div class="gc-r"><div class="v">${esc(s.noise || 22)}<small> дБ</small></div><div class="k">${esc(t('gc_noise'))}</div></div>
    </div></a>`;
}

// render current uk i18n text into static HTML (matches runtime applyI18n → correct for SEO/no-JS)
function applyI18nStatic(html) {
  return html.replace(/(<([a-zA-Z0-9]+)((?:[^>]*?)\sdata-i18n="([^"]+)"(?:[^>]*?))>)([\s\S]*?)(<\/\2>)/g,
    (m, open, tag, attrs, key, inner, close) => {
      const v = i18n.uk[key];
      return v === undefined ? m : open + esc(v) + close;
    });
}

// ---- catalog dataset injected for client hydration (no heavy desc fields) ----
const catalogData = products.map(({ desc_ru, desc_en, desc_uk, srcIndex, photoCount, ...keep }) => keep);
const injectData = (extraProducts) => `<script>window.__I18N__=${JSON.stringify(i18n)};window.__SITE__=${JSON.stringify(site)};window.__PRODUCTS__=${JSON.stringify(extraProducts)};</script>`;

// ===================== BUILD =====================
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

let body = fs.readFileSync(path.join(ROOT, 'templates/body.html'), 'utf8');
const best = products.find(p => p.bestseller) || products[0];
body = body.replace('<!--HERO_CARD-->', heroCard(best));
// pre-render catalog grid for SEO (client re-renders on filter)
body = body.replace('<div class="grid" id="catalog-grid"></div>',
  `<div class="grid" id="catalog-grid">${products.map(card).join('')}</div>`);
body = applyI18nStatic(body);   // bake current uk text into static HTML (SEO)

// shared chrome (header before hero; footer+modals+floats from <footer> onward) for product pages
const _heroAt = body.indexOf('<section class="hero"');
const _footAt = body.indexOf('<footer');
// on inner pages (product/blog) homepage-section anchors must point to "/#..." not "#..."
const toHome = h => h.replace(/href="#(?!")/g, 'href="/#');
const HEADER = toHome(body.slice(0, _heroAt));
const FOOTER = toHome(body.slice(_footAt));

const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: (i18n.uk.faq || []).map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
const indexHtml = `<!doctype html><html lang="uk"><head>
${head({
  title: 'TEXNO PLAZA — Кондиціонери у Сумах | Продаж та монтаж під ключ',
  desc: 'TEXNO PLAZA — кондиціонери у Сумах. 52 моделі TCL, MIDEA, Olmo, Samurai, Ardesto, IDEA, Grunhelm. Монтаж під ключ за 1 день. Оплата після встановлення.',
  canonical: abs('/'),
  jsonld: {
    '@context': 'https://schema.org', '@type': 'HVACBusiness', name: site.name,
    image: abs('/assets/og/default.jpg'), telephone: site.phone, email: site.email,
    address: { '@type': 'PostalAddress', streetAddress: 'вул. Харківська 2/1', addressLocality: site.city, addressCountry: 'UA' },
    url: BASE, priceRange: '₴₴', areaServed: 'Суми'
  }
})}
<script type="application/ld+json">${JSON.stringify(faqLd)}</script>
</head><body>${GTM_NS}
${body}
${injectData(catalogData)}
<script src="/assets/js/main.js?v=${VER}" defer></script>
</body></html>`;
fs.writeFileSync(path.join(DIST, 'index.html'), indexHtml, 'utf8');

// ---- product pages ----
function specTable(p) {
  const s = p.specs || {};
  const rows = [
    [t('sp_power'), (p.btu ? (p.btu / 1000).toFixed(0) + 'k BTU' : '') + (s.power_w ? ` · ${s.power_w} Вт` : '')],
    [t('sp_area'), p.area ? `до ${p.area} м²` : '—'],
    [t('sp_comp'), p.inverter ? t('sp_inv') : t('sp_onoff')],
    s.eclass && [t('sp_eclass'), s.eclass],
    s.noise && [t('sp_noise'), `від ${s.noise} дБ`],
    [t('sp_freon'), 'R32'],
    (s.cool_min !== undefined) && [t('sp_cool_range'), `${s.cool_min}°C … +${s.cool_max}°C`],
    (s.heat_min !== undefined) && [t('sp_heat_min'), `${s.heat_min}°C`],
    [t('sp_wifi'), p.wifi ? t('sp_yes') : t('sp_opt')],
    [t('sp_heat'), p.heatpump ? t('sp_hp') : t('sp_yes')],
  ].filter(Boolean);
  return rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
}
function related(p) {
  return products.filter(x => x.slug !== p.slug && (x.brand === p.brand || x.btu === p.btu)).slice(0, 3);
}
function productPage(p) {
  const s = p.specs || {};
  const thumbs = p.photos.map((src, i) => `<button class="pp-thumb${i === 0 ? ' active' : ''}" onclick="ppShow(${i})"><img src="${esc(src)}" alt="${esc(p.name)} фото ${i + 1}" loading="lazy"></button>`).join('');
  const chips = [p.btu && `❄ ${(p.btu / 1000).toFixed(0)}k BTU`, p.area && `⌖ до ${p.area} м²`, s.eclass && `⚡ ${s.eclass}`, s.noise && `🔊 від ${s.noise} дБ`, p.inverter && 'Інвертор', p.heatpump && 'Тепловий насос', p.wifi && 'Wi-Fi'].filter(Boolean)
    .map(c => `<span class="pp-chip">${esc(c)}</span>`).join('');
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.name, sku: p.slug,
    image: p.photos.map(ph => abs(ph)), description: p.desc_uk, brand: { '@type': 'Brand', name: p.brand },
    offers: { '@type': 'Offer', price: p.price, priceCurrency: 'UAH', availability: 'https://schema.org/InStock', url: abs(purl(p)), itemCondition: 'https://schema.org/NewCondition' }
  };
  const crumbs = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Головна', item: BASE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Каталог', item: BASE + '/#catalog' },
      { '@type': 'ListItem', position: 3, name: p.name, item: abs(purl(p)) }
    ]
  };
  return `<!doctype html><html lang="uk"><head>
${head({ title: `${p.name} — купити у Сумах | ${site.name}`, desc: `${p.name}. ${p.btu} BTU, до ${p.area} м², клас ${s.eclass || ''}. Ціна ${fmt(p.price)} грн. Монтаж під ключ. ${site.name}, Суми.`, canonical: abs(purl(p)), ogTitle: p.name, ogImage: abs('/assets/og/' + p.slug + '.jpg'), jsonld })}
<script type="application/ld+json">${JSON.stringify(crumbs)}</script>
</head><body>${GTM_NS}
${HEADER}
<div class="pp-wrap">
  <nav class="pp-bc"><a href="/">Головна</a> › <a href="/#catalog">Каталог</a> › <span>${esc(p.brand)}</span></nav>
  <div class="pp-top">
    <div class="pp-gallery">
      <div class="pp-main"><img id="pp-main-img" src="${esc(p.photos[0])}" alt="${esc(p.name)}" width="680" height="510"></div>
      <div class="pp-thumbs">${thumbs}</div>
    </div>
    <div class="pp-info">
      <div class="pp-brand">${esc(p.brand)}</div>
      <h1 class="pp-title">${esc(p.name)}</h1>
      <div class="pp-chips">${chips}</div>
      <div class="pp-price">${fmt(p.price)} <span>грн</span></div>
      <div class="pp-instal">або <b>${fmt(Math.round(p.price / 24))} грн/міс</b> × 24 (оплата частинами)</div>
      <div class="pp-cta">
        <button class="btn-primary" onclick="ppLead('${esc(p.name)}')">Замовити</button>
        <a class="btn-wa" href="${esc(site.whatsapp)}&text=${encodeURIComponent('Цікавить ' + p.name)}" target="_blank" rel="noopener">WhatsApp</a>
        <a class="btn-ghost2" href="tel:${esc(site.phone)}">${esc(site.phoneDisplay)}</a>
      </div>
      <div class="pp-trust"><span>✓ Монтаж під ключ — ${fmt(site.installPrice)} грн</span><span>✓ Оплата після встановлення</span><span>✓ Гарантія до 5 років</span></div>
    </div>
  </div>
  <div class="pp-cols">
    <div class="pp-specs"><h2>Характеристики</h2><table class="pp-table">${specTable(p)}</table></div>
    <div class="pp-desc"><h2>Опис</h2><p>${esc(p.desc_uk)}</p></div>
  </div>
  <div class="pp-related"><h2>Схожі моделі</h2><div class="grid grid-rel">${related(p).map(card).join('')}</div></div>
  <div class="pp-back"><a href="/#catalog">← Усі кондиціонери</a></div>
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

let n = 0;
for (const p of products) {
  const dir = path.join(DIST, site.productUrlPrefix.replace(/^\//, ''), p.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), productPage(p), 'utf8');
  n++;
}

// ---- blog ----
function blogCard(a) {
  return `<a class="bl-card" href="${blogUrl(a)}">
    <div class="bl-tag">${esc(a.tag)}</div>
    <h3 class="bl-card-t">${esc(a.title)}</h3>
    <p class="bl-card-d">${esc(a.desc)}</p>
    <span class="bl-more">Читати →</span></a>`;
}
function blogIndexPage() {
  return `<!doctype html><html lang="uk"><head>
${head({ title: 'Блог про кондиціонери — поради, монтаж, обслуговування | ' + site.name, desc: 'Корисні статті про вибір, монтаж та обслуговування кондиціонерів у Сумах: потужність, ціна монтажу, інвертор vs On/Off, опалення тепловим насосом.', canonical: abs('/blog/') })}
</head><body>${GTM_NS}
${HEADER}
<div class="pp-wrap">
  <nav class="pp-bc"><a href="/">Головна</a> › <span>Блог</span></nav>
  <h1 class="bl-h1">Блог про кондиціонери</h1>
  <p class="bl-sub">Поради щодо вибору, монтажу та обслуговування кліматичної техніки.</p>
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
    { '@type': 'ListItem', position: 1, name: 'Головна', item: BASE + '/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: abs('/blog/') },
    { '@type': 'ListItem', position: 3, name: a.title, item: abs(blogUrl(a)) } ] };
  return `<!doctype html><html lang="uk"><head>
${head({ title: a.title + ' | ' + site.name, desc: a.desc, canonical: abs(blogUrl(a)), ogTitle: a.title, jsonld })}
<script type="application/ld+json">${JSON.stringify(crumbs)}</script>
</head><body>${GTM_NS}
${HEADER}
<article class="pp-wrap bl-article">
  <nav class="pp-bc"><a href="/">Головна</a> › <a href="/blog/">Блог</a> › <span>${esc(a.tag)}</span></nav>
  <div class="bl-tag">${esc(a.tag)}</div>
  <h1 class="bl-art-h1">${esc(a.title)}</h1>
  <div class="bl-meta">${new Date(a.date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })} · ${a.read} хв читання</div>
  <div class="bl-body">${a.html}</div>
  <div class="bl-cta"><a class="btn-primary" href="/#catalog">Переглянути каталог</a> <a class="btn-ghost2" href="/" onclick="if(window.openQuiz){openQuiz();return false}">Підібрати за площею</a></div>
  ${others.length ? `<div class="bl-related"><h2>Читайте також</h2><div class="bl-grid">${others.map(blogCard).join('')}</div></div>` : ''}
</article>
${FOOTER}
${injectData(catalogData)}
<script src="/assets/js/main.js?v=${VER}" defer></script>
</body></html>`;
}
fs.mkdirSync(path.join(DIST, 'blog'), { recursive: true });
fs.writeFileSync(path.join(DIST, 'blog', 'index.html'), blogIndexPage(), 'utf8');
for (const a of blog) {
  const dir = path.join(DIST, 'blog', a.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), blogPost(a), 'utf8');
}

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
const urls = ['/', '/blog/', ...blog.map(blogUrl), ...products.map(purl)].map(u => `  <url><loc>${abs(u)}</loc></url>`).join('\n');
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, 'utf8');
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${abs('/sitemap.xml')}\n`, 'utf8');

console.log(`build OK → dist/  (index + ${n} product pages + sitemap + robots)`);
console.log(`baseUrl: ${site.baseUrl}${site.baseUrl.includes('REPLACE') ? '  (placeholder!)' : ''}`);
