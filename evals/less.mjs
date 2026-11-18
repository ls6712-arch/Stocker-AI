// Needing less from people, round 1 (16 Nov 2026). Two small changes that the household simulation (evals/less-sim/) supports
// against what is live, each pinned in both directions:
//   1. The list looks ahead to the next shop. "Might be running low" used to mean "out by tomorrow". Standing in front of the
//      list, what matters is "out before I shop again", so the server works out how often this home shops and says so.
//      When it does not know, nothing changes: code gives up rather than guesses.
//   2. Fresh food is mentioned the day before its date, not on the day, when there is still time to use or freeze it.
// Runs the Worker's real code and real SQL against an in-memory database. No network and no model.
//
//   node --no-warnings evals/less.mjs
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
const check = (name, pass, detail) => results.push([!!pass, name, pass ? '' : JSON.stringify(detail ?? '').slice(0, 400)]);
const DAY = '2026-11-16';
const plus = (n) => new Date(Date.parse(DAY + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const tryIt = async (name, fn) => { try { await fn(); } catch (e) { check(name + ' (crashed)', false, String((e && e.stack) || e).slice(0, 400)); } };

let A;
try { A = await loadAgent(['digest', 'remindText', 'shopGapFrom']); } catch (e) { A = await loadAgent(['digest', 'remindText']); }

async function home() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  const env = { APP_PIN: 'test1234', TEST_DATES: 'on', DB: d1(db), AI: { run: async () => { throw new Error('4006: no credits'); } }, TEXT_MODEL: 'none', ASSETS: { fetch: async () => new Response('') } };
  let cookie = '';
  const call = async (method, p, body, today) => {
    const res = await A.default.fetch(new Request('https://stocker.test' + p, { method, headers: { cookie, 'content-type': 'application/json', origin: 'https://stocker.test', 'x-today': today || DAY }, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} });
    return { status: res.status, data: await res.json().catch(() => ({})), res };
  };
  const login = await call('POST', '/api/login', { pin: 'test1234', name: 'Sam' });
  cookie = login.res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const add = (name, o = {}) => call('POST', '/api/apply', { source: 'hand', bought: o.bought || DAY, actions: [{ action: 'add', name, quantity: o.qty || 1, unit: o.unit || 'pcs', area: o.area || 'Kitchen', category: o.category || 'Other', expiry: o.expiry || '', shelfLifeDays: 0, finishDays: o.finish || 14 }] }, o.bought || DAY);
  const state = async (today) => (await call('GET', '/api/items', null, today)).data;
  return { db, env, call, add, state };
}

// ---------- 1. how often this home shops ----------
await tryIt('shop gap', async () => {
  const f = A.shopGapFrom;
  check('how often a home shops is worked out by code', typeof f === 'function');
  if (typeof f !== 'function') return;
  const g = (days) => f(days.map(plus));
  check('a shop every 5 days is read as 5', g([-20, -15, -10, -5, 0]).known && g([-20, -15, -10, -5, 0]).days === 5, g([-20, -15, -10, -5, 0]));
  check('one odd long gap (a holiday) does not move it', g([-33, -28, -23, -18, -4, 0]).days === 5, g([-33, -28, -23, -18, -4, 0]));
  check('the order the days arrive in does not matter', g([0, -10, -5, -15]).days === 5, g([0, -10, -5, -15]));
  check('the same day twice is one shop', g([-10, -10, -5, -5, 0]).days === 5, g([-10, -10, -5, -5, 0]));
  check('opposite: two shops are not a habit yet', g([-5, 0]).known === false, g([-5, 0]));
  check('opposite: nothing bought, nothing known', g([]).known === false, g([]));
  check('opposite: a home that orders every day looks ahead one day, as before', g([-4, -3, -2, -1, 0]).days === 1, g([-4, -3, -2, -1, 0]));
  check('opposite: a monthly shopper is not asked about a whole month of things (capped at a week)', g([-90, -60, -30, 0]).days === 7, g([-90, -60, -30, 0]));
  check('opposite: a date that is not a date is ignored', g([-10, -5, 0]).days === f([plus(-10), 'soon', plus(-5), null, plus(0)]).days);
});

await tryIt('shop gap in the app', async () => {
  const h = await home();
  for (const d of [-18, -12, -6]) await h.add('Milk', { bought: plus(d), unit: 'L', finish: 6 });
  await h.add('Eggs', { bought: plus(-6), finish: 10 });
  const s = await h.state();
  check('the app is told how often this home shops', s.shop && s.shop.known === true && s.shop.days === 6, s.shop);
  const e = await home();
  await e.add('Milk', { bought: plus(-3), unit: 'L' });
  const s2 = await e.state();
  check('opposite: a new home is told it is not known yet', s2.shop && s2.shop.known === false, s2.shop);
  check('opposite: the app still opens for a home with nothing in it', Array.isArray((await (await home()).state()).items));
});

await tryIt('still have it, at the list', async () => {
  // asked "may run out before you shop again", the answer "still have it" must hold until after that shop, or the same line comes straight back
  const h = await home();
  for (const d of [-18, -12]) await h.add('Bananas', { bought: plus(d), finish: 6 });
  await h.add('Eggs', { bought: plus(-6), finish: 7 });
  await h.add('Butter', { bought: plus(-6), finish: 7 });
  const s = await h.state(), eggs = s.items.find((i) => i.name === 'Eggs'), butter = s.items.find((i) => i.name === 'Butter');
  check('this home shops every 6 days', s.shop.known && s.shop.days === 6, s.shop);
  await h.call('POST', '/api/remind', { ids: [eggs.id], answer: 'still', ahead: true });
  await h.call('POST', '/api/remind', { ids: [butter.id], answer: 'still' });
  const s2 = await h.state(), e2 = s2.items.find((i) => i.name === 'Eggs'), b2 = s2.items.find((i) => i.name === 'Butter');
  const outIn = (it) => Math.round((Date.parse(it.bought) - Date.parse(DAY)) / 86400000) + it.finish_days;
  check('"still have it" at the list: not asked again until after the next shop', outIn(e2) > 6, { finish: e2.finish_days, outIn: outIn(e2) });
  check('opposite: the same answer on a phone reminder keeps its own, shorter rule', b2.finish_days === 6 + 4 && outIn(b2) === 4, { finish: b2.finish_days });
  check('opposite: it puts nothing on the list', !e2.low && !b2.low);
  const u = await h.call('POST', '/api/remind', { answer: 'undo', of: 'still', before: [{ id: eggs.id, low: 0, finish_days: 7 }] });
  check('Undo puts the estimate back', (await h.state()).items.find((i) => i.name === 'Eggs').finish_days === 7, u.data);
  const n = await home();
  await n.add('Eggs', { bought: plus(-6), finish: 7 });
  const id = (await n.state()).items[0].id;
  await n.call('POST', '/api/remind', { ids: [id], answer: 'still', ahead: true });
  check('opposite: in a home whose shopping I do not know yet, nothing changes', (await n.state()).items[0].finish_days === 10, (await n.state()).items[0].finish_days);
});

// ---------- 2. fresh food: the day before ----------
await tryIt('day before', async () => {
  const h = await home();
  await h.add('Strawberries', { bought: plus(-4), expiry: plus(1), category: 'Produce' });
  await h.add('Spinach', { bought: plus(-2), expiry: plus(3), category: 'Produce' });
  await h.add('Old Yogurt', { bought: plus(-9), expiry: plus(-1), category: 'Dairy' });
  let d = await A.digest(h.env, DAY, false);
  const names = (x) => x.use.map((i) => i.name);
  check('strawberries best by tomorrow are mentioned today', names(d).includes('Strawberries'), names(d));
  check('opposite: spinach with three days left is not', !names(d).includes('Spinach'), names(d));
  check('opposite: something already past its date is not brought up again', !names(d).includes('Old Yogurt'), names(d));
  const t = A.remindText(d, DAY);
  check('the reminder says tomorrow, and what to do', t && /best by tomorrow/.test(t.title) && /freeze/.test(t.body), t);
  check('in under 12 words a line, with no exclamation mark', t && t.title.split(/\s+/).length <= 12 && t.body.split(/\s+/).length <= 12 && !/!/.test(t.title + t.body), t);
  d = await A.digest(h.env, plus(1), false);
  check('opposite: it is not said a second time on the day itself', !names(d).includes('Strawberries'), names(d));
  // something that arrives with a day or less to go never had a day before: it is said on the day, as now
  const h2 = await home();
  await h2.add('Fresh Chicken', { bought: DAY, expiry: DAY, category: 'Meat' });
  const d2 = await A.digest(h2.env, DAY, false), t2 = A.remindText(d2, DAY);
  check('bought today, best by today: still said today', d2.use.map((i) => i.name).includes('Fresh Chicken') && /best by today/.test(t2.title), t2);
  const h3 = await home();
  await h3.add('Berries', { bought: plus(-3), expiry: plus(1), category: 'Produce' });
  await h3.call('PATCH', '/api/items/' + (await h3.state()).items[0].id, { frozen: true });
  const fr = (await h3.state()).items[0];
  if (fr.frozen) check('opposite: frozen food is left alone', !(await A.digest(h3.env, DAY, false)).use.length);
  const h4 = await home();
  await h4.add('Milk', { bought: plus(-5), expiry: plus(1), unit: 'L', category: 'Dairy' });
  await h4.add('Paneer', { bought: DAY, expiry: DAY, category: 'Dairy' });
  const t4 = A.remindText(await A.digest(h4.env, DAY, false), DAY);
  check('one for today and one for tomorrow: the nearer day is the one said', t4 && /best by today/.test(t4.title), t4);
});

const failed = results.filter((r) => !r[0]);
for (const [ok, name, detail] of results) console.log((ok ? '  pass  ' : '  FAIL  ') + name + (detail ? '\n        ' + detail : ''));
console.log('\nNeeding less, round 1: ' + (results.length - failed.length) + ' of ' + results.length + ' checks pass.');
if (process.argv.includes('--json')) console.log(JSON.stringify({ pass: results.length - failed.length, total: results.length }));
process.exit(failed.length && !process.argv.includes('--baseline') ? 1 : 0);
