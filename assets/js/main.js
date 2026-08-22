const PRODUCTS=window.__PRODUCTS__||[];
const I18N=window.__I18N__||{};
const SITE=window.__SITE__||{};
const CATS=window.__CATS__||{};
const catOf=p=>CATS[p&&p.category]||CATS['kondicioneri']||{};
function jFmtVal(p,f){
  const s=p.specs||{};
  if(f.value!==undefined)return f.value;
  const raw=f.key?((s[f.key]!==undefined&&s[f.key]!==null)?s[f.key]:p[f.key]):undefined;
  switch(f.fmt){
    case'kbtu':return p.btu?(p.btu/1000).toFixed(0)+'k BTU':null;
    case'kbtu_power':return p.btu?(p.btu/1000).toFixed(0)+'k BTU'+(s.power_w?' · '+s.power_w+' '+t('u_w'):''):null;
    case'area':return p.area?t('u_upto')+' '+p.area+' '+t('u_m2'):(f.dash?'—':null);
    case'comp':return p.inverter?t('u_inverter'):t('u_onoff');
    case'noise':return s.noise?t('u_from')+' '+s.noise+' '+t('u_db'):null;
    case'cool_range':return(s.cool_min!==undefined)?s.cool_min+'°C … +'+s.cool_max+'°C':null;
    case'celsius':return(raw!==undefined&&raw!==null)?raw+'°C':null;
    case'wifi_yesopt':return p.wifi?t('u_yes'):t('u_option');
    case'heat_yesno':return p.heatpump?t('u_yes'):t('u_no');
    case'wh':return raw?raw+' '+t('u_wh'):null;
    case'watt':return raw?raw+' '+t('u_w'):null;
    case'sockets':return raw?raw+' '+t('u_sockets'):null;
    case'first':return raw?String(raw).split(' ')[0]:null;
    case'litres':return raw?raw+' '+t('u_l'):null;
    case'mins':{const n=Number(raw);if(!n)return null;const h=Math.floor(n/60),m=n%60;
      return h?(m?h+' '+t('rt_hr')+' '+m+' '+t('rt_min'):h+' '+t('rt_hr')):m+' '+t('rt_min');}
    case'kg':return raw?raw+' '+t('u_kg'):null;
    case'rpm':return raw?raw+' '+t('u_rpm'):null;
    case'cm':return raw?raw+' '+t('u_cm'):null;
    default:return specValJS((raw!==undefined&&raw!==null&&raw!=='')?raw:null);
  }
}
/* free-text spec values + per-language labels, mirroring build.mjs */
const SPECV=window.__SPECV__||{};
function specValJS(v){
  if(LANG==='uk'||typeof v!=='string')return v;
  const e=SPECV[v];return (e&&e[LANG])||v;
}
const lfJS=(o,field)=>(LANG!=='uk'&&o&&o[field+'_'+LANG])||(o?o[field]:undefined);
function pnameJS(p){
  if(LANG!=='uk'&&p['name_'+LANG])return p['name_'+LANG];
  const pref=(catOf(p)||{}).productPrefix;
  if(!pref||LANG==='uk'||!pref[LANG]||!p.name.startsWith(pref.uk))return p.name;
  return pref[LANG]+p.name.slice(pref.uk.length);
}
function catChipsJS(p){
  return(catOf(p).chips||[]).map(function(c){
    if(c.flag)return p[c.flag]?'<span class="stag">'+c.icon+' '+lfJS(c,'label')+'</span>':'';
    const v=jFmtVal(p,c);
    return v?'<span class="stag">'+c.icon+' '+v+'</span>':'';
  }).join('');
}
/* ============ CONFIG ============ */
const PHONE="380991108041";              // WhatsApp / Viber / Telegram number
const TG_USER="a3w44";                    // Telegram username
const FORMSPREE="xaqgygqb";          // Formspree form ID (e.g. xyzabcd)

function track(n,p){try{if(window.gtag)gtag('event',n,p||{});}catch(e){}}
/* lead events → GA4 (imported to Google Ads as conversions): click_to_call, click_whatsapp, generate_lead */
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a');if(!a)return;var h=a.getAttribute('href')||'';if(h.indexOf('tel:')===0){track('click_to_call');}else if(h.indexOf('api.whatsapp.com')>-1||h.indexOf('wa.me')>-1||h.indexOf('t.me')>-1||h.toLowerCase().indexOf('viber')>-1){track('click_whatsapp');}},true);

/* language comes from the URL: / = uk, /ru/… and /en/… are separate page trees */
const LANG_FROM_PATH=(function(){var m=location.pathname.match(/^\/(ru|en)(?=\/|$)/);return m?m[1]:'uk';})();
let LANG = LANG_FROM_PATH;
if(!I18N[LANG]) LANG='uk';
try{localStorage.setItem('tp_lang',LANG);}catch(e){}
let activeBvol='all', activeHeat='all', activeCap='all', activePw='all', activeBrand='all', activeArea='all', activeType='all', activePrice='all', activeLoad='all', activeDepth='all', activeVol='all', activeHeight='all', activeTech='all', currentProduct=null;
let FAV = JSON.parse(localStorage.getItem('tp_fav')||'[]');
let CMP = JSON.parse(localStorage.getItem('tp_cmp')||'[]');

const $=id=>document.getElementById(id);
const fmt=n=>n.toLocaleString(LANG==='en'?'en-US':(LANG==='ru'?'ru-RU':'uk-UA'));
const COUNTS={TOTAL:PRODUCTS.length,
  AC:PRODUCTS.filter(p=>p.category==='kondicioneri').length,
  WM:PRODUCTS.filter(p=>p.category==='pralni-mashyny').length,
  PS:PRODUCTS.filter(p=>p.category==='zaryadni-stantsii').length,
  FR:PRODUCTS.filter(p=>p.category==='holodylnyky').length};
const PLURALS={uk:['товар','товари','товарів'],ru:['товар','товара','товаров'],en:['product','products','products']};
function plural(n,f){if(LANG==='en')return n===1?f[0]:f[1];
  const a=n%10,b=n%100;
  if(a===1&&b!==11)return f[0];
  if(a>=2&&a<=4&&(b<10||b>=20))return f[1];
  return f[2];}
const subCounts=s=>String(s)
  .replace(/\{\{ITEMS\}\}/g,()=>COUNTS.TOTAL+' '+plural(COUNTS.TOTAL,PLURALS[LANG]||PLURALS.uk))
  .replace(/\{\{(TOTAL|AC|WM|PS|FR)\}\}/g,(m,k)=>COUNTS[k]);
const t=k=>subCounts(I18N[LANG][k]!==undefined?I18N[LANG][k]:(I18N.uk[k]||k));
const pdesc=p=>p['desc_'+LANG]||p.desc_uk;

/* ============ I18N ENGINE ============ */
function applyI18n(){
  document.documentElement.lang = LANG;
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const k=el.getAttribute('data-i18n'); const v=t(k);
    if(v!==undefined) el.textContent=v;
  });
  // icon-only controls carry their name in aria-label, which must translate too
  document.querySelectorAll('[data-i18n-aria]').forEach(el=>{
    const k=el.getAttribute('data-i18n-aria'); const v=t(k);
    if(v!==undefined) el.setAttribute('aria-label',v);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el=>{
    const k=el.getAttribute('data-i18n-ph'); const v=t(k);
    if(v!==undefined) el.setAttribute('placeholder',v);
  });
  // sort select options
  const so=$('sort-select');
  if(so){[['default','sort_pop'],['price-asc','sort_cheap'],['price-desc','sort_exp'],['area-asc','sort_area']].forEach(([val,key])=>{const o=so.querySelector(`option[value="${val}"]`);if(o)o.textContent=t(key);});}
  // interest select
  const ci=$('cf-interest');
  if(ci){[...ci.options].forEach(o=>{const k=o.getAttribute('data-i18n');if(k)o.textContent=t(k);});}
  // top strip / contact static
  setText('top-addr',t('top_addr')); setText('top-hours',t('top_hours'));
  setText('con-addr-val',t('con_addr_val')); setText('con-hours-val',t('con_hours_val'));
  // lang buttons
  document.querySelectorAll('.lang-btn').forEach(b=>b.classList.toggle('active',b.dataset.lang===LANG));
  // dynamic UI
  renderCatalog(); updateCalc(); renderCmpBar(); updateFavCount();
  // the page is served pre-rendered in its own language, so the <title> stays as built
}
function setText(id,v){const e=$(id);if(e)e.textContent=v;}
/* switching language navigates to the same page in the other tree */
function setLang(l){
  // I18N now only carries this page's language, so validity comes from __LANGS__
  if((window.__LANGS__||['uk','ru','en']).indexOf(l)<0||l===LANG)return;
  try{localStorage.setItem('tp_lang',l);}catch(e){}
  /* Not every page exists in every language — the blog is written in Ukrainian
     and Russian only. Each page lists the languages it really has as hreflang
     links, so follow those; if this one has no version in the chosen language,
     land on that language's home page rather than a 404. */
  var alt=document.querySelector('link[rel="alternate"][hreflang="'+l+'"]');
  if(alt){location.href=alt.getAttribute('href')+location.hash;return;}
  var here=document.querySelector('link[rel="alternate"][hreflang="'+LANG+'"]');
  if(here){location.href=(l==='uk'?'/':'/'+l+'/');return;}
  var base=location.pathname.replace(/^\/(ru|en)(?=\/|$)/,'')||'/';
  if(!base.startsWith('/'))base='/'+base;
  location.href=(l==='uk'?'':'/'+l)+base+location.hash;
}

/* ============ THEME ============ */
/* dark theme removed in redesign — single curated light theme */

/* ============ HERO ============ */
(function(){const af=$('airflow');if(!af)return;for(let i=0;i<5;i++){const s=document.createElement('span');s.style.top=(8+i*12)+'px';s.style.width=(50+Math.random()*40)+'%';s.style.left='0';s.style.animationDelay=(i*0.4)+'s';af.appendChild(s);}})();
/* energy sparks on the power-station hero card */
/* fridge hero card: drifting cold-air specks */
(function(){const cl=$('chill');if(!cl)return;for(let i=0;i<9;i++){const s=document.createElement('span');
  s.style.left=(6+i*10+Math.random()*7)+'%';s.style.animationDelay=(i*0.42+Math.random()*0.5)+'s';
  s.style.animationDuration=(3.4+Math.random()*1.8)+'s';cl.appendChild(s);}})();
(function(){const ch=$('charge');if(!ch)return;for(let i=0;i<7;i++){const s=document.createElement('span');s.style.left=(12+i*12+Math.random()*6)+'%';s.style.animationDelay=(i*0.34)+'s';s.style.animationDuration=(2.2+Math.random()*1.2)+'s';ch.appendChild(s);}})();

/* ============ CATALOG ============ */
/* Mirror of mixedOrder() in build.mjs — the pre-rendered grid and this
   re-render must produce the identical order or the page reshuffles on load. */
function mixedOrder(list){
  const seen={},size={};
  list.forEach(p=>{size[p.category]=(size[p.category]||0)+1;});
  return list.map((p,i)=>{
    const n=(seen[p.category]=(seen[p.category]||0)+1)-1;
    return {p,i,pin:p.pin||99,k:(n+0.5)/size[p.category]};
  }).sort((a,b)=>a.pin-b.pin||a.k-b.k||a.i-b.i).map(x=>x.p);
}
function getFiltered(){
  let list=[...PRODUCTS];
  if(window.__CATALOG_CAT__&&window.__CATALOG_CAT__!=='all') list=list.filter(p=>p.category===window.__CATALOG_CAT__);
  // a brand page is pinned to its brand, whatever else is on the page
  if(window.__BRAND__) list=list.filter(p=>p.brand===window.__BRAND__);
  // brand pages show a grid without the filter bar, so these controls may not
  // exist — reading them blindly threw and left the catalogue unrendered
  const si=$('search-input');
  const q=si?si.value.toLowerCase().trim():'';
  if(q) list=list.filter(p=>p.name.toLowerCase().includes(q)||p.brand.toLowerCase().includes(q)||p.series.toLowerCase().includes(q));
  if(activeBrand!=='all') list=list.filter(p=>p.brand===activeBrand);
  if(activeType==='inverter') list=list.filter(p=>p.inverter);
  if(activeType==='heatpump') list=list.filter(p=>p.heatpump);
  if(activeArea!=='all'){const a=parseInt(activeArea);
    if(a===25)list=list.filter(p=>p.area<=25);else if(a===35)list=list.filter(p=>p.area>25&&p.area<=35);
    else if(a===50)list=list.filter(p=>p.area>35&&p.area<=50);else if(a===70)list=list.filter(p=>p.area>50);}
  if(activeLoad!=='all'){const kg=parseInt(activeLoad);list=list.filter(p=>p.specs&&Number(p.specs.load_kg)===kg);}
  if(activeDepth!=='all'){list=list.filter(p=>{const d=p.specs&&parseFloat(p.specs.depth);if(!d)return false;return activeDepth==='narrow'?d<45:d>=45;});}
  if(activeCap!=='all'){const [lo,hi]=activeCap.split('-').map(Number);list=list.filter(p=>{const v=p.specs&&Number(p.specs.capacity_wh);return v>lo&&v<=hi;});}
  if(activePw!=='all'){const [lo,hi]=activePw.split('-').map(Number);list=list.filter(p=>{const v=p.specs&&Number(p.specs.output_w);return v>lo&&v<=hi;});}
  if(activeVol!=='all'){const [lo,hi]=activeVol.split('-').map(Number);list=list.filter(p=>{const v=p.specs&&Number(p.specs.volume_l);return v>lo&&v<=hi;});}
  if(activeHeight!=='all'){const [lo,hi]=activeHeight.split('-').map(Number);list=list.filter(p=>{const h=p.specs&&Number(p.specs.height_cm);return h>lo&&h<=hi;});}
  /* water heaters: volume bands of their own (30/50/80/100 l, not the fridge
     bands), plus the one distinction that actually decides the purchase —
     a dry steatite element versus a wet copper one. */
  if(activeBvol!=='all'){const [lo,hi]=activeBvol.split('-').map(Number);list=list.filter(p=>{const v=p.specs&&Number(p.specs.volume_l);return v>lo&&v<=hi;});}
  if(activeHeat==='dry')list=list.filter(p=>p.dryheat);
  if(activeHeat==='wet')list=list.filter(p=>!p.dryheat);
  if(activeHeat==='slim')list=list.filter(p=>p.slim);
  if(activeTech==='nofrost')list=list.filter(p=>p.nofrost);
  if(activeTech==='inverter')list=list.filter(p=>p.inverter);
  if(activePrice!=='all'){const [lo,hi]=String(activePrice).split('-').map(Number);
    if(!isNaN(lo)&&!isNaN(hi))list=list.filter(p=>p.price>lo&&p.price<=hi);}
  const so=$('sort-select');
  const sort=so?so.value:'default';
  if(sort==='price-asc')list.sort((a,b)=>a.price-b.price);
  else if(sort==='price-desc')list.sort((a,b)=>b.price-a.price);
  else if(sort==='area-asc')list.sort((a,b)=>(a.area||0)-(b.area||0));
  else list=mixedOrder(list);            // default: pinned first, then categories interleaved
  return list;
}
/* Every language lives in its own page tree, so a link built on /ru/ has to stay
   in /ru/ — without the prefix a Russian visitor is thrown onto the Ukrainian page. */
const langPfx=()=>(LANG==='uk'?'':'/'+LANG);
const brandSlugJS=b=>String(b).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
function productUrl(p){return langPfx()+(catOf(p).urlPrefix||SITE.productUrlPrefix||'/kondicioner')+'/'+p.slug+'/';}
function cardHTML(p){
  const idx=PRODUCTS.indexOf(p);
  const url=productUrl(p);
  let badge='';
  if(p.heatpump)badge=`<span class="cbadge heat">${t('sp_hp')}</span>`;
  else if(p.inverter)badge=`<span class="cbadge inv">${t('f_inv').replace(/і$|ые$|s$/,'')||'Inverter'}</span>`;
  /* worked out at build time and shipped on the product, so this cannot
     disagree with the statically rendered cards */
  const edge=p.edge?`<span class="cedge">${t(p.edge)}</span>`:'';
  const favOn=FAV.includes(idx)?'on':'';
  const cmpOn=CMP.includes(idx)?'on':'';
  return`<div class="card">
    <a class="card-img" href="${url}">
      ${badge}
      <span class="cstock"><i></i>${t('c_instock')}</span>
      <button class="card-fav ${favOn}" onclick="event.preventDefault();event.stopPropagation();toggleFav(${idx})" aria-label="fav"><svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg></button>
      <button class="card-cmp ${cmpOn}" title="${t('cmp_add')}" aria-label="${t('cmp_add')}" onclick="event.preventDefault();event.stopPropagation();toggleCmp(${idx})"><svg viewBox="0 0 24 24"><path d="M3 6h7M14 6h7M6.5 6v12M17.5 6v12M3 12l3.5-6 3.5 6a3.5 3.5 0 0 1-7 0zM14 12l3.5-6 3.5 6a3.5 3.5 0 0 1-7 0z"/></svg><span class="cmp-lbl">${t('cmp_add')}</span></button>
      <img src="${p.thumb}" alt="${pnameJS(p)}" loading="lazy" width="400" height="300">
    </a>
    <div class="card-body">
      <a class="card-brand" href="${langPfx()}${(catOf(p).urlPrefix||'')}/${brandSlugJS(p.brand)}/">${p.brand}</a>
      <a class="card-name" href="${url}">${pnameJS(p)}</a>
      ${edge}
      <div class="card-specs">${catChipsJS(p)}</div>
      <div class="card-foot">
        <div class="card-price">${fmt(p.price)} <small>${t('u_uah')}</small></div>
        <div class="card-act">
          <div class="row2">
            <button class="btn-order" onclick="openOrder(${idx})">${t('c_order')}</button>
            <a class="btn-det" href="${url}">${t('c_det')}</a>
          </div>
          <button class="btn-buy" onclick="openQbuy(event,${idx})"><svg viewBox="0 0 24 24"><path d="M3 3h2l2 12h10l2-8H6"/><circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/></svg>${t('c_buy')}</button>
        </div>
      </div>
    </div>
  </div>`;
}
function renderCatalog(){
  const grid=$('catalog-grid'); if(!grid) return;
  const list=getFiltered();
  const base=(window.__CATALOG_CAT__&&window.__CATALOG_CAT__!=='all')?PRODUCTS.filter(p=>p.category===window.__CATALOG_CAT__).length:PRODUCTS.length;
  const rc=$('results-count'); if(rc) setResultCount(rc,list.length,base);
  if(!list.length){grid.innerHTML=`<div class="no-results"><p>${t('no_res_t')}</p><span>${t('no_res_s')}</span></div>`;return;}
  grid.innerHTML=list.map(cardHTML).join('');
}
/* The result count rewrote itself in place, so a filter that took the grid
   from 52 models to 9 looked like nothing had happened. Count to the new
   figure instead: long enough to notice, short enough that nobody waits to
   read it, and only the number is rewritten rather than the whole line. */
let rcSeen=null, rcRun=0;
function setResultCount(el,to,base){
  const key=base+'|'+LANG;
  if(el.dataset.rcKey!==key){
    el.innerHTML=`${t('found')} <strong class="rc-n">${to}</strong> ${t('of')} ${base} ${t('models_w')}`;
    el.dataset.rcKey=key; rcSeen=to; return;
  }
  const num=el.querySelector('.rc-n'); if(!num){el.dataset.rcKey='';return setResultCount(el,to,base);}
  const from=rcSeen==null?to:rcSeen;
  rcSeen=to;
  const token=++rcRun;
  /* Write the real figure first and let the tween play over it. If the frame
     callbacks never arrive — a hidden tab, reduced motion, anything — what is
     left on screen is the correct number rather than the previous one. */
  num.textContent=to;
  if(from===to||matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  el.classList.remove('rc-bump'); void el.offsetWidth; el.classList.add('rc-bump');
  const t0=performance.now(), dur=Math.min(420,140+Math.abs(to-from)*12);
  requestAnimationFrame(function step(now){
    if(token!==rcRun)return;                       // a newer filter click won
    const p=Math.min(1,(now-t0)/dur);
    num.textContent=Math.round(from+(to-from)*(1-Math.pow(1-p,3)));
    if(p<1)requestAnimationFrame(step); else num.textContent=to;
  });
}
function setupFilters(){
  [['brand-filters','brand'],['area-filters','area'],['type-filters','type'],['price-filters','price'],['load-filters','load'],['depth-filters','depth'],['vol-filters','vol'],['height-filters','height'],['tech-filters','tech'],['cap-filters','cap'],['pw-filters','pw'],['bvol-filters','bvol'],['heat-filters','heat']].forEach(([gid,attr])=>{
    const g=$(gid); if(!g) return;
    g.addEventListener('click',e=>{const b=e.target.closest('.fbtn');if(!b)return;const v=b.dataset[attr];if(v===undefined)return;
      g.querySelectorAll('.fbtn').forEach(x=>x.classList.remove('active'));b.classList.add('active');
      if(attr==='brand')activeBrand=v;if(attr==='area')activeArea=v;if(attr==='type')activeType=v;if(attr==='price')activePrice=v;
      if(attr==='load')activeLoad=v;if(attr==='depth')activeDepth=v;
      if(attr==='vol')activeVol=v;if(attr==='height')activeHeight=v;if(attr==='tech')activeTech=v;if(attr==='cap')activeCap=v;if(attr==='pw')activePw=v;
      if(attr==='bvol')activeBvol=v;if(attr==='heat')activeHeat=v;renderCatalog();});
  });
  renderBrandFilters();renderPriceFilters();
}
/* brand buttons follow the active category — every brand actually in stock, nothing stale */
function renderBrandFilters(){
  const g=$('brand-filters'); if(!g) return;
  const cat=window.__CATALOG_CAT__;
  const pool=(cat&&cat!=='all')?PRODUCTS.filter(p=>p.category===cat):PRODUCTS;
  const brands=[...new Set(pool.map(p=>p.brand))].sort((a,b)=>a.localeCompare(b,'uk'));
  g.innerHTML=`<button class="fbtn${activeBrand==='all'?' active':''}" data-brand="all">${t('f_all')}</button>`
    +brands.map(b=>`<button class="fbtn${activeBrand===b?' active':''}" data-brand="${b.replace(/"/g,'&quot;')}">${b}</button>`).join('');
}
/* The price bands are one global set spanning 4 000 to 84 000 UAH. In a
   category that only occupies one of them — every water heater is under
   10 000 — the other four buttons return an empty grid, which reads as a
   broken page rather than as an empty band. Show a band only if something
   in this category actually falls into it. */
function renderPriceFilters(){
  const g=$('price-filters'); if(!g) return;
  const cat=window.__CATALOG_CAT__;
  const pool=(cat&&cat!=='all')?PRODUCTS.filter(p=>p.category===cat):PRODUCTS;
  g.querySelectorAll('.fbtn').forEach(b=>{
    const v=b.dataset.price;
    if(v==='all'){b.style.display='';return;}
    const [lo,hi]=String(v).split('-').map(Number);
    b.style.display=pool.some(p=>p.price>lo&&p.price<=hi)?'':'none';
  });
}
function setActive(gid,attr,val){$(gid).querySelectorAll('.fbtn').forEach(b=>b.classList.toggle('active',b.dataset[attr]===val));}
function resetFilters(){activeBvol=activeHeat=activeCap=activePw=activeBrand=activeArea=activeType=activePrice=activeLoad=activeDepth=activeVol=activeHeight=activeTech='all';
  [['brand-filters','brand'],['area-filters','area'],['type-filters','type'],['price-filters','price'],['load-filters','load'],['depth-filters','depth'],['vol-filters','vol'],['height-filters','height'],['tech-filters','tech'],['cap-filters','cap'],['pw-filters','pw'],['bvol-filters','bvol'],['heat-filters','heat']].forEach(([g,a])=>{if($(g))setActive(g,a,'all');});
  const si2=$('search-input'),ss=$('sort-select');
  if(si2)si2.value='';if(ss)ss.value='default';renderBrandFilters();renderPriceFilters();renderCatalog();}
/* homepage catalog category tabs */
function switchCat(cat){
  if(cat!=='all'&&!window.__CATS__[cat])return;
  window.__CATALOG_CAT__=cat;
  document.querySelectorAll('#cat-tabs .ctab').forEach(b=>b.classList.toggle('active',b.dataset.cat===cat));
  const ac=cat==='kondicioneri';
  ['frow-area'].forEach(id=>{const el=$(id);if(el)el.style.display=ac?'':'none';});
  const wmRow=$('frow-wm');if(wmRow)wmRow.style.display=cat==='pralni-mashyny'?'':'none';
  const frRow=$('frow-fr');if(frRow)frRow.style.display=cat==='holodylnyky'?'':'none';
  const psRow=$('frow-ps');if(psRow)psRow.style.display=cat==='zaryadni-stantsii'?'':'none';
  const blRow=$('frow-bl');if(blRow)blRow.style.display=cat==='boylery'?'':'none';
  const areaSort=document.querySelector('#sort-select option[value="area-asc"]');if(areaSort)areaSort.hidden=!ac;
  // full-size quiz appears right above the grid when the category has one
  const qHost=$('quiz-inline');
  if(qHost){ if(QUIZZES[cat]) startInlineQuiz(cat); else qHost.style.display='none'; }
  const h=$('cat-title');if(h){const key={all:'cat_h_all',kondicioneri:'cat_h','zaryadni-stantsii':'cat_h_ps','pralni-mashyny':'cat_h_wm',holodylnyky:'cat_h_fr',boylery:'cat_h_bl'}[cat]||'cat_h_all';h.textContent=t(key);}
  resetFilters();   // also re-renders the brand buttons for this category
}
function jumpCat(cat){switchCat(cat);document.getElementById('catalog').scrollIntoView({behavior:'smooth'});}
(function initCatTabs(){
  const tabs=document.getElementById('cat-tabs');if(!tabs)return;
  tabs.querySelectorAll('.ctab').forEach(b=>{
    const n=b.dataset.cat==='all'?PRODUCTS.length:PRODUCTS.filter(p=>p.category===b.dataset.cat).length;
    const el=b.querySelector('.ctab-n');if(el)el.textContent=n;
  });
})();
function jumpBrand(brand,cat){
  if(!cat){const cats=[...new Set(PRODUCTS.filter(p=>p.brand===brand).map(p=>p.category))];cat=cats.length===1?cats[0]:'all';}
  if(window.__CATALOG_CAT__!==cat)switchCat(cat);
  activeBrand=brand;renderBrandFilters();renderCatalog();
  document.getElementById('catalog').scrollIntoView({behavior:'smooth'});
}

/* ============ PRODUCT MODAL ============ */
function specRows(p){
  const s=p.specs||{};const r=[];
  r.push([t('sp_power'), (p.btu?(p.btu/1000).toFixed(0)+'k BTU':'')+(s.power_w?' · '+s.power_w+' '+(LANG==='en'?'W':'Вт'):'')]);
  r.push([t('sp_area'), p.area?`${LANG==='en'?'up to':'до'} ${p.area} ${LANG==='en'?'m²':'м²'}`:'—']);
  r.push([t('sp_comp'), p.inverter?t('sp_inv'):t('sp_onoff')]);
  if(s.eclass) r.push([t('sp_eclass'), s.eclass]);
  if(s.noise) r.push([t('sp_noise'), (LANG==='en'?'from ':LANG==='ru'?'от ':'від ')+s.noise+' '+(LANG==='en'?'dB':'дБ')]);
  r.push([t('sp_freon'),'R32']);
  if(s.cool_min!==undefined) r.push([t('sp_cool_range'), `${s.cool_min}°C … +${s.cool_max}°C`]);
  if(s.heat_min!==undefined) r.push([t('sp_heat_min'), s.heat_min+'°C']);
  r.push([t('sp_wifi'), p.wifi?t('sp_yes'):t('sp_opt')]);
  r.push([t('sp_heat'), p.heatpump?t('sp_hp'):t('sp_yes')]);
  return r;
}

/* ============ FAVORITES ============ */
function toggleFav(idx){const i=FAV.indexOf(idx);if(i>=0)FAV.splice(i,1);else FAV.push(idx);localStorage.setItem('tp_fav',JSON.stringify(FAV));updateFavCount();renderCatalog();if($('fav-modal').classList.contains('open'))renderFav();}
function updateFavCount(){const c=$('fav-count');if(!c)return;c.textContent=FAV.length;c.classList.toggle('show',FAV.length>0);}
function openFav(){renderFav();$('fav-modal').classList.add('open');document.body.style.overflow='hidden';}
function renderFav(){
  const c=$('fav-content');
  if(!FAV.length){c.innerHTML=`<div class="fav-empty">${t('fav_empty')}</div>`;return;}
  c.innerHTML=`<div class="fav-grid">${FAV.map(idx=>cardHTML(PRODUCTS[idx])).join('')}</div>`;
}

/* ============ COMPARE ============ */
function toggleCmp(idx){
  const i=CMP.indexOf(idx);
  if(i>=0)CMP.splice(i,1);
  else{if(CMP.length>=3){alert(t('cmp_max'));return;}CMP.push(idx);}
  localStorage.setItem('tp_cmp',JSON.stringify(CMP));renderCmpBar();renderCatalog();
}
function clearCompare(){CMP=[];localStorage.setItem('tp_cmp','[]');renderCmpBar();renderCatalog();}
function renderCmpBar(){
  const cc=$('cmp-count'); if(cc){cc.textContent=CMP.length;cc.classList.toggle('show',CMP.length>0);} // header compare badge
  const bar=$('cmp-bar'); if(!bar) return;
  bar.classList.toggle('show',CMP.length>0);
  $('cmp-thumbs').innerHTML=CMP.map(idx=>`<div class="cmp-th"><img src="${PRODUCTS[idx].thumb}"><span class="x" onclick="toggleCmp(${idx})">✕</span></div>`).join('');
}
/* Which way is "better" for a numeric spec, so the winning cell can be marked.
   A spec not listed here is still compared, just without a winner — that is the
   honest default for anything where more is not automatically better. */
const CMP_BETTER={capacity_wh:'max',output_w:'max',surge_w:'max',area:'max',btu:'max',
  load_kg:'max',rpm:'max',volume_l:'max',programs:'max',ac_sockets:'max',ac_in_w:'max',
  noise:'min',noise_wm:'min',depth:'min',price:'min'};
function openCompare(){
  const prods=CMP.map(i=>PRODUCTS[i]).filter(Boolean);
  if(!prods.length){
    $('compare-content').innerHTML=`<div class="cmp-empty">${t('cmp_empty')}</div>`;
    $('compare-modal').classList.add('open');document.body.style.overflow='hidden';return;
  }
  /* Rows come from the category's own spec list, so washing machines are
     compared on load and spin speed rather than on BTU and refrigerant. */
  const cats=[...new Set(prods.map(p=>p.category))];
  const mixed=cats.length>1;
  const specs=mixed?[]:(catOf(prods[0]).specs||[]);
  let html='';
  if(mixed) html+=`<div class="cmp-note">${t('cmp_mixed')}</div>`;
  html+='<table class="cmp-table"><thead><tr><th></th>';
  prods.forEach(p=>{html+=`<th><div class="cmp-prod-img"><img src="${p.thumb}" alt="${pnameJS(p)}"></div>`
    +`<div class="cmp-prod-name"><a href="${productUrl(p)}">${pnameJS(p)}</a></div>`
    +`<div class="cmp-prod-price">${fmt(p.price)} ${t('u_uah')}</div></th>`;});
  html+='</tr></thead><tbody>';
  // price first — it is the row every buyer reads
  html+=cmpRow(t('cmp_price'),prods,p=>fmt(p.price)+' '+t('u_uah'),'min',p=>p.price);
  specs.forEach(f=>{
    const vals=prods.map(p=>jFmtVal(p,f));
    if(vals.every(v=>v===null||v===undefined||v==='')) return;   // nobody has it
    const dir=CMP_BETTER[f.key];
    const metric=dir?(p=>{const n=parseFloat(p.specs&&p.specs[f.key]);return isNaN(n)?(dir==='max'?-Infinity:Infinity):n;}):null;
    html+=cmpRow(lfJS(f,'label'),prods,p=>{const v=jFmtVal(p,f);return (v===null||v===undefined||v==='')?'—':v;},dir,metric);
  });
  html+='</tbody></table>';
  $('compare-content').innerHTML=html;
  $('compare-modal').classList.add('open');document.body.style.overflow='hidden';
}
function cmpRow(label,prods,fn,dir,metric){
  let best=null;
  if(dir&&metric&&prods.length>1){
    const vals=prods.map(metric).filter(v=>isFinite(v));
    if(vals.length>1&&new Set(vals).size>1) best=dir==='max'?Math.max(...vals):Math.min(...vals);
  }
  let r=`<tr><td class="cmp-row-lbl">${label}</td>`;
  prods.forEach(p=>{const win=best!==null&&metric(p)===best;r+=`<td class="${win?'best':''}">${fn(p)}</td>`;});
  return r+'</tr>';
}

/* ============ QUICK BUY ============ */
let qbuyIdx=null;
function openQbuy(e,idx){
  e.stopPropagation();qbuyIdx=idx;const p=PRODUCTS[idx];
  const msg=encodeURIComponent(t('buy_msg')+' '+p.name+' ('+fmt(p.price)+' '+(LANG==='en'?'UAH':'грн')+')');
  $('qb-wa').href=`https://api.whatsapp.com/send?phone=${PHONE}&text=${msg}`;
  $('qb-vb').href=`viber://chat?number=%2B${PHONE}`;
  $('qb-tg').href=`https://t.me/${TG_USER}?text=${msg}`;
  const pop=$('qbuy-pop');const r=e.target.getBoundingClientRect();
  pop.style.left=Math.min(r.left, window.innerWidth-256)+'px';
  pop.style.top=(r.top - pop.offsetHeight - 8)<10 ? (r.bottom+8)+'px' : '';
  pop.style.bottom = (r.top - 170 < 10) ? '' : (window.innerHeight - r.top + 8)+'px';
  pop.classList.add('show');$('qbuy-backdrop').classList.add('show');
}
function closeQbuy(){$('qbuy-pop').classList.remove('show');$('qbuy-backdrop').classList.remove('show');}

/* ============ CALLBACK + FORMSPREE ============ */
function openOrder(idx){const p=PRODUCTS[idx];currentProduct=p;openCb(null,p.name);}
/* kind 'question' comes from the product page's "Задати питання" — same form,
   but the heading and the Telegram label say it is a question, not a callback. */
const CB_KINDS={question:['question','pp_ask_sub','cb_p'],cheaper:['cheaper','pp_cheaper_h','pp_cheaper_p']};
/* The product line is owned here, not by the callers: the modal is shared, so a
   name left over from a product button used to ride along on the next plain
   callback opened from the header. */
function openCb(kind,product){
  const k=CB_KINDS[kind];
  window.__CB_TYPE__=k?k[0]:'callback';
  const h=$('cb-title');if(h)h.textContent=t(k?k[1]:'cb_btn');
  const sub=$('cb-sub');if(sub)sub.textContent=t(k?k[2]:'cb_p');
  const f=$('cb-product'),w=$('cb-product-wrap');
  if(f)f.value=product||'';
  if(w)w.style.display=product?'block':'none';
  const hp=$('cb-hp');if(hp)hp.value='';
  $('cb-form').style.display='block';$('cb-success').style.display='none';
  $('cb-modal').classList.add('open');document.body.style.overflow='hidden';
}
/* Theme. Light is the default — the shop's own look — and the system setting
   is deliberately not consulted: someone whose phone is in dark mode should
   still land on the site the owner designed. The switch is how you leave it,
   and the choice sticks. Applied in <head> before first paint. */
function toggleTheme(){
  const now=document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',now);
  try{localStorage.setItem('tp_theme',now);}catch(e){}
  track('switch_theme',{theme:now});
}
function closeCb(e){if(e.target===e.currentTarget)forceCloseCb();}
function forceCloseCb(){$('cb-modal').classList.remove('open');document.body.style.overflow='';}
function closeOverlay(e,id){if(e.target===e.currentTarget)closeModalById(id);}
function closeModalById(id){$(id).classList.remove('open');document.body.style.overflow='';}
function openContact(){$('contact-modal').classList.add('open');document.body.style.overflow='hidden';}

async function sendLead(data){
  track('generate_lead',{lead_type:(data&&data.type)||'form'});
  // primary: our serverless endpoint → Telegram
  try{
    const r=await fetch('/api/lead/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if(r.ok) return true;
  }catch(e){}
  // fallback: Formspree (email), if configured
  if(typeof FORMSPREE!=='undefined' && FORMSPREE && FORMSPREE.indexOf('__')!==0){
    try{const r=await fetch('https://formspree.io/f/'+FORMSPREE,{method:'POST',headers:{'Accept':'application/json','Content-Type':'application/json'},body:JSON.stringify(data)});return r.ok;}catch(e){}
  }
  return true; // never block the user; lead still reachable via phone/WhatsApp
}
async function submitCb(){
  const hp=$('cb-hp');if(hp&&hp.value)return;   // spam bots fill every field they find
  const ph=$('cb-phone').value.trim();if(!ph){alert(t('cb_phone'));return;}
  const ok=await sendLead({type:window.__CB_TYPE__||'callback',name:$('cb-name').value.trim(),phone:ph,product:$('cb-product').value||'',lang:LANG});
  if(ok){$('cb-form').style.display='none';$('cb-success').style.display='block';track('generate_lead',{method:'callback'});}
  else alert(t('form_send_err'));
}
async function submitContact(){
  const ph=$('cf-phone').value.trim();if(!ph){alert(t('form_phone'));return;}
  const ok=await sendLead({type:'consultation',name:$('cf-name').value.trim(),phone:ph,interest:$('cf-interest').value,comment:$('cf-comment').value.trim(),lang:LANG});
  if(ok){$('contact-form').style.display='none';$('contact-success').style.display='block';track('generate_lead',{method:'consultation'});}
  else alert(t('form_send_err'));
}

/* ============ CALC ============ */
function recommendBtu(area){const btu=Math.round(area/10*3412/1000)*1000;const sizes=[7000,9000,12000,18000,24000];return sizes.find(s=>s>=btu)||sizes[sizes.length-1];}
function calcBand(btu){return btu<=9000?'25':btu<=12000?'35':btu<=18000?'50':'70';}
function modelsForArea(area){const b=+calcBand(recommendBtu(area));return PRODUCTS.filter(p=> b===25?p.area<=25 : b===35?(p.area>25&&p.area<=35) : b===50?(p.area>35&&p.area<=50) : p.area>50);}
function updateCalc(){
  if(!$('calc-area'))return;
  const area=+$('calc-area').value;
  $('calc-area-val').textContent=area+' '+(LANG==='en'?'m²':'м²');
  $('calc-area-2').textContent=area+' '+(LANG==='en'?'m²':'м²');
  const btu=recommendBtu(area);$('calc-btu').innerHTML=fmt(btu)+'<span> BTU</span>';
  const count=modelsForArea(area).length;
  $('calc-models').textContent=count+' '+(LANG==='en'?'models':LANG==='ru'?modelsRu(count):modelsUk(count));
}
function modelsUk(n){const m=n%100,d=n%10;if(m>=11&&m<=14)return'моделей';if(d===1)return'модель';if(d>=2&&d<=4)return'моделі';return'моделей';}
function modelsRu(n){const m=n%100,d=n%10;if(m>=11&&m<=14)return'моделей';if(d===1)return'модель';if(d>=2&&d<=4)return'модели';return'моделей';}
function applyCalc(){if(window.__CATALOG_CAT__!=='kondicioneri')switchCat('kondicioneri');const band=calcBand(recommendBtu(+$('calc-area').value));resetFilters();activeArea=band;setActive('area-filters','area',band);renderCatalog();document.getElementById('catalog').scrollIntoView({behavior:'smooth'});}

/* ============ UI ============ */
function toggleFaq(el){const it=el.parentElement;const open=it.classList.contains('open');document.querySelectorAll('.faq-item').forEach(i=>i.classList.remove('open'));if(!open)it.classList.add('open');}
function toggleNav(){document.getElementById('header').classList.toggle('nav-open');}
document.querySelectorAll('nav a').forEach(a=>a.addEventListener('click',()=>document.getElementById('header').classList.remove('nav-open')));

/* Anchor navigation that survives late layout shifts.

   Third-party embeds and images finish loading after the page is interactive,
   and anything that grows above the target moves it out from under a scroll
   that is already running — the visitor presses "Питання" and lands somewhere
   in the middle of the reviews. So: scroll, then keep re-aligning while the
   document height is still changing, and stop as soon as the visitor takes
   over or the page settles. */
(function(){
  const HEAD = 84;                       // sticky header, matches scroll-padding-top
  let trip = 0;                          // only the newest jump may steer
  function goTo(el){
    const mine = ++trip;
    let t0 = Date.now();
    const done = () => mine !== trip;
    const stop = () => { if (mine === trip) trip++; };
    addEventListener('wheel', stop, {passive:true, once:true});
    addEventListener('touchstart', stop, {passive:true, once:true});
    addEventListener('keydown', stop, {once:true});
    (function align(){
      if (done()) return;                // a newer click, or the visitor took over
      const y = Math.max(0, Math.round(el.getBoundingClientRect().top + scrollY - HEAD));
      /* Jump, never glide. The sections are tens of thousands of pixels apart
         and a smooth scroll over that distance crawls for seconds — and while
         it crawls, anything that finishes loading moves the target out from
         under it, so it arrives in the wrong place. */
      if (Math.abs(y - scrollY) > 3) scrollTo({top: y, behavior: 'instant'});
      if (Date.now() - t0 < 1200) setTimeout(align, 150);
    })();
  }
  addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"], a[href*="/#"]');
    if (!a || a.target === '_blank') return;
    const id = (a.getAttribute('href') || '').split('#')[1];
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;                     // let cross-page links through
    e.preventDefault();
    history.replaceState(null, '', '#' + id);
    goTo(el);
  });
  // deep link: /#faq typed or shared — same treatment once the page is up
  addEventListener('load', () => {
    const id = location.hash.slice(1);
    const el = id && document.getElementById(id);
    if (el) goTo(el);
  });
})();
document.addEventListener('keydown',e=>{if(e.key==='Escape'){forceCloseCb();closeModalById('compare-modal');closeModalById('fav-modal');closeQbuy();}});
window.addEventListener('scroll',closeQbuy,{passive:true});
/* Sixty-five blocks start at opacity 0 and only the observer brings them back,
   so if it is missing the page is mostly blank. Without IntersectionObserver,
   reveal everything at once rather than animating nothing. */
const io='IntersectionObserver' in window
  ? new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}}),{threshold:.12})
  : null;
/* Callable again for anything rendered later; already-revealed nodes are
   unobserved, and re-observing one that is still hidden is harmless. */
function scanReveals(root){
  (root||document).querySelectorAll('.reveal:not(.in)').forEach(el=>{
    if(io)io.observe(el); else el.classList.add('in');
  });
}
scanReveals();
window.scanReveals=scanReveals;

/* WhatsApp float + contact links use new phone */
document.querySelectorAll('a[href*="380991108041"]').forEach(()=>{});

/* 3D tilt on product cards and on the hero cards (delegated, survives
   re-renders). The hero cards are large and sit against a dark backdrop, so
   they get shallower angles — the same numbers that read as "premium" on a
   260px catalogue card read as a wobble on a 460px one. */
(function(){
  if(!matchMedia('(hover:hover) and (pointer:fine)').matches) return;
  if(matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  const TILT=[['.card',4.5,5.5,6],['.hero-vis .gauge-card',3,3.6,4]];
  let cur=null;
  function reset(c){if(c)c.style.transform='';}
  function find(target){
    for(const [sel,rx,ry,lift] of TILT){const el=target.closest(sel);if(el)return [el,rx,ry,lift];}
    return null;
  }
  document.addEventListener('pointermove',e=>{
    const hit=e.target.closest?find(e.target):null;
    const card=hit&&hit[0];
    if(card!==cur){reset(cur);cur=card;}
    if(!hit)return;
    const [el,rx,ry,lift]=hit;
    const r=el.getBoundingClientRect();
    const px=(e.clientX-r.left)/r.width-0.5, py=(e.clientY-r.top)/r.height-0.5;
    el.style.transform=`perspective(950px) rotateX(${(-py*rx).toFixed(2)}deg) rotateY(${(px*ry).toFixed(2)}deg) translateY(-${lift}px)`;
  },{passive:true});
  document.addEventListener('pointerout',e=>{if(cur&&!cur.contains(e.relatedTarget)){reset(cur);cur=null;}},true);
})();

/* Premium flourishes: scroll progress, cursor glow, count-up, snowflakes */
(function(){
  const reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
  /* scroll progress bar */
  const sp=document.createElement('div');sp.className='scroll-prog';document.body.appendChild(sp);
  const onScroll=()=>{const h=document.documentElement.scrollHeight-innerHeight;sp.style.width=(h>0?Math.min(100,scrollY/h*100):0)+'%';};
  addEventListener('scroll',onScroll,{passive:true});onScroll();
  const hero=document.querySelector('.hero');
  /* cursor glow */
  if(hero && matchMedia('(pointer:fine)').matches && !reduce){
    hero.addEventListener('pointermove',e=>{const r=hero.getBoundingClientRect();hero.style.setProperty('--mx',((e.clientX-r.left)/r.width*100).toFixed(1)+'%');hero.style.setProperty('--my',((e.clientY-r.top)/r.height*100).toFixed(1)+'%');},{passive:true});
  }
  /* The season is baked into <html data-season> at build time, which is right
     as long as the site is deployed now and then. Re-check it against today's
     date and correct the attribute: a stale deploy showing snow over the hero
     in July reads as a broken page, not an old one. */
  const liveSeason=(m=>m>=4&&m<=7?'warm':(m>=10||m<=1?'cold':'mild'))(new Date().getMonth());
  document.documentElement.dataset.season=liveSeason;
  /* snowflakes in hero — cold months only */
  if(hero && !reduce && liveSeason==='cold'){
    const wrap=document.createElement('div');wrap.style.cssText='position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0';
    for(let i=0;i<9;i++){const s=document.createElement('div');s.className='flake';s.textContent='❄';s.style.left=(Math.random()*100).toFixed(1)+'%';s.style.fontSize=(8+Math.random()*9).toFixed(0)+'px';s.style.animationDuration=(11+Math.random()*12).toFixed(1)+'s';s.style.animationDelay=(-Math.random()*14).toFixed(1)+'s';wrap.appendChild(s);}
    hero.insertBefore(wrap,hero.firstChild);
  }
})();

/* ============ QUIZ ENGINE ============
   One state machine + lead flow; each category describes its own steps and
   how to rank products. Adding a category = adding an entry to QUIZZES.     */
const QUIZ_ROOMS=[['bed','quiz_bed',1.0],['liv','quiz_liv',1.1],['kit','quiz_kit',1.2],['kid','quiz_kid',1.05],['off','quiz_off',1.0],['stu','quiz_stu',1.1]];
const QUIZ_FLOORS=[['low','quiz_fl_low',1.0],['mid','quiz_fl_mid',1.0],['top','quiz_fl_top',1.1]];
const HOSE_CLEARANCE=5;   // cm behind a washing machine for hoses
const num=v=>{const n=parseFloat(String(v).replace(',','.'));return isNaN(n)?null:n;};
function priceRange(cat){
  const ps=PRODUCTS.filter(p=>!cat||p.category===cat).map(p=>p.price);
  if(!ps.length)return [0,100000];
  return [Math.floor(Math.min(...ps)/1000)*1000,Math.ceil(Math.max(...ps)/1000)*1000];
}
const QUIZZES={
  kondicioneri:{
    cat:'kondicioneri', eyeKey:'quiz_eye', titleKey:'quiz_h', resKey:'quiz_res_h', overKey:'quiz_over', ctaKey:'acq_cta',
    steps:[
      {type:'range',key:'area',qKey:'quiz_s1',hintKey:'quiz_s1_hint',min:8,max:100,step:1,def:25,unit:()=>LANG==='en'?'m²':'м²'},
      {type:'choice',key:'room',qKey:'quiz_s2',options:QUIZ_ROOMS.map(([v,k])=>[v,k])},
      {type:'choice',key:'floor',qKey:'quiz_s3',options:QUIZ_FLOORS.map(([v,k])=>[v,k])},
      {type:'budget',key:'budget',qKey:'quiz_s4',hintKey:'quiz_s4_hint'}
    ],
    need(s){const rc=(QUIZ_ROOMS.find(r=>r[0]===s.room)||[,,1])[2],fc=(QUIZ_FLOORS.find(f=>f[0]===s.floor)||[,,1])[2];
      const target=recommendBtu(s.area)*rc*fc;return [7000,9000,12000,18000,24000].find(x=>x>=target)||24000;},
    fits(p,s){return p.btu>=this.need(s);},
    rank(a,b){return a.btu-b.btu||a.price-b.price;},
    meta(p){return `${p.brand} · ${(p.btu/1000).toFixed(0)}k BTU · ${LANG==='en'?'up to':'до'} ${p.area} м²`;},
    summary(s){const r=QUIZ_ROOMS.find(x=>x[0]===s.room),f=QUIZ_FLOORS.find(x=>x[0]===s.floor);
      return `${t('quiz_area_lbl')}: ${s.area} м²; ${r?t(r[1]):''}; ${f?t(f[1]):''}; ${t('quiz_budget_lbl')}: ${fmt(s.budget)} грн; ~${this.need(s)} BTU`;}
  },
  'pralni-mashyny':{
    cat:'pralni-mashyny', eyeKey:'wmq_eye', titleKey:'wmq_h', resKey:'wmq_res_h', overKey:'wmq_over', noneKey:'wmq_none', relaxKey:'wmq_relaxed', ctaKey:'wmq_cta',
    steps:[
      {type:'range',key:'depth',qKey:'wmq_s1',hintKey:'wmq_s1_hint',min:38,max:60,step:1,def:50,unit:()=>LANG==='en'?'cm':'см'},
      {type:'choice',key:'family',qKey:'wmq_s2',hintKey:'wmq_s2_hint',options:[['1','wmq_fam1'],['2','wmq_fam2'],['3','wmq_fam3']]},
      {type:'choice',key:'priority',qKey:'wmq_s3',options:[['quiet','wmq_pr_quiet','wmq_pr_quiet_h'],['dry','wmq_pr_dry','wmq_pr_dry_h'],['hyg','wmq_pr_hyg','wmq_pr_hyg_h'],['price','wmq_pr_price','wmq_pr_price_h']]},
      {type:'budget',key:'budget',qKey:'quiz_s4',hintKey:'quiz_s4_hint'}
    ],
    need(s){return {'1':5,'2':6,'3':7}[s.family]||6;},
    fits(p,s){
      const kg=num(p.specs&&p.specs.load_kg);
      if(!this.fitsPhysical(p,s))return false;
      return kg===null||kg>=this.need(s);
    },
    fitsPhysical(p,s){const d=num(p.specs&&p.specs.depth);return d!==null&&d+HOSE_CLEARANCE<=s.depth;},
    score(p,s){
      const sp=p.specs||{},rpm=num(sp.rpm)||0;
      if(s.priority==='quiet')return (p.inverter?100:0)+(1400-rpm)/100;
      if(s.priority==='dry')return rpm/10;
      if(s.priority==='hyg')return (sp.steam?100:0)+(p.inverter?10:0);
      return -p.price/1000;                                     // price
    },
    rank(a,b){const s=quizState;return this.score(b,s)-this.score(a,s)||a.price-b.price;},
    meta(p){const sp=p.specs||{};return `${p.brand} · ${sp.load_kg} кг · ${sp.rpm} об/хв · ${t('wmq_depth_lbl')} ${sp.depth} см`;},
    summary(s){const fam=(this.steps[1].options.find(o=>o[0]===s.family)||[])[1],pr=(this.steps[2].options.find(o=>o[0]===s.priority)||[])[1];
      return `${t('wmq_niche_lbl')}: ${s.depth} см; ${fam?t(fam):''}; ${pr?t(pr):''}; ${t('quiz_budget_lbl')}: ${fmt(s.budget)} грн; ~${this.need(s)} кг`;}
  }
  ,
  holodylnyky:{
    cat:'holodylnyky', eyeKey:'quiz_eye', titleKey:'frq_h', resKey:'frq_res_h', overKey:'frq_over', noneKey:'frq_none', ctaKey:'frq_cta',
    steps:[
      {type:'range',key:'height',qKey:'frq_s1',hintKey:'frq_s1_hint',min:85,max:210,step:1,def:200,unit:()=>LANG==='en'?'cm':'см'},
      {type:'choice',key:'people',qKey:'frq_s2',hintKey:'frq_s2_hint',options:[['1','frq_p1'],['2','frq_p2'],['3','frq_p3']]},
      {type:'choice',key:'priority',qKey:'frq_s3',options:[['nofrost','frq_pr_nf','frq_pr_nf_h'],['quiet','frq_pr_quiet','frq_pr_quiet_h'],['freezer','frq_pr_frz','frq_pr_frz_h'],['price','frq_pr_price','frq_pr_price_h']]},
      {type:'budget',key:'budget',qKey:'quiz_s4',hintKey:'quiz_s4_hint'}
    ],
    need(s){return {'1':150,'2':250,'3':330}[s.people]||250;},   // litres the household needs
    fits(p,s){
      const sp=p.specs||{},v=num(sp.volume_l);
      if(!this.fitsPhysical(p,s))return false;
      return v===null||v>=this.need(s)*0.8;                      // 20% tolerance on capacity
    },
    fitsPhysical(p,s){const h=num((p.specs||{}).height_cm);return h!==null&&h<=s.height;},
    score(p,s){
      const sp=p.specs||{},v=num(sp.volume_l)||0,noise=num(String(sp.noise_db||'').replace(/[^\d.]/g,''))||45;
      if(s.priority==='nofrost')return (p.nofrost?200:0)+v/10;
      if(s.priority==='quiet')return (60-noise)*10+(p.inverter?80:0);
      if(s.priority==='freezer')return (num(sp.vol_freezer)||0)*2;
      return -p.price/1000;
    },
    rank(a,b){const s=quizState;return this.score(b,s)-this.score(a,s)||a.price-b.price;},
    warn(res,s){return (s.priority==='nofrost'&&res.length&&!res.some(p=>p.nofrost))?'frq_warn_nf':null;},
    meta(p){const sp=p.specs||{};return `${p.brand} · ${sp.volume_l} ${t('u_l')} · ${sp.height_cm} ${t('u_cm')}${p.nofrost?' · No Frost':''}`;},
    summary(s){const pe=(this.steps[1].options.find(o=>o[0]===s.people)||[])[1],pr=(this.steps[2].options.find(o=>o[0]===s.priority)||[])[1];
      return `${t('frq_niche_lbl')}: ${s.height} см; ${pe?t(pe):''}; ${pr?t(pr):''}; ${t('quiz_budget_lbl')}: ${fmt(s.budget)} грн; ~${this.need(s)} л`;}
  }
  ,
  'zaryadni-stantsii':{
    cat:'zaryadni-stantsii', eyeKey:'quiz_eye', titleKey:'psq_h', resKey:'psq_res_h', overKey:'psq_over', noneKey:'psq_none', relaxKey:'psq_none', ctaKey:'psq_cta',
    steps:[
      {type:'choice',key:'load',qKey:'psq_s1',hintKey:'psq_s1_hint',
       options:[['light','psq_l1','psq_l1_h'],['fridge','psq_l2','psq_l2_h'],['home','psq_l3','psq_l3_h'],['power','psq_l4','psq_l4_h']]},
      {type:'range',key:'hours',qKey:'psq_s2',hintKey:'psq_s2_hint',min:2,max:24,step:1,def:6,unit:()=>t('rt_hr')},
      {type:'choice',key:'priority',qKey:'psq_s3',
       options:[['autonomy','psq_pr_auto','psq_pr_auto_h'],['portable','psq_pr_port','psq_pr_port_h'],['expand','psq_pr_exp','psq_pr_exp_h'],['price','psq_pr_price','psq_pr_price_h']]},
      {type:'budget',key:'budget',qKey:'quiz_s4',hintKey:'quiz_s4_hint'}
    ],
    /* watts the chosen set of appliances draws together — same figures as the
       runtime calculator on the product page, so the two never disagree */
    watts(s){return {light:70,fridge:190,home:410,power:1200}[s.load]||190;},
    need(s){return Math.round(this.watts(s)*s.hours/0.85);},     // Wh, inverter loss included
    fits(p,s){
      const wh=num((p.specs||{}).capacity_wh);
      if(!this.fitsPhysical(p,s))return false;
      return wh!==null&&wh>=this.need(s);
    },
    // the hard constraint: it must be able to carry the load at all
    fitsPhysical(p,s){const w=num((p.specs||{}).output_w);return w!==null&&w>=this.watts(s);},
    score(p,s){
      const sp=p.specs||{},wh=num(sp.capacity_wh)||0,kg=num(String(sp.weight||'').replace(/[^\d.]/g,''))||99;
      if(s.priority==='autonomy')return wh/10;
      if(s.priority==='portable')return -kg*10+wh/100;
      if(s.priority==='expand')return (sp.expandable?500:0)+wh/10;
      return -p.price/1000;
    },
    rank(a,b){const s=quizState;return this.score(b,s)-this.score(a,s)||a.price-b.price;},
    warn(res,s){return (s.priority==='expand'&&res.length&&!res.some(p=>(p.specs||{}).expandable))?'psq_warn_exp':null;},
    meta(p){const sp=p.specs||{};return `${p.brand} · ${sp.capacity_wh} ${t('u_wh')} · ${sp.output_w} ${t('u_w')}${sp.weight?' · '+sp.weight:''}`;},
    summary(s){const l=(this.steps[0].options.find(o=>o[0]===s.load)||[])[1],pr=(this.steps[2].options.find(o=>o[0]===s.priority)||[])[1];
      return `${l?t(l):''}; ${s.hours} ${t('rt_hr')}; ${pr?t(pr):''}; ${t('quiz_budget_lbl')}: ${fmt(s.budget)} ${t('u_uah')}; ~${this.watts(s)} ${t('u_w')} · ${this.need(s)} ${t('u_wh')}`;}
  }
  ,
  boylery:{
    cat:'boylery', eyeKey:'quiz_eye', titleKey:'blq_h', resKey:'blq_res_h', overKey:'blq_over',
    noneKey:'blq_none', relaxKey:'blq_relaxed', ctaKey:'blq_cta',
    steps:[
      {type:'choice',key:'people',qKey:'blq_s1',hintKey:'blq_s1_hint',
       options:[['1','blq_p1'],['2','blq_p2'],['3','blq_p3'],['5','blq_p4']]},
      {type:'choice',key:'niche',qKey:'blq_s2',hintKey:'blq_s2_hint',
       options:[['any','blq_n1','blq_n1_h'],['narrow','blq_n2','blq_n2_h']]},
      {type:'choice',key:'priority',qKey:'blq_s3',
       options:[['life','blq_pr_life','blq_pr_life_h'],['fast','blq_pr_fast','blq_pr_fast_h'],['price','blq_pr_price','blq_pr_price_h']]},
      {type:'budget',key:'budget',qKey:'quiz_s4',hintKey:'quiz_s4_hint'}
    ],
    need(s){return {'1':30,'2':50,'3':80,'5':100}[s.people]||50;},   // litres the household needs
    fits(p,s){
      const v=num((p.specs||{}).volume_l);
      if(!this.fitsPhysical(p,s))return false;
      return v!==null&&v>=this.need(s);
    },
    // a narrow recess is the hard constraint: a 433 mm body will not go in at all
    fitsPhysical(p,s){return s.niche!=='narrow'||!!p.slim;},
    score(p,s){
      const sp=p.specs||{},mins=num(sp.heat_time)||999,yrs=parseInt(String(sp.warranty_tank||''),10)||3;
      if(s.priority==='life')return (p.dryheat?300:0)+yrs*20;
      if(s.priority==='fast')return -mins;
      return -p.price/1000;
    },
    rank(a,b){const s=quizState;return this.score(b,s)-this.score(a,s)||a.price-b.price;},
    warn(res,s){return (s.priority==='life'&&res.length&&!res.some(p=>p.dryheat))?'blq_warn_dry':null;},
    meta(p){const sp=p.specs||{};return `${p.brand} · ${sp.volume_l} ${t('u_l')} · ${sp.power_w} ${t('u_w')}${p.slim?' · Ø380':''}`;},
    summary(s){const pe=(this.steps[0].options.find(o=>o[0]===s.people)||[])[1],
      ni=(this.steps[1].options.find(o=>o[0]===s.niche)||[])[1],
      pr=(this.steps[2].options.find(o=>o[0]===s.priority)||[])[1];
      return `${pe?t(pe):''}; ${ni?t(ni):''}; ${pr?t(pr):''}; ${t('quiz_budget_lbl')}: ${fmt(s.budget)} ${t('u_uah')}; ${t('blq_need_lbl')} ~${this.need(s)} ${t('u_l')}`;}
  }
};
let quizKind='kondicioneri', quizStep=0, quizState={}, quizHost='modal';
const QIDS={modal:{prog:'quiz-prog',body:'quiz-body',back:'quiz-back',next:'quiz-next'},
            inline:{prog:'qi-prog',body:'qi-body',back:'qi-back',next:'qi-next'}};
const qel=k=>$(QIDS[quizHost][k]);
const quizDef=()=>QUIZZES[quizKind];
function quizBudget(){return priceRange(quizDef().cat);}
function openQuiz(kind,host){
  if(!PRODUCTS.length)return;
  quizHost=(host==='inline'&&$('qi-body'))?'inline':'modal';
  quizKind=QUIZZES[kind]?kind:'kondicioneri';
  const d=quizDef();
  quizStep=0;quizState={};
  d.steps.forEach(st=>{
    if(st.type==='range')quizState[st.key]=st.def!=null?st.def:Math.round((st.min+st.max)/2);
    else if(st.type==='budget')quizState[st.key]=priceRange(d.cat)[1];
    else quizState[st.key]=null;
  });
  if(quizHost==='inline'){
    const eye=$('qi-eyebrow'),ttl=$('qi-title');
    if(eye)eye.textContent=t(d.eyeKey);if(ttl)ttl.textContent=t(d.titleKey);
  }else{
    const eye=document.querySelector('#quiz-modal .quiz-eyebrow'),ttl=document.querySelector('#quiz-modal .quiz-title');
    if(eye)eye.textContent=t(d.eyeKey);if(ttl)ttl.textContent=t(d.titleKey);
    $('quiz-modal').classList.add('open');document.body.style.overflow='hidden';
  }
  quizRender();
}
function openQuizWm(){openQuiz('pralni-mashyny');}
function closeQuiz(){closeModalById('quiz-modal');}
function quizCalc(){return quizDef().need(quizState);}   // kept for the AC calculator section
function quizRender(){
  const d=quizDef(),steps=d.steps,st=steps[quizStep];
  const body=qel('body'),back=qel('back'),next=qel('next');
  // progress reflects the step you are ON, so it is never an empty bar
  qel('prog').style.width=(((quizStep+1)/steps.length)*100)+'%';
  back.style.visibility=quizStep>0?'visible':'hidden';next.style.display='';
  next.textContent=quizStep===steps.length-1?t('quiz_finish'):t('quiz_next');
  const stepNo=`<div class="qi-step-no">${t('quiz_step')} ${quizStep+1} ${t('quiz_of')} ${steps.length}</div>`;
  const hint=st.hintKey?`<div class="quiz-hint">${t(st.hintKey)}</div>`:'';
  if(st.type==='range'||st.type==='budget'){
    const isBudget=st.type==='budget';
    const [mn,mx]=isBudget?quizBudget():[st.min,st.max];
    if(quizState[st.key]==null)quizState[st.key]=isBudget?mx:(st.def!=null?st.def:Math.round((mn+mx)/2));
    const val=quizState[st.key];
    const unit=isBudget?t('u_uah'):st.unit();
    const show=isBudget?fmt(val):val;
    const scale=`<div class="quiz-scale"><span>${isBudget?fmt(mn):mn} ${unit}</span><span>${isBudget?fmt(mx):mx} ${unit}</span></div>`;
    body.innerHTML=`<div class="quiz-step">${stepNo}<div class="quiz-q">${t(st.qKey)}</div>
      <div class="quiz-big"><span id="qv-${st.key}">${show}</span> <span class="quiz-unit">${unit}</span></div>
      <input type="range" min="${mn}" max="${mx}" step="${isBudget?1000:(st.step||1)}" value="${val}"
        oninput="quizState['${st.key}']=+this.value;$('qv-${st.key}').textContent=${isBudget?'fmt(+this.value)':'this.value'}">
      ${scale}${hint}</div>`;
  }else{
    body.innerHTML=`<div class="quiz-step">${stepNo}<div class="quiz-q">${t(st.qKey)}</div>
      <div class="quiz-opts">${st.options.map(([v,k,h])=>`<button class="quiz-opt${quizState[st.key]===v?' on':''}" onclick="quizState['${st.key}']='${v}';quizRender()">${t(k)}${h?`<small>${t(h)}</small>`:''}</button>`).join('')}</div>
      ${hint}</div>`;
  }
}
function quizNext(){
  const d=quizDef(),st=d.steps[quizStep];
  if(st.type==='choice'&&!quizState[st.key])return;      // must pick something
  if(quizStep<d.steps.length-1){quizStep++;quizRender();}else quizResult();
}
function quizBack(){if(quizStep>0){quizStep--;quizRender();}}
function quizSummary(){return quizDef().summary(quizState);}
function quizResult(){
  const d=quizDef();
  // on a brand page the visitor has already chosen the make — keep the picker
  // inside it rather than sending them off to a different brand
  const pool=PRODUCTS.filter(p=>(!d.cat||p.category===d.cat)&&(!window.__BRAND__||p.brand===window.__BRAND__));
  let fitting=pool.filter(p=>d.fits(p,quizState)),relaxed=false;
  if(!fitting.length&&d.fitsPhysical){                        // nothing ideal — drop the size wish
    fitting=pool.filter(p=>d.fitsPhysical(p,quizState));
    relaxed=fitting.length>0;
  }
  const within=fitting.filter(p=>p.price<=quizState.budget).sort((a,b)=>d.rank(a,b));
  let over=false,res=within.slice(0,3);
  if(!res.length&&fitting.length){over=true;res=fitting.slice().sort((a,b)=>d.rank(a,b)).slice(0,3);}
  qel('prog').style.width='100%';qel('back').style.visibility='visible';qel('next').style.display='none';
  const cards=res.map(p=>`<a class="quiz-card" href="${productUrl(p)}"><img src="${p.thumb}" alt="${pnameJS(p)}" loading="lazy"><div class="quiz-card-b"><div class="quiz-card-m">${d.meta(p)}</div><div class="quiz-card-n">${pnameJS(p)}</div><div class="quiz-card-p">${fmt(p.price)} ${t('u_uah')}</div></div></a>`).join('');
  const warnKey=d.warn?d.warn(res,quizState):null;
  const relaxNote=relaxed?`<div class="quiz-note">${t(d.relaxKey||'quiz_relaxed')}</div>`:'';
  const note=(!res.length?`<div class="quiz-note">${t(d.noneKey||'quiz_over')}</div>`:(over?`<div class="quiz-note">${t(d.overKey)}</div>`:''))
    +relaxNote+(warnKey?`<div class="quiz-note">${t(warnKey)}</div>`:'');
  qel('body').innerHTML=`<div class="quiz-res"><div class="quiz-q">${t(d.resKey)}</div>${note}<div class="quiz-cards">${cards}</div>
    <form class="quiz-lead" onsubmit="return quizSubmit(event)"><div class="quiz-q2">${t('quiz_lead_h')}</div>
      <div class="quiz-lead-row"><input name="name" placeholder="${t('form_name')}" required><input name="phone" placeholder="+38 (0__) ___-__-__" required></div>
      <input type="text" name="company" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button type="submit" class="btn-primary">${t('quiz_send')}</button></form></div>`;
}
function quizSubmit(e){e.preventDefault();const f=e.target;if(f.company.value)return false;
  sendLead({type:'quiz-'+quizKind,name:f.name.value,phone:f.phone.value,note:quizSummary()});
  track('generate_lead',{method:'quiz',category:quizKind});
  qel('body').innerHTML=`<div class="quiz-done"><div class="quiz-done-ic">✓</div><h3>${t('quiz_done_h')}</h3><p>${t('quiz_done_p')}</p></div>`;
  qel('back').style.visibility='hidden';return false;}
/* the inline quiz starts itself on category pages and on the homepage category tabs */
function startInlineQuiz(cat){
  const host=$('quiz-inline'); if(!host||!QUIZZES[cat])return false;
  host.style.display='';
  openQuiz(cat,'inline');
  return true;
}
(function initInlineQuiz(){
  const host=$('quiz-inline'); if(!host)return;
  const cat=window.__CATALOG_CAT__;
  if(QUIZZES[cat]&&!document.getElementById('cat-tabs'))startInlineQuiz(cat);   // category page
})();

/* GA: track call / WhatsApp / messenger clicks */
document.addEventListener('click',e=>{const a=e.target.closest('a');if(!a)return;const h=a.getAttribute('href')||'';
  if(h.indexOf('tel:')===0)track('click_to_call');
  else if(/wa\.me|api\.whatsapp|whatsapp\.com/.test(h))track('click_whatsapp');
  else if(/t\.me|viber:\/\//.test(h))track('click_messenger');
},{passive:true});

if($('catalog-grid')){ setupFilters(); renderCatalog(); }
applyI18n();
if($('cmp-bar')) renderCmpBar();
if($('fav-count')) updateFavCount();

/* Product pages carry their own inline script and cannot see the consts above.
   Expose them through getters rather than copies — CMP and FAV are reassigned
   on clear, and a snapshot would silently go stale. */
window.ppState={
  index:slug=>PRODUCTS.findIndex(p=>p.slug===slug),
  inCmp:i=>CMP.indexOf(i)>=0,
  inFav:i=>FAV.indexOf(i)>=0,
  t:t
};

/* Blog index: filter the cards by tag. Pure show/hide — the articles are all
   in the page already, so there is nothing to fetch and nothing to break. */
(function(){
  const bar=document.getElementById('bl-tags'); if(!bar) return;
  bar.addEventListener('click',e=>{
    const b=e.target.closest('.bl-tbtn'); if(!b) return;
    const tag=b.dataset.tag;
    bar.querySelectorAll('.bl-tbtn').forEach(x=>x.classList.toggle('active',x===b));
    document.querySelectorAll('#bl-grid .bl-card').forEach(c=>{
      c.style.display=(tag==='all'||c.dataset.tag===tag)?'':'none';
    });
  });
})();

/* ============ RECENTLY VIEWED ============ */
/* A visitor comparing five fridges loses the thread the moment they navigate.
   Remember what they opened and offer it back — kept entirely in this browser,
   nothing is sent anywhere. */
const RECENT_KEY='tp_recent', RECENT_MAX=8, RECENT_DAYS=30;
/* Entries carry the time they were viewed and expire after RECENT_DAYS, so the
   strip shows what someone is shopping for now rather than what they glanced at
   last spring. Reading also accepts the old plain-slug format, so nobody's
   existing history is thrown away when this ships. */
function recentRead(){
  let v;
  try{v=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');}catch(e){return [];}
  if(!Array.isArray(v))return [];
  const cutoff=Date.now()-RECENT_DAYS*864e5;
  const list=v.map(e=>typeof e==='string'?{s:e,t:Date.now()}:e)   // migrate the old format
              .filter(e=>e&&e.s&&(!e.t||e.t>=cutoff));
  if(list.length!==v.length)recentWrite(list);                    // drop the expired ones for good
  return list;
}
function recentWrite(list){
  try{localStorage.setItem(RECENT_KEY,JSON.stringify(list.slice(0,RECENT_MAX)));}catch(e){}
}
function recentSlugs(){return recentRead().map(e=>e.s);}
function recentAdd(slug){
  if(!slug)return;
  const list=recentRead().filter(e=>e.s!==slug);
  list.unshift({s:slug,t:Date.now()});
  recentWrite(list);
}
function clearRecent(){
  try{localStorage.removeItem(RECENT_KEY);}catch(e){}
  renderRecent();
}
function renderRecent(){
  const box=$('recent'),row=$('recent-row');
  if(!box||!row)return;
  const here=window.PP_SLUG||null;                       // never offer the page you are on
  const items=recentSlugs().filter(s=>s!==here)
    .map(s=>PRODUCTS.find(p=>p.slug===s)).filter(Boolean);
  if(!items.length){box.hidden=true;return;}
  row.innerHTML=items.map(p=>`<a class="rc-card" href="${productUrl(p)}">
    <span class="rc-img"><img src="${p.thumb}" alt="${pnameJS(p)}" loading="lazy" width="200" height="150"></span>
    <span class="rc-n">${pnameJS(p)}</span>
    <span class="rc-p">${fmt(p.price)} ${t('u_uah')}</span></a>`).join('');
  box.hidden=false;
}
if(window.PP_SLUG) recentAdd(window.PP_SLUG);            // product pages record themselves
renderRecent();
