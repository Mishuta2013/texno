// Rewrite each product's thumb/photos from what is actually on disk.
// The processing scripts decide how many photos a model has; this keeps
// data/products.json from capping or outliving them.
// Run after any process_*.py:  node scripts/sync_photos.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const FILE = path.join(ROOT, 'data', 'products.json');
const products = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let changed = 0, missing = [];

for (const p of products) {
  const dir = path.join(ROOT, 'assets', 'img', 'products', p.slug);
  if (!fs.existsSync(dir)) { missing.push(p.slug); continue; }
  const nums = fs.readdirSync(dir)
    .filter(f => /^\d+\.webp$/.test(f))
    .sort((a, b) => parseInt(a) - parseInt(b))
    .map(f => `/assets/img/products/${p.slug}/${f}`);
  if (!nums.length) { missing.push(p.slug); continue; }
  const thumb = fs.existsSync(path.join(dir, 'thumb.webp'))
    ? `/assets/img/products/${p.slug}/thumb.webp` : nums[0];
  const before = JSON.stringify([p.thumb, p.photos]);
  p.thumb = thumb; p.photos = nums;
  if (JSON.stringify([p.thumb, p.photos]) !== before) { changed++; console.log(`  ${p.slug}: ${nums.length} photos`); }
}

fs.writeFileSync(FILE, JSON.stringify(products, null, 2) + '\n', 'utf8');
const total = products.reduce((n, p) => n + (p.photos ? p.photos.length : 0), 0);
console.log(`products updated: ${changed}, total photos: ${total}`);
if (missing.length) console.log(`NO PHOTOS: ${missing.join(', ')}`);
