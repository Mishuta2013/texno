// Phase 0: extract PRODUCTS + I18N from the monolithic index.html into data/*.json.
// Run: node scripts/extract.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const HTML = path.join(ROOT, 'index.html');
const DATA = path.join(ROOT, 'data');
fs.mkdirSync(DATA, { recursive: true });

const html = fs.readFileSync(HTML, 'utf8');
const lines = html.split(/\r?\n/);

// --- PRODUCTS (single line, valid JSON produced by earlier json.dumps) ---
const pLine = lines.find(l => l.startsWith('const PRODUCTS='));
if (!pLine) throw new Error('PRODUCTS line not found');
const products = JSON.parse(pLine.replace(/^const PRODUCTS=/, '').replace(/;\s*$/, ''));

// --- I18N (multiline JS object literal, eval via Function) ---
const sIdx = html.indexOf('const I18N');
const braceStart = html.indexOf('{', sIdx);
let depth = 0, end = -1;
for (let i = braceStart; i < html.length; i++) {
  const c = html[i];
  if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
}
const i18nText = html.slice(braceStart, end + 1);
const I18N = (new Function('return (' + i18nText + ')'))();
for (const lng of ['uk', 'ru', 'en']) if (!I18N[lng]) throw new Error('i18n missing lang ' + lng);

// --- slugify (strip Cyrillic prefix, translit remainder) ---
const translit = { а:'a',б:'b',в:'v',г:'h',ґ:'g',д:'d',е:'e',є:'ie',ж:'zh',з:'z',и:'y',і:'i',ї:'i',й:'i',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ь:'',ю:'iu',я:'ia',ы:'y',э:'e',ъ:'' };
function slugify(s){
  return s.toLowerCase()
    .replace(/конди[цц]і?онер|кондиционер/g,'')
    .replace(/[а-яёіїєґ]/g, ch => translit[ch] ?? '')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').replace(/-{2,}/g,'-');
}

const seen = new Set();
products.forEach((p, i) => {
  let slug = slugify(p.name || (p.brand + ' ' + (p.series||'') + ' ' + i));
  if (!slug) slug = 'model-' + (i + 1);
  let base = slug, n = 2;
  while (seen.has(slug)) slug = base + '-' + (n++);
  seen.add(slug);
  p.slug = slug;
  p.srcIndex = i;            // maps to ФОТО folder order for Phase 2
  p.photoCount = Array.isArray(p.photos) ? p.photos.length : 0;
  p.photos = [];            // file paths filled in Phase 2 (regenerated from source)
});

products[0].bestseller = true; // hero "Хіт продажів" card; owner can change

// --- site.json (globals) ---
const site = {
  name: 'TEXNO PLAZA',
  baseUrl: 'https://REPLACE_WITH_DOMAIN',   // owner will provide final domain
  phone: '+380991108041',
  phoneDisplay: '+38 (099) 110 80 41',
  email: 'dimagala48@gmail.com',
  address: 'м. Суми, вул. Харківська 2/1',
  city: 'Суми',
  hours: 'Пн–Пт 10:00–18:00 · Сб 10:00–17:00',
  whatsapp: 'https://api.whatsapp.com/send?phone=380991108041',
  googleReviewsUrl: 'https://www.google.com/maps/place/%D0%9A%D0%9E%D0%9D%D0%94%D0%98%D0%A6%D0%86%D0%9E%D0%9D%D0%95%D0%A0%D0%98+-+%D0%A2%D0%95%D0%A5%D0%9D%D0%9E%D0%9F%D0%9B%D0%90%D0%97%D0%90/data=!4m8!3m7!1s0x412901be62b6ba2f:0xa156555d39aa61f!8m2!3d50.9044303!4d34.8064328!9m1!1b1',
  elfsightAppId: 'elfsight-app-f1a3ff9d-c084-46cf-acc3-84bf9303d5bc',
  brands: ['TCL', 'MIDEA', 'Olmo', 'Samurai', 'Ardesto', 'IDEA', 'Grunhelm'],
  installPrice: 6000,
  productUrlPrefix: '/kondicioner'
};

fs.writeFileSync(path.join(DATA, 'products.json'), JSON.stringify(products, null, 2), 'utf8');
fs.writeFileSync(path.join(DATA, 'i18n.json'), JSON.stringify(I18N, null, 2), 'utf8');
fs.writeFileSync(path.join(DATA, 'site.json'), JSON.stringify(site, null, 2), 'utf8');

console.log('products:', products.length, '| sample slug:', products[0].slug);
console.log('i18n langs:', Object.keys(I18N).join(','), '| uk keys:', Object.keys(I18N.uk).length);
console.log('wrote data/products.json, data/i18n.json, data/site.json');
console.log('product keys:', Object.keys(products[0]).filter(k=>k!=='photos').join(','));
