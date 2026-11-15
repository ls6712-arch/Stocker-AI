// Delegation test: is each job sent to the cheapest model that can do it, and does a small model's mistake go up?
// No network. Three parts:
//  1. Routing on 629 phrasings by other writers (evals/corpus, heldout, heldout2): every dish, health question, correction and
//     other-language message must go to the large model; how many model jobs the small model takes. First sight (15 Nov 2026):
//     9 dishes and health questions would have gone small; the words for dishes and food safety were widened after that, so this
//     set is no longer held out for routing.
//  2. The checks on a small model's work, with a stand-in that answers well or badly on purpose.
//  3. Estimated cost of those 629 messages against a 120-item home, everything on the large model vs delegated
//     (tokens estimated at 4 characters each, stand-in answers of a typical length; live numbers come from the scorecard).
//
//   node --no-warnings evals/delegate.mjs          report and checks
//   node --no-warnings evals/delegate.mjs --json   numbers only (used by npm run track)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const src = fs.readFileSync(path.join(ROOT, 'src/index.js'), 'utf8');
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tote-delegate-')), 'agent.mjs');
fs.writeFileSync(tmp, src + '\nexport { tierFor, smallOk, converse, answerTurn, route, costOf, quickAnswer };\n');
const T = await import(pathToFileURL(tmp).href);
const asJson = process.argv.includes('--json');
const LARGE = '@cf/meta/llama-3.3-70b-instruct-fp8-fast', SMALL = '@cf/meta/llama-3.1-8b-instruct-fp8-fast';
const today = '2026-11-13';
let pass = 0, total = 0;
const lines = [];
const ok = (name, cond, got) => { total++; if (cond) pass++; lines.push((cond ? '  ok  ' : '  FAIL') + ' ' + name + (cond ? '' : '   got: ' + JSON.stringify(got).slice(0, 200))); };

// ---- 1. routing ----
const msgs = [];
for (const d of ['corpus', 'heldout', 'heldout2']) for (const f of fs.readdirSync(path.join(ROOT, 'evals', d)).filter((x) => x.endsWith('.json'))) for (const m of JSON.parse(fs.readFileSync(path.join(ROOT, 'evals', d, f), 'utf8'))) msgs.push(m);
const env0 = { TEXT_MODEL: LARGE, SMALL_MODEL: SMALL };
const MUST_BE_LARGE = ['cooked', 'health', 'correction'];
const wrongly = [];
let modelJobs = 0, smallJobs = 0;
for (const m of msgs) {
  const way = T.route(m.text);
  if (way === 'refuse' || way === 'wipe' || way === 'correct') continue;
  if (way === 'answer' && (await T.quickAnswer({}, m.text, [], [], today, null, true))) continue; // code answers it: no model at all
  const tier = T.tierFor(env0, way === 'update' ? 'update' : 'answer', m.text, [], null);
  modelJobs++; if (tier === 'small') smallJobs++;
  if (MUST_BE_LARGE.includes(m.intent) && tier === 'small') wrongly.push(m.intent + ': ' + m.text);
}
ok('routing: no dish, health question or correction goes to the small model', !wrongly.length, wrongly.slice(0, 5));
for (const t of ['se acabaron los huevos', 'atta khatam ho gaya aur do packet paneer le aaya', 'ubos na yung patis', 'kya mere paas rice hai'])
  ok('routing: another language goes to the large model: "' + t + '"', T.tierFor(env0, 'update', t, [], null) === 'large');
ok('routing: a follow-up goes to the large model', T.tierFor(env0, 'update', 'make that three', [{ role: 'user', content: 'x' }], null) === 'large');
ok('routing: a home with allergies goes to the large model', T.tierFor(env0, 'update', 'grabbed granola bars on the way home', [], { allergies: ['Peanuts'], diet: '', rules: [], avoid: [], members: [] }) === 'large');
ok('routing: an everyday update goes to the small model', T.tierFor(env0, 'update', 'the bread went stale so I tossed it', [], null) === 'small');
ok('routing: an everyday question goes to the small model', T.tierFor(env0, 'answer', 'any tips to keep cilantro fresh longer?', [], null) === 'small');
ok('routing: a cooking or safety question goes to the large model', T.tierFor(env0, 'answer', 'what can I make for dinner?', [], null) === 'large' && T.tierFor(env0, 'answer', 'is the yogurt still ok if it expired yesterday?', [], null) === 'large');
ok('routing: DELEGATE=off sends everything to the large model', T.tierFor({ ...env0, DELEGATE: 'off' }, 'update', 'the bread went stale so I tossed it', [], null) === 'large');

// ---- 2. checks on the small model's work ----
const rows = [{ name: 'Bread', qty: 1, unit: 'pcs', area: 'Kitchen' }, { name: 'Whole Milk', qty: 1, unit: 'L', area: 'Kitchen' }];
const said = 'the bread went stale so I tossed it';
ok('check: a right reading is used', T.smallOk({ intent: 'update', actions: [{ action: 'use', name: 'Bread', quantity: 0 }] }, said, rows));
ok('check: nothing found goes up', !T.smallOk({ intent: 'update', actions: [] }, said, rows));
ok('check: a thing the message never named goes up', !T.smallOk({ intent: 'update', actions: [{ action: 'use', name: 'Whole Milk', quantity: 0 }] }, said, rows));
ok('check: a guess from a dish goes up', !T.smallOk({ intent: 'update', actions: [{ action: 'use', name: 'Bread', quantity: 1, inferred: true }] }, said, rows));
ok('check: an unbelievable amount goes up', !T.smallOk({ intent: 'update', actions: [{ action: 'add', name: 'Bread', quantity: 400, unit: 'pcs' }] }, 'bought bread', rows));
ok('check: not JSON goes up', !T.smallOk(null, said, rows) && !T.smallOk({ actions: 'Bread' }, said, rows));

const stand = (smallSays, largeSays) => {
  const calls = [];
  return { calls, env: { DB: null, MEMO: new Map(), TEXT_MODEL: LARGE, SMALL_MODEL: SMALL, AI: { run: async (model, input) => { calls.push(model); const say = model === SMALL ? smallSays : largeSays; return { response: input.response_format || /JSON only/.test(input.messages[0].content) ? say.json : say.text }; } } } };
};
const home = () => rows.map((r) => ({ ...r, low: 0, frozen: 0, expiry: null, learned: 0, finish_days: 14 }));
{
  const s = stand({ json: JSON.stringify({ intent: 'update', actions: [{ action: 'use', name: 'Bread', quantity: 0, unit: 'pcs', area: 'Kitchen', category: 'Bakery' }] }) }, { json: { intent: 'update', actions: [] } });
  const t = await T.converse(s.env, said, [], home(), null, today, false, true);
  ok('flow: the small model\'s right reading is used, one cheap call', t.via === 'small' && s.calls.join() === SMALL && t.out.actions[0].name === 'Bread', [t.via, s.calls]);
}
{
  const s = stand({ json: '{"intent":"update","actions":[{"action":"use","name":"Whole Milk","quantity":0}]}' }, { json: { intent: 'update', actions: [{ action: 'use', name: 'Bread', quantity: 0, unit: 'pcs', area: 'Kitchen', category: 'Bakery' }] } });
  const t = await T.converse(s.env, said, [], home(), null, today, false, true);
  ok('flow: a wrong small reading goes up, and the large one is used', t.via === 'model' && s.calls.join() === SMALL + ',' + LARGE && t.out.actions[0].name === 'Bread', [t.via, s.calls]);
}
{
  const s = stand({ json: 'Sure! Here you go: bread was tossed' }, { json: { intent: 'update', actions: [{ action: 'use', name: 'Bread', quantity: 0, unit: 'pcs', area: 'Kitchen', category: 'Bakery' }] } });
  const t = await T.converse(s.env, said, [], home(), null, today, false, true);
  ok('flow: a small reply that is not JSON goes up', t.via === 'model' && s.calls.length === 2, [t.via, s.calls]);
}
{
  const s = stand({ text: 'Wrap it in a damp paper towel and keep it in the fridge.' }, { text: 'large answer' });
  const a = await T.answerTurn(s.env, 'any tips to keep cilantro fresh longer?', [], home(), [], today, null, [], true);
  ok('flow: a good small answer is used', a.via === 'small' && a.reply.startsWith('Wrap') && s.calls.join() === SMALL, [a, s.calls]);
}
{
  const s = stand({ text: 'You have 7 loaves of bread, enough for 3 weeks.' }, { text: 'You have one bread.' });
  const a = await T.answerTurn(s.env, 'is that enough bread for the week?', [], home(), [], today, null, [], true);
  ok('flow: a small answer with numbers the home does not contain goes up', a.via === 'model' && s.calls.length === 2, [a, s.calls]);
}
{
  const s = stand({ text: 'I added bread to your list! 🍞🍞' }, { text: 'Bread is not on your list yet.' });
  const a = await T.answerTurn(s.env, 'is bread on the list already?', [], home(), [], today, null, [], true);
  ok('flow: a small answer that claims a change or is off voice goes up', a.via === 'model', [a, s.calls]);
}

// ---- 3. estimated cost on the corpus ----
const names = new Set();
for (const m of msgs) for (const it of m.items || []) names.add(String(it).replace(/\b[a-z]/g, (c) => c.toUpperCase()));
const big = [...names].slice(0, 120).map((name, i) => ({ name, qty: 3, unit: 'pcs', area: 'Kitchen', category: 'Pantry', low: 0, frozen: 0, expiry: i % 5 ? null : '2026-11-' + (14 + (i % 10)), expiry_est: 1, learned: i % 3 ? 0 : 1, bought: '2026-11-05', finish_days: 7 }));
async function costRun(delegate) {
  let cost = 0, calls = 0;
  const env = { DB: null, MEMO: new Map(), TEXT_MODEL: LARGE, SMALL_MODEL: SMALL, DELEGATE: delegate, AI: { run: async (model, input) => {
    calls++;
    const json = !!input.response_format || /JSON only/.test(input.messages[0].content);
    // stand-in answers: a short, good reading of what was said (so it passes the checks when it is right to), or a short reply
    const res = { response: json ? JSON.stringify({ intent: 'update', actions: [{ action: 'add', name: (input.messages[1].content.match(/[a-z]{4,}/i) || ['x'])[0], quantity: 1 }] }) : 'You have some of that at home.' };
    cost += T.costOf(model, input, res);
    return res;
  } } };
  for (const m of msgs) {
    const t = await T.converse(env, m.text, [], big.map((r) => ({ ...r })), null, today, false, true);
    if (!t.reply && !t.out.actions.length && !t.proposal.length) await T.answerTurn(env, m.text, [], big, [], today, null, [], true);
  }
  return { per1000: Math.round((cost / msgs.length) * 1000 * 1000) / 1000, calls };
}
const before = await costRun('off'), after = await costRun('on');
const out = { routing: { smallShare: Math.round((smallJobs / modelJobs) * 1000) / 10, wronglySmall: wrongly.length }, cost: { allLarge: before.per1000, delegated: after.per1000 }, checks: { pass, total } };
if (asJson) { console.log(JSON.stringify(out)); process.exit(0); }
console.log('Routing on ' + msgs.length + ' phrasings by other writers: ' + out.routing.smallShare + '% of model jobs go to the small model; ' + wrongly.length + ' dishes, health questions or corrections sent small.');
console.log('Estimated cost of those messages (120-item home, stand-in answers): $' + before.per1000 + ' per 1,000 with everything on the large model, $' + after.per1000 + ' delegated.');
console.log(lines.join('\n'));
console.log('\n' + pass + ' of ' + total + ' delegation checks pass');
if (pass < total) process.exit(1);
