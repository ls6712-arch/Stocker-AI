// World groceries: does Tote know the things people buy at Patel Brothers, H Mart, 99 Ranch, Seafood City, Weee!, BigBasket,
// Blinkit, Northgate, an African market or NetCost, and does it keep people with allergies and diets safe around them?
// Runs the Worker's own code with no model and no network. The model's reading of whole receipts is tested live (scorecard).
//
//   node evals/world.mjs                    tuning set (evals/world/lines-tune.json)
//   node evals/world.mjs --set=heldout      held-out set, never used for tuning
//   node evals/world.mjs --json             one line of JSON, for evals/track.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SET = (process.argv.find((a) => a.startsWith('--set=')) || '--set=tune').slice(6);
const WANT = ['unfit', 'cleanProfile', 'sanitize', 'itemInfo', 'enrich', 'glossaryFor'];

export async function loadAgent() {
  const src = fs.readFileSync(path.join(ROOT, 'src/index.js'), 'utf8');
  const have = WANT.filter((n) => new RegExp('^(const|function|async function) ' + n + '\\b', 'm').test(src));
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tote-world-')), 'agent.mjs');
  fs.writeFileSync(tmp, src + '\nexport { ' + have.join(', ') + ' };\n');
  return import(pathToFileURL(tmp).href);
}

const NAMES = { P: 'Peanuts', T: 'Tree nuts', M: 'Milk', E: 'Eggs', W: 'Wheat', S: 'Soy', F: 'Fish', C: 'Shellfish', Z: 'Sesame', U: 'Mustard' };
const DIET = { meat: ['Vegetarian', 'Vegan'], fish: ['Vegetarian', 'Vegan'], shellfish: ['Vegetarian', 'Vegan'], dairy: ['Vegan'], egg: ['Vegan'], pork: ['Halal', 'No pork'] };

export async function run(T, set = SET) {
  const rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'evals/world/lines-' + set + '.json'), 'utf8'));
  const stats = {}, fails = [];
  const ok = (k, pass, d) => { const s = stats[k] || (stats[k] = { pass: 0, total: 0 }); s.total++; if (pass) s.pass++; else if (fails.length < 400) fails.push(k + ': ' + d); };
  const prof = (o) => T.cleanProfile({ personas: ['other'], ...o });
  // Is this item flagged for that home? The real pipeline: the glossary on the action (enrich) and the name check (unfit).
  const flagged = (name, line, p) => {
    if (T.enrich) { const a = T.enrich({ action: 'add', name, quantity: 1, unit: 'pcs', area: 'Kitchen', category: 'Other', warn: '', shelfLifeDays: 0 }, p, line); if (a.warn) return true; }
    return !!T.unfit(name, p);
  };
  for (const r of rows) {
    const names = [r.clean, r.line.replace(/[\d.,₹$×x]+\s*(lb|oz|kg|g|l|ml|ct|pk|pc|fl oz|gal)?\b/gi, ' ').replace(/\s+/g, ' ').trim()];
    if (r.name) {
      const info = T.itemInfo ? T.itemInfo(r.line) || T.itemInfo(r.clean) : null;
      ok('knows the item', !!info && new RegExp(r.name, 'i').test(info.name), r.store + ' | ' + r.line + ' -> ' + (info ? info.name : 'unknown'));
      ok('right place (area and category)', !!info && info.place === r.place, r.line + ' -> ' + (info ? info.place : 'unknown') + ', want ' + r.place);
      ok('sensible keeping time', !!info && info.keep >= r.keep[0] && info.keep <= r.keep[1], r.line + ' -> ' + (info ? info.keep : '?') + ' days, want ' + r.keep.join('-'));
    }
    // safety: every allergen it really has must be flagged for a home with that allergy, whatever the model calls it
    for (const a of r.allergens) for (const n of names) ok('allergy flagged: ' + NAMES[a], flagged(n, r.line, prof({ allergies: [NAMES[a]] })), n + ' for ' + NAMES[a]);
    // and no false alarm for an allergen it does not have (peanuts, or sesame for things with peanuts)
    const absent = r.allergens.includes('P') ? 'Z' : 'P';
    if (!r.allergens.includes(absent)) ok('no false alarm', !flagged(r.clean, r.line, prof({ allergies: [NAMES[absent]] })), r.clean + ' flagged for ' + NAMES[absent]);
    for (const t of r.tags) for (const d of DIET[t] || []) ok('diet respected: ' + d, flagged(r.clean, r.line, prof({ diet: [d] })), r.clean + ' for ' + d);
    if (!r.tags.some((t) => ['meat', 'fish', 'shellfish'].includes(t))) ok('vegetarian food not flagged for a vegetarian home', !flagged(r.clean, r.line, prof({ diet: ['Vegetarian'] })), r.clean);
  }
  // units read from receipts: a gallon is never a gram
  for (const [line, name, unit, lo, hi] of [['ORG WHL MILK 1GAL', 'Whole Milk', 'L', 3.5, 4], ['Organic Whole Milk, 1 gal', 'Organic Whole Milk', 'L', 3.5, 4], ['HORIZON 2% MILK HALF GAL', 'Horizon 2% Milk', 'L', 1.7, 2], ['TROPICANA OJ 52 FL OZ', 'Orange Juice', 'L', 1.4, 1.6]]) {
    const out = T.sanitize({ actions: [{ action: 'add', name, quantity: /half/i.test(line) ? 0.5 : /52/.test(line) ? 52 : 1, unit: 'g', area: 'Kitchen', category: 'Dairy' }] }, 'bill');
    let a = out.actions[0];
    if (T.enrich) a = T.enrich(a, null, line);
    ok('units: liquids read as litres', a.unit === unit && a.quantity >= lo && a.quantity <= hi, line + ' -> ' + a.quantity + ' ' + a.unit);
  }
  // context: only what the receipt needs goes to the model
  if (T.glossaryFor) {
    const g = T.glossaryFor('CJ GOCHUJANG 1KG\nNAPA CABBAGE\nWHOLE MILK 1GAL');
    ok('context: the model gets the matching entries only', /gochujang/i.test(g) && /napa/i.test(g) && g.split('\n').length <= 6, g);
  } else ok('context: the model gets the matching entries only', false, 'no glossary');
  const all = Object.values(stats).reduce((s, x) => ({ pass: s.pass + x.pass, total: s.total + x.total }), { pass: 0, total: 0 });
  const pct = (s) => Math.round((s.pass / s.total) * 1000) / 10;
  const group = (re) => { const xs = Object.entries(stats).filter(([k]) => re.test(k)).map(([, v]) => v); const s = xs.reduce((a, x) => ({ pass: a.pass + x.pass, total: a.total + x.total }), { pass: 0, total: 0 }); return s.total ? pct(s) : null; };
  return { set, lines: rows.length, stores: new Set(rows.map((r) => r.store)).size, stats, fails, overall: pct(all), knows: group(/^knows/), place: group(/^right place/), keep: group(/^sensible/), allergy: group(/^allergy/), falseAlarm: group(/^no false|^vegetarian food/), diet: group(/^diet/), units: group(/^units/) };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes('--check')) {
  // for npm test: the tuning set must stay perfect and the first held-out set (now tuning too) must not slip;
  // heldout2 is reported, not gated, because it is the closest thing to a clean score
  const T = await loadAgent(), a = await run(T, 'tune'), b = await run(T, 'heldout'), c = await run(T, 'heldout2');
  console.log('World groceries: tuning ' + a.overall + '%, held-out ' + b.overall + '%, fresh held-out ' + c.overall + '% (allergies ' + c.allergy + '%, diets ' + c.diet + '%, units ' + c.units + '%)');
  process.exit(a.overall === 100 && b.overall >= 95 && c.allergy >= 80 && c.units === 100 ? 0 : 1);
} else if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const s = await run(await loadAgent());
  if (process.argv.includes('--json')) { console.log(JSON.stringify({ ...s, stats: undefined, fails: undefined })); process.exit(0); }
  console.log('World groceries, ' + s.set + ' set: ' + s.lines + ' receipt lines from ' + s.stores + ' stores and apps');
  for (const [k, v] of Object.entries(s.stats).sort()) console.log((v.pass === v.total ? '  ok   ' : '  FAIL ') + (Math.round((v.pass / v.total) * 1000) / 10 + '%').padStart(6) + '  ' + (v.pass + '/' + v.total).padStart(8) + '  ' + k);
  console.log('\nKnows the item ' + s.knows + '% · right place ' + s.place + '% · keeping time ' + s.keep + '% · allergies caught ' + s.allergy + '% · no false alarms ' + s.falseAlarm + '% · diets ' + s.diet + '% · units ' + s.units + '%');
  console.log('Overall ' + s.overall + '%');
  if (process.argv.includes('--fails')) console.log('\n' + s.fails.join('\n'));
}
