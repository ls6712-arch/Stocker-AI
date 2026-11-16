// Ranks each feature by what it adds to the live app. node evals/less-sim/run.mjs [--sweep] (the sweep redraws every assumption about people 150 times; a few minutes)
import { runArm, P0, RANGES, LIVE, ALL } from './homes.mjs';
const N = 2000, cols = ['seen', 'typed', 'taps', 'outDays', 'helped', 'helped4', 'wrong', 'late', 'waste', 'over', 'muted'];
const row = (name, r) => console.log(name.slice(0, 55).padEnd(56) + cols.map((c) => String(r[c]).padStart(8)).join(''));
const PLUS = {
  'email forwarding': { email: 1 }, 'guess from amount x people (app + phone)': { fixed: 0, guess: 1, pushGuess: 1 }, 'list looks ahead to the next shop': { shopAsk: 'gap' },
  'first-run photo': { photo: 1 }, 'iPhone answer buttons': { buttons: 1 }, 'remind earlier for slow items': { lead: 1 }, 'tap teaches pace': { learnOut: 1 }, 'fresh: day before': { useEarly: 1 }, 'set-your-own reminders': { manual: 1 },
};
for (const seed of [1, 2]) {
  console.log('seed', seed, '\n' + ''.padEnd(56) + cols.map((c) => c.padStart(8)).join(''));
  row('LIVE', runArm(LIVE, P0, N, seed));
  for (const [n, a] of Object.entries(PLUS)) row('+ ' + n, runArm({ ...LIVE, ...a }, P0, N, seed));
  row('ALL', runArm(ALL, P0, N, seed));
}
console.log('\nHow much depends on Tote seeing the purchases at all (LIVE features, only the share of trips captured changes)');
for (const dil of [0.25, 0.5, 0.75, 0.95]) for (const hl of [8, 1000]) { const r = runArm(LIVE, { ...P0, dil, halfLife: hl }, N, 2); console.log('  snaps in week 1: ' + dil + (hl > 100 ? ', no drop-off ' : ', halving in 8 wks') + '  sees ' + String(r.seen).padStart(5) + '%   days without ' + String(r.outDays).padStart(5) + '   caught ' + String(r.helped).padStart(5) + '%   waste ' + r.waste + '%'); }
if (!process.argv.includes('--sweep')) process.exit(0);
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; }; }
const r = rng(77), D = 150, acc = {}; const live = [];
for (let i = 0; i < D; i++) { const P = { ...P0 }; for (const [k, [a, b]] of Object.entries(RANGES)) P[k] = a + r() * (b - a); const L = runArm(LIVE, P, 400, 900 + i); live.push(L);
  for (const [n, a] of Object.entries({ ...PLUS, ALL: ALL })) { const x = runArm(n === 'ALL' ? ALL : { ...LIVE, ...a }, P, 400, 900 + i); (acc[n] = acc[n] || []).push({ out: L.outDays - x.outDays, waste: L.waste - x.waste, wrong: x.wrong - L.wrong, taps: x.taps - L.taps }); } }
const q = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))], f = (x) => (Math.round(x * 10) / 10).toFixed(1).padStart(6);
console.log('\n' + D + ' sets of assumptions. LIVE days without median ' + f(q(live.map((x) => x.outDays), 0.5)) + ', waste ' + f(q(live.map((x) => x.waste), 0.5)) + '%, caught ' + f(q(live.map((x) => x.helped), 0.5)) + '%, sees ' + f(q(live.map((x) => x.seen), 0.5)) + '%');
console.log('added to LIVE:'.padEnd(46) + ' days saved [med 10 90] helps% | waste pts saved | extra not-needed/mo | extra taps/wk');
for (const [n, xs] of Object.entries(acc)) console.log(('  ' + n).padEnd(46) + f(q(xs.map((x) => x.out), 0.5)) + f(q(xs.map((x) => x.out), 0.1)) + f(q(xs.map((x) => x.out), 0.9)) + String(Math.round(xs.filter((x) => x.out > 0.05).length / D * 100)).padStart(5) + '% |' + f(q(xs.map((x) => x.waste), 0.5)) + ' |' + f(q(xs.map((x) => x.wrong), 0.5)) + ' |' + f(q(xs.map((x) => x.taps), 0.5)));
