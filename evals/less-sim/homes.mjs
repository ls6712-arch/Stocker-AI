// Needing less: 2,000 simulated households living 12 weeks with Stocker under different feature sets (16 Nov 2026).
// LIVE below is what the app does today; every feature is scored against that, not against an app with nothing in it.
// The pace learning is the Worker's real paceFrom(); the reminder rules mirror digest()/dueSoon() and /api/remind in src/index.js.
// How people BEHAVE (do they snap the receipt, answer a reminder) is assumed, not measured: see P below, and --sweep.
import { loadAgent } from '../load.mjs';
const { paceFrom } = await loadAgent(['paceFrom']);
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const DAYS = 84;
const iso = (d) => new Date(Date.UTC(2026, 0, 1) + d * 86400000).toISOString().slice(0, 10);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
// one random number per (home, event): the same home lives the same life under every feature set
function U(seed, tag, a = 0, b = 0) {
  let h = (seed ^ Math.imul(tag + 1, 0x9e3779b1) ^ Math.imul(a + 7, 0x85ebca6b) ^ Math.imul(b + 13, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const T = { kind: 1, style: 2, dil: 3, has: 4, base: 5, start: 6, bulk: 7, wob: 8, away: 9, trip: 10, online: 11, cap: 12, tell: 13, notice: 14, fore: 15, resp: 16, emailOn: 17, itemized: 18, listUse: 19, accept: 20, pHas: 21, pBuy: 22, pSpoil: 23, pUse: 24, pDate: 25, photo: 26, vision: 27, manual: 28, mInt: 29, iphone: 30, table: 31 };
const ITEMS = [
  { name: 'milk', unit: 'L', size: 4, perPerson: 9 }, { name: 'eggs', unit: 'pcs', size: 12, perPerson: 14 },
  { name: 'bread', unit: 'pcs', size: 1, perPerson: 8 }, { name: 'coffee', unit: 'pack', size: 1, perPerson: 24 },
  { name: 'bananas', unit: 'pcs', size: 6, perPerson: 9 }, { name: 'diapers', unit: 'pcs', size: 40, perPerson: 6, kids: true },
  { name: 'dish soap', unit: 'pcs', size: 1, perPerson: 40 }, { name: 'toilet paper', unit: 'pack', size: 1, perPerson: 30 },
  { name: 'yogurt', unit: 'pcs', size: 6, perPerson: 7 }, { name: 'rice', unit: 'kg', size: 2, perPerson: 45 },
];
const FRESH = [{ name: 'berries', shelf: 5 }, { name: 'leafy greens', shelf: 6 }, { name: 'fresh chicken', shelf: 3 }, { name: 'herbs', shelf: 7 }, { name: 'avocados', shelf: 5 }];
const KINDS = [
  { kind: 'busy family', people: 5, kids: true, share: 0.3, wobble: 0.25, gap: 4 }, { kind: 'student alone', people: 1, kids: false, share: 0.2, wobble: 0.35, gap: 6 },
  { kind: 'works alone', people: 1, kids: false, share: 0.2, wobble: 0.2, gap: 6 }, { kind: 'couple, no kids', people: 2, kids: false, share: 0.3, wobble: 0.2, gap: 5 },
];
// ASSUMPTIONS about people. Central values; --sweep draws each from the range beside it.
export const P0 = {
  dil: 0.5,          // [0.25, 0.7]  chance an average person does a step that needs a snap or a sentence, in week 1
  halfLife: 8,       // [3, 20]      weeks until that chance halves (drop-off), floor 20% of the start
  tell: 0.35,        // [0.15, 0.5]  says "we're out" unprompted (0.35 is what evals/pace.mjs assumes)
  respond: 0.3,      // [0.15, 0.4]  answers a reminder that needs the app opened
  buttons: 1.8,      // [1.2, 2.2]   times more likely to answer when the reminder itself has the buttons
  iphone: 0.5,       // [0.05, 0.6]  homes on iPhone, where a web reminder has no buttons today
  noticeOut: 0.85,   // [0.7, 0.95]  on a shopping trip, remembers something that has already run out
  foresight: 0.45,   // [0.3, 0.6]   on a trip, notices something that will run out before the next trip
  store: 0.55,       // [0.3, 0.7]   homes that mostly shop in a store (the rest: delivery, or quick commerce)
  emailSetup: 0.5,   // [0.3, 0.8]   homes that would set up the one-time email forward
  itemized: 0.8,     // [0.6, 0.95]  online orders whose email lists the items
  listUse: 0.5,      // [0.3, 0.7]   trips where the person opens the list in Stocker
  accept: 0.7,       // [0.5, 0.85]  accepts a "probably low, add?" suggestion
  useBase: 0.7,      // [0.5, 0.8]   fresh food used in time with no help
  photo: 0.6,        // [0.4, 0.8]   homes that take the first-run photo
  vision: 0.7,       // [0.5, 0.9]   of what is at home, how much a photo catches
  manualSet: 0.15,   // [0.05, 0.3]  per item, sets a reminder by hand when asked to
  tableErr: 0.25,    // [0.15, 0.4]  how far off the starting-guess table is, per item
};
export const RANGES = { dil: [0.25, 0.7], halfLife: [3, 20], tell: [0.15, 0.5], respond: [0.15, 0.4], buttons: [1.2, 2.2], iphone: [0.05, 0.6], noticeOut: [0.7, 0.95], foresight: [0.3, 0.6], store: [0.3, 0.7], emailSetup: [0.3, 0.8], itemized: [0.6, 0.95], listUse: [0.3, 0.7], accept: [0.5, 0.85], useBase: [0.5, 0.8], photo: [0.4, 0.8], vision: [0.5, 0.9], manualSet: [0.05, 0.3], tableErr: [0.15, 0.4] };
export const FEATURES = {
  email: 'Order emails forwarded automatically',
  guess: 'Starting guess from pack size and people',
  learnOut: 'A tap on a reminder also teaches the pace',
  buttons: 'Answer buttons on iPhone reminders too',
  lead: 'Remind earlier for slow items',
  shopAsk: '"Probably low, add?" when the list opens',
  photo: 'First run from a photo (needs the guess)',
  useEarly: 'Fresh food: remind the day before, not the day',
  manual: 'Leave it open: people set their own reminders',
};

function makeHome(seed, P) {
  let x = U(seed, T.kind), k = KINDS[0];
  for (const c of KINDS) { if (x < c.share) { k = c; break; } x -= c.share; }
  const s = U(seed, T.style), style = s < P.store ? { name: 'store', online: 0.1, gap: k.gap } : s < P.store + (1 - P.store) * 0.55 ? { name: 'delivery', online: 0.7, gap: k.gap } : { name: 'quick commerce', online: 0.9, gap: 2 };
  const dil = clamp(P.dil + (U(seed, T.dil) - 0.5) * 0.5 - (k.kids ? 0.05 : 0), 0.05, 0.95);
  const trips = []; let d = Math.floor(U(seed, T.trip, 999) * style.gap);
  while (d < DAYS) { trips.push(d); d += Math.max(1, style.gap + Math.floor(U(seed, T.trip, trips.length) * (style.name === 'quick commerce' ? 2 : 4)) - (style.name === 'quick commerce' ? 0 : 1)); }
  const staples = ITEMS.map((it, i) => ({ it, i })).filter(({ it, i }) => (!it.kids || k.kids) && U(seed, T.has, i) < 0.6).map(({ it, i }) => ({
    it, i, base: Math.max(1.5, (it.perPerson / Math.pow(k.people, 0.8)) * (0.7 + U(seed, T.base, i) * 0.6)),
    packs: Math.max(1, Math.ceil(style.gap / Math.max(1.5, (it.perPerson / Math.pow(k.people, 0.8)) * (0.7 + U(seed, T.base, i) * 0.6)))), // people buy enough to reach the next trip
    fixed: Math.max(4, Math.round((it.perPerson / Math.pow(3, 0.8)) * (1 - P.tableErr + U(7, T.table, i) * 2 * P.tableErr))),
    guess: (bulk) => Math.max(2, Math.round((it.perPerson * (1 - P.tableErr + U(7, T.table, i) * 2 * P.tableErr) / k.people) * bulk)), // a naive table: divide by people
  }));
  const fresh = FRESH.map((f, i) => ({ f, i })).filter(({ i }) => U(seed, T.pHas, i) < 0.5);
  return { seed, k, style, dil, dilF: clamp(dil / 0.5, 0.4, 1.6), trips, staples, fresh, iphone: U(seed, T.iphone) < P.iphone, emailOn: U(seed, T.emailOn) < P.emailSetup };
}

export function live(home, A, P) {
  const { seed, k, style } = home, m = { trips: 0, seen: 0, typed: 0, taps: 0, outDays: 0, runOuts: 0, helped: 0, sent: 0, onTime: 0, early: 0, late: 0, notes: 0, freshBought: 0, wasted: 0, over: 0, muted: 0, first4: { runOuts: 0, helped: 0, outDays: 0 } };
  const fatigue = (d) => Math.max(0.2, Math.pow(0.5, d / 7 / P.halfLife));
  const lead = (days) => (A.lead ? (days >= 21 ? 3 : days >= 8 ? 2 : 1) : 1);
  const st = home.staples.map((s) => {
    const first = Math.max(1, Math.round(s.base * s.packs * U(seed, T.start, s.i)));
    return { s, n: 0, bulk: 1, outDay: first, onList: false, helped: false, hist: [], appLast: null, finish: null, learned: false, low: false, rem: { last: null, streak: 0, answered: true, muted: false }, manual: null };
  });
  const dur = (x) => { x.n++; x.bulk = U(seed, T.bulk, x.s.i, x.n) < 0.12 ? 2 : 1; let l = x.s.base * x.s.packs * x.bulk * (1 + (U(seed, T.wob, x.s.i, x.n) * 2 - 1) * k.wobble); if (U(seed, T.away, x.s.i, x.n) < 0.05) l += 5 + Math.floor(U(seed, T.away, x.s.i, x.n + 500) * 7); return Math.max(1, Math.round(l)); };
  if (A.email && home.emailOn) m.typed++; // setting up the forward, once
  if (A.photo && U(seed, T.photo) < Math.min(1, P.photo * home.dilF)) { m.typed++; for (const x of st) if ((A.guess || A.fixed) && U(seed, T.vision, x.s.i) < P.vision) { x.appLast = 0; x.finish = Math.max(2, Math.round((A.guess ? x.s.guess(x.s.packs) : x.s.fixed) * 0.5)); } } // a pack seen on the shelf is, on average, half used
  if (A.manual) for (const x of st) if (U(seed, T.manual, x.s.i) < Math.min(1, P.manualSet * home.dilF)) { m.typed++; x.manual = Math.max(2, Math.round(x.s.base * (0.7 + U(seed, T.mInt, x.s.i) * 0.6))); }
  const risk = []; let ti = 0;
  for (let d = 0; d < DAYS; d++) {
    const wk4 = d < 28;
    // (a) something runs out; some people say so
    for (const x of st) if (x.outDay === d) {
      if (x.appLast !== null && x.hist.length && !x.low && U(seed, T.tell, x.s.i, d) < P.tell * home.dilF) { m.typed++; const h = x.hist[x.hist.length - 1]; if (iso(d) > h.bought) h.ran_out = iso(d); x.low = true; x.onList = true; }
    }
    // (b) a shopping trip
    if (home.trips[ti] === d) {
      ti++; m.trips++;
      const gapNext = (home.trips[ti] ?? d + style.gap) - d;
      const online = U(seed, T.online, d) < style.online;
      let seen = false;
      if (online && A.email && home.emailOn && U(seed, T.itemized, d) < P.itemized) seen = true;
      else if (U(seed, T.cap, d) < Math.min(0.95, home.dil * fatigue(d))) { seen = true; m.typed++; }
      if (seen) m.seen++;
      const want = new Set();
      const usesList = U(seed, T.listUse, d) < Math.min(1, P.listUse * home.dilF); // shops from the list in Stocker this trip
      if (A.shopAsk && usesList) {
        const c = st.filter((x) => x.appLast !== null && x.finish && !x.low && d - x.appLast >= 2 && x.appLast + x.finish <= d + (A.shopAsk === 'day' ? 1 : style.gap + 1)).sort((a, b) => a.appLast + a.finish - (b.appLast + b.finish)).slice(0, 3);
        for (const x of c) if (U(seed, T.accept, x.s.i, d) < P.accept) { m.taps++; want.add(x); if (x.outDay - d >= 0 && x.outDay - d < gapNext) x.helped = true; }
      }
      for (const x of st) {
        const left = x.outDay - d;
        const buy = x.onList || want.has(x) || (left <= 0 ? U(seed, T.notice, x.s.i, d) < P.noticeOut : left < gapNext && U(seed, T.fore, x.s.i, d) < P.foresight);
        if (!buy) continue;
        if (left > gapNext + 3) m.over++;
        m.runOuts++; if (wk4) m.first4.runOuts++;
        if (left <= 0) { m.outDays += -left; if (wk4) m.first4.outDays += -left; }
        if (x.helped) { m.helped++; if (wk4) m.first4.helped++; }
        x.outDay = Math.max(d, x.outDay) + dur(x); x.onList = false; x.helped = false;
        const ticked = !seen && usesList && (x.low || want.has(x)) && x.appLast !== null; // ticking a tracked thing off the list restocks it (restock() in the app)
        if (ticked) m.taps++;
        if (seen || ticked) {
          const qty = x.s.it.size * x.s.packs * x.bulk;
          if (x.hist.length && x.hist[x.hist.length - 1].bought === iso(d)) x.hist[x.hist.length - 1].qty += qty; else x.hist.push({ bought: iso(d), qty, unit: x.s.it.unit, ran_out: null });
          const pace = paceFrom(x.hist.map((h) => ({ ...h })), qty, x.s.it.unit);
          x.learned = !!pace; x.finish = pace ? pace.days : A.guess ? x.s.guess(x.s.packs * x.bulk) : A.fixed ? x.s.fixed : null;
          x.appLast = d; x.low = false; x.rem.answered = true; x.rem.streak = 0;
        }
      }
      for (const { f, i } of home.fresh) if (U(seed, T.pBuy, i, d) < Math.min(1, gapNext / 7) * 0.8) {
        m.freshBought++;
        if (U(seed, T.pUse, i, d) < clamp(P.useBase - (k.people === 1 ? 0.1 : 0), 0.05, 0.95)) continue; // used in time anyway
        risk.push({ spoil: d + Math.max(1, Math.round(f.shelf * (0.8 + U(seed, T.pSpoil, i, d) * 0.4))), known: seen, date: d + f.shelf + Math.round((U(seed, T.pDate, i, d) - 0.5) * 2), saved: false });
      }
    }
    // (c) the day's one reminder: same rules as digest() in the Worker
    const low = [];
    for (const x of st.filter((x) => x.appLast !== null && x.finish && (x.learned || A.pushGuess) && !x.low && !x.rem.muted && x.appLast + x.finish - d <= lead(x.finish) && d - x.appLast >= 2).sort((a, b) => a.appLast + a.finish - (b.appLast + b.finish))) {
      if (x.rem.last !== null && d - x.rem.last < 2) continue;
      const streak = !x.rem.answered ? x.rem.streak + 1 : 0;
      x.rem.streak = streak;
      if (streak >= 3) { x.rem.muted = true; m.muted++; continue; }
      if (low.length < 6) low.push(x);
    }
    const byHand = A.manual ? st.filter((x) => x.manual && d > 0 && d % x.manual === 0 && !low.includes(x) && !x.low) : [];
    const use = risk.filter((r) => r.known && !r.saved && r.date - (A.useEarly ? 1 : 0) === d);
    if (low.length || byHand.length || use.length) {
      m.notes++;
      const hasButtons = !home.iphone || A.buttons;
      const answered = U(seed, T.resp, d) < Math.min(0.95, P.respond * home.dilF * (hasButtons ? P.buttons : 1));
      for (const x of low.concat(byHand)) {
        const left = x.outDay - d, hand = byHand.includes(x);
        // worth hearing if it would run out before the trip after next: skip it now and they go without
        const after = home.trips[ti + 1] ?? (home.trips[ti] ?? d + style.gap) + style.gap, needed = x.outDay <= after;
        m.sent++; if (left < 0) m.late++; else if (!needed) m.early++; else m.onTime++;
        if (!hand) { x.rem.last = d; x.rem.answered = answered; }
        if (!answered) continue;
        m.taps++; x.rem.streak = 0;
        if (needed) {
          x.onList = true; x.low = true; if (left >= 0) x.helped = true;
          if (A.learnOut && left <= 0 && x.hist.length) { const h = x.hist[x.hist.length - 1]; if (!h.ran_out && iso(d) > h.bought) h.ran_out = iso(d); } // "we're out" from the tap
        } else if (!hand) x.finish = d - x.appLast + Math.max(3, Math.ceil(x.finish * 0.5)); // "still have it": the Worker's own rule
      }
      if (answered) for (const r of use) if (d <= r.spoil) { r.saved = true; m.taps++; }
    }
    for (const r of risk) if (r.spoil === d && !r.saved) m.wasted++;
  }
  return m;
}

const KEYS = ['trips', 'seen', 'typed', 'taps', 'outDays', 'runOuts', 'helped', 'sent', 'onTime', 'early', 'late', 'notes', 'freshBought', 'wasted', 'over', 'muted'];
export function runArm(A, P, n, seed0, filter) {
  const t = Object.fromEntries(KEYS.map((k) => [k, 0])); t.homes = 0; t.f4r = 0; t.f4h = 0; t.f4o = 0;
  for (let h = 0; h < n; h++) {
    const home = makeHome((seed0 * 1000003 + h * 7919) >>> 0, P);
    if (filter && !filter(home)) continue;
    const m = live(home, A, P); t.homes++;
    for (const k of KEYS) t[k] += m[k]; t.f4r += m.first4.runOuts; t.f4h += m.first4.helped; t.f4o += m.first4.outDays;
  }
  const r1 = (x) => Math.round(x * 10) / 10, wk = DAYS / 7, mo = DAYS / 28;
  return {
    homes: t.homes,
    seen: r1((t.seen / t.trips) * 100),                 // % of shopping trips Tote knows about
    typed: r1(t.typed / t.homes / wk),                  // snaps or sentences per home per week
    taps: r1(t.taps / t.homes / wk),                    // one-tap answers per home per week
    outDays: r1(t.outDays / t.homes / mo),              // days without a staple, per home per month
    helped: r1((t.helped / t.runOuts) * 100),           // % of run-outs where a reminder was answered in time
    helped4: r1((t.f4h / Math.max(1, t.f4r)) * 100),    // the same, first four weeks
    wrong: r1(t.early / t.homes / mo),
    wrongPct: r1((t.early / Math.max(1, t.sent)) * 100), // % of reminders about something not yet low                  // reminders about something not yet low, per home per month
    late: r1((t.late / Math.max(1, t.sent)) * 100),     // % of reminders that came after it ran out
    waste: r1((t.wasted / Math.max(1, t.freshBought)) * 100), // % of fresh food bought that is thrown away
    over: r1(t.over / t.homes / mo),                    // bought while there was still plenty, per home per month
    muted: r1(t.muted / t.homes),                       // things Tote stopped asking about, per home
    notes: r1(t.notes / t.homes / wk),                  // reminders per home per week
  };
}
export const LIVE = { fixed: 1, shopAsk: 'day' }; // what the app does today: a typical number of days, suggestions on the list for things due by tomorrow
export const ALL = { email: 1, guess: 1, pushGuess: 1, learnOut: 1, buttons: 1, lead: 1, shopAsk: 'gap', photo: 1, useEarly: 1 };
