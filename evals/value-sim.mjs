// Value simulation: which feature saves a household the most food, and what is missing?
// 5,000 made-up households in six segments live 12 weeks of shopping, cooking and throwing away. Every household is run
// through each feature, on its own and together, on the SAME random events (paired), so differences are the feature's.
// THIS IS A MODEL, NOT EVIDENCE: the waste total is scaled to the EPA's $728 per person per year, the ranking of reasons
// follows WRAP's household study, and every behaviour number below is an assumption. The second half re-runs the model
// 200 times with every assumption shaken (roughly halved to doubled) and reports how often each feature still ranks first.
//
//   node evals/value-sim.mjs            the report
//   node evals/value-sim.mjs --json     numbers only
const asJson = process.argv.includes('--json');
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// who they are: share of homes, people, perishable items bought a week, nights eating out, how often a pack is too big for
// the home, how busy (forgetting), how often they tell the app what they used, shops at stores most apps cannot read
const SEG = [
  { k: 'Busy family with kids', w: 0.30, size: 5, items: 26, out: 1, bulk: 0.35, busy: 1.3, logs: 0.20, world: 0.15, kids: 1 },
  { k: 'Single parent', w: 0.08, size: 3, items: 16, out: 1, bulk: 0.25, busy: 1.5, logs: 0.15, world: 0.15, kids: 1 },
  { k: 'Student living alone', w: 0.17, size: 1, items: 7, out: 3, bulk: 0.45, busy: 1.0, logs: 0.25, world: 0.20, kids: 0 },
  { k: 'Working and living alone', w: 0.17, size: 1, items: 8, out: 4, bulk: 0.40, busy: 1.2, logs: 0.20, world: 0.15, kids: 0 },
  { k: 'Couple, no kids', w: 0.18, size: 2, items: 13, out: 3, bulk: 0.25, busy: 1.0, logs: 0.30, world: 0.15, kids: 0 },
  { k: 'Big family, world groceries', w: 0.10, size: 5, items: 28, out: 0, bulk: 0.30, busy: 1.1, logs: 0.20, world: 0.80, kids: 1 },
];
// the assumptions (P). Probabilities are per perishable item bought, unless said otherwise.
const BASE = {
  forget: 0.055,     // pushed to the back and found too late
  plans: 0.030,      // bought for a meal that did not happen; grows with nights out
  dup: 0.030,        // bought again because nobody knew it was already at home
  packBig: 0.16,     // times seg.bulk: the pack is more than the home gets through
  surplus: 0.45,     // share of a too-big or doubled item that ends up thrown away
  pref: 0.035,       // nobody liked it; no app fixes this
  leftover: 0.45,    // a cooked dinner leaves leftovers
  leftLost: 0.40,    // those leftovers are forgotten and thrown away
  plate: 0.9,        // plate and pan waste per dinner per person, in item-values x 0.1
  capture: 0.85,     // share of shopping the app knows about with snap-or-say capture, week 1
  captureForm: 0.85, // the same in week 1 when every item is a form...
  churn: 0.035,      // ...but this share of homes stop logging each week with no forms
  churnForm: 0.16,   // and this share with forms
  worldMiss: 0.45,   // share of world-grocery lines an ordinary reader cannot place
  seen: 0.60,        // a reminder or card is seen in time
  act: 0.40,         // and acted on when it is right
  dish: 0.20,        // extra acting when a dish is offered with it
  freeze: 0.15,      // extra acting when "freeze it" fits (meat, bread: 25% of items)
  shopCheck: 0.65,   // a doubled purchase avoided when the list knows the home
  rightSize: 0.50,   // a too-big pack avoided once the app has seen it wasted (after 3 weeks)
  planAdopt: 0.18,   // homes that would keep a weekly meal plan (x1.6 with kids)
  planCut: 0.55,     // of plans-changed and too-big waste a kept plan removes
  portion: 0.25,     // of plate and pan waste "cook for who is home" removes, for homes that cook from the app
  cookFromApp: 0.35, // dinners where the app knows what was cooked
};
const FEATURES = {
  remind: 'Use-first reminders', dish: 'Dinner idea with what goes off first', freeze: 'Freeze-it prompt', shop: 'List that knows what is at home',
  world: 'Reads world-grocery receipts', usedTap: 'One-tap "used it" that keeps the home true',
  rightSize: 'MISSING: buy-less nudge from what got thrown away', leftovers: 'MISSING: leftovers tracked after "I cooked this"',
  plan: 'MISSING: weekly plan tied to the shop', portion: 'MISSING: cook for who is home (portions)',
};
const CAPTURED = ['remind', 'dish', 'freeze', 'shop', 'world', 'usedTap', 'rightSize', 'leftovers', 'plan', 'portion'];

function homes(n, seed) {
  const r = rng(seed), out = [];
  for (let i = 0; i < n; i++) { let u = r(), s = SEG[0]; for (const x of SEG) { if (u < x.w) { s = x; break; } u -= x.w; }
    out.push({ s, seed: Math.floor(r() * 2 ** 31), world: r() < s.world, planner: r(), quit: r(), quitForm: r() }); }
  return out;
}
// one home, 12 weeks, under one set of switches. Returns item-values wasted by reason (1 = one average perishable item).
function live(h, P, on, forms) {
  const r = rng(h.seed), s = h.s, w = { time: 0, over: 0, cooked: 0, pref: 0 };
  const plans = P.plans * (1 + s.out / 2), keepsPlan = on.plan && h.planner < P.planAdopt * (s.kids ? 1.6 : 1);
  for (let wk = 0; wk < 12; wk++) {
    const logging = forms ? h.quitForm > 1 - Math.exp(-P.churnForm * wk) : h.quit > 1 - Math.exp(-P.churn * wk);
    let c = logging ? (forms ? P.captureForm : P.capture) : 0;
    if (h.world && !on.world) c *= 1 - P.worldMiss;
    // how often a "use it soon" card is about something still there: without a cheap way to say "used it", most are not
    const told = Math.min(0.9, s.logs + (on.usedTap ? 0.45 : 0)), atRisk = Math.min(0.5, P.forget * s.busy + plans);
    const right = atRisk / (atRisk + (1 - atRisk) * (1 - told)), trust = Math.min(1, Math.sqrt(right / 0.5));
    for (let i = 0; i < s.items; i++) {
      const u1 = r(), u2 = r(), u3 = r(), u4 = r(), u5 = r(), frz = r() < 0.25, kitchen = r() < 0.85;
      if (u4 < P.pref * (s.kids ? 1.4 : 1)) { w.pref += 1; continue; }
      const rescue = on.remind ? c * P.seen * trust * Math.min(0.95, P.act + (on.dish && kitchen ? P.dish : 0) + (on.freeze && frz ? P.freeze : 0)) : 0;
      if (u1 < P.forget * s.busy) { if (!(u5 < rescue)) w.time += 1; continue; }
      if (u2 < plans) { if (keepsPlan && r() < P.planCut) continue; if (!(u5 < rescue)) w.time += 1; continue; }
      if (u3 < P.dup) { if (on.shop && r() < c * P.shopCheck) continue; w.over += P.surplus; continue; }
      if (u3 < P.dup + P.packBig * s.bulk) { if (keepsPlan && r() < P.planCut) continue; if (on.rightSize && wk >= 3 && r() < c * P.rightSize) continue; if (on.freeze && frz && on.remind && r() < c * P.seen * P.act) continue; w.over += P.surplus; }
    }
    for (let d = 0; d < 7 - s.out; d++) {
      const known = r() < P.cookFromApp * (logging ? 1 : 0);
      w.cooked += P.plate * 0.1 * s.size * (on.portion && known ? 1 - P.portion : 1);
      if (r() < P.leftover && r() < P.leftLost) { if (on.leftovers && known && r() < P.seen * (P.act + 0.25)) continue; w.cooked += 0.8; }
    }
  }
  return w;
}
function run(H, P, on, forms) { const t = { time: 0, over: 0, cooked: 0, pref: 0 }, by = {}; let people = 0;
  for (const h of H) { const w = live(h, P, on, forms), all = w.time + w.over + w.cooked + w.pref; for (const k in t) t[k] += w[k]; people += h.s.size; const b = by[h.s.k] || (by[h.s.k] = { all: 0, n: 0, people: 0 }); b.all += all; b.n++; b.people += h.s.size; }
  return { ...t, all: t.time + t.over + t.cooked + t.pref, by, people, n: H.length }; }
const none = {}, only = (k) => ({ remind: k === 'dish' || k === 'freeze' || k === 'usedTap' || k === 'remind', [k]: true });
const today = { remind: true, dish: true, freeze: false, shop: true, world: true, usedTap: true };
const everything = Object.fromEntries(CAPTURED.map((k) => [k, true]));

const H = homes(5000, 20261116), base = run(H, BASE, none);
const usd = 728 / ((base.all / base.people) * (52 / 12)); // dollars per item-value, so the baseline equals the EPA figure
const perHome = (x) => Math.round((x.all / x.n) * (52 / 12) * usd);
const saved = (x, b = base) => Math.round(((b.all - x.all) / x.n) * (52 / 12) * usd);
const out = { homes: H.length, baseline: { perPerson: 728, perHome: perHome(base), reasons: { 'cooked or served too much': Math.round(base.cooked / base.all * 100), 'not used in time': Math.round(base.time / base.all * 100), 'bought too much': Math.round(base.over / base.all * 100), 'nobody liked it': Math.round(base.pref / base.all * 100) } } };
// each feature added to plain capture with reminders, measured against that
const ref = run(H, BASE, { remind: true });
out.remindersAlone = saved(ref);
out.features = {};
for (const k of CAPTURED.filter((x) => x !== 'remind')) out.features[k] = { name: FEATURES[k], saves: saved(run(H, BASE, { remind: true, [k]: true }), ref) };
const now = run(H, BASE, today), all = run(H, BASE, everything), nowForms = run(H, BASE, today, true);
out.today = { saves: saved(now), ofWaste: Math.round((base.all - now.all) / base.all * 100), withForms: saved(nowForms) };
out.withMissing = { saves: saved(all), ofWaste: Math.round((base.all - all.all) / base.all * 100) };
out.bySegment = Object.fromEntries(SEG.map((s) => [s.k, { wastes: Math.round(base.by[s.k].all / base.by[s.k].n * (52 / 12) * usd), today: Math.round((base.by[s.k].all - now.by[s.k].all) / base.by[s.k].n * (52 / 12) * usd), withMissing: Math.round((base.by[s.k].all - all.by[s.k].all) / base.by[s.k].n * (52 / 12) * usd) }]));
for (const s of SEG) { const hs = H.filter((h) => h.s === s), b = run(hs, BASE, { remind: true }); let best = ['', -1]; for (const k of CAPTURED.filter((x) => x !== 'remind')) { const v = saved(run(hs, BASE, { remind: true, [k]: true }), b); if (v > best[1]) best = [FEATURES[k], v]; } out.bySegment[s.k].best = best[0] + ' ($' + best[1] + ')'; }

// how sure is the ranking? shake every assumption and count who comes first
const r = rng(7), wins = {}, top3 = {}, K = CAPTURED.filter((x) => x !== 'remind'), Hs = homes(800, 99), DRAWS = 200;
for (let d = 0; d < DRAWS; d++) {
  const P = {}; for (const k in BASE) { const f = Math.exp((r() + r() + r() - 1.5) * 0.8); P[k] = Math.min(k === 'plate' ? 5 : 0.97, BASE[k] * f); }
  const b = run(Hs, P, { remind: true }), sc = K.map((k) => [k, b.all - run(Hs, P, { remind: true, [k]: true }).all]).sort((a, c) => c[1] - a[1]);
  wins[sc[0][0]] = (wins[sc[0][0]] || 0) + 1; sc.slice(0, 3).forEach((x) => { top3[x[0]] = (top3[x[0]] || 0) + 1; });
}
out.ranking = K.map((k) => ({ name: FEATURES[k], first: Math.round((wins[k] || 0) / DRAWS * 100), top3: Math.round((top3[k] || 0) / DRAWS * 100) })).sort((a, b) => b.first - a.first || b.top3 - a.top3);
if (asJson) { console.log(JSON.stringify(out)); process.exit(0); }
console.log(JSON.stringify(out, null, 1));
