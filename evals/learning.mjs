// Learning test: does Tote really learn a household's pace, remind at the right moment, and keep its mistakes for review?
// Runs the Worker's real code and real SQL against an in-memory database, with the models and the push service replaced by stand-ins.
// No network, no model calls.
//
//   node evals/learning.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'url';
import { loadAgent } from './load.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const NAMES = ['paceFrom', 'remindText', 'digest', 'tick', 'localNow', 'dueSoon', 'review', 'migrate'];


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

// a stand-in for the model: it only has to turn the test sentences into the same shape the real one returns
function fakeModel() {
  const item = (name) => ({ Milk: ['L', 'Dairy'], Eggs: ['pcs', 'Dairy'], Rice: ['kg', 'Pantry'], Bread: ['pcs', 'Bakery'], Coffee: ['pack', 'Pantry'] }[name] || ['pcs', 'Other']);
  const nameIn = (t) => ['Milk', 'Eggs', 'Rice', 'Bread', 'Coffee'].find((n) => t.toLowerCase().includes(n.toLowerCase()));
  return {
    run: async (model, input) => {
      if (!input.response_format) return { response: 'Okay.' };
      const t = input.messages[input.messages.length - 1].content, name = nameIn(t), n = Number((t.match(/\b(\d+)\b/) || [])[1] || 1);
      if (!name) return { response: { intent: 'question', actions: [] } };
      const [unit, category] = item(name);
      const action = /\b(bought|got|picked up)\b/i.test(t) ? 'add' : /\b(out of|finished|used up)\b/i.test(t) ? 'use' : /\bwe have\b/i.test(t) ? 'set' : '';
      if (!action) return { response: { intent: 'question', actions: [] } };
      return { response: { intent: 'update', store: '', purchaseDate: '', currency: '', actions: [{ action, name, quantity: action === 'use' ? 0 : n, unit, area: 'Kitchen', category, daysToFinish: 10, shelfLifeDays: 10, quantityKnown: true }] } };
    },
  };
}

const stats = {}, fails = [];
function note(check, pass, detail) {
  const s = stats[check] || (stats[check] = { pass: 0, total: 0 });
  s.total++;
  if (pass) s.pass++; else fails.push(check + '  ' + JSON.stringify(detail ?? '').slice(0, 300));
}
const day = (n) => new Date(Date.UTC(2026, 2, n)).toISOString().slice(0, 10); // days of March 2026
const at = (n, hour) => new Date(Date.UTC(2026, 2, n, hour));

async function main() {
  const A = await loadAgent(NAMES);

  // ---- 1. the pace estimate on its own ----
  const buys = (...days) => days.map((d) => ({ bought: day(d), qty: 1, unit: 'L', ran_out: null }));
  note('pace: milk bought every 3 days is learned as 3', A.paceFrom(buys(1, 4, 7, 10), 1, 'L').days === 3);
  note('pace: one holiday gap does not move it', A.paceFrom(buys(1, 4, 7, 21, 24, 27), 1, 'L').days === 3, A.paceFrom(buys(1, 4, 7, 21, 24, 27), 1, 'L'));
  note('pace: twice the amount is expected to last twice as long', A.paceFrom(buys(1, 4, 7), 2, 'L').days === 6);
  note('pace: a single purchase teaches nothing yet', A.paceFrom(buys(1), 1, 'L') === null);
  const ran = buys(1, 9); ran[0].ran_out = day(6);
  note('pace: "we ran out" beats the gap to the next purchase', A.paceFrom(ran, 1, 'L').days === 5, A.paceFrom(ran, 1, 'L'));
  note('pace: only recent history counts', A.paceFrom(buys(1, 11, 21, 23, 25, 27, 29, 31), 1, 'L').days === 2);

  // ---- a home to live in ----
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  const env = { APP_PIN: 'test1234', DB: d1(db), AI: fakeModel(), TEXT_MODEL: 'fake', ASSETS: { fetch: async () => new Response('') } };
  const sentPushes = [];
  let pushStatus = 201;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sentPushes.push({ url: String(url), init }); return new Response('', { status: pushStatus }); };
  let cookie = '';
  const call = async (method, p, body, today) => {
    const res = await A.default.fetch(new Request('https://stocker.test' + p, { method, headers: { cookie, 'content-type': 'application/json', origin: 'https://stocker.test', 'x-today': today || day(1) }, body: body ? JSON.stringify(body) : undefined }), env);
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data, res };
  };
  const login = await call('POST', '/api/login', { pin: 'test1234', name: 'Sam' });
  cookie = login.res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const say = (text, n) => call('POST', '/api/chat', { text }, day(n));
  const itemNamed = async (name, n) => (await call('GET', '/api/items', null, day(n))).data.items.find((i) => i.name === name);

  // ---- 2. learning through ordinary use ----
  const first = await say('bought milk', 1);
  note('chat: the first purchase is added without claiming a pace', first.data.changes.length === 1 && !/about every/.test(first.data.reply), first.data);
  const second = await say('bought milk', 4);
  note('chat: after the second purchase I say what I learned', /buy milk about every 3 days/.test(second.data.reply), second.data.reply);
  let milk = await itemNamed('Milk', 4);
  note('chat: the item now carries the learned pace', milk.learned === 1 && milk.finish_days === 3 && milk.bought === day(4), milk);
  const third = await say('bought milk', 7);
  note('chat: I say it once, not every time', !/about every/.test(third.data.reply), third.data.reply);

  await say('bought eggs', 1);
  await say('we are out of eggs', 6);
  const eggs2 = await say('bought eggs', 9);
  const eggs = await itemNamed('Eggs', 9);
  note('ran out: five days of eggs is learned as 5, not the 8 days between shops', eggs.finish_days === 5 && /about every 5 days/.test(eggs2.data.reply), [eggs.finish_days, eggs2.data.reply]);

  await say('we have 2 rice', 2);
  note('"we have" is not a purchase', db.prepare("SELECT COUNT(*) AS n FROM purchases WHERE name_key = 'rice'").get().n === 0);

  const before = db.prepare("SELECT COUNT(*) AS n FROM purchases WHERE name_key = 'milk'").get().n;
  const again = await say('bought milk', 8);
  await call('PATCH', '/api/items/' + again.data.changes[0].id, { qty: again.data.changes[0].prevQty, undo: true }, day(8));
  note('undo: a purchase that was taken back teaches nothing', db.prepare("SELECT COUNT(*) AS n FROM purchases WHERE name_key = 'milk'").get().n === before);

  // ---- 3. reminders ----
  const phone = crypto.createECDH('prime256v1'); phone.generateKeys();
  const auth = crypto.randomBytes(16), b64 = (b) => Buffer.from(b).toString('base64url');
  const sub = (endpoint) => ({ endpoint, keys: { p256dh: b64(phone.getPublicKey()), auth: b64(auth) }, tz: 'UTC' });
  note('phone: an address that is not a push service is refused', (await call('POST', '/api/push', sub('https://evil.example/collect'))).status === 400);
  note('phone: a plain http address is refused', (await call('POST', '/api/push', sub('http://fcm.googleapis.com/fcm/send/abc'))).status === 400);
  const on = await call('POST', '/api/push', sub('https://fcm.googleapis.com/fcm/send/abc123'));
  note('phone: turning reminders on sends a hello', on.status === 200 && on.data.hello === true && sentPushes.length === 1, on.data);

  // open the sealed message the way the phone would, with the phone's own keys
  const open = (p) => {
    const body = Buffer.from(p.init.body), salt = body.subarray(0, 16), keyLen = body[20], from = body.subarray(21, 21 + keyLen), sealed = body.subarray(21 + keyLen);
    const shared = phone.computeSecret(from);
    const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), phone.getPublicKey(), from]), 32));
    const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
    const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
    const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
    d.setAuthTag(sealed.subarray(sealed.length - 16));
    const plain = Buffer.concat([d.update(sealed.subarray(0, sealed.length - 16)), d.final()]);
    return JSON.parse(plain.subarray(0, plain.lastIndexOf(2)).toString('utf8'));
  };
  let hello = null; try { hello = open(sentPushes[0]); } catch (e) { hello = { error: e.message }; }
  note('phone: only the phone can read the message, and it reads correctly', hello.title === 'Reminders are on', hello);
  const header = sentPushes[0].init.headers.authorization || '', jwt = (header.match(/t=([^,]+)/) || [])[1] || '', k = (header.match(/k=(\S+)/) || [])[1] || '';
  const [h64, c64, s64] = jwt.split('.');
  const pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64(Buffer.from(k, 'base64url').subarray(1, 33)), y: b64(Buffer.from(k, 'base64url').subarray(33)) }, format: 'jwk' });
  const claims = JSON.parse(Buffer.from(c64 || 'e30', 'base64url').toString());
  note('phone: the message is signed by this Stocker', !!s64 && crypto.verify('sha256', Buffer.from(h64 + '.' + c64), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(s64, 'base64url')));
  note('phone: the signature names the push service and expires within a day', claims.aud === 'https://fcm.googleapis.com' && claims.exp * 1000 > Date.now() && claims.exp * 1000 < Date.now() + 86400000 && claims.sub === 'https://stocker.test', claims);
  note('phone: the key that signs is never handed to the app', !JSON.stringify((await call('GET', '/api/push')).data).includes('"d"') && !JSON.stringify((await call('GET', '/api/items')).data).includes('jwk'));

  // milk was last bought on the 7th at a 3-day pace, so it is due from the 9th
  const preview = (await call('GET', '/api/remind', null, day(9))).data.preview;
  note('reminder: milk is raised on day 2 of a 3-day pace, saying when', !!preview && /Milk is running low/.test(preview.title) && /My guess: out by tomorrow/.test(preview.body) && preview.actions.length === 2, preview);
  note('reminder: nothing is raised the day after buying', (await call('GET', '/api/remind', null, day(8))).data.preview === null);
  const pushes = () => sentPushes.length;
  let n0 = pushes();
  await A.tick(env, at(9, 12));
  note('reminder: not before five in the afternoon', pushes() === n0);
  await A.tick(env, at(9, 17));
  const sentMsg = pushes() > n0 ? open(sentPushes[sentPushes.length - 1]) : {};
  note('reminder: sent at five, to the phone, with one-tap answers', pushes() === n0 + 1 && /Milk/.test(sentMsg.title || '') && (sentMsg.actions || []).length === 2 && (sentMsg.ids || []).length === 1, sentMsg);
  await A.tick(env, at(9, 18)); await A.tick(env, at(9, 20));
  note('reminder: once a day at most', pushes() === n0 + 1);
  await A.tick(env, at(10, 17));
  note('reminder: an unanswered one is not repeated the next day', pushes() === n0 + 1);
  await A.tick(env, at(11, 17)); await A.tick(env, at(13, 17));
  note('reminder: it is raised again every other day', pushes() === n0 + 3);
  await A.tick(env, at(15, 17));
  const muted = db.prepare("SELECT muted FROM reminders WHERE name_key = 'milk'").get();
  const day15 = pushes() > n0 + 3 ? open(sentPushes[sentPushes.length - 1]) : { title: '' }; // the eggs are due by now, so a reminder may still go out, but not about milk
  note('reminder: after three with no answer I stop asking about it', !/Milk/.test(day15.title + day15.body) && muted && muted.muted === 1, [muted, day15]);
  note('reminder: the app is told which items are quiet', (await call('GET', '/api/items', null, day(15))).data.learnt.muted.includes('milk'));

  // answers
  milk = await itemNamed('Milk', 15);
  await call('POST', '/api/remind', { ids: [milk.id], answer: 'start' }, day(15));
  note('answer: turning it back on works', db.prepare("SELECT muted FROM reminders WHERE name_key = 'milk'").get().muted === 0);
  await call('POST', '/api/remind', { ids: [milk.id], answer: 'still', hour: 20 }, day(15));
  const later = await itemNamed('Milk', 15);
  const after = (await call('GET', '/api/remind', null, day(15))).data.preview;
  note('answer: "still have it" pushes the next reminder back', later.finish_days > 8 && !/Milk/.test(JSON.stringify(after || '')), [later.finish_days, after]);
  await call('POST', '/api/remind', { ids: [eggs.id], answer: 'add', hour: 20 }, day(15));
  note('answer: "add to list" puts it on the list', (await itemNamed('Eggs', 15)).low === 1);
  await call('POST', '/api/remind', { ids: [eggs.id], answer: 'still', hour: 20 }, day(15));
  await call('POST', '/api/remind', { ids: [eggs.id], answer: 'still', hour: 9 }, day(15));
  const early = (await call('GET', '/api/remind', null, day(15))).data;
  note('timing: a few answers are not enough to move the hour', early.hour === 17 && early.learned === false, early);
  await call('POST', '/api/remind', { ids: [eggs.id], answer: 'still', hour: 20 }, day(15));
  const hour = (await call('GET', '/api/remind', null, day(15))).data;
  note('timing: once most answers come at eight in the evening, reminders move to eight', hour.hour === 20 && hour.learned === true, hour);
  await call('POST', '/api/remind', { ids: [milk.id], answer: 'stop' }, day(15));
  await call('POST', '/api/remind', { ids: [milk.id], answer: 'add' }, day(15));
  note('answer: "stop reminding me" stays off until they turn it on', db.prepare("SELECT muted FROM reminders WHERE name_key = 'milk'").get().muted === 2);

  // a phone that has gone away is forgotten
  await say('bought bread', 16); await say('bought bread', 18);
  pushStatus = 410; n0 = pushes();
  await A.tick(env, at(20, 20));
  note('phone: a phone that unsubscribed is forgotten', pushes() === n0 + 1 && db.prepare('SELECT COUNT(*) AS n FROM push_subs').get().n === 0);
  pushStatus = 201;
  const ny = A.localNow('America/New_York', new Date('2026-03-10T21:30:00Z'));
  note('timing: the hour is the phone\'s own local hour', ny.day === '2026-03-10' && ny.hour === 17, ny);

  // ---- 3b. clean notifications, in a fresh home ----
  {
    const db2 = new DatabaseSync(':memory:');
    db2.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
    const env2 = { ...env, DB: d1(db2) };
    let jar = '';
    const call2 = async (method, p, body, today) => {
      const res = await A.default.fetch(new Request('https://stocker.test' + p, { method, headers: { cookie: jar, 'content-type': 'application/json', origin: 'https://stocker.test', 'x-today': today || day(1) }, body: body ? JSON.stringify(body) : undefined }), env2);
      return { status: res.status, data: await res.json().catch(() => ({})), res };
    };
    jar = (await call2('POST', '/api/login', { pin: 'test1234', name: 'Sam' })).res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const say2 = (text, n) => call2('POST', '/api/chat', { text }, day(n));
    const words = (t) => String(t || '').split(/\s+/).filter(Boolean).length;
    const sentStat = (name) => db2.prepare("SELECT COALESCE(SUM(CAST(v AS REAL)), 0) AS n FROM settings WHERE k LIKE ?").get('stat:' + name + ':%').n;
    await say2('bought milk', 1); await say2('bought milk', 4);

    const one = (await call2('GET', '/api/remind', null, day(6))).data.preview || {};
    note('notification: leads with the item and says when, as my guess', /^Milk is running low$/.test(one.title || '') && /my guess/i.test(one.body || '') && /tomorrow/.test(one.body || ''), one);
    note('notification: title and body each under 12 words', !!one.title && words(one.title) < 12 && words(one.body) < 12, one);
    await say2('bought bread', 1); await say2('bought bread', 4);
    const two = (await call2('GET', '/api/remind', null, day(6))).data.preview || {};
    note('notification: two items stay short too', /Milk and Bread are running low/.test(two.title || '') && words(two.title) < 12 && words(two.body) < 12, two);

    pushStatus = 201; let n1 = sentPushes.length;
    await call2('POST', '/api/push', sub('https://fcm.googleapis.com/fcm/send/home2-a'));
    const hi = open(sentPushes[sentPushes.length - 1]);
    note('notification: the hello is short', sentPushes.length === n1 + 1 && words(hi.body) < 12, hi);

    pushStatus = 503; n1 = sentPushes.length;
    await A.tick(env2, at(6, 17));
    pushStatus = 201;
    await A.tick(env2, at(6, 18));
    await A.tick(env2, at(6, 19));
    const got = sentPushes.length > n1 ? open(sentPushes[sentPushes.length - 1]) : {};
    note('phone: a push service hiccup is tried again later that day, then stops', sentPushes.length === n1 + 2 && /Milk/.test(got.title || ''), [sentPushes.length - n1, got]);

    await call2('POST', '/api/push', { ...sub('https://fcm.googleapis.com/fcm/send/home2-b'), quiet: true });
    n1 = sentPushes.length;
    await A.tick(env2, at(8, 17));
    note('phone: each phone hears once that day', sentPushes.length === n1 + 2, sentPushes.length - n1);

    db2.prepare("UPDATE push_subs SET fails = 8 WHERE endpoint LIKE '%home2-a'").run();
    await A.tick(env2, at(10, 17));
    const kept = db2.prepare("SELECT fails FROM push_subs WHERE endpoint LIKE '%home2-a'").get();
    note('phone: a phone that works again is kept, not dropped for old failures', !!kept && kept.fails === 0, kept);

    const milk2 = (await call2('GET', '/api/items', null, day(10))).data.items.find((i) => i.name === 'Milk');
    const added = (await call2('POST', '/api/remind', { ids: [milk2.id], answer: 'add', hour: 17 }, day(10))).data;
    note('answer: a tap on the notification says what it did', /Milk is on your list/.test((added.say || {}).title || '') && Array.isArray(added.before) && added.before.length === 1, added);
    await call2('POST', '/api/remind', { answer: 'undo', of: 'add', before: added.before }, day(10));
    const back = (await call2('GET', '/api/items', null, day(10))).data.items.find((i) => i.name === 'Milk');
    note('answer: Undo from the notification puts it back', back.low === 0 && back.finish_days === milk2.finish_days, back);
    note('counting: an undone "add" is not counted as useful', sentStat('remind_add') === 0, sentStat('remind_add'));
    const still = (await call2('POST', '/api/remind', { ids: [milk2.id], answer: 'still', hour: 17 }, day(10))).data;
    await call2('POST', '/api/remind', { answer: 'undo', of: 'still', before: still.before }, day(10));
    const back2 = (await call2('GET', '/api/items', null, day(10))).data.items.find((i) => i.name === 'Milk');
    note('answer: Undo also takes back "still have it"', back2.finish_days === milk2.finish_days && /later/.test((still.say || {}).title || ''), [back2.finish_days, milk2.finish_days, still.say]);
    db2.prepare("DELETE FROM settings WHERE k LIKE 'stat:remind_sent:%'").run();
    n1 = sentPushes.length;
    await A.tick(env2, at(12, 17));
    note('counting: a reminder on two phones counts each item once', sentPushes.length === n1 + 2 && sentStat('remind_sent') === 1, [sentPushes.length - n1, sentStat('remind_sent')]);
  }

  // ---- 4. learning from conversations ----
  db.exec('DELETE FROM turns');
  const now = new Date().toISOString().slice(0, 10); // turns are stamped by the clock, so the review is asked about the real today
  await say('is there any coffee left, my email is jamie.k@example.com', 20);
  const kept = db.prepare('SELECT * FROM turns ORDER BY id DESC LIMIT 1').get();
  note('review: every turn is kept, with private details removed', !!kept && /\[removed\]/.test(kept.said) && !/jamie/.test(kept.said), kept);
  await call('POST', '/api/feedback', { kind: 'down', said: kept.said, reply: kept.reply, route: kept.route }, day(20));
  await call('POST', '/api/feedback', { kind: 'wanted', said: kept.said, detail: 'add coffee to my list' }, day(20));
  const bought = await say('bought 3 coffee', 20);
  await call('POST', '/api/feedback', { kind: 'undo', said: 'bought 3 coffee', reply: 'Coffee', route: 'update' }, day(20));
  await say('finished the bread', 20);
  await say('no I meant the milk', 20);
  let rv = (await call('GET', '/api/review', null, now)).data;
  const kinds = Object.fromEntries(rv.groups.map((g) => [g.kind, g]));
  note('review: a "not right" is grouped with what they wanted instead', !!kinds.quiet && kinds.quiet.examples[0].wanted === 'add coffee to my list', rv.groups);
  note('review: an undo counts as a miss', !!kinds.wrong && kinds.wrong.examples.some((e) => /coffee/.test(e.said)), kinds.wrong);
  note('review: a correction marks the reply before it', kinds.wrong && kinds.wrong.examples.some((e) => /finished the bread/.test(e.said) && e.outcome === 'corrected'), kinds.wrong);
  note('review: this week is counted', rv.weeks[0].turns === 4 && rv.weeks[0].missed === 3, rv.weeks[0]);
  note('review: the app is told how many need a look', (await call('GET', '/api/items', null, day(20))).data.review === 3);
  const target = kinds.quiet.examples[0];
  await call('POST', '/api/review', { id: target.id, label: 'list', name: 'coffee' }, day(20));
  rv = (await call('GET', '/api/review', null, now)).data;
  note('review: deciding what should have happened makes a test case', rv.cases.length === 1 && rv.cases[0].expect === 'list' && rv.cases[0].name === 'coffee' && !rv.groups.some((g) => g.kind === 'quiet'), rv.cases);
  await call('POST', '/api/review', { id: kinds.wrong.examples[0].id, label: 'ok' }, day(20));
  rv = (await call('GET', '/api/review', null, now)).data;
  note('review: "not a mistake" clears it without a test case', rv.cases.length === 1 && rv.groups.reduce((t, g) => t + g.count, 0) === 1, rv.groups);
  note('review: nothing a person typed changed a rule', bought.status === 200 && db.prepare("SELECT COUNT(*) AS n FROM settings WHERE k LIKE 'rule%' OR k LIKE 'prompt%'").get().n === 0);

  globalThis.fetch = realFetch;
  const rows = Object.entries(stats).map(([check, s]) => ({ check, ...s }));
  const passed = rows.filter((r) => r.pass === r.total).length;
  console.log('Learning: ' + passed + ' / ' + rows.length + ' checks passed\n');
  for (const r of rows) console.log((r.pass === r.total ? '  ok  ' : 'FAIL  ') + r.check);
  if (fails.length) { console.log('\nFailures:'); for (const f of fails) console.log('  ' + f); }
  process.exitCode = fails.length ? 1 : 0;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
