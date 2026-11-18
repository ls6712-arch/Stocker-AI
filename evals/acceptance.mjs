// Acceptance test: the defects found in the 16 Nov 2026 user acceptance test, each pinned as a check, in both directions.
// Runs the Worker's real code and real SQL against an in-memory database. No network, no model calls: the model stand-in
// refuses every call, so everything here is what Stocker does by rule.
//
//   node --no-warnings evals/acceptance.mjs
import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { loadAgent, ROOT } from './load.mjs';

// a stand-in for the Cloudflare database that runs the same SQL
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

const A = await loadAgent(['saidAmount', 'enrich', 'listPieces', 'boughtCovers', 'homeWarn', 'cleanProfile']);

async function home() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  let calls = 0;
  const env = { APP_PIN: 'test1234', TEST_DATES: 'on', DB: d1(db), AI: { run: async () => { calls++; throw new Error('4006: you have used up your daily free allocation of 10,000 neurons'); } }, TEXT_MODEL: 'none', ASSETS: { fetch: async () => new Response('') } };
  let cookie = '';
  const call = async (method, p, body) => {
    const res = await A.default.fetch(new Request('https://stocker.test' + p, { method, headers: { cookie, 'content-type': 'application/json', origin: 'https://stocker.test', 'x-today': DAY }, body: body ? JSON.stringify(body) : undefined }), env);
    return { status: res.status, data: await res.json().catch(() => ({})), res };
  };
  const login = await call('POST', '/api/login', { pin: 'test1234', name: 'Sam' });
  cookie = login.res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const add = (name, o = {}) => call('POST', '/api/apply', { source: o.source || 'hand', bought: DAY, auto: o.auto, actions: [{ action: 'add', name, quantity: o.qty || 1, unit: o.unit || 'pcs', area: o.area || 'Kitchen', category: o.category || 'Pantry', warn: o.warn || '', restock: o.restock, expiry: '', shelfLifeDays: 0, finishDays: 10 }] });
  const state = async () => (await call('GET', '/api/items')).data;
  const item = async (name) => (await state()).items.find((i) => i.name === name);
  const say = (text) => call('POST', '/api/chat', { text });
  return { db, call, add, state, item, say, modelCalls: () => calls };
}
const LEO = { personas: ['mom'], adults: 1, kids: 3, members: [{ name: 'Leo', kind: 'child', allergies: ['Peanuts'] }] };

// ---- 1. allergy flags follow the household's own allergies, and refresh when the profile changes (bugs 1 to 3) ----
{
  const h = await home();
  await h.add('Peanut Butter Pretzel Sandwich');
  await h.add('Dumplings', { warn: 'contains wheat' }); // a flag left behind by an earlier guess
  check('no profile: nothing is flagged', !(await h.item('Peanut Butter Pretzel Sandwich')).warn && !(await h.item('Dumplings')).warn, await h.state());
  await h.call('POST', '/api/profile', LEO);
  const pb = await h.item('Peanut Butter Pretzel Sandwich');
  check('a child marked no peanuts: the peanut butter sandwich is flagged, by name', /peanut/.test(pb.warn || '') && /Leo/.test(pb.warn || ''), pb);
  check('nobody avoids wheat: dumplings are not flagged', !(await h.item('Dumplings')).warn, await h.item('Dumplings'));
  await h.add('Peanut Butter');
  check('adding peanut butter by hand is flagged', /peanut/.test((await h.item('Peanut Butter')).warn || ''), await h.item('Peanut Butter'));
  await h.call('POST', '/api/extras', { text: 'Peanut butter cups' });
  await h.call('POST', '/api/extras', { text: 'Apples' });
  const ex = (await h.state()).extras;
  check('the same thing on the shopping list is flagged', /peanut/.test((ex.find((x) => /cups/.test(x.text)) || {}).warn || ''), ex);
  check('apples on the list are not flagged', !(ex.find((x) => x.text === 'Apples') || {}).warn, ex);
  check('diaper cream is not read as dairy or food', A.homeWarn('Diaper cream', A.cleanProfile({ personas: ['mom'], allergies: ['Milk'] }), 'Kids') === '' && A.homeWarn('Butternut squash', A.cleanProfile({ personas: ['mom'], allergies: ['Milk'] }), 'Kitchen') === '');
  check('"peanut-free" in the name is not flagged for peanuts', A.homeWarn('Peanut-free granola bars', A.cleanProfile(LEO), 'Kitchen') === '');
  await h.call('POST', '/api/profile', { personas: ['mom'], allergies: ['Wheat'] });
  check('profile changed to a wheat allergy: dumplings are flagged now, the sandwich is not flagged for peanuts', /wheat/.test((await h.item('Dumplings')).warn || '') && !/peanut/.test((await h.item('Peanut Butter')).warn || ''), [await h.item('Dumplings'), await h.item('Peanut Butter')]);

  await h.call('POST', '/api/profile', LEO);
  const no = await h.say("Can I put the peanut butter pretzel sandwiches in Leo's lunchbox?");
  check('chat: "can Leo have it?" is answered No, with who and why', /^No\./.test(no.data.reply) && /Leo is marked no peanuts/.test(no.data.reply) && /peanut in the name/.test(no.data.reply) && /check the label/i.test(no.data.reply) && !(no.data.changes || []).length, no.data);
  await h.add('Apple Slices');
  const ok = await h.say("Can I put the apple slices in Leo's lunchbox?");
  check('chat: a food with no clash is never called safe, and still says check the label', !/^(No|Yes)\b/.test(ok.data.reply) && !/\bsafe\b/i.test(ok.data.reply) && /check the label/i.test(ok.data.reply), ok.data.reply);
  await h.call('POST', '/api/profile', { personas: ['student'], adults: 1, allergies: ['Tree nuts'] });
  const mix = await h.say('What can I eat right now? Also add almond milk to my list');
  const onList = (await h.state()).extras.map((x) => x.text);
  check('chat: a meal question next to a list add does both, and names the tree-nut clash', onList.includes('Almond Milk') && /tree nuts/.test(mix.data.reply) && /check the label/i.test(mix.data.reply) && !/vouch/.test(mix.data.reply), [mix.data.reply, onList]);
  check('none of this needed the model to succeed', true);
}

// ---- 2. the shopping list can be edited, split and cleared (bugs 5, 6, 14) ----
{
  const h = await home();
  const long = await h.call('POST', '/api/extras', { text: '2 gallons whole milk, birthday candles and size 5 diapers' });
  let ex = (await h.state()).extras.map((x) => x.text);
  check('a long line with three things is saved as three rows, not a server error', long.status === 200 && ex.length === 3 && ex.includes('Birthday candles') && ex.includes('Size 5 diapers'), [long.status, long.data, ex]);
  await h.call('POST', '/api/extras', { text: 'diapers, wipes' });
  ex = (await h.state()).extras.map((x) => x.text);
  check('"diapers, wipes" is two rows', ex.includes('Diapers') && ex.includes('Wipes'), ex);
  check('"mac and cheese" and a single thing stay one row', A.listPieces('mac and cheese').length === 1 && A.listPieces('birthday candles').length === 1 && A.listPieces('salt and pepper').length === 1, [A.listPieces('mac and cheese'), A.listPieces('salt and pepper')]);
  const s1 = await h.state(), wipes = s1.extras.find((x) => x.text === 'Wipes');
  const ren = await h.call('PATCH', '/api/extras/' + wipes.id, { text: 'Baby wipes', count: 3 });
  check('a list row can be renamed and given a quantity', ren.data.text === 'Baby wipes ×3' && (await h.state()).extras.some((x) => x.text === 'Baby wipes ×3'), ren.data);
  await h.call('DELETE', '/api/extras/' + wipes.id);
  check('a list row can be removed', !(await h.state()).extras.some((x) => /wipes/i.test(x.text)));

  const g = await home();
  for (const t of ['Almond milk', 'Bread', 'Cheese']) await g.call('POST', '/api/extras', { text: t });
  await g.add('Coffee', { qty: 1 });
  await g.call('PATCH', '/api/items/' + (await g.item('Coffee')).id, { qty: 0, out: true });
  const miss = await g.say('take olives off my list');
  check('chat: taking off something that is not listed says so, and never says "at home"', /not on your list/.test(miss.data.reply) && !/at home/.test(miss.data.reply) && (await g.state()).extras.length === 3, miss.data.reply);
  const clear = await g.say('take everything off my shopping list except cheese');
  const after = await g.state(), coffee = after.items.find((i) => i.name === 'Coffee');
  check('chat: "take everything off my list except cheese" leaves only cheese', after.extras.map((x) => x.text).join() === 'Cheese' && coffee && coffee.nolist === 1 && !/at home/.test(clear.data.reply), [clear.data.reply, after.extras, coffee]);
  check('chat: clearing the list removes nothing from home', after.items.length === 1 && coffee.qty === 0, after.items);
  check('chat: every cleared entry has its own Undo', (clear.data.changes || []).length === 3 && clear.data.changes.every((c) => c.action === 'unlist'), clear.data.changes);
  await g.add('Coffee', { qty: 1 });
  check('buying it again puts it back in the normal cycle', (await g.item('Coffee')).nolist === 0);

  const b = await home();
  await b.call('POST', '/api/extras', { text: 'Yogurt' });
  await b.call('POST', '/api/extras', { text: 'Diapers (size 5)' });
  await b.call('POST', '/api/extras', { text: 'Milk' });
  const buy = await b.add('Greek Yogurt', { source: 'bill' });
  await b.add('Diapers', { area: 'Kids', category: 'Diapering' });
  await b.add('Almond Milk');
  const left = (await b.state()).extras.map((x) => x.text);
  check('buying Greek yogurt clears "Yogurt" from the list, and says which entry it cleared', !left.includes('Yogurt') && ((buy.data.changes[0] || {}).cleared || []).some((c) => c.text === 'Yogurt'), [left, buy.data.changes]);
  check('buying diapers clears "Diapers (size 5)"', !left.some((x) => /Diapers/.test(x)), left);
  check('buying almond milk does not clear "Milk"', left.includes('Milk'), left);
}

// ---- 3. nothing is destroyed without a way back, and the log tells the truth (bugs 7, 8, 13, 18) ----
{
  const h = await home();
  await h.add('Iceberg Lettuce', { qty: 2, unit: 'lb', category: 'Produce' });
  const lettuce = await h.item('Iceberg Lettuce');
  await h.call('PATCH', '/api/items/' + lettuce.id, { binned: true });
  check('threw it away: the item is gone', !(await h.item('Iceberg Lettuce')));
  const back = await h.call('POST', '/api/items/restore', { item: lettuce, binned: true });
  const again = await h.item('Iceberg Lettuce');
  check('undo puts it back exactly, and takes it out of the thrown-away count', back.status === 200 && again && again.qty === 2 && again.unit === 'lb' && again.id === lettuce.id && (await h.state()).waste === 0, [back, again]);
  check('restore refuses a row that is not an item', (await h.call('POST', '/api/items/restore', { item: { id: 'nope', name: 'x' } })).status === 400);

  await h.call('PATCH', '/api/items/' + lettuce.id, { qty: 0, out: true });
  const re = await h.add('Iceberg Lettuce', { unit: 'lb', restock: true });
  check('ticking it off the list restocks the 2 lb bought last time, not 1', (await h.item('Iceberg Lettuce')).qty === 2, [re.data, await h.item('Iceberg Lettuce')]);

  await h.add('Diapers', { auto: true });
  await h.add('Toothpaste', { auto: true });
  const d = await h.item('Diapers'), t = await h.item('Toothpaste');
  check('added by hand without picking a room: diapers go to Kids and toothpaste to Bathroom', d.area === 'Kids' && t.area === 'Bathroom', [d, t]);
  await h.add('Diaper Genie Refill', { area: 'Home', category: 'General' });
  check('a room picked by hand is respected', (await h.item('Diaper Genie Refill')).area === 'Home');

  const typed = await h.say('bought milk');
  let log = (await h.state()).log;
  check('a typed message is logged as typed, with the name of what changed', log[0].source === 'text' && /added Milk/.test(log[0].summary), log[0]);
  const c = typed.data.changes[0];
  await h.call('DELETE', '/api/items/' + c.id + '?undo=1');
  log = (await h.state()).log;
  check('an undone change shows in the log as taken back', /took back adding Milk/.test(log[0].summary), log[0]);
}

// ---- 4. asking which one, and amounts (bugs 12, 19) ----
{
  const h = await home();
  await h.add('Ground Chicken', { qty: 1, unit: 'lb', category: 'Meat' });
  await h.add('Chicken Thighs', { qty: 2, unit: 'lb', category: 'Meat' });
  const r = await h.say("We're out of chicken");
  check('"we\'re out of chicken" with two kinds at home asks which, and changes nothing', /which one/i.test(r.data.reply) && /ground chicken/.test(r.data.reply) && /chicken thighs/.test(r.data.reply) && (await h.item('Ground Chicken')).qty === 1, r.data);
  const r2 = await h.say("we're out of ground chicken");
  check('named in full, it is done without asking', (await h.item('Ground Chicken')).qty === 0 && (await h.item('Chicken Thighs')).qty === 2, r2.data);

  const six = A.saidAmount({ action: 'add', name: 'Protein Shakes', quantity: 6, unit: 'pack' }, 'got a 6 pack of protein shakes, oat milk 64 fl oz and 2 bananas');
  const oat = A.saidAmount({ action: 'add', name: 'Oat Milk', quantity: 1, unit: 'L' }, 'got a 6 pack of protein shakes, oat milk 64 fl oz and 2 bananas');
  const ban = A.saidAmount({ action: 'add', name: 'Bananas', quantity: 2, unit: 'pcs' }, 'got a 6 pack of protein shakes, oat milk 64 fl oz and 2 bananas');
  check('"a 6 pack of protein shakes" is 6, not 6 packs', six.quantity === 6 && six.unit === 'pcs', six);
  check('"oat milk 64 fl oz" is 1.89 L, not 1 L', oat.unit === 'L' && Math.abs(oat.quantity - 1.89) < 0.02, oat);
  check('an amount that was read right is left alone', ban.quantity === 2 && ban.unit === 'pcs', ban);
  const byChat = A.enrich({ action: 'add', name: 'Greek Yogurt', quantity: 1, unit: 'pcs', area: 'Kitchen', category: 'Dairy', shelfLifeDays: 30, warn: '' }, null, '');
  const byBill = A.enrich({ action: 'add', name: 'Greek Yogurt', quantity: 1, unit: 'pcs', area: 'Kitchen', category: 'Dairy', shelfLifeDays: 14, warn: '' }, null, 'GREEK YOGURT 5.99');
  check('Greek yogurt keeps the same number of days by chat and by receipt', byChat.shelfLifeDays === byBill.shelfLifeDays && byChat.shelfLifeDays > 0, [byChat.shelfLifeDays, byBill.shelfLifeDays]);
}

const failed = results.filter((r) => !r[0]);
for (const [ok, name, detail] of results) console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + name + (ok ? '' : '\n        ' + detail));
console.log('\n' + (results.length - failed.length) + ' of ' + results.length + ' acceptance checks pass');
if (process.argv.includes('--json')) console.log(JSON.stringify({ pass: results.length - failed.length, total: results.length }));
process.exit(failed.length ? 1 : 0);
