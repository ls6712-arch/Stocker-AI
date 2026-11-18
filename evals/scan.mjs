// Shelf and fridge photos: what Tote does with what the camera saw. Each check has its opposite.
// Runs the Worker's real code and SQL against an in-memory database, with a stand-in model that "sees" what each check
// chooses (the first one is what the real model said about Sushmitha's fridge door on 17 Nov 2026), so every result is exact.
// Then it scores Tote's real answers on real photos (evals/scan-photos.json) against what is really in them.
//
//   node --no-warnings evals/scan.mjs
import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { loadAgent, ROOT } from './load.mjs';

function d1(db) {
  const fix = (v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v);
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => { db.prepare(sql).run(...args.map(fix)); return { success: true }; },
    first: async () => db.prepare(sql).get(...args.map(fix)) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args.map(fix)) }),
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => Promise.all(list.map((s) => s.all())) };
}
const results = [];
const check = (name, pass, detail) => results.push([!!pass, name, pass ? '' : JSON.stringify(detail ?? '').slice(0, 500)]);
const DAY = '2026-11-17';
const A = await loadAgent(['cleanProfile', 'checkSeen', 'keepSeen']);
const act = (action, name, quantity, known, x = {}) => ({ action, name, note: '', inferred: false, quantity, quantityKnown: known, unit: 'pcs', area: 'Kitchen', category: 'Dairy', expiryDate: '', shelfLifeDays: 7, daysToFinish: 7, price: 0, warn: '', ...x });

// a home whose camera sees `sees` and whose reading model turns it into `actions`
async function home(items = [], opts = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  let sees = '', actions = [];
  const looked = [];
  const env = { APP_PIN: 'test1234', DB: d1(db), TEXT_MODEL: 'big', SMALL_MODEL: 'small', VISION_MODEL: 'vision', DELEGATE: 'off', ASSETS: { fetch: async () => new Response('') }, ...(opts.env || {}),
    AI: { run: async (model, input) => {
      const pic = input.image || (input.messages || []).some((m) => Array.isArray(m.content) && m.content.some((c) => c.type === 'image_url'));
      if (pic) { looked.push(model); if (opts.fail && opts.fail === model) throw new Error('model unavailable'); if (model !== 'vision') return opts.openai ? { choices: [{ message: { content: model + ' saw milk' } }] } : { response: model + ' saw milk' }; }
      if (input.image) return { response: sees };
      if (/You keep an inventory/.test(JSON.stringify(input.messages || ''))) return { response: JSON.stringify({ intent: 'update', store: '', purchaseDate: '', currency: '', actions }) };
      return { response: '' };
    } } };
  let cookie = '';
  const call = async (method, p, body) => {
    const res = await A.default.fetch(new Request('https://stocker.test' + p, { method, headers: { cookie, 'content-type': 'application/json', origin: 'https://stocker.test', 'x-today': DAY }, body: body ? JSON.stringify(body) : undefined }), env);
    return { status: res.status, data: await res.json().catch(() => ({})), res };
  };
  const login = await call('POST', '/api/login', { pin: 'test1234', name: 'Sam' });
  cookie = login.res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  for (const [name, qty, unit] of items) await call('POST', '/api/apply', { source: 'hand', bought: DAY, actions: [{ action: 'add', name, quantity: qty, unit, area: 'Kitchen', category: 'Dairy', warn: '', expiry: '', shelfLifeDays: 7, finishDays: 7 }] });
  // what the app does after a photo: scan it, then save what came back, the same as public/index.html
  const snap = async (kind, seen, plan) => {
    sees = seen; actions = plan;
    const d = (await call('POST', '/api/scan/' + kind, { image: 'data:image/jpeg;base64,AAAA' })).data;
    const r = (await call('POST', '/api/apply', { source: kind, store: d.store || '', bought: d.bought || (kind === 'shelf' ? '' : DAY), currency: d.currency || '', actions: d.actions || [] })).data;
    return { d, r };
  };
  const item = (name) => db.prepare('SELECT name, qty, unit, unsure, source FROM items WHERE lower(name) = lower(?)').get(name);
  // a friend's home on the same database: the owner makes a code, the friend signs in with it
  const friend = async () => {
    const code = (await call('POST', '/api/homes', { name: 'Asha' })).data.code;
    const r = await A.default.fetch(new Request('https://stocker.test/api/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://stocker.test' }, body: JSON.stringify({ pin: code, name: 'Asha' }) }), env);
    const ck = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    return async (kind, seen2, plan) => { sees = seen2; actions = plan; const res = await A.default.fetch(new Request('https://stocker.test/api/scan/' + kind, { method: 'POST', headers: { cookie: ck, 'content-type': 'application/json', origin: 'https://stocker.test', 'x-today': DAY }, body: JSON.stringify({ image: 'data:image/jpeg;base64,AAAA' }) }), env); return res.json(); };
  };
  const trials = () => { try { return db.prepare('SELECT * FROM photo_trials ORDER BY id').all(); } catch (e) { return null; } };
  return { call, snap, item, friend, trials, looked, items: () => db.prepare('SELECT name, qty, unsure FROM items').all() };
}

// ---- 1. a photo never asks "how many": each thing seen is one, a guess with Undo (brief, product rule 1) ----
{
  const h = await home();
  // what the real model said about the fridge door on 17 Nov 2026, as the reading model turned it into actions
  const { r } = await h.snap('shelf', 'Granola | 1 |\nMilk | unsure |\nYogurt | unsure |',
    [act('add', 'Granola', 1, true, { category: 'Pantry' }), act('add', 'Milk', 1, false), act('add', 'Yogurt', 1, false)]);
  const g = h.item('Granola'), m = h.item('Milk'), y = h.item('Yogurt');
  check('fridge photo of 17 Nov: milk and yogurt, not counted by the model, are each saved as one', m && m.qty === 1 && y && y.qty === 1, h.items());
  check('  ...and neither is left waiting for "How many?"', m && m.unsure === 0 && y && y.unsure === 0, h.items());
  check('  ...and the card after the scan asks nothing', (r.changes || []).length === 3 && (r.changes || []).every((c) => !c.unsure), r.changes);
  check('  ...granola, which the model counted, is one as before', g && g.qty === 1 && g.unsure === 0, g);
  check('  ...each one can still be taken back (every change is in the card)', (r.changes || []).every((c) => c.id && c.created), r.changes);
}

// ---- 2. opposite: a typed note or a receipt that gives no amount still leaves it open, as before ----
{
  const h = await home();
  await h.call('POST', '/api/apply', { source: 'text', bought: DAY, actions: [{ action: 'add', name: 'Oat Milk', quantity: 1, sure: false, unit: 'pcs', area: 'Kitchen', category: 'Dairy' }] });
  check('opposite: "got oat milk" in a typed note, no amount, still asks how many', h.item('Oat Milk') && h.item('Oat Milk').unsure === 1, h.items());
  await h.call('POST', '/api/apply', { source: 'bill', bought: DAY, actions: [{ action: 'add', name: 'Butter', quantity: 1, sure: false, unit: 'pcs', area: 'Kitchen', category: 'Dairy' }] });
  check('opposite: a receipt line with no readable amount is unchanged (still asks)', h.item('Butter') && h.item('Butter').unsure === 1, h.items());
  await h.call('POST', '/api/apply', { source: 'text', bought: DAY, actions: [{ action: 'add', name: 'Bananas', quantity: 6, sure: true, unit: 'pcs', area: 'Kitchen', category: 'Produce' }] });
  check('opposite: an amount that was said is never a question', h.item('Bananas') && h.item('Bananas').qty === 6 && h.item('Bananas').unsure === 0, h.items());
}

// ---- 3. a photo shows what is there now: a guess never overwrites a count Tote already has ----
{
  const h = await home([['Whole Milk', 2, 'pcs'], ['Eggs', 12, 'pcs']]);
  await h.snap('shelf', 'Whole Milk | unsure |', [act('add', 'Whole Milk', 1, false)]);
  check('a photo that could not count tracked milk leaves the 2 alone', h.item('Whole Milk').qty === 2, h.item('Whole Milk'));
  check('  ...and does not start asking about it either', h.item('Whole Milk').unsure === 0, h.item('Whole Milk'));
  await h.snap('shelf', 'Eggs | 6 |', [act('add', 'Eggs', 6, true)]);
  check('opposite: a photo that counted 6 eggs sets the 12 to 6 (what is there now, not a purchase)', h.item('Eggs').qty === 6, h.item('Eggs'));
  await h.snap('shelf', 'Eggs | 6 |', [act('add', 'Eggs', 6, true)]);
  check('  ...and the same photo again does not stack another 6', h.item('Eggs').qty === 6, h.item('Eggs'));
}

// ---- 4. the app: Today never asks the same question the card after a scan is asking ----
{
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  const fn = html.slice(html.indexOf('function todayCards('), html.indexOf('function todayCards(') + 4000);
  check('Today leaves out a "How many?" that the card after a scan is already asking', /many=items\.filter\(function\(i\)\{return i\.unsure&&i\.qty>0&&!asking\(i\)\}\)/.test(fn), fn.match(/many=items\.filter\([^;]+/)?.[0]);
}

// ---- 5. the check by code between the camera and the home: what a photo line must be to change anything ----
{
  const v = A.checkSeen([
    'Here are the products I can see:', 'Fridge door | 1 |', 'Shelf | unsure |', "Person's hand | 1 |", '- **Daisy cottage cheese** | 1 | sure |',
    'Whole milk, 1 gallon | 1 | sure | 11/24', 'Glass jar | 1 | maybe |', 'Unlabelled bag | 1 | maybe |', 'Sour cream (maybe) | 1 |', 'Yogurt or sour cream | 1 |',
    'Granola? | 1 |', 'Eggs | 1000 |', 'Oreo cookies | 2 |', 'Oreo cookies | 1 |', 'Toor dal | 1 |', 'Half and half | 1 |', 'Steel cut oats | 1 |', 'Orange juice | 1 |', 'Light bulbs | 4 |', 'Kitchen paper towels | 1 |'].join('\n'));
  const kept = v.names.map((n) => n.toLowerCase());
  check('a fridge door, a shelf and a hand are never products', !kept.some((n) => /fridge door|^shelf$|hand/.test(n)) && v.dropped >= 3, v);
  check('  ...and the sentence before the list is not one either', !kept.some((n) => /here are/.test(n)), kept);
  check('a bare "glass jar" or "unlabelled bag" is asked about, not added', v.doubts.some((d) => /glass jar/i.test(d.name) && d.why === 'label') && v.doubts.some((d) => /unlabell?ed bag/i.test(d.name) && d.why === 'label') && !kept.some((n) => /jar|bag$/.test(n)), v.doubts);
  check('a guess ("sour cream (maybe)", "yogurt or sour cream", "granola?") is asked about or left out, never added', v.doubts.some((d) => /sour cream/i.test(d.name) && d.why === 'maybe') && !kept.some((n) => /sour cream|granola|yogurt/.test(n)), [v.doubts, kept]);
  check('  ...at most four questions from one photo', v.doubts.length <= 4, v.doubts.length);
  check('1,000 eggs in one photo is a misreading: kept as eggs, count left as a guess', /^eggs \| unsure/im.test(v.text), v.text);
  check('the same thing listed twice is one line, the counts added', (v.text.match(/^oreo cookies/gim) || []).length === 1 && /oreo cookies \| 3/i.test(v.text), v.text);
  check('opposite: real products pass as listed (Daisy cottage cheese, whole milk, toor dal, half and half, steel cut oats, orange juice, light bulbs, paper towels)',
    ['daisy cottage cheese', 'whole milk, 1 gallon', 'toor dal', 'half and half', 'steel cut oats', 'orange juice', 'light bulbs', 'kitchen paper towels'].every((n) => kept.includes(n)), kept);
  check('  ...a printed date travels with its line', /whole milk, 1 gallon \| 1 \| 11\/24/i.test(v.text), v.text);
  const k = A.keepSeen([{ name: 'Cottage Cheese' }, { name: 'Whole Milk' }, { name: 'Yogurt' }, { name: 'Butter' }, { name: 'Salmon fillets' }], ['Daisy cottage cheese', 'Whole milk, 1 gallon', 'Dahi']);
  check('the reading model cannot add what the camera never saw (butter, salmon)', k.dropped.includes('Butter') && k.dropped.includes('Salmon fillets'), k);
  check('opposite: a reworded or translated line is kept (Daisy cottage cheese → Cottage Cheese, dahi → Yogurt)', ['Cottage Cheese', 'Whole Milk', 'Yogurt'].every((n) => k.actions.some((a) => a.name === n)), k);
}

// ---- 6. through the real route: what changes the home, and what is asked ----
{
  const h = await home();
  const { d, r } = await h.snap('shelf', 'Fridge door | 1 |\nWhole milk | 1 |\nGlass jar | 1 | maybe |\nSour cream (maybe) | 1 |',
    [act('add', 'Whole Milk', 1, true), act('add', 'Butter', 1, true), act('add', 'Sour Cream', 1, true)]);
  check('a photo adds only what it saw for sure (milk)', !!h.item('Whole Milk') && !h.item('Butter') && !h.item('Sour Cream') && (r.changes || []).length === 1, h.items());
  check('  ...and hands back what it was unsure of, as questions', (d.doubts || []).length === 2 && d.doubts.some((x) => x.why === 'label') && d.doubts.some((x) => /sour cream/i.test(x.name) && x.why === 'maybe'), d.doubts);
  check('  ...butter, which the camera never saw, is reported as dropped, not added', (d.unseen || []).includes('Butter'), d);
  const yes = (await h.call('POST', '/api/apply', { source: 'shelf', auto: true, actions: [{ action: 'add', name: 'Sour cream', quantity: 1, unit: 'pcs', sure: true }] })).data;
  check('"Yes" on a question adds it, as one, with nothing left to ask', h.item('Sour cream') && h.item('Sour cream').qty === 1 && h.item('Sour cream').unsure === 0 && !!(yes.changes || [])[0]?.created, h.items());
  const only = await h.snap('shelf', 'Glass jar | 1 | maybe |\nUnlabelled bag | 1 | maybe |', [act('add', 'Pickles', 1, true)]);
  check('a photo with nothing certain changes nothing and only asks', (only.d.actions || []).length === 0 && (only.d.doubts || []).length === 2 && !h.item('Pickles'), only.d);
  const bill = await h.snap('bill', 'CORNER STORE\nBUTTER 1 3.49', [act('add', 'Butter', 1, true)]);
  check('opposite: a receipt is not put through the photo check (butter from a receipt is added)', !!h.item('Butter') && bill.d.doubts === undefined, h.items());
}

// ---- 7. edit from the card: the old line is taken back and the corrected one saved ----
{
  const h = await home();
  const { r } = await h.snap('shelf', 'Granola | 1 |', [act('add', 'Granola', 1, true, { category: 'Pantry' })]);
  const c = (r.changes || [])[0] || {};
  await h.call('DELETE', '/api/items/' + c.id + '?undo=1');
  const e = (await h.call('POST', '/api/apply', { source: 'shelf', auto: true, actions: [{ action: 'add', name: 'Sunflower seeds', quantity: 2, unit: 'pcs', sure: true }] })).data;
  check('editing "Granola" to "Sunflower seeds", 2: granola is gone, 2 sunflower seeds are at home', !h.item('Granola') && h.item('Sunflower seeds') && h.item('Sunflower seeds').qty === 2, h.items());
  await h.call('DELETE', '/api/items/' + ((e.changes || [])[0] || {}).id + '?undo=1');
  check('  ...and the corrected line can still be taken back', !h.item('Sunflower seeds'), h.items());
}

// ---- 8. photo trials: the owner's photos read by other models too, kept as text; nothing in the home changes ----
{
  let h = await home([], { env: { PHOTO_TRIAL: 'on' } });
  await h.snap('shelf', 'Whole milk | 1 |', [act('add', 'Whole Milk', 1, true)]);
  let t = h.trials() || [];
  check('with trials on, the owner\'s photo is read by the live model and four others, all kept as text', t.length === 5 && t[0].prompt === 'v1 (live)' && t.slice(1).every((x) => x.prompt === 'v2' && /saw milk/.test(x.text)) && new Set(t.slice(1).map((x) => x.model)).size === 4, t);
  check('  ...the four include Llama 4 Scout, Gemma 4 and Mistral Small 3.1', ['llama-4-scout', 'gemma-4', 'mistral-small-3.1'].every((m) => t.some((x) => x.model.includes(m))), t.map((x) => x.model));
  check('  ...the photo itself is never kept', !JSON.stringify(t).includes('base64'), null);
  check('  ...and the home changed only by the live reading (one milk)', h.items().length === 1 && h.item('Whole Milk').qty === 1, h.items());
  const ask = await h.friend();
  const before = (h.trials() || []).length;
  await ask('shelf', 'Whole milk | 1 |', [act('add', 'Whole Milk', 1, true)]);
  check('a friend\'s photo is never put through trials', (h.trials() || []).length === before, (h.trials() || []).length - before);
  h = await home([], { env: { PHOTO_TRIAL: 'on' }, fail: '@cf/google/gemma-4-26b-a4b-it', openai: true });
  const s2 = await h.snap('shelf', 'Whole milk | 1 |', [act('add', 'Whole Milk', 1, true)]);
  t = h.trials() || [];
  check('a trial model that fails is noted, and the scan still works', t.some((x) => x.model.includes('gemma-4') && x.err) && !!h.item('Whole Milk') && (s2.r.changes || []).length === 1, t);
  check('  ...an answer in the chat-completions shape is read too', t.some((x) => x.model.includes('scout') && /saw milk/.test(x.text)), t);
  h = await home();
  await h.snap('shelf', 'Whole milk | 1 |', [act('add', 'Whole Milk', 1, true)]);
  check('opposite: with trials off, one model reads the photo and nothing is kept', (h.trials() || []).length === 0 && h.looked.length === 1 && h.looked[0] === 'vision', [h.trials(), h.looked]);
}

// ---- 9. real photos: what Tote found against what is really there (a score, not pass or fail) ----
const P = JSON.parse(fs.readFileSync(path.join(ROOT, 'evals/scan-photos.json'), 'utf8'));
function score(photo, said) {
  const used = new Set(); let found = 0, strict = 0;
  for (const t of photo.readable) {
    const re = new RegExp(t.match, 'i');
    const hit = said.findIndex((s, i) => !used.has(i) && re.test(s.name));
    if (hit >= 0) { used.add(hit); found++; if (!t.confirm) strict++; }
  }
  return { found, strict, readable: photo.readable.length, invented: said.length - used.size, asked: said.filter((s) => s.count === null).length };
}
const scores = [];
for (const ph of P.photos) for (const [day, run] of Object.entries(ph.tote)) scores.push([ph.id, day, run.model, score(ph, run.said)]);
const fr = scores.find((s) => s[0] === 'fridge-door-2026-11-17');
check('the scorer reads the 17 Nov fridge photo as 3 of 7 found (1 certain), none invented, 2 asked', fr && fr[3].found === 3 && fr[3].strict === 1 && fr[3].readable === 7 && fr[3].invented === 0 && fr[3].asked === 2, fr && fr[3]);

const failed = results.filter((r) => !r[0]);
for (const [ok, name, detail] of results) console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '\n     ' + detail));
console.log('\nReal photos (what Tote found / readable things; "certain" leaves out what is not yet confirmed):');
for (const [id, day, model, s] of scores) console.log('  ' + id + ', ' + day + ' (' + model + '): found ' + s.found + ' of ' + s.readable + ' (certain ' + s.strict + '), invented ' + s.invented + ', asked "how many" ' + s.asked);
console.log('\nShelf scan: ' + (results.length - failed.length) + ' of ' + results.length + ' checks pass');
if (failed.length) process.exit(1);
