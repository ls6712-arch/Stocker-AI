// Subscriber walk-through, 18 Nov 2026: the defects a busy parent on the $9.99 plan found in one session, each pinned as a check,
// in both directions. Runs the Worker's real code and real SQL against an in-memory database; the model stand-in refuses every
// call, so everything here is what Stocker does by rule.
//
//   node --no-warnings evals/subscriber.mjs
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
const DAY = '2026-11-18';
const A = await loadAgent(['cleanProfile', 'homeWarn', 'quickReceipt', 'enrich']);

async function home() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  const env = { APP_PIN: 'test1234', TEST_DATES: 'on', DB: d1(db), AI: { run: async () => { throw new Error('4006: you have used up your daily free allocation of 10,000 neurons'); } }, TEXT_MODEL: 'none', ASSETS: { fetch: async () => new Response('') } };
  let cookie = '';
  const call = async (method, p, body) => {
    const res = await A.default.fetch(new Request('https://stocker.test' + p, { method, headers: { cookie, 'content-type': 'application/json', origin: 'https://stocker.test', 'x-today': DAY }, body: body ? JSON.stringify(body) : undefined }), env);
    return { status: res.status, data: await res.json().catch(() => ({})), res };
  };
  const login = await call('POST', '/api/login', { pin: 'test1234', name: 'Sam' });
  cookie = login.res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const apply = (actions, o = {}) => call('POST', '/api/apply', { source: o.source || 'text', bought: DAY, auto: o.auto, actions });
  const add = (name, o = {}) => apply([{ action: 'add', name, quantity: o.qty ?? 1, unit: o.unit || 'pcs', area: o.area || 'Kitchen', category: o.category || 'Pantry', sure: o.sure, expiry: '', shelfLifeDays: 0, finishDays: 10 }], o);
  const state = async () => (await call('GET', '/api/items')).data;
  const item = async (name) => (await state()).items.find((i) => i.name === name);
  const say = (text) => call('POST', '/api/chat', { text });
  return { db, call, apply, add, state, item, say };
}

// ---- 1. amounts in another unit are never added as they are ----
{
  const h = await home();
  await h.add('Eggs', { qty: 1, unit: 'pack', sure: true });
  await h.say('bought 2 dozen eggs');
  const e = await h.item('Eggs');
  check('"2 dozen eggs" onto 1 box of eggs is 36 eggs, counted one by one, not 25', e.unit === 'pcs' && e.qty === 36, e);

  const h2 = await home();
  await h2.add('Eggs', { qty: 1, unit: 'pack', sure: true });
  await h2.apply([{ action: 'add', name: 'Eggs', quantity: 24, unit: 'pcs', sure: true }]);
  const e2 = await h2.item('Eggs');
  check('24 eggs from the model onto 1 box is 36 eggs', e2.unit === 'pcs' && e2.qty === 36, e2);

  const h3 = await home();
  await h3.add('Eggs', { qty: 12, unit: 'pcs', sure: true });
  await h3.say('bought 2 dozen eggs');
  const e3 = await h3.item('Eggs');
  check('opposite: eggs kept as pieces, "2 dozen" adds 24', e3.unit === 'pcs' && e3.qty === 36, e3);

  const h4 = await home();
  await h4.add('Rice', { qty: 1, unit: 'kg', sure: true });
  await h4.apply([{ action: 'add', name: 'Rice', quantity: 500, unit: 'g', sure: true }]);
  const r = await h4.item('Rice');
  check('opposite: 500 g onto 1 kg of rice is 1.5 kg', r.unit === 'kg' && Math.abs(r.qty - 1.5) < 0.001, r);

  const h5 = await home();
  await h5.add('Iceberg Lettuce', { qty: 2, unit: 'lb', sure: true, category: 'Produce' });
  await h5.apply([{ action: 'add', name: 'Iceberg Lettuce', quantity: 1, unit: 'pcs', sure: true }]);
  const l = await h5.item('Iceberg Lettuce');
  check('a head of lettuce onto 2 lb stays in lb (no pounds-plus-heads)', l.unit === 'lb' && l.qty > 2, l);

  const h6 = await home();
  await h6.add('Milk', { qty: 1, unit: 'pack', sure: true });
  await h6.say('bought 2 milk');
  check('opposite: a bare count onto packs is packs', (await h6.item('Milk')).qty === 3, await h6.item('Milk'));
}

// ---- 2. eggs bought with no count are a dozen, said as a guess ----
{
  const h = await home();
  await h.say('bought eggs');
  const e = await h.item('Eggs');
  check('"bought eggs" with no count is 12, marked as a guess', e && e.qty === 12 && e.unit === 'pcs', e);
  const h2 = await home();
  await h2.say('bought 6 eggs');
  check('opposite: "bought 6 eggs" is 6', ((await h2.item('Eggs')) || {}).qty === 6, await h2.item('Eggs'));
  const h3 = await home();
  await h3.say('bought bananas');
  check('opposite: bananas with no count stay 1 (no made-up dozen)', (await h3.item('Bananas')).qty === 1, await h3.item('Bananas'));
}


// ---- 2b. pack sizes are read, not guessed: receipts, order screens and chat ----
{
  const egg = (o) => o.actions.find((a) => /egg/i.test(a.name)) || {};
  const r1 = egg(A.quickReceipt('KROGER\nLG EGGS 18CT 4.99\nTOTAL 4.99', [], null));
  check('receipt "LG EGGS 18CT" is 18 eggs, 18 to a pack', r1.quantity === 18 && r1.unit === 'pcs' && r1.each === 18, r1);
  const r2 = egg(A.quickReceipt('Blinkit\nFarm Fresh Eggs (Pack of 6) x 2 ₹130\nDelivery fee ₹25', [], null));
  check('order "Farm Fresh Eggs (Pack of 6) x 2" is 12 eggs, 6 to a pack', r2.quantity === 12 && r2.unit === 'pcs' && r2.each === 6, r2);
  const r3 = egg(A.quickReceipt('Zepto\nEggs - Tray of 30 ₹210', [], null));
  check('order "Eggs - Tray of 30" is 30 eggs', r3.quantity === 30 && r3.each === 30, r3);
  const r4 = A.quickReceipt('WHOLE FOODS\nORG WHL MILK 1GAL 5.99\nTOTAL 5.99', [], null).actions[0] || {};
  check('opposite: a gallon of milk is litres, with no pack size', r4.unit === 'L' && !r4.each, r4);

  const m1 = A.enrich({ action: 'add', name: 'Eggs', quantity: 1, unit: 'pcs', area: 'Kitchen', category: 'Dairy', warn: '' }, null, 'LG EGGS 18CT 4.99');
  check('a receipt read by the model: "LG EGGS 18CT" is 18 eggs, 18 to a pack', m1.quantity === 18 && m1.unit === 'pcs' && m1.each === 18, m1);
  const m2 = A.enrich({ action: 'add', name: 'Bananas', quantity: 6, unit: 'pcs', area: 'Kitchen', category: 'Produce', warn: '' }, null, 'BANANAS 2.1LB 1.26');
  check('opposite: bananas by the pound keep their weight and get no pack size', m2.unit === 'lb' && !m2.each, m2);

  const h = await home();
  await h.say('bought a tray of 30 eggs');
  check('chat "a tray of 30 eggs" is 30 eggs', ((await h.item('Eggs')) || {}).qty === 30, await h.item('Eggs'));
  await h.say('bought eggs');
  check('then "bought eggs" with no count is another 30, the size this home buys', ((await h.item('Eggs')) || {}).qty === 60, await h.item('Eggs'));
  const h2 = await home();
  await h2.say('bought 2 packs of 18 eggs');
  check('chat "2 packs of 18 eggs" is 36 eggs', ((await h2.item('Eggs')) || {}).qty === 36, await h2.item('Eggs'));
  const h3 = await home();
  await h3.say('picked up an 18-pack of eggs');
  check('chat "an 18-pack of eggs" is 18 eggs', ((await h3.item('Eggs')) || {}).qty === 18, await h3.item('Eggs'));
  const h4 = await home();
  await h4.add('Eggs', { qty: 1, unit: 'pack', sure: true });
  await h4.apply([{ action: 'add', name: 'Eggs', quantity: 18, unit: 'pcs', each: 18, sure: true }]);
  check('a box of 18 onto 1 box kept in packs: the old box counts as 12, the new as 18, 30 eggs', ((await h4.item('Eggs')) || {}).qty === 30 && ((await h4.item('Eggs')) || {}).unit === 'pcs', await h4.item('Eggs'));
  const h5 = await home();
  await h5.add('Laundry Pods', { qty: 1, unit: 'pack', sure: true, area: 'Cleaning', category: 'Laundry' });
  await h5.apply([{ action: 'add', name: 'Laundry Pods', quantity: 42, unit: 'pcs', each: 42, sure: true }]);
  check('opposite: 42 pods read off a receipt onto pods kept in packs is one more pack, not 43', ((await h5.item('Laundry Pods')) || {}).qty === 2 && ((await h5.item('Laundry Pods')) || {}).unit === 'pack', await h5.item('Laundry Pods'));
  const h6 = await home();
  await h6.say('bought 2 packs of tortillas');
  check('opposite: packs of something with no size stay packs', (await h6.item('Tortillas') || {}).unit === 'pack' && (await h6.item('Tortillas')).qty === 2, await h6.item('Tortillas'));
}

// ---- 3. a typed allergy with a spelling slip still counts ----
{
  const p = A.cleanProfile({ personas: ['mom'], allergies: ['Avacado', 'Kiwi', 'Peanuts', 'Strawbery'] });
  check('"Avacado" is saved as Avocado', p.allergies.includes('Avocado') && !p.allergies.includes('Avacado'), p.allergies);
  check('"Strawbery" is saved as Strawberry', p.allergies.includes('Strawberry'), p.allergies);
  check('opposite: Kiwi and Peanuts are left as they are', p.allergies.includes('Kiwi') && p.allergies.includes('Peanuts'), p.allergies);
  const q = A.cleanProfile({ personas: ['mom'], allergies: ['Lychee', 'Garlic'] });
  check('opposite: a real food not on any list is not "corrected" (lychee, garlic)', q.allergies.includes('Lychee') && q.allergies.includes('Garlic'), q.allergies);
  const h = await home();
  await h.call('POST', '/api/profile', { personas: ['mom'], allergies: ['Avacado'], adults: 2, kids: 1, members: [{ name: 'Leo', kind: 'child', allergies: ['Peanuts'] }] });
  await h.add('Guacamole');
  check('guacamole at home is flagged for a home that typed "Avacado"', /avocado/i.test((await h.item('Guacamole')).warn || ''), await h.item('Guacamole'));
  await h.add('Peanut Butter');
  const both = await h.say("can I pack a peanut butter sandwich and some guacamole in Leo's lunchbox tomorrow?");
  check('asked about two foods, both clashes are named (peanut and avocado), with check the label', /peanut/i.test(both.data.reply) && /avocado/i.test(both.data.reply) && /check the label/i.test(both.data.reply), both.data.reply);
  await h.add('Apple Slices');
  const ok = await h.say("can I pack apple slices and carrots in Leo's lunchbox?");
  check('opposite: apple slices and carrots are not refused', !/^No\b|Not for/.test(ok.data.reply || ''), ok.data.reply);
}

// ---- 4. non-food lands in its own room; a room can be changed by hand ----
{
  const h = await home();
  await h.add('Diapers', { area: 'Kitchen', category: 'Pantry' });
  const d = await h.item('Diapers');
  check('diapers sent as Kitchen by default go to Kids, not cupboard staples', d.area === 'Kids', d);
  const h2 = await home();
  await h2.add('Diapers', { area: 'Kitchen', category: 'Pantry', auto: false, source: 'hand' });
  check('opposite: a room picked by hand is kept', (await h2.item('Diapers')).area === 'Kitchen', await h2.item('Diapers'));
  const h3 = await home();
  await h3.add('Peanut Butter', { area: 'Kitchen', category: 'Pantry' });
  check('opposite: food stays in the kitchen', (await h3.item('Peanut Butter')).area === 'Kitchen', await h3.item('Peanut Butter'));
  const id = (await h2.item('Diapers')).id;
  await h2.call('PATCH', '/api/items/' + id, { area: 'Kids', category: 'Diapering' });
  const moved = await h2.item('Diapers');
  check('an item can be moved to another room and kind', moved.area === 'Kids' && moved.category === 'Diapering', moved);
  await h2.call('PATCH', '/api/items/' + id, { area: 'Garage', category: 'Nope' });
  const kept = await h2.item('Diapers');
  check('opposite: an unknown room or kind is refused', kept.area === 'Kids' && kept.category === 'Diapering', kept);
}

// ---- 5. the shopping list: tidy names, and what is already at home ----
{
  const h = await home();
  await h.add('Greek Yogurt', { qty: 2, unit: 'pack', category: 'Dairy' });
  const r = await h.call('POST', '/api/extras', { text: 'dish soap' });
  check('"dish soap" is written "Dish soap" on the list', r.data.text === 'Dish soap', r.data);
  const y = await h.call('POST', '/api/extras', { text: 'Yogurt' });
  check('putting yogurt on the list says Greek Yogurt is at home', y.data.have && /Greek Yogurt/.test(y.data.have.name), y.data);
  const a = await h.call('POST', '/api/extras', { text: 'Apples' });
  check('opposite: apples, not at home, say nothing about home', !a.data.have, a.data);
  const ex = (await h.state()).extras;
  check('list rows carry their kind (Dish soap: Dishes, Yogurt: Dairy)', (ex.find((x) => x.text === 'Dish soap') || {}).kind === 'Dishes' && (ex.find((x) => x.text === 'Yogurt') || {}).kind === 'Dairy', ex);
  const k = await h.call('POST', '/api/extras', { text: 'iPhone charger' });
  check('opposite: a brand written in lower case first keeps its spelling', k.data.text === 'iPhone charger', k.data);
}

const failed = results.filter((r) => !r[0]);
for (const [ok, name, detail] of results) console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + name + (ok ? '' : '\n        ' + detail));
console.log('\n' + (results.length - failed.length) + ' of ' + results.length + ' subscriber checks pass');
if (process.argv.includes('--json')) console.log(JSON.stringify({ pass: results.length - failed.length, total: results.length }));
process.exit(failed.length ? 1 : 0);
