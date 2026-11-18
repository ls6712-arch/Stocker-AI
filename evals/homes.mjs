// Separate homes: each friend gets a personal code, and each code opens its own private home.
// Every check has its opposite: what a code must open, and what it must never reach.
// Runs the Worker's real code and real SQL against an in-memory database. No network and no model calls:
// the model stand-in refuses every call, and the phone push service is a stand-in that only records what was sent.
//
//   node --no-warnings evals/homes.mjs
import fs from 'fs';
import path from 'path';
import { webcrypto } from 'node:crypto';
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
const DAY = new Date().toISOString().slice(0, 10);
const TABLES = ['items', 'purchases', 'log', 'extras', 'pics', 'spend', 'settings', 'feedback', 'push_subs', 'reminders', 'turns', 'cases', 'eval_runs', 'eval_trials', 'facts', 'memo', 'prices', 'saves'];

// the parts under test; on a version without separate homes they do not exist, and every check that needs them fails
let A, built = true;
try { A = await loadAgent(['scopeSql', 'sessionToken', 'unionAll']); } catch (e) { built = false; A = await loadAgent([]); }

function world() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  let calls = 0;
  const env = { APP_PIN: 'test1234', TEST_DATES: 'on', DB: d1(db), AI: { run: async () => { calls++; throw new Error('4006: you have used up your daily free allocation of 10,000 neurons'); } }, TEXT_MODEL: 'none', ASSETS: { fetch: async () => new Response('') } };
  // one person on one phone: their own cookies and their own network address
  const person = (ip) => {
    const p = { cookie: '' };
    p.call = async (method, pth, body) => {
      const res = await A.default.fetch(new Request('https://stocker.test' + pth, { method, headers: { cookie: p.cookie, 'content-type': 'application/json', origin: 'https://stocker.test', 'x-today': DAY, 'cf-connecting-ip': ip }, body: body ? JSON.stringify(body) : undefined }), env);
      return { status: res.status, data: await res.json().catch(() => ({})), res };
    };
    p.open = async (code, name) => {
      const r = await p.call('POST', '/api/login', { pin: code, name });
      if (r.status === 200) p.cookie = r.res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
      return r;
    };
    p.add = (name, o = {}) => p.call('POST', '/api/apply', { source: 'hand', bought: DAY, actions: [{ action: 'add', name, quantity: o.qty || 1, unit: o.unit || 'pcs', area: 'Kitchen', category: 'Pantry', warn: '', expiry: '', shelfLifeDays: 0, finishDays: o.finishDays || 10 }] });
    p.state = async () => ({ items: [], extras: [], log: [], learnt: {}, ...(await p.call('GET', '/api/items')).data });
    p.names = async () => ((await p.state()).items || []).map((i) => i.name).sort();
    p.say = (text) => p.call('POST', '/api/chat', { text });
    return p;
  };
  const count = (t) => { try { return db.prepare('SELECT COUNT(*) AS n FROM ' + t).get().n; } catch (e) { return -1; } };
  return { db, env, person, modelCalls: () => calls, count };
}
const invite = async (owner, name) => (await owner.call('POST', '/api/homes', { name })).data;

// ---- 1. a personal code opens a home of its own ----
{
  const w = world(), owner = w.person('10.0.0.1'), asha = w.person('10.0.0.2'), ben = w.person('10.0.0.3'), stranger = w.person('10.0.0.9');
  const first = await owner.open('test1234', 'Sush');
  check('the owner still opens her own home with her passcode', first.status === 200 && (await owner.state()).owner === true, first.data);
  check('the owner\'s sign-in from before this change still works (same cookie as before)', built && owner.cookie.includes('pk=' + (await A.sessionToken(w.env))), owner.cookie.slice(0, 20));

  const a = await invite(owner, 'Asha'), b = await invite(owner, 'Ben');
  check('the owner makes a personal code for a friend', /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(a.code || '') && !!a.id, a);
  check('two friends never get the same code', a.code && b.code && a.code !== b.code && a.id !== b.id, [a, b]);
  const dump = () => w.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => JSON.stringify(w.db.prepare('SELECT * FROM ' + t.name).all())).join('\n');
  check('the code itself is not kept anywhere in the database', !!a.code && !dump().includes(a.code) && !dump().includes(a.code.replace('-', '')), null);
  check('the friend\'s name is kept, so the owner can tell the homes apart', dump().includes('Asha'), null);

  const wrong = await stranger.open('ZZZZ-ZZZZ', 'Mallory');
  check('a made-up code opens nothing', wrong.status === 401 && wrong.data.error === 'wrong_pin', wrong.data);
  check('nobody gets in without signing in', (await stranger.call('GET', '/api/items')).status === 401, null);
  const inA = await asha.open(String(a.code || 'none'), 'Asha');
  check('a friend opens Stocker with her code', inA.status === 200 && (await asha.call('GET', '/api/items')).status === 200, inA.data);
  const loose = await w.person('10.0.0.4').open(String(b.code || 'none').toLowerCase().replace('-', ' '), 'Ben');
  check('the code works typed in small letters and without the dash', loose.status === 200, loose.data);
  await ben.open(String(b.code || 'none'), 'Ben');
  const sa = await asha.state();
  check('a friend\'s home starts empty and is marked as not the owner\'s', sa.owner === false && Array.isArray(sa.items) && sa.items.length === 0, sa);

  // ---- 2. homes never see each other ----
  await owner.add('Whole Milk');
  const before = Object.fromEntries(TABLES.map((t) => [t, w.count(t)]));
  await asha.add('Basmati Rice');
  await asha.say('bought eggs');
  await ben.add('Bread');
  await asha.call('POST', '/api/extras', { text: 'Apples' });
  check('Asha sees only what Asha added', JSON.stringify(await asha.names()) === JSON.stringify(['Basmati Rice', 'Eggs']), await asha.names());
  check('Ben sees only what Ben added', JSON.stringify(await ben.names()) === JSON.stringify(['Bread']), await ben.names());
  check('the owner sees only her own things', JSON.stringify(await owner.names()) === JSON.stringify(['Whole Milk']), await owner.names());
  check('a shopping list entry stays in the home that wrote it', (await asha.state()).extras.length === 1 && (await ben.state()).extras.length === 0 && (await owner.state()).extras.length === 0, null);
  const logOf = async (p) => ((await p.state()).log || []).map((l) => l.summary).join(' | ');
  check('the activity of one home never shows in another', /rice/i.test(await logOf(asha)) && !/rice|eggs/i.test(await logOf(ben)) && !/rice|eggs|bread/i.test(await logOf(owner)), [await logOf(asha), await logOf(ben), await logOf(owner)]);
  const yes = await asha.say('do we have rice?'), no = await ben.say('do we have rice?');
  check('"do we have rice?" is answered from the asker\'s own home', /^You have .*basmati rice/i.test(yes.data.reply || '') && /not tracked at home/.test(no.data.reply || ''), [yes.data.reply, no.data.reply]);

  await asha.call('POST', '/api/profile', { personas: ['mom'], adults: 1, kids: 1, members: [{ name: 'Leo', kind: 'child', allergies: ['Peanuts'] }] });
  await asha.add('Peanut Butter');
  await ben.add('Peanut Butter');
  const pa = ((await asha.state()).items.find((i) => i.name === 'Peanut Butter') || {}).warn, pb = ((await ben.state()).items.find((i) => i.name === 'Peanut Butter') || {}).warn;
  check('an allergy set in one home flags peanut butter there', /peanut/i.test(pa || ''), pa);
  check('and flags nothing in a home that has no such allergy', !pb && !(await ben.state()).profile && !(await owner.state()).profile, [pb, (await ben.state()).profile]);
  await asha.call('POST', '/api/dish', { dish: 'lemon rice', items: [{ name: 'Basmati Rice', quantity: 1 }] });
  check('a dish one home taught is not known in another', ((await asha.state()).learnt.dishes || []).includes('lemon rice') && !((await ben.state()).learnt.dishes || []).length && !((await owner.state()).learnt.dishes || []).length, (await asha.state()).learnt);
  const after = Object.fromEntries(TABLES.map((t) => [t, w.count(t)]));
  const moved = TABLES.filter((t) => t !== 'settings' && before[t] !== after[t]);
  check('nothing two friends did added or removed a single row in the owner\'s home', !moved.length, moved);
  check('an undo in one home cannot reach an item in another', (await ben.call('POST', '/api/items/restore', { item: { ...(await owner.state()).items[0], qty: 99 } })).status >= 200 && (await owner.state()).items[0].qty !== 99 && (await owner.names()).length === 1, (await owner.state()).items);

  // every query in the code, when run for a friend's home, names only that home's own tables
  if (built) {
    const src = fs.readFileSync(path.join(ROOT, 'src/index.js'), 'utf8').split('\n// GROCERY-START')[0];
    const sqls = [...src.matchAll(/(["'`])((?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\b[^"'`]*?)\1/g)].map((m) => m[2]).filter((s) => !/\b(homes|accounts|waitlist|signin_codes|photo_trials)\b/.test(s)); // the owner's own tables are never run for a home: see the refusals below
    const bare = new RegExp('\\b(?:FROM|INTO|UPDATE|JOIN|TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?|ON)\\s+(?:' + TABLES.join('|') + ')\\b', 'i');
    const leaks = sqls.filter((s) => bare.test(A.scopeSql(s, 'abc123'))), pointed = sqls.filter((s) => /h_abc123_/.test(A.scopeSql(s, 'abc123'))).length;
    check('every query in the code is pointed at the friend\'s own tables (' + pointed + ' queries read)', pointed > 150 && !leaks.length, leaks.slice(0, 3));
    check('and it makes no difference how a query is typed (small letters, extra spaces)', A.scopeSql('select * from  items join purchases on 1 where 1', 'abc123') === 'select * from  h_abc123_items join h_abc123_purchases on 1 where 1', A.scopeSql('select * from  items join purchases on 1', 'abc123'));
    let refused = false; try { A.scopeSql('SELECT * FROM homes', 'abc123'); } catch (e) { refused = true; }
    check('a friend\'s home can never read the list of homes or codes', refused, null);
    const shut = ['SELECT * FROM accounts', 'SELECT email FROM waitlist', 'DELETE FROM signin_codes', 'select * from Accounts a join homes h on 1'].filter((q) => { try { A.scopeSql(q, 'abc123'); return false; } catch (e) { return true; } });
    check('nor who signed up, who is waiting, or a sign-in code on its way', shut.length === 4, shut);
    const closed = ['INSERT INTO photo_trials (photo) VALUES (1)', 'SELECT * FROM notes_new_feature', 'select * from items join Some_Shared_Table on 1'].filter((q) => { try { A.scopeSql(q, 'abc123'); return false; } catch (e) { return true; } });
    check('fail closed: a table that is not a home table (the owner\'s photo trials, a new feature\'s table nobody listed) is refused for a home, not read or written in the shared database', closed.length === 3, closed);
    let upsert = ''; try { upsert = A.scopeSql("INSERT INTO settings (k, v) VALUES ('a', 1) ON CONFLICT(k) DO UPDATE SET v = excluded.v", 'abc123'); } catch (e) { upsert = 'refused: ' + e.message; }
    check('opposite: an ordinary home query that updates on conflict still runs, pointed at the home', /INTO h_abc123_settings/.test(upsert) && /DO UPDATE SET v/.test(upsert), upsert);
  } else { check('every query in the code is pointed at the friend\'s own tables', false, 'not built'); check('and it makes no difference how a query is typed (small letters, extra spaces)', false, 'not built'); check('a friend\'s home can never read the list of homes or codes', false, 'not built'); }
  const cols = (t) => w.db.prepare('PRAGMA table_info(' + t + ')').all().map((c) => c.name + ':' + c.type + ':' + c.notnull + ':' + c.pk).sort().join(',');
  const mine = w.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'h\\_%\\_items' ESCAPE '\\'").all().map((t) => t.name.replace(/items$/, ''));
  const uneven = mine.flatMap((pre) => TABLES.filter((t) => cols(pre + t) !== cols(t)).map((t) => pre + t));
  check('a friend\'s home has the same tables and columns as the owner\'s, so every feature works there', mine.length === 2 && !uneven.length, [mine, uneven]);

  // ---- 3. what belongs to the owner alone ----
  check('a friend cannot make codes or see who else is testing', (await asha.call('POST', '/api/homes', { name: 'Eve' })).status === 403 && (await asha.call('GET', '/api/homes')).status === 403, null);
  const list = await owner.call('GET', '/api/homes');
  check('the owner sees her list of friends\' homes, without their codes', list.status === 200 && (list.data.homes || []).length === 2 && !JSON.stringify(list.data).includes(a.code) && (list.data.homes || []).some((h) => h.name === 'Asha'), list.data);
  const used = (list.data.homes || []).find((h) => h.name === 'Asha') || {};
  check('and how much each has used it: Asha has 3 things at home and has said 2 things', used.items === 3 && used.turns === 2 && used.seen === DAY && used.off === false, used);
  check('a friend cannot open the scorecard or the review of misses', (await asha.call('GET', '/api/scorecard')).status === 403 && (await asha.call('GET', '/api/review')).status === 403 && (await asha.call('GET', '/api/feedback')).status === 403, null);
  await asha.call('POST', '/api/scorecard/run', {});
  check('a friend cannot start or stop a test run', w.count('eval_runs') === 0 && (await asha.call('POST', '/api/scorecard/stop', {})).status === 403, w.count('eval_runs'));
  check('the owner still opens the scorecard and the review', (await owner.call('GET', '/api/scorecard')).status === 200 && (await owner.call('GET', '/api/review')).status === 200, null);

  // ---- 4. the owner learns from what friends found wrong ----
  await asha.say('we finished the oat milk');
  await asha.call('POST', '/api/feedback', { kind: 'down', said: 'we finished the oat milk', reply: 'x', route: 'update' });
  const rev = (await owner.call('GET', '/api/review')).data;
  const ex = (rev.groups || []).flatMap((g) => g.examples).find((e) => e.said === 'we finished the oat milk');
  check('a miss a friend flagged reaches the owner\'s review, marked with whose home it came from', !!ex && ex.from === 'Asha', rev.groups);
  const turnsAll = ((await owner.call('GET', '/api/scorecard')).data.health || [])[0] || {};
  check('the weekly numbers count every home\'s chats (3 from Asha, 1 from Ben)', turnsAll.turns === 4, turnsAll);
  const verdict = await owner.call('POST', '/api/review', { id: ex && ex.id, home: ex && ex.home, label: 'update' });
  const rev2 = (await owner.call('GET', '/api/review')).data;
  check('the owner\'s verdict on it becomes a test case and clears it from the queue', verdict.status === 200 && (rev2.cases || []).some((c) => c.said === 'we finished the oat milk') && !(rev2.groups || []).flatMap((g) => g.examples).some((e) => e.said === 'we finished the oat milk'), rev2);

  // ---- 5. the AI allowance is one pot: once it is empty, no home spends another call finding that out ----
  const c0 = w.modelCalls();
  await asha.say('we had lemon chicken with capers for dinner');
  const c1 = w.modelCalls();
  await ben.say('we had lemon chicken with capers for dinner');
  check('one home finds the allowance empty; the next home does not try again', c1 > c0 && w.modelCalls() === c1, [c0, c1, w.modelCalls()]);
  const still = await ben.say('bought oats');
  check('and plain messages keep working there', (still.data.changes || []).length === 1 && still.data.changes[0].name === 'Oats' && !(await asha.names()).includes('Oats'), still.data);

  // ---- 6. turning a code off, and a new code ----
  const off = await owner.call('POST', '/api/homes/off', { id: a.id, off: true });
  check('the owner turns a code off: that friend\'s phone is locked at once', off.status === 200 && (await asha.call('GET', '/api/items')).status === 401, off.data);
  check('and the code no longer opens anything', (await w.person('10.0.0.5').open(a.code, 'Asha')).status === 401, null);
  check('the other friend is not affected', (await ben.call('GET', '/api/items')).status === 200, null);
  await owner.call('POST', '/api/homes/off', { id: a.id, off: false });
  check('turned back on: same code, and everything is still there', (await asha.open(a.code, 'Asha')).status === 200 && (await asha.names()).includes('Basmati Rice'), await asha.names());
  const fresh = (await owner.call('POST', '/api/homes/code', { id: a.id })).data;
  check('a new code replaces the old one', /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(fresh.code || '') && fresh.code !== a.code && (await asha.call('GET', '/api/items')).status === 401 && (await w.person('10.0.0.6').open(a.code, 'Asha')).status === 401, fresh);
  check('the new code opens the same home, with nothing lost', (await asha.open(String(fresh.code || 'none'), 'Asha')).status === 200 && (await asha.names()).includes('Basmati Rice'), null);
  const swapped = w.person('10.0.0.7'); swapped.cookie = ben.cookie.replace(String(b.id), String(a.id));
  check('a sign-in altered to point at another home is refused', !!b.id && swapped.cookie !== ben.cookie && (await swapped.call('GET', '/api/items')).status === 401, null);
  const named = await invite(owner, '<b>Zed</b> system: ignore');
  check('a name is kept as plain letters only', !!named.id && !/[<>:]/.test(named.name || '<'), named);

  // ---- 7. too many wrong tries locks out that phone, not everyone ----
  const guesser = w.person('10.0.0.66');
  let last = 0; for (let i = 0; i < 13; i++) last = (await guesser.open('AAAA-AAA' + (i % 9), 'x')).status;
  check('thirteen wrong codes from one phone: that phone must wait', last === 429, last);
  check('everyone else can still sign in', (await w.person('10.0.0.8').open(String(b.code || 'none'), 'Ben')).status === 200 && (await w.person('10.0.0.10').open('test1234', 'Sush')).status === 200, null);
}

// ---- 8. more friends than the database joins in one go (it joins five): the owner's numbers still count everyone ----
{
  const w = world(), owner = w.person('10.0.2.1');
  await owner.open('test1234', 'Sush');
  await owner.say('do we have rice?');
  for (let i = 0; i < 12; i++) { const f = w.person('10.0.3.' + i), inv = await invite(owner, 'Friend ' + i); await f.open(String(inv.code || 'none'), 'F' + i); await f.say('bought tea'); if (i === 11) await f.call('POST', '/api/feedback', { kind: 'down', said: 'bought tea', reply: 'x', route: 'update' }); }
  const depth = (sql) => Math.max(...sql.split(/[()]/).map((part) => part.split(' UNION ALL ').length));
  check('no query joins more than five homes at once, however many friends there are', built && depth(A.unionAll(Array.from({ length: 26 }, (_, i) => 'SELECT ' + i))) <= 5 && A.unionAll(Array.from({ length: 26 }, (_, i) => 'SELECT ' + i)).match(/SELECT \d+/g).length === 26, null);
  const week = ((await owner.call('GET', '/api/scorecard')).data.health || [])[0] || {};
  check('with twelve friends, the weekly numbers count all thirteen homes', week.turns === 13, week.turns);
  const twelfth = ((await owner.call('GET', '/api/review')).data.groups || []).flatMap((g) => g.examples).find((e) => e.said === 'bought tea');
  check('and a miss from the twelfth friend still reaches the review', !!twelfth && twelfth.from === 'Friend 11', twelfth);
  const all = (await owner.call('GET', '/api/homes')).data.homes || [];
  check('and the list shows every friend with their own numbers', all.length === 12 && all.every((h) => h.items === 1 && h.turns === 1), all.slice(0, 2));
  check('the bell on the owner\'s Today counts that miss', (await owner.state()).review === 1, (await owner.state()).review);
  for (let i = 12; i < 25; i++) await invite(owner, 'Friend ' + i);
  check('a twenty-sixth friend is refused, plainly', (await owner.call('POST', '/api/homes', { name: 'One more' })).data.error === 'full' && ((await owner.call('GET', '/api/homes')).data.homes || []).length === 25, null);
}

// ---- 9. reminders go to each home about its own things only ----
{
  const w = world(), owner = w.person('10.0.1.1'), asha = w.person('10.0.1.2'), ben = w.person('10.0.1.3');
  await owner.open('test1234', 'Sush');
  const a = await invite(owner, 'Asha'), b = await invite(owner, 'Ben');
  await asha.open(String(a.code || 'none'), 'Asha'); await ben.open(String(b.code || 'none'), 'Ben');
  // Asha has coffee that is due tomorrow by her own pace; Ben and the owner have nothing due
  await asha.add('Coffee'); await ben.add('Tea'); await owner.add('Sugar');
  const due = new Date(Date.now() - 9 * 86400000).toISOString().slice(0, 10);
  const tbl = (w.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'h\\_%\\_items' ESCAPE '\\'").all().map((t) => t.name).find((n) => w.db.prepare('SELECT COUNT(*) AS n FROM ' + n + " WHERE name = 'Coffee'").get().n)) || 'items';
  w.db.prepare('UPDATE ' + tbl + " SET essential = 1, learned = 1, finish_days = 10, bought = ? WHERE name = 'Coffee'").run(due);
  const sent = [], realFetch = globalThis.fetch;
  globalThis.fetch = async (u, o) => { sent.push({ to: String(u), bytes: (o && o.body && o.body.byteLength) || 0 }); return new Response(null, { status: 201 }); };
  const phone = async (p, n) => {
    const pair = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const b64 = (buf) => Buffer.from(buf).toString('base64url');
    return p.call('POST', '/api/push', { endpoint: 'https://fcm.googleapis.com/fcm/send/' + n, keys: { p256dh: b64(await webcrypto.subtle.exportKey('raw', pair.publicKey)), auth: b64(webcrypto.getRandomValues(new Uint8Array(16))) }, tz: 'UTC', quiet: true });
  };
  const pa = await phone(asha, 'asha-phone'), pb = await phone(ben, 'ben-phone'), po = await phone(owner, 'owner-phone');
  const preA = (await asha.call('GET', '/api/remind')).data.preview, preB = (await ben.call('GET', '/api/remind')).data.preview;
  check('Asha\'s reminder is about her coffee; Ben has nothing to hear about', pa.status === 200 && pb.status === 200 && po.status === 200 && !!preA && /Coffee/.test(preA.title) && !preB, [preA, preB, pa.data]);
  sent.length = 0;
  // the job runs every minute: the owner's home on the hour, then one friend's home a minute
  const at = new Date(DAY + 'T20:00:00Z').getTime();
  // (the same job also looks for an eval run; there is none here, and its note about that is not part of this check)
  const quiet = console.error; console.error = () => {};
  const hour = async () => { for (let m = 0; m < 5; m++) { const waits = []; await A.default.scheduled({ scheduledTime: at + m * 60000 }, w.env, { waitUntil: (p) => waits.push(p) }); await Promise.all(waits); } };
  await hour();
  globalThis.fetch = realFetch;
  check('over the hour the job sends exactly one reminder, to Asha\'s phone', sent.length === 1 && /asha-phone$/.test(sent[0].to), sent);
  check('and never to a phone in another home', !sent.some((s) => /ben-phone|owner-phone/.test(s.to)), sent);
  const offHome = await owner.call('POST', '/api/homes/off', { id: a.id, off: true });
  w.db.prepare('UPDATE ' + tbl.replace(/items$/, 'push_subs') + ' SET last_day = NULL').run();
  w.db.prepare('DELETE FROM ' + tbl.replace(/items$/, 'reminders')).run();
  sent.length = 0; globalThis.fetch = async (u) => { sent.push({ to: String(u) }); return new Response(null, { status: 201 }); };
  await hour();
  globalThis.fetch = realFetch;
  console.error = quiet;
  check('a home whose code is turned off gets no reminders', offHome.status === 200 && sent.length === 0, sent);
}

const failed = results.filter((r) => !r[0]);
for (const [ok, name, detail] of results) console.log((ok ? '  ok   ' : '  FAIL ') + name + (detail ? '\n         ' + detail : ''));
console.log('\n' + (results.length - failed.length) + ' of ' + results.length + ' separate-homes checks pass');
if (process.argv.includes('--json')) console.log(JSON.stringify({ pass: results.length - failed.length, total: results.length }));
process.exit(failed.length ? 1 : 0);
