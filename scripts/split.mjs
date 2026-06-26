// One-time: split monolithic index.html into reusable parts for the build:
//   assets/css/main.css  (the <style> block)
//   assets/js/main.js    (the main app <script>, with PRODUCTS+I18N consts removed → injected from data)
//   templates/body.html  (body inner WITHOUT the main app script; data-driven catalog shell kept)
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function between(s, openTag, closeTag, from = 0) {
  const a = s.indexOf(openTag, from); if (a < 0) return null;
  const b = s.indexOf(closeTag, a + openTag.length); if (b < 0) return null;
  return { inner: s.slice(a + openTag.length, b), start: a, end: b + closeTag.length };
}
function matchBrace(s, fromBrace) {
  let d = 0; for (let i = fromBrace; i < s.length; i++) { const c = s[i]; if (c === '{') d++; else if (c === '}') { d--; if (!d) return i; } } return -1;
}

fs.mkdirSync(path.join(ROOT, 'assets/css'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'assets/js'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'templates'), { recursive: true });

// --- CSS ---
const style = between(html, '<style>', '</style>');
fs.writeFileSync(path.join(ROOT, 'assets/css/main.css'), style.inner.trim() + '\n', 'utf8');

// --- main app script (the bare <script> ... </script>, the largest one) ---
// find a <script> with no attributes
const scriptOpen = html.indexOf('<script>\n', style.end);
const sc = between(html, '<script>', '</script>', scriptOpen);
let js = sc.inner;
// remove `const I18N = { ... };`
const i18nAt = js.indexOf('const I18N');
if (i18nAt >= 0) {
  const brace = js.indexOf('{', i18nAt);
  const close = matchBrace(js, brace);
  let after = close + 1; if (js[after] === ';') after++;
  js = js.slice(0, i18nAt) + js.slice(after);
}
// remove `const PRODUCTS=...;` (single line)
js = js.replace(/const PRODUCTS=.*?;\s*\n/, '');
// inject from data (set on window by the page before this script loads)
js = `const PRODUCTS=window.__PRODUCTS__||[];\nconst I18N=window.__I18N__||{};\nconst SITE=window.__SITE__||{};\n` + js.trimStart();
fs.writeFileSync(path.join(ROOT, 'assets/js/main.js'), js.trim() + '\n', 'utf8');

// --- body inner (without the main app script) ---
const body = between(html, '<body>', '</body>');
let bodyInner = body.inner;
// strip the main script tag block from body
const fullScript = html.slice(sc.start, sc.end);
bodyInner = bodyInner.replace(fullScript, '');
fs.writeFileSync(path.join(ROOT, 'templates/body.html'), bodyInner.trim() + '\n', 'utf8');

console.log('css bytes:', style.inner.length);
console.log('js bytes:', js.length, '| PRODUCTS removed:', !js.includes('const PRODUCTS=['), '| I18N removed:', !js.includes('const I18N = {'));
console.log('body bytes:', bodyInner.length, '| main script stripped:', !bodyInner.includes('function renderCatalog'));
console.log('wrote assets/css/main.css, assets/js/main.js, templates/body.html');
