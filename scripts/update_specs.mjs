// Phase 1: apply VERIFIED spec corrections to data/products.json.
// Sources: official brand sites + vencon.ua / climagroup.ua datasheets (2026-06).
// Conservative: fill operating ranges & missing energy classes; fill noise only where empty.
import fs from 'node:fs';
const P = 'data/products.json';
const d = JSON.parse(fs.readFileSync(P, 'utf8'));
const tclNoise = { 9000: 22, 12000: 25, 18000: 33, 24000: 37 }; // verified TCL inverter indoor min (ZG11I-09=22)
let changed = [];

for (const p of d) {
  const s = p.specs || (p.specs = {});
  const before = JSON.stringify(s);
  if (p.brand === 'TCL' && p.inverter) {
    s.cool_min = -15; s.cool_max = 53;                 // verified across TCL R32 inverter line
    if (s.noise === undefined && tclNoise[p.btu]) s.noise = tclNoise[p.btu];
  } else if (p.brand === 'TCL' && !p.inverter) {
    if (!s.eclass) s.eclass = 'A';                     // XAB1 on/off R32
  } else if (p.brand === 'Ardesto') {
    s.cool_min = -15; s.cool_max = 53;                 // verified ARD-ACS-I (vencon)
  } else if (p.brand === 'MIDEA') {
    if (!s.eclass) s.eclass = 'A';                     // verified SEER 5.10 → A (midea.com.ua)
  } else if (p.brand === 'IDEA') {
    s.cool_min = 16; s.cool_max = 52;                  // verified Victory Basic line (+16…+52)
  }
  if (JSON.stringify(s) !== before) changed.push(p.slug);
}

fs.writeFileSync(P, JSON.stringify(d, null, 2), 'utf8');
console.log('updated', changed.length, 'products');
