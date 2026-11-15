// Pace test: does Tote learn "you buy milk every 3 days" well enough that its reminders land the day before you run out?
// Simulates months of real shopping for 1,000 households (bulk buys, holidays, shopping a day early or late, telling Tote
// "we're out" only some of the time), feeds the purchases to the Worker's real paceFrom(), and scores the reminders it would send.
// No network, no model calls.
//
//   node evals/pace.mjs            the score (seed 2, never used for tuning)
//   node evals/pace.mjs --seed=1   the tuning set
//   node evals/pace.mjs --json     machine-readable, for evals/track.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { loadAgent } from './load.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const SEED = Number(arg('seed', 2)), HOUSEHOLDS = Number(arg('households', 1000)), DAYS = 180;

export async function loadPace() {
  return (await loadAgent(['paceFrom'])).paceFrom;
}

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; }; }
// what people buy again and again, with how many days one usual purchase lasts for one person
const ITEMS = [
  { name: 'milk', unit: 'L', size: 4, perPerson: 9 }, { name: 'eggs', unit: 'pcs', size: 12, perPerson: 14 },
  { name: 'bread', unit: 'pcs', size: 1, perPerson: 8 }, { name: 'coffee', unit: 'pack', size: 1, perPerson: 24 },
  { name: 'bananas', unit: 'pcs', size: 6, perPerson: 9 }, { name: 'diapers', unit: 'pcs', size: 40, perPerson: 6, kids: true },
  { name: 'dish soap', unit: 'pcs', size: 1, perPerson: 40 }, { name: 'toilet paper', unit: 'pack', size: 1, perPerson: 30 },
  { name: 'yogurt', unit: 'pcs', size: 6, perPerson: 7 }, { name: 'rice', unit: 'kg', size: 2, perPerson: 45 },
];
const HOMES = [ // [people, kids, share, how regular they are]
  { kind: 'busy family', people: 5, kids: true, share: 0.3, wobble: 0.25 }, { kind: 'student alone', people: 1, kids: false, share: 0.2, wobble: 0.35 },
  { kind: 'works alone', people: 1, kids: false, share: 0.2, wobble: 0.2 }, { kind: 'couple, no kids', people: 2, kids: false, share: 0.3, wobble: 0.2 },
];
const iso = (d) => new Date(Date.UTC(2026, 0, 1) + d * 86400000).toISOString().slice(0, 10);

// One item in one home: the truth (when it really ran out) and what Tote is told (purchases, and sometimes "we're out").
function simulate(r, home, item) {
  const base = Math.max(1.5, (item.perPerson / Math.pow(home.people, 0.8)) * (0.7 + r() * 0.6));
  const periods = [];
  let day = Math.floor(r() * 5);
  while (day < DAYS) {
    const bulk = r() < 0.12 ? 2 : 1, qty = item.size * bulk;
    let lasts = base * bulk * (1 + (r() * 2 - 1) * home.wobble);
    if (r() < 0.05) lasts += 5 + Math.floor(r() * 7); // away for a while
    const out = day + Math.max(1, Math.round(lasts));
    const told = r() < 0.35; // they tell Tote "we're out" about a third of the time
    // the next shop: usually the day it runs out or a day or two after, sometimes a day early on the weekly trip
    const u = r(), next = out + (u < 0.2 ? -1 : u < 0.55 ? 0 : u < 0.85 ? 1 : 2 + Math.floor(r() * 3));
    periods.push({ bought: day, qty, out, told: told && next > out });
    day = Math.max(day + 1, next);
  }
  return periods;
}

export async function run(paceFrom, seed = SEED, households = HOUSEHOLDS) {
  const r = rng(seed * 7919 + 13);
  const m = { periods: 0, predicted: 0, abs: 0, within1: 0, within2: 0, onTime: 0, early: 0, late: 0, missedNoPace: 0, firstPaceAt: [] };
  const byHome = {};
  for (let h = 0; h < households; h++) {
    let x = r(), home = HOMES[0];
    for (const k of HOMES) { if (x < k.share) { home = k; break; } x -= k.share; }
    const bh = byHome[home.kind] || (byHome[home.kind] = { predicted: 0, onTime: 0, abs: 0 });
    const items = ITEMS.filter((i) => !i.kids || home.kids).filter(() => r() < 0.6);
    for (const item of items) {
      const ps = simulate(r, home, item);
      const hist = [];
      ps.forEach((p, i) => {
        // what Tote knows when this purchase is logged: every earlier purchase, and "we're out" when it was said
        hist.push({ bought: iso(p.bought), qty: p.qty, unit: item.unit, ran_out: null });
        if (i > 0 && ps[i - 1].told) hist[i - 1].ran_out = iso(ps[i - 1].out);
        const pace = paceFrom(hist.map((x) => ({ ...x })), p.qty, item.unit);
        if (i === ps.length - 1 && p.out >= DAYS) return; // still running when the simulation ends
        m.periods++;
        if (!pace) { m.missedNoPace++; return; }
        if (!m.firstPaceAt[i]) m.firstPaceAt[i] = 0; m.firstPaceAt[i]++;
        m.predicted++; bh.predicted++;
        const predictedOut = p.bought + pace.days, err = Math.abs(predictedOut - p.out);
        m.abs += err; bh.abs += err;
        if (err <= 1) m.within1++;
        if (err <= 2) m.within2++;
        // Tote reminds the day before it expects them to run out (and never within two days of buying)
        const remind = Math.max(p.bought + 2, predictedOut - 1);
        if (remind > p.out) m.late++; // they had already run out
        else if (remind < p.out - 2) m.early++; // a nag: days before it was needed
        else { m.onTime++; bh.onTime++; }
      });
    }
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  return {
    seed, households, periods: m.periods, withPace: pct(m.predicted, m.periods),
    errorDays: Math.round((m.abs / Math.max(1, m.predicted)) * 100) / 100, within1: pct(m.within1, m.predicted), within2: pct(m.within2, m.predicted),
    reminderOnTime: pct(m.onTime, m.predicted), reminderEarly: pct(m.early, m.predicted), reminderLate: pct(m.late, m.predicted),
    byHome: Object.fromEntries(Object.entries(byHome).map(([k, v]) => [k, { onTime: pct(v.onTime, v.predicted), errorDays: Math.round((v.abs / Math.max(1, v.predicted)) * 100) / 100 }])),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const s = await run(await loadPace());
  if (process.argv.includes('--json')) { console.log(JSON.stringify(s)); process.exit(0); }
  console.log('Pace learning, ' + s.households + ' households, seed ' + s.seed + ', ' + s.periods + ' purchases');
  console.log('  has a pace for            ' + s.withPace + '% of purchases');
  console.log('  off by                    ' + s.errorDays + ' days on average');
  console.log('  within 1 / 2 days         ' + s.within1 + '% / ' + s.within2 + '%');
  console.log('  reminder on time          ' + s.reminderOnTime + '%   (the day or two before they run out)');
  console.log('  reminder too early        ' + s.reminderEarly + '%   (a nag)');
  console.log('  reminder too late         ' + s.reminderLate + '%   (they had already run out)');
  for (const [k, v] of Object.entries(s.byHome)) console.log('  ' + k.padEnd(26) + v.onTime + '% on time, off by ' + v.errorDays + ' days');
}
