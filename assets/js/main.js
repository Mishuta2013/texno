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
    case'kbtu_power':return p.btu?(p.btu/1000).toFixed(0)+'k BTU'+(s.power_w?' · '+s.power_w+' Вт':''):null;
    case'area':return p.area?'до '+p.area+' м²':(f.dash?'—':null);
    case'comp':return p.inverter?'Інверторний':'On/Off';
    case'noise':return s.noise?'від '+s.noise+' дБ':null;
    case'cool_range':return(s.cool_min!==undefined)?s.cool_min+'°C … +'+s.cool_max+'°C':null;
    case'celsius':return(raw!==undefined&&raw!==null)?raw+'°C':null;
    case'wifi_yesopt':return p.wifi?'Так':'Опція';
    case'heat_yesno':return p.heatpump?'Так':'Ні';
    case'wh':return raw?raw+' Wh':null;
    case'watt':return raw?raw+' Вт':null;
    case'sockets':return raw?raw+' × Schuko':null;
    default:return(raw!==undefined&&raw!==null&&raw!=='')?raw:null;
  }
}
function catChipsJS(p){
  return(catOf(p).chips||[]).map(function(c){
    if(c.flag)return p[c.flag]?'<span class="stag">'+c.icon+' '+c.label+'</span>':'';
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

let LANG = (localStorage.getItem('tp_lang')||'uk');
if(!I18N[LANG]) LANG='uk';
let activeBrand='all', activeArea='all', activeType='all', activePrice='all', currentProduct=null;
let FAV = JSON.parse(localStorage.getItem('tp_fav')||'[]');
let CMP = JSON.parse(localStorage.getItem('tp_cmp')||'[]');

const $=id=>document.getElementById(id);
const fmt=n=>n.toLocaleString(LANG==='en'?'en-US':(LANG==='ru'?'ru-RU':'uk-UA'));
const t=k=>(I18N[LANG][k]!==undefined?I18N[LANG][k]:(I18N.uk[k]||k));
const pdesc=p=>p['desc_'+LANG]||p.desc_uk;

/* ============ I18N ENGINE ============ */
function applyI18n(){
  document.documentElement.lang = LANG;
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const k=el.getAttribute('data-i18n'); const v=t(k);
    if(v!==undefined) el.textContent=v;
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
  if($('catalog-grid')&&LANG!=='uk'){ // homepage only; uk keeps the server-rendered SEO title
    document.title = LANG==='ru' ? 'TEXNO PLAZA — Техника для дома и энергонезависимость в Сумах'
      : 'TEXNO PLAZA — Home appliances & energy independence in Sumy';
  }
}
function setText(id,v){const e=$(id);if(e)e.textContent=v;}
function setLang(l){LANG=l;localStorage.setItem('tp_lang',l);applyI18n();}

/* ============ THEME ============ */
/* dark theme removed in redesign — single curated light theme */

/* ============ HERO ============ */
(function(){const af=$('airflow');if(!af)return;for(let i=0;i<5;i++){const s=document.createElement('span');s.style.top=(8+i*12)+'px';s.style.width=(50+Math.random()*40)+'%';s.style.left='0';s.style.animationDelay=(i*0.4)+'s';af.appendChild(s);}})();

/* ============ CATALOG ============ */
function getFiltered(){
  let list=[...PRODUCTS];
  if(window.__CATALOG_CAT__&&window.__CATALOG_CAT__!=='all') list=list.filter(p=>p.category===window.__CATALOG_CAT__);
  const q=$('search-input').value.toLowerCase().trim();
  if(q) list=list.filter(p=>p.name.toLowerCase().includes(q)||p.brand.toLowerCase().includes(q)||p.series.toLowerCase().includes(q));
  if(activeBrand!=='all') list=list.filter(p=>p.brand===activeBrand);
  if(activeType==='inverter') list=list.filter(p=>p.inverter);
  if(activeType==='heatpump') list=list.filter(p=>p.heatpump);
  if(activeArea!=='all'){const a=parseInt(activeArea);
    if(a===25)list=list.filter(p=>p.area<=25);else if(a===35)list=list.filter(p=>p.area>25&&p.area<=35);
    else if(a===50)list=list.filter(p=>p.area>35&&p.area<=50);else if(a===70)list=list.filter(p=>p.area>50);}
  if(activePrice!=='all'){const pr=parseInt(activePrice);
    if(pr===15000)list=list.filter(p=>p.price<=15000);else if(pr===25000)list=list.filter(p=>p.price>15000&&p.price<=25000);
    else if(pr===40000)list=list.filter(p=>p.price>25000&&p.price<=40000);else if(pr===999999)list=list.filter(p=>p.price>40000);}
  const sort=$('sort-select').value;
  if(sort==='price-asc')list.sort((a,b)=>a.price-b.price);
  else if(sort==='price-desc')list.sort((a,b)=>b.price-a.price);
  else if(sort==='area-asc')list.sort((a,b)=>(a.area||0)-(b.area||0));
  return list;
}
function productUrl(p){return (catOf(p).urlPrefix||SITE.productUrlPrefix||'/kondicioner')+'/'+p.slug+'/';}
function cardHTML(p){
  const idx=PRODUCTS.indexOf(p);
  const url=productUrl(p);
  let badge='';
  if(p.heatpump)badge=`<span class="cbadge hp">${t('sp_hp')}</span>`;
  else if(p.inverter)badge=`<span class="cbadge inv">${t('f_inv').replace(/і$|ые$|s$/,'')||'Inverter'}</span>`;
  const favOn=FAV.includes(idx)?'on':'';
  const cmpOn=CMP.includes(idx)?'on':'';
  return`<div class="card">
    <a class="card-img" href="${url}">
      ${badge}
      <span class="cstock"><i></i>${t('c_instock')}</span>
      <button class="card-fav ${favOn}" onclick="event.preventDefault();event.stopPropagation();toggleFav(${idx})" aria-label="fav"><svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg></button>
      <button class="card-cmp ${cmpOn}" onclick="event.preventDefault();event.stopPropagation();toggleCmp(${idx})"><span class="box"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span>${t('cmp_add')}</button>
      <img src="${p.thumb||p.photos[0]}" alt="${p.name}" loading="lazy" width="400" height="300">
    </a>
    <div class="card-body">
      <div class="card-brand">${p.brand}</div>
      <a class="card-name" href="${url}">${p.name}</a>
      <div class="card-specs">${catChipsJS(p)}</div>
      <div class="card-foot">
        <div class="card-price">${fmt(p.price)} <small>${LANG==='en'?'UAH':'грн'}</small></div>
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
  const rc=$('results-count'); if(rc) rc.innerHTML=`${t('found')} <strong>${list.length}</strong> ${t('of')} ${base} ${t('models_w')}`;
  if(!list.length){grid.innerHTML=`<div class="no-results"><p>${t('no_res_t')}</p><span>${t('no_res_s')}</span></div>`;return;}
  grid.innerHTML=list.map(cardHTML).join('');
}
function setupFilters(){
  [['brand-filters','brand'],['area-filters','area'],['type-filters','type'],['price-filters','price']].forEach(([gid,attr])=>{
    $(gid).addEventListener('click',e=>{const v=e.target.dataset[attr];if(v===undefined)return;
      $(gid).querySelectorAll('.fbtn').forEach(b=>b.classList.remove('active'));e.target.classList.add('active');
      if(attr==='brand')activeBrand=v;if(attr==='area')activeArea=v;if(attr==='type')activeType=v;if(attr==='price')activePrice=v;renderCatalog();});
  });
}
function setActive(gid,attr,val){$(gid).querySelectorAll('.fbtn').forEach(b=>b.classList.toggle('active',b.dataset[attr]===val));}
function resetFilters(){activeBrand=activeArea=activeType=activePrice='all';
  [['brand-filters','brand'],['area-filters','area'],['type-filters','type'],['price-filters','price']].forEach(([g,a])=>setActive(g,a,'all'));
  $('search-input').value='';$('sort-select').value='default';renderCatalog();}
/* homepage catalog category tabs */
function switchCat(cat){
  if(cat!=='all'&&!window.__CATS__[cat])return;
  window.__CATALOG_CAT__=cat;
  document.querySelectorAll('#cat-tabs .ctab').forEach(b=>b.classList.toggle('active',b.dataset.cat===cat));
  const ac=cat==='kondicioneri';
  ['frow-brand','frow-area'].forEach(id=>{const el=$(id);if(el)el.style.display=ac?'':'none';});
  const h=$('cat-title');if(h)h.textContent=cat==='all'?t('cat_h_all'):(ac?t('cat_h'):t('cat_h_ps'));
  resetFilters();
}
function jumpCat(cat){switchCat(cat);document.getElementById('catalog').scrollIntoView({behavior:'smooth'});}
(function initCatTabs(){
  const tabs=document.getElementById('cat-tabs');if(!tabs)return;
  tabs.querySelectorAll('.ctab').forEach(b=>{
    const n=b.dataset.cat==='all'?PRODUCTS.length:PRODUCTS.filter(p=>p.category===b.dataset.cat).length;
    const el=b.querySelector('.ctab-n');if(el)el.textContent=n;
  });
})();
function jumpBrand(brand){if(window.__CATALOG_CAT__!=='kondicioneri')switchCat('kondicioneri');activeBrand=brand;setActive('brand-filters','brand',brand);renderCatalog();document.getElementById('catalog').scrollIntoView({behavior:'smooth'});}

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
function openProduct(idx){
  const p=PRODUCTS[idx];currentProduct=p;
  $('m-brand').textContent=p.brand+' · '+p.series;
  $('m-name').textContent=p.name;
  $('m-price').textContent=fmt(p.price);
  $('m-hp').style.display=p.heatpump?'inline-flex':'none';
  $('m-hp').textContent=t('m_hp');
  $('m-desc').textContent=pdesc(p);
  $('m-main-img').src=p.photos[0];
  $('m-thumbs').innerHTML=p.photos.map((ph,i)=>`<div class="m-thumb ${i===0?'active':''}" onclick="setThumb(this,${idx},${i})"><img src="${ph}" loading="lazy"></div>`).join('');
  // compact spec grid (top 6)
  const grid=[[t('sp_power'),(p.btu/1000).toFixed(0)+'k BTU'],[t('sp_area'),`${LANG==='en'?'up to':'до'} ${p.area} ${LANG==='en'?'m²':'м²'}`],[t('sp_comp'),p.inverter?t('sp_inv'):t('sp_onoff')],[t('sp_freon'),'R32'],[t('sp_wifi'),p.wifi?t('sp_yes'):t('sp_opt')],[t('sp_heat'),p.heatpump?t('sp_hp'):t('sp_yes')]];
  $('m-specs').innerHTML=grid.map(([l,v])=>`<div class="m-spec"><div class="l">${l}</div><div class="v">${v}</div></div>`).join('');
  // full spec table
  $('m-specs-full-body').innerHTML=specRows(p).map(([l,v])=>`<tr><td>${l}</td><td>${v}</td></tr>`).join('');
  $('m-specs-full-title').textContent=t('sp_more');
  // fav button
  const fb=$('m-fav-btn');fb.classList.toggle('on',FAV.includes(idx));
  fb.querySelector('span').textContent=FAV.includes(idx)?t('fav_rem'):t('fav_add');
  fb.onclick=()=>{toggleFav(idx);openProduct(idx);};
  // ctas
  $('m-order-btn').textContent=t('m_order');
  const wa=$('m-wa');wa.href=`https://api.whatsapp.com/send?phone=${PHONE}&text=${encodeURIComponent(t('buy_msg')+' '+p.name+' ('+fmt(p.price)+' '+(LANG==='en'?'UAH':'грн')+')')}`;
  const _msg=encodeURIComponent(t('buy_msg')+' '+p.name+' ('+fmt(p.price)+' '+(LANG==='en'?'UAH':'грн')+')');
  $('m-vb').href=`viber://chat?number=%2B${PHONE}`;
  $('m-tg').href=`https://t.me/${TG_USER}?text=${_msg}`;
  // wa label is static 'WhatsApp'
  $('product-modal').classList.add('open');document.body.style.overflow='hidden';
}
function setThumb(el,idx,i){document.querySelectorAll('.m-thumb').forEach(x=>x.classList.remove('active'));el.classList.add('active');$('m-main-img').src=PRODUCTS[idx].photos[i];}
function closeProduct(e){if(e.target===e.currentTarget)closeProductModal();}
function closeProductModal(){$('product-modal').classList.remove('open');document.body.style.overflow='';}

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
  $('cmp-thumbs').innerHTML=CMP.map(idx=>`<div class="cmp-th"><img src="${PRODUCTS[idx].thumb||PRODUCTS[idx].photos[0]}"><span class="x" onclick="toggleCmp(${idx})">✕</span></div>`).join('');
}
function openCompare(){
  if(CMP.length<2){alert(t('cmp_max'));}
  const rows=[
    ['',null],
    [t('sp_power'),p=>(p.btu/1000).toFixed(0)+'k BTU'],
    [t('sp_area'),p=>`${p.area} ${LANG==='en'?'m²':'м²'}`,'max',p=>p.area],
    [t('sp_comp'),p=>p.inverter?t('sp_inv'):t('sp_onoff')],
    [t('sp_eclass'),p=>p.specs.eclass||'—'],
    [t('sp_noise'),p=>p.specs.noise?p.specs.noise+' '+(LANG==='en'?'dB':'дБ'):'—','min',p=>p.specs.noise||999],
    [t('sp_heat_min'),p=>p.specs.heat_min!==undefined?p.specs.heat_min+'°C':'—','min',p=>p.specs.heat_min!==undefined?p.specs.heat_min:99],
    [t('sp_wifi'),p=>p.wifi?t('sp_yes'):t('sp_opt')],
    [t('sp_heat'),p=>p.heatpump?t('sp_hp'):t('sp_yes')],
    [t('sp_freon'),()=>'R32'],
  ];
  const prods=CMP.map(i=>PRODUCTS[i]);
  let html='<table class="cmp-table"><thead><tr><th></th>';
  prods.forEach((p,i)=>{html+=`<th><div class="cmp-prod-img"><img src="${p.photos[0]}"></div><div class="cmp-prod-name">${p.name}</div><div class="cmp-prod-price">${fmt(p.price)} ${LANG==='en'?'UAH':'грн'}</div></th>`;});
  html+='</tr></thead><tbody>';
  rows.slice(1).forEach(([lbl,fn,best,metric])=>{
    html+=`<tr><td class="cmp-row-lbl">${lbl}</td>`;
    let bestVal=null;
    if(best&&metric){const vals=prods.map(metric);bestVal=best==='max'?Math.max(...vals):Math.min(...vals);}
    prods.forEach(p=>{const v=fn(p);const isBest=best&&metric&&metric(p)===bestVal&&prods.length>1;html+=`<td class="${isBest?'best':''}">${v}</td>`;});
    html+='</tr>';
  });
  html+='</tbody></table>';
  $('compare-content').innerHTML=prods.length?html:`<div class="cmp-empty">${t('fav_empty')}</div>`;
  $('compare-modal').classList.add('open');document.body.style.overflow='hidden';
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
function openOrder(idx){const p=PRODUCTS[idx];currentProduct=p;$('cb-product').value=p.name;$('cb-product-wrap').style.display='block';openCb();}
function orderFromModal(){if(currentProduct){$('cb-product').value=currentProduct.name;$('cb-product-wrap').style.display='block';}closeProductModal();openCb();}
function openCb(){$('cb-form').style.display='block';$('cb-success').style.display='none';$('cb-modal').classList.add('open');document.body.style.overflow='hidden';}
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
  const ph=$('cb-phone').value.trim();if(!ph){alert(t('cb_phone'));return;}
  const ok=await sendLead({type:'callback',name:$('cb-name').value.trim(),phone:ph,product:$('cb-product').value||'',lang:LANG});
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
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeProductModal();forceCloseCb();closeModalById('compare-modal');closeModalById('fav-modal');closeQbuy();}});
window.addEventListener('scroll',closeQbuy,{passive:true});
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}}),{threshold:.12});
document.querySelectorAll('.reveal').forEach(el=>io.observe(el));

/* WhatsApp float + contact links use new phone */
document.querySelectorAll('a[href*="380991108041"]').forEach(()=>{});

/* Premium 3D tilt on product cards (delegated, survives re-renders) */
(function(){
  if(!matchMedia('(hover:hover) and (pointer:fine)').matches) return;
  if(matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  let cur=null;
  function reset(c){if(c)c.style.transform='';}
  document.addEventListener('pointermove',e=>{
    const card=e.target.closest('.card');
    if(card!==cur){reset(cur);cur=card;}
    if(!card)return;
    const r=card.getBoundingClientRect();
    const px=(e.clientX-r.left)/r.width-0.5, py=(e.clientY-r.top)/r.height-0.5;
    card.style.transform=`perspective(950px) rotateX(${(-py*4.5).toFixed(2)}deg) rotateY(${(px*5.5).toFixed(2)}deg) translateY(-6px)`;
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
  /* snowflakes in hero */
  if(hero && !reduce){
    const wrap=document.createElement('div');wrap.style.cssText='position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0';
    for(let i=0;i<9;i++){const s=document.createElement('div');s.className='flake';s.textContent='❄';s.style.left=(Math.random()*100).toFixed(1)+'%';s.style.fontSize=(8+Math.random()*9).toFixed(0)+'px';s.style.animationDuration=(11+Math.random()*12).toFixed(1)+'s';s.style.animationDelay=(-Math.random()*14).toFixed(1)+'s';wrap.appendChild(s);}
    hero.insertBefore(wrap,hero.firstChild);
  }
  /* count-up hero stats */
  const cu=document.querySelectorAll('.hstat .n');
  if(!reduce && cu.length){
    cu.forEach(el=>el.dataset.cu=el.innerHTML);
    const cio=new IntersectionObserver(es=>es.forEach(e=>{
      if(!e.isIntersecting)return;cio.unobserve(e.target);
      const el=e.target,html=el.dataset.cu,m=html.match(/^\s*(\d+)/);if(!m)return;
      const target=+m[1];let t0;const dur=1200;
      requestAnimationFrame(function step(ts){t0=t0||ts;const p=Math.min(1,(ts-t0)/dur);
        const v=Math.round(target*(1-Math.pow(1-p,3)));el.innerHTML=html.replace(/^\s*\d+/,v);
        if(p<1)requestAnimationFrame(step);});
    }),{threshold:.6});
    cu.forEach(el=>cio.observe(el));
  }
})();

/* ============ QUIZ ============ */
const QUIZ_ROOMS=[['bed','quiz_bed',1.0],['liv','quiz_liv',1.1],['kit','quiz_kit',1.2],['kid','quiz_kid',1.05],['off','quiz_off',1.0],['stu','quiz_stu',1.1]];
const QUIZ_FLOORS=[['low','quiz_fl_low',1.0],['mid','quiz_fl_mid',1.0],['top','quiz_fl_top',1.1]];
let quizStep=0, quizState={area:25,room:null,floor:null,budget:null};
function quizBudget(){const ps=PRODUCTS.map(p=>p.price);return [Math.floor(Math.min(...ps)/1000)*1000, Math.ceil(Math.max(...ps)/1000)*1000];}
function openQuiz(){if(!PRODUCTS.length)return;quizStep=0;quizState={area:25,room:null,floor:null,budget:quizBudget()[1]};$('quiz-modal').classList.add('open');document.body.style.overflow='hidden';quizRender();}
function closeQuiz(){closeModalById('quiz-modal');}
function quizCalc(){const rc=(QUIZ_ROOMS.find(r=>r[0]===quizState.room)||[,,1])[2];const fc=(QUIZ_FLOORS.find(f=>f[0]===quizState.floor)||[,,1])[2];const target=recommendBtu(quizState.area)*rc*fc;return [7000,9000,12000,18000,24000].find(s=>s>=target)||24000;}
function quizRender(){
  const body=$('quiz-body'),back=$('quiz-back'),next=$('quiz-next');
  $('quiz-prog').style.width=(quizStep/4*100)+'%';
  back.style.visibility=quizStep>0?'visible':'hidden';next.style.display='';
  next.textContent=quizStep===3?t('quiz_finish'):t('quiz_next');
  if(quizStep===0){
    body.innerHTML=`<div class="quiz-step"><div class="quiz-q">${t('quiz_s1')}</div><div class="quiz-big"><span id="qa-v">${quizState.area}</span> ${LANG==='en'?'m²':'м²'}</div><input type="range" min="8" max="100" value="${quizState.area}" oninput="quizState.area=+this.value;$('qa-v').textContent=this.value"><div class="quiz-hint">${t('quiz_s1_hint')}</div></div>`;
  }else if(quizStep===1){
    body.innerHTML=`<div class="quiz-step"><div class="quiz-q">${t('quiz_s2')}</div><div class="quiz-opts">${QUIZ_ROOMS.map(([k,key])=>`<button class="quiz-opt${quizState.room===k?' on':''}" onclick="quizState.room='${k}';quizRender()">${t(key)}</button>`).join('')}</div></div>`;
  }else if(quizStep===2){
    body.innerHTML=`<div class="quiz-step"><div class="quiz-q">${t('quiz_s3')}</div><div class="quiz-opts">${QUIZ_FLOORS.map(([k,key])=>`<button class="quiz-opt${quizState.floor===k?' on':''}" onclick="quizState.floor='${k}';quizRender()">${t(key)}</button>`).join('')}</div></div>`;
  }else{
    const [mn,mx]=quizBudget();if(quizState.budget==null)quizState.budget=mx;
    body.innerHTML=`<div class="quiz-step"><div class="quiz-q">${t('quiz_s4')}</div><div class="quiz-big"><span id="qb-v">${fmt(quizState.budget)}</span> ${LANG==='en'?'UAH':'грн'}</div><input type="range" min="${mn}" max="${mx}" step="1000" value="${quizState.budget}" oninput="quizState.budget=+this.value;$('qb-v').textContent=fmt(+this.value)"><div class="quiz-hint">${t('quiz_s4_hint')}</div></div>`;
  }
}
function quizNext(){if(quizStep===1&&!quizState.room)return;if(quizStep===2&&!quizState.floor)return;if(quizStep<3){quizStep++;quizRender();}else quizResult();}
function quizBack(){if(quizStep>0){quizStep--;quizRender();}}
function quizSummary(){const r=QUIZ_ROOMS.find(x=>x[0]===quizState.room),f=QUIZ_FLOORS.find(x=>x[0]===quizState.floor);return `${t('quiz_s1')}: ${quizState.area} ${LANG==='en'?'m²':'м²'}; ${r?t(r[1]):''}; ${f?t(f[1]):''}; ${t('quiz_s4')}: ${fmt(quizState.budget)} грн; ~${quizCalc()} BTU`;}
function quizResult(){
  const need=quizCalc();const list=PRODUCTS.filter(p=>p.btu>=need);
  const within=list.filter(p=>p.price<=quizState.budget).sort((a,b)=>a.btu-b.btu||a.price-b.price);
  let over=false,res=within.slice(0,3);
  if(!res.length){over=true;res=list.slice().sort((a,b)=>a.btu-b.btu||a.price-b.price).slice(0,3);}
  if(!res.length)res=PRODUCTS.slice().sort((a,b)=>b.btu-a.btu).slice(0,3);
  $('quiz-prog').style.width='100%';$('quiz-back').style.visibility='visible';$('quiz-next').style.display='none';
  const cards=res.map(p=>`<a class="quiz-card" href="${productUrl(p)}"><img src="${p.thumb||p.photos[0]}" alt="${p.name}" loading="lazy"><div class="quiz-card-b"><div class="quiz-card-m">${p.brand} · ${(p.btu/1000).toFixed(0)}k BTU · до ${p.area} м²</div><div class="quiz-card-n">${p.name}</div><div class="quiz-card-p">${fmt(p.price)} грн</div></div></a>`).join('');
  $('quiz-body').innerHTML=`<div class="quiz-res"><div class="quiz-q">${t('quiz_res_h')}</div>${over?`<div class="quiz-note">${t('quiz_over')}</div>`:''}<div class="quiz-cards">${cards}</div>
    <form class="quiz-lead" onsubmit="return quizSubmit(event)"><div class="quiz-q2">${t('quiz_lead_h')}</div>
      <div class="quiz-lead-row"><input name="name" placeholder="${t('form_name')}" required><input name="phone" placeholder="+38 (0__) ___-__-__" required></div>
      <input type="text" name="company" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button type="submit" class="btn-primary">${t('quiz_send')}</button></form></div>`;
}
function quizSubmit(e){e.preventDefault();const f=e.target;if(f.company.value)return false;
  sendLead({type:'quiz',name:f.name.value,phone:f.phone.value,note:quizSummary()});
  track('generate_lead',{method:'quiz'});
  $('quiz-body').innerHTML=`<div class="quiz-done"><div class="quiz-done-ic">✓</div><h3>${t('quiz_done_h')}</h3><p>${t('quiz_done_p')}</p></div>`;
  $('quiz-back').style.visibility='hidden';return false;}

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
