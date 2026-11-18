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
const A = await loadAgent(['cleanProfile']);
const act = (action, name, quantity, known, x = {}) => ({ action, name, note: '', inferred: false, quantity, quantityKnown: known, unit: 'pcs', area: 'Kitchen', category: 'Dairy', expiryDate: '', shelfLifeDays: 7, daysToFinish: 7, price: 0, warn: '', ...x });

// a home whose camera sees `sees` and whose reading model turns it into `actions`
async function home(items = []) {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  let sees = '', actions = [];
  const env = { APP_PIN: 'test1234', DB: d1(db), TEXT_MODEL: 'big', SMALL_MODEL: 'small', VISION_MODEL: 'vision', DELEGATE: 'off', ASSETS: { fetch: async () => new Response('') },
    AI: { run: async (model, input) => {
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
  return { call, snap, item, items: () => db.prepare('SELECT name, qty, unsure FROM items').all() };
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

// ---- 5. real photos: what Tote found against what is really there (a score, not pass or fail) ----
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
