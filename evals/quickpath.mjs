// Quick-path test: the code that reads plain messages without a model.
// Two parts, no network:
//  1. Phrasings written by other people (evals/corpus, heldout, heldout2: 629 messages, labelled by intent). First seen by the
//     quick path on 15 Nov 2026 (first sight: 100% left alone, 19.1% read, 95% of those right), then used once to tune it, so
//     it is no longer a held-out score: write a fresh set for the next honest one. Code must leave every question, chat, health, private, attack, wipe, correction and dish alone,
//     and when it does act on an update, the kind of change and the things changed must match the label.
//  2. Both-direction checks written alongside the code: what it must read, and what it must leave to the model.
//
//   node --no-warnings evals/quickpath.mjs          report and checks
//   node --no-warnings evals/quickpath.mjs --json   numbers only (used by npm run track)
//   node --no-warnings evals/quickpath.mjs --show   also list every held-out message code acted on
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const src = fs.readFileSync(path.join(ROOT, 'src/index.js'), 'utf8');
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tote-quick-')), 'agent.mjs');
fs.writeFileSync(tmp, src + '\nexport { route, quickParse, quickAnswer, normKey, converse, stapleFor };\n');
const T = await import(pathToFileURL(tmp).href);
const asJson = process.argv.includes('--json'), show = process.argv.includes('--show');
const env = { DB: null, MEMO: new Map(), AI: { run: async () => { throw new Error('no model in this test'); } } };
const today = '2026-11-13';
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);

// ---- 1. held-out phrasings ----
const msgs = [];
for (const d of ['corpus', 'heldout', 'heldout2']) for (const f of fs.readdirSync(path.join(ROOT, 'evals', d)).filter((x) => x.endsWith('.json'))) for (const m of JSON.parse(fs.readFileSync(path.join(ROOT, 'evals', d, f), 'utf8'))) msgs.push({ ...m, src: d });
// a home that tracks everything these people talk about, so "used the X" can be matched
const names = new Set(['Whole Milk', 'Eggs', 'Bread', 'Rice', 'Coffee', 'Dish Soap', 'Diapers', 'Baby Spinach']);
for (const m of msgs) for (const it of m.items || []) names.add(String(it).replace(/\b[a-z]/g, (c) => c.toUpperCase()));
const rows = [...names].map((name) => ({ name, qty: 5, unit: 'pcs', area: 'Kitchen', category: '', low: 0, frozen: 0, expiry: null, learned: 0, finish_days: 14 }));
const HANDS_OFF = ['question', 'chitchat', 'off_topic', 'health', 'private', 'attack', 'destructive', 'correction', 'cooked'];
const UPDATES = ['stated_update', 'list_add', 'list_remove'];
const res = { offTotal: 0, offActed: [], upd: 0, handled: 0, right: 0, wrong: [], mixedActed: 0, mixed: 0 };
for (const m of msgs) {
  if (m.ambiguous) continue;
  const turn = await T.converse(env, m.text, [], rows.map((r) => ({ ...r })), null, today, false, false);
  const acts = turn.reply ? [] : turn.out.actions;
  if (HANDS_OFF.includes(m.intent)) { res.offTotal++; if (acts.length) res.offActed.push({ m, acts }); continue; }
  if (m.intent === 'mixed') { res.mixed++; if (acts.length) res.mixedActed++; continue; }
  if (!UPDATES.includes(m.intent)) continue;
  res.upd++;
  if (!acts.length) continue;
  res.handled++;
  const kinds = new Set(acts.map((a) => a.action));
  const kindOk = m.intent === 'list_add' ? [...kinds].every((k) => k === 'list') : m.intent === 'list_remove' ? [...kinds].every((k) => k === 'unlist') : ![...kinds].includes('unlist');
  // every thing changed was named in the message, and every thing the label names was changed
  // (2-letter words count: "tp" is a thing. A nickname written out in full, "tp" -> Toilet Paper, counts as the same thing.)
  const words = (t) => new Set(T.normKey(t).split(' ').filter((w) => w.length > 1).concat(T.normKey((T.stapleFor(t) || {}).name || '').split(' ').filter((w) => w.length > 1)));
  const said = words(m.text);
  const invented = acts.filter((a) => ![...words(a.name)].some((w) => said.has(w)));
  const missed = (m.items || []).filter((it) => !acts.some((a) => [...words(a.name)].some((w) => words(it).has(w))));
  if (kindOk && !invented.length && !missed.length) res.right++;
  else res.wrong.push({ m, acts, why: (kindOk ? '' : 'wrong kind; ') + (invented.length ? 'not in the message: ' + invented.map((a) => a.name).join(', ') + '; ' : '') + (missed.length ? 'missed: ' + missed.join(', ') : '') });
}
const held = {
  handsOffSafe: pct(res.offTotal - res.offActed.length, res.offTotal), handsOff: res.offTotal,
  updates: res.upd, coverage: pct(res.handled, res.upd), precision: pct(res.right, res.handled),
};

// ---- 2. both directions ----
const HOME = [['Whole Milk', 1, 'L'], ['Oat Milk', 1, 'L'], ['Eggs', 12, 'pcs'], ['Bread', 1, 'pcs'], ['Rice', 2, 'kg'], ['Coffee', 1, 'pack'], ['Dish Soap', 1, 'pcs'], ['Diapers', 20, 'pcs'], ['Chicken Breast', 2, 'lb'], ['Mac and Cheese', 2, 'pcs']]
  .map(([name, qty, unit]) => ({ name, qty, unit, area: 'Kitchen', category: '', low: 0, frozen: 0, expiry: null, learned: 0, finish_days: 14 }));
const read = async (text, history = []) => { const o = await T.quickParse(env, text, HOME.map((r) => ({ ...r })), null, history, true); return o ? o.actions.map((a) => a.action + ' ' + (a.action === 'list' || a.action === 'unlist' || a.action === 'low' ? '' : a.quantity + ' ') + a.name).join('; ') : null; };
const MUST_READ = [
  ['add bread to the list', 'list Bread'],
  ['put eggs and bread on the list', 'list Eggs; list Bread'],
  ['we need trash bags', 'list Trash Bags'],
  ['need to buy dish soap', 'list Dish Soap'],
  ['bought a dozen eggs', 'add 12 Eggs'],
  ['picked up 2 kg rice', 'add 2 Rice'],
  ['got 500g rice', 'add 0.5 Rice'],
  ['bought 3 bananas and a loaf of bread', 'add 3 Bananas; add 1 Bread'],
  ['used 4 eggs', 'use 4 Eggs'],
  ['used 1 lb chicken', 'use 1 Chicken Breast'],
  ['finished the coffee', 'use 0 Coffee'],
  ['threw out the bread', 'use 0 Bread'],
  ['we are out of whole milk', 'use 0 Whole Milk'],
  ['out of olive oil', 'list Olive Oil'],
  ['running low on rice', 'low Rice'],
  ['the dish soap is running low', 'low Dish Soap'],
  ['only 3 eggs left', 'set 3 Eggs'],
  ['we have 4 boxes of mac and cheese', null], // "boxes" of a thing counted in pieces: the model decides
  ['take bread off the list', 'unlist Bread'],
  ['cross off eggs', 'unlist Eggs'],
  ['can you add eggs?', 'list Eggs'],
  ['picked up toothpaste and a new razor on the way home', 'add 1 Toothpaste; add 1 Razors'],
  ['add a couple of avocados', 'list 2 Avocados'],
  ['we need tp', 'list Toilet Paper'],
  ['the diapers are all gone', 'use 0 Diapers'],
  ['used the last of the diapers and we need wipes', 'use 0 Diapers; list Wipes'],
];
const LEAVE = [
  'bought milk', // two milks are tracked: which one is the model's call
  'used some rice', 'used the eggs', 'had eggs for breakfast', 'made pancakes', 'cooking rice tonight', 'I might grab milk later',
  'if we run out of coffee get the good one', "we didn't finish the rice", 'not out of eggs yet', 'my mom bought bread for her place',
  'bought milk for my neighbour', 'sorry I meant 2 eggs', 'actually it was 3', 'the milk went bad', 'add 99 gold bars', 'put the milk in the fridge',
  'get rid of everything', 'we need it', 'add that to the list', 'bought stuff', 'used half the rice', 'we have milk', 'I have to go', 'got it',
  'need help', 'need a break', 'need sleep', 'tote add bananas spinach and frozen berries', 'used 2 of the frozen pizzas for the sleepover', 'remind me to buy eggs tomorrow', 'freeze the chicken', 'ate the last 2 eggs or was it 3', 'agrega leche a la lista',
];
const lines = [];
let pass = 0, total = 0;
for (const [text, want] of MUST_READ) { total++; const got = await read(text); const ok = got === want; if (ok) pass++; lines.push((ok ? '  ok  ' : '  FAIL') + ' reads "' + text + '" -> ' + got + (ok ? '' : '   (want ' + want + ')')); }
for (const text of LEAVE) { total++; const got = await read(text); const ok = got === null; if (ok) pass++; lines.push((ok ? '  ok  ' : '  FAIL') + ' leaves "' + text + '" to the model' + (ok ? '' : '   (code read: ' + got + ')')); }
// answers from code: right facts, and nothing it cannot be sure of
const A = async (text, rowsIn = HOME, ai = true) => T.quickAnswer(env, text, rowsIn.map((r) => ({ ...r })), [], today, null, ai);
const ans = [
  ['do we have eggs?', (r) => /12 eggs/.test(r)],
  ['how much rice is left?', (r) => /2 kg of rice/.test(r)],
  ['do we have any milk?', (r) => /whole milk/.test(r) && /oat milk/.test(r)],
  ['do we have butter?', (r) => /not tracked/.test(r) && !/^yes/i.test(r)],
  ['is this safe for my peanut allergy?', (r) => /check the label/.test(r) && !/\b(is|are) safe\b/.test(r)],
  ['what can I make for dinner?', (r) => r === null],
  ['why is the sky blue?', (r) => r === null],
  ['do we have time to cook?', (r) => r === null],
];
for (const [text, okf] of ans) { total++; const r = await A(text); const ok = okf(r); if (ok) pass++; lines.push((ok ? '  ok  ' : '  FAIL') + ' answers "' + text + '" -> ' + r); }

const out = { held, both: { pass, total } };
if (asJson) { console.log(JSON.stringify(out)); process.exit(0); }
console.log('Phrasings by other writers (' + msgs.length + ' messages; tuned on once, 15 Nov: first sight was 100% left alone, 19.1% read, 95% right)');
console.log('  left alone: ' + held.handsOffSafe + '% of ' + held.handsOff + ' questions, chats, dishes, health, attacks and corrections');
console.log('  read by code: ' + held.coverage + '% of ' + held.updates + ' plain updates and list changes, and ' + held.precision + '% of those read right');
for (const x of res.offActed) console.log('  FAIL acted on ' + x.m.intent + ': "' + x.m.text + '" -> ' + x.acts.map((a) => a.action + ' ' + a.name).join('; '));
for (const x of res.wrong) console.log('  wrong: "' + x.m.text + '" -> ' + x.acts.map((a) => a.action + ' ' + a.quantity + ' ' + a.name).join('; ') + '  [' + x.why + ']');
if (show) for (const m of msgs) { const turn = await T.converse(env, m.text, [], rows.map((r) => ({ ...r })), null, today, false, false); if (!turn.reply && turn.out.actions.length) console.log('  read: "' + m.text + '" -> ' + turn.out.actions.map((a) => a.action + ' ' + a.quantity + ' ' + a.name).join('; ')); }
console.log('\nBoth directions');
console.log(lines.join('\n'));
console.log('\n' + pass + ' of ' + total + ' quick-path checks pass');
const fail = pass < total || held.handsOffSafe < 100 || held.precision < 95;
if (fail) { console.log('Quick path: below the bar (every check, 100% left alone, 95% read right)'); process.exit(1); }
