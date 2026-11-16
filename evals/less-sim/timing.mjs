// Experiment A: reminder timing with the Worker's real paceFrom(), same simulated homes as evals/pace.mjs.
// Adds (1) a starting guess from pack size x people for cycles with no learned pace, (2) lead-time rules.
import { loadAgent } from '../load.mjs';
const { paceFrom } = await loadAgent(['paceFrom']);
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const SEED = Number(arg('seed', 2)), HOUSEHOLDS = Number(arg('households', 2000)), DAYS = 180;
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; }; }
const ITEMS = [
  { name: 'milk', unit: 'L', size: 4, perPerson: 9 }, { name: 'eggs', unit: 'pcs', size: 12, perPerson: 14 },
  { name: 'bread', unit: 'pcs', size: 1, perPerson: 8 }, { name: 'coffee', unit: 'pack', size: 1, perPerson: 24 },
  { name: 'bananas', unit: 'pcs', size: 6, perPerson: 9 }, { name: 'diapers', unit: 'pcs', size: 40, perPerson: 6, kids: true },
  { name: 'dish soap', unit: 'pcs', size: 1, perPerson: 40 }, { name: 'toilet paper', unit: 'pack', size: 1, perPerson: 30 },
  { name: 'yogurt', unit: 'pcs', size: 6, perPerson: 7 }, { name: 'rice', unit: 'kg', size: 2, perPerson: 45 },
];
const HOMES = [
  { kind: 'busy family', people: 5, kids: true, share: 0.3, wobble: 0.25 }, { kind: 'student alone', people: 1, kids: false, share: 0.2, wobble: 0.35 },
  { kind: 'works alone', people: 1, kids: false, share: 0.2, wobble: 0.2 }, { kind: 'couple, no kids', people: 2, kids: false, share: 0.3, wobble: 0.2 },
];
const iso = (d) => new Date(Date.UTC(2026, 0, 1) + d * 86400000).toISOString().slice(0, 10);
function simulate(r, home, item) { // identical to evals/pace.mjs
  const base = Math.max(1.5, (item.perPerson / Math.pow(home.people, 0.8)) * (0.7 + r() * 0.6));
  const periods = []; let day = Math.floor(r() * 5);
  while (day < DAYS) {
    const bulk = r() < 0.12 ? 2 : 1, qty = item.size * bulk;
    let lasts = base * bulk * (1 + (r() * 2 - 1) * home.wobble);
    if (r() < 0.05) lasts += 5 + Math.floor(r() * 7);
    const out = day + Math.max(1, Math.round(lasts));
    const told = r() < 0.35;
    const u = r(), next = out + (u < 0.2 ? -1 : u < 0.55 ? 0 : u < 0.85 ? 1 : 2 + Math.floor(r() * 3));
    periods.push({ bought: day, qty, bulk, out, base, told: told && next > out });
    day = Math.max(day + 1, next);
  }
  return periods;
}
// The starting guess Tote would carry in code: days one usual pack lasts one person, wrong by a fixed factor per item
// (a table is never the truth), and a naive "divide by people" (the truth here divides by people^0.8, which Tote would not know).
const tr = rng(4242); const TABLE = Object.fromEntries(ITEMS.map((i) => [i.name, i.perPerson * (0.8 + tr() * 0.45)]));
const guess = (item, home, bulk, naive) => Math.max(2, Math.round((TABLE[item.name] / (naive ? home.people : Math.pow(home.people, 0.8))) * bulk));

export function run({ prior = false, naive = false, lead = () => 1, blend = false, oracle = false }, seed = SEED) {
  const r = rng(seed * 7919 + 13);
  const mk = () => ({ n: 0, onTime: 0, early: 0, late: 0, none: 0 });
  const all = mk(), first = mk(), byHome = {};
  for (let h = 0; h < HOUSEHOLDS; h++) {
    let x = r(), home = HOMES[0];
    for (const k of HOMES) { if (x < k.share) { home = k; break; } x -= k.share; }
    const bh = byHome[home.kind] || (byHome[home.kind] = mk());
    const items = ITEMS.filter((i) => !i.kids || home.kids).filter(() => r() < 0.6);
    for (const item of items) {
      const ps = simulate(r, home, item), hist = [];
      ps.forEach((p, i) => {
        hist.push({ bought: iso(p.bought), qty: p.qty, unit: item.unit, ran_out: null });
        if (i > 0 && ps[i - 1].told) hist[i - 1].ran_out = iso(ps[i - 1].out);
        const pace = paceFrom(hist.map((x) => ({ ...x })), p.qty, item.unit);
        if (i === ps.length - 1 && p.out >= DAYS) return;
        const buckets = [all, bh].concat(i === 0 ? [first] : []);
        for (const b of buckets) b.n++;
        let days = pace ? pace.days : null, seen = pace ? pace.seen : 0;
        if (prior) { const g = guess(item, home, p.bulk, naive); if (!pace) days = g; else if (blend && seen < 3) days = Math.round((g + pace.days * seen * 2) / (1 + seen * 2)); }
        if (oracle) days = Math.round(p.base * p.bulk);
        if (days == null) { for (const b of buckets) b.none++; return; }
        const predictedOut = p.bought + days;
        const remind = Math.max(p.bought + 2, predictedOut - lead(days, seen, home));
        const k = remind > p.out ? 'late' : remind < p.out - 2 ? 'early' : 'onTime';
        for (const b of buckets) b[k]++;
      });
    }
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  // shares are of ALL run-outs, so "no reminder at all" counts against Tote (pace.mjs reports shares of predicted ones only)
  const sh = (b) => ({ runOuts: b.n, onTime: pct(b.onTime, b.n), early: pct(b.early, b.n), late: pct(b.late, b.n), none: pct(b.none, b.n), lateOfSent: pct(b.late, b.n - b.none), onTimeOfSent: pct(b.onTime, b.n - b.none) });
  return { all: sh(all), first: sh(first), byHome: Object.fromEntries(Object.entries(byHome).map(([k, v]) => [k, sh(v)])) };
}
const LEADS = {
  'today (1 day before)': () => 1,
  '2 days before, always': () => 2,
  'long items earlier (2 if every 10+ days)': (d) => (d >= 10 ? 2 : 1),
  'long items earlier (2 if 8+, 3 if 21+)': (d) => (d >= 21 ? 3 : d >= 8 ? 2 : 1),
  'unsure earlier (2 until 3 purchases seen)': (d, s) => (s < 3 ? 2 : 1),
  'both (unsure or long: 2; 21+: 3)': (d, s) => (d >= 21 ? 3 : s < 3 || d >= 8 ? 2 : 1),
};
if (process.argv[1].endsWith('timing.mjs')) {
  const row = (name, s) => console.log(name.padEnd(46), String(s.onTime).padStart(5), String(s.early).padStart(6), String(s.late).padStart(6), String(s.none).padStart(6), ' | of sent: late', s.lateOfSent, 'on time', s.onTimeOfSent);
  console.log('seed', SEED, 'homes', HOUSEHOLDS, ' columns: on time / early / late / no reminder, as % of all run-outs');
  console.log('\n-- starting guess (lead 1) --');
  const t = run({}); row('today, all run-outs', t.all); row('today, first purchase of an item', t.first);
  for (const [n, o] of [['guess (people^0.8)', { prior: true }], ['guess (naive / people)', { prior: true, naive: true }], ['guess + blend while unsure', { prior: true, blend: true }]]) { const s = run(o); row(n + ', all', s.all); row(n + ', first purchase', s.first); }
  row('CEILING: true average pace known exactly', run({ oracle: true }).all);
  console.log('\n-- lead time (no guess) --');
  for (const [n, f] of Object.entries(LEADS)) row(n, run({ lead: f }).all);
  console.log('\n-- lead time by home, today vs candidates --');
  for (const n of ['today (1 day before)', 'long items earlier (2 if 8+, 3 if 21+)', 'both (unsure or long: 2; 21+: 3)']) { const s = run({ lead: LEADS[n] }); console.log(n); for (const [k, v] of Object.entries(s.byHome)) row('   ' + k, v); }
}
