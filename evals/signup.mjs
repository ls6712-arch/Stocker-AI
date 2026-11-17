// Real sign-in: anyone can make a home of their own with Google or a code sent by email, up to a cap.
// Every check has its opposite: what a sign-in must open, and what it must never reach.
// Runs the Worker's real code and real SQL against an in-memory database. No network: Google's public keys and the
// mail service are stand-ins made here, and the model is a stand-in that says what the check chooses.
//
//   node --no-warnings evals/signup.mjs            (add --json for one line of numbers)
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
const CLIENT = 'stocker-test.apps.googleusercontent.com';

// the parts under test; on a version without sign-up they do not exist, and every check that needs them fails
let A, built = true;
try { A = await loadAgent(['acctToken', 'tickHome', 'sessionToken']); } catch (e) { built = false; A = await loadAgent([]); }

// ---- a stand-in for Google: a key pair of our own, and tokens signed with it ----
const b64u = (buf) => Buffer.from(buf).toString('base64url');
async function keyPair(kid) {
  const pair = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  return { kid, priv: pair.privateKey, jwk: { ...jwk, kid, alg: 'RS256', use: 'sig' } };
}
const GOOGLE = await keyPair('g1'), OTHER = await keyPair('g1');
async function idToken(claims = {}, o = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = { alg: o.alg || 'RS256', kid: (o.key || GOOGLE).kid, typ: 'JWT' };
  const body = { iss: 'https://accounts.google.com', aud: CLIENT, sub: '1' + String(claims.email || 'x').length + '0042', email_verified: true, iat: now - 5, exp: now + 3600, given_name: 'Asha', ...claims };
  const data = b64u(JSON.stringify(head)) + '.' + b64u(JSON.stringify(body));
  if (o.alg === 'none') return data + '.';
  const sig = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', (o.key || GOOGLE).priv, new TextEncoder().encode(data));
  return data + '.' + b64u(sig);
}

// ---- the outside world, as far as the Worker can reach it ----
const mail = [], outside = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = String(typeof input === 'string' ? input : input.url);
  outside.push(url);
  if (/googleapis\.com\/oauth2\/v3\/certs/.test(url)) return new Response(JSON.stringify({ keys: [GOOGLE.jwk] }), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' } });
  if (/api\.resend\.com\/emails/.test(url)) { const b = JSON.parse(init.body); mail.push({ to: [].concat(b.to)[0], subject: b.subject, text: b.text, auth: (init.headers || {}).authorization || (init.headers || {}).Authorization }); return new Response(JSON.stringify({ id: 'm' + mail.length }), { status: 200 }); }
  return new Response('no network in this check', { status: 599 });
};
const codeIn = (m) => ((m && m.text.match(/\b(\d{6})\b/)) || [])[1] || '';
const lastMail = (to) => [...mail].reverse().find((m) => m.to === to);

const act = (action, name, quantity, extra = {}) => ({ action, name, note: '', inferred: false, quantity, quantityKnown: true, unit: 'pcs', area: 'Kitchen', category: 'Pantry', expiryDate: '', shelfLifeDays: 30, daysToFinish: 14, price: 0, warn: '', ...extra });
const plan = (actions, intent = 'update') => JSON.stringify({ intent, store: '', purchaseDate: '', currency: '', actions });

function world(vars = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  let calls = 0;
  const env = { APP_PIN: 'test1234', DB: d1(db), TEXT_MODEL: 'big', DELEGATE: 'off', ASSETS: { fetch: async () => new Response('') }, GOOGLE_CLIENT_ID: CLIENT, MAIL_KEY: 'mail-key-for-tests', MAIL_FROM: 'Tote <tote@stocker.test>',
    AI: { run: async (model, input) => { calls++; return { response: /You keep an inventory/.test(JSON.stringify(input)) ? plan([], 'question') : 'You have rice at home.' }; } }, ...vars };
  for (const k of Object.keys(env)) if (env[k] === null) delete env[k];
  const person = (ip) => {
    const p = { cookie: '' };
    p.call = async (method, pth, body, o = {}) => {
      const res = await A.default.fetch(new Request('https://stocker.test' + pth, { method, headers: { cookie: o.cookie ?? p.cookie, 'content-type': 'application/json', origin: o.origin ?? 'https://stocker.test', 'x-today': DAY, 'cf-connecting-ip': ip }, body: body ? JSON.stringify(body) : undefined }), env);
      return { status: res.status, data: await res.json().catch(() => ({})), res };
    };
    const keep = (r) => { if (r.status === 200) p.cookie = r.res.headers.getSetCookie().map((c) => c.split(';')[0]).filter((c) => !/^pk=$/.test(c)).join('; '); return r; };
    p.open = async (code, name) => keep(await p.call('POST', '/api/login', { pin: code, name }));
    p.google = async (claims, o) => keep(await p.call('POST', '/api/signin/google', { credential: typeof claims === 'string' ? claims : await idToken(claims, o) }));
    p.askCode = (email) => p.call('POST', '/api/signin/email', { email });
    p.useCode = async (email, code) => keep(await p.call('POST', '/api/signin/email/check', { email, code }));
    p.email = async (email) => { await p.askCode(email); return p.useCode(email, codeIn(lastMail(email))); };
    p.add = (name, o = {}) => p.call('POST', '/api/apply', { source: 'hand', bought: o.bought || DAY, store: o.store, currency: o.currency, actions: [{ action: 'add', name, quantity: o.qty || 1, unit: o.unit || 'pcs', area: 'Kitchen', category: 'Pantry', warn: '', expiry: '', shelfLifeDays: 0, finishDays: 10, price: o.price || 0 }] });
    p.state = async () => ({ items: [], extras: [], log: [], learnt: {}, ...(await p.call('GET', '/api/items')).data });
    p.names = async () => ((await p.state()).items || []).map((i) => i.name).sort();
    p.say = (text) => p.call('POST', '/api/chat', { text });
    return p;
  };
  const count = (t) => { try { return db.prepare('SELECT COUNT(*) AS n FROM ' + t).get().n; } catch (e) { return -1; } };
  const tables = () => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => t.name);
  const dump = () => tables().map((t) => JSON.stringify(db.prepare('SELECT * FROM ' + t).all())).join('\n');
  return { db, env, person, modelCalls: () => calls, count, tables, dump };
}
const section = async (name, fn) => { try { await fn(); } catch (e) { check(name + ': the checks could run', false, String((e && e.stack) || e).slice(0, 380)); } };

// ---- 1. Google sign-in opens a home of one's own ----
await section('Google sign-in', async () => {
  const w = world(), owner = w.person('10.0.0.1'), asha = w.person('10.0.0.2'), ashaPhone2 = w.person('10.0.0.22'), ben = w.person('10.0.0.3'), stranger = w.person('10.0.0.9');
  await owner.open('test1234', 'Sush');
  await owner.add('Owner Basmati Rice');
  const opt = await stranger.call('GET', '/api/signin/options');
  check('the sign-in screen is told that Google sign-in is on, and which app it is for', opt.status === 200 && opt.data.google === CLIENT && opt.data.places === true, opt.data);
  const first = await asha.google({ email: 'asha@example.com', given_name: 'Asha' });
  check('a person signs in with Google and is let in', first.status === 200 && first.data.ok === true && first.data.fresh === true, first.data);
  const st = await asha.state();
  check('her home is her own and starts empty', (st.items || []).length === 0 && st.owner === false && (st.extras || []).length === 0, { n: (st.items || []).length, owner: st.owner });
  check('  ...and she is greeted by the name Google gave', st.me === 'Asha', st.me);
  await asha.add('Asha Oat Milk');
  const again = await ashaPhone2.google({ email: 'asha@example.com', given_name: 'Asha' });
  check('signing in again on a second phone opens the same home, not a new one', again.status === 200 && again.data.fresh === false && (await ashaPhone2.names()).join() === 'Asha Oat Milk' && w.count('accounts') === 1, [again.data, await ashaPhone2.names(), w.count('accounts')]);
  check('  ...whatever the letters of the address look like', (await w.person('10.0.0.23').google({ email: 'Asha@Example.COM' })).data.fresh === false && w.count('accounts') === 1, w.count('accounts'));
  const b = await ben.google({ email: 'ben@example.com', given_name: 'Ben' });
  await ben.add('Ben Paneer');
  check('a second person gets a second home', b.status === 200 && b.data.fresh === true && w.count('accounts') === 2, b.data);
  check('neither sees the other\'s things', (await asha.names()).join() === 'Asha Oat Milk' && (await ben.names()).join() === 'Ben Paneer', [await asha.names(), await ben.names()]);
  check('the owner\'s home is untouched by sign-ups', (await owner.names()).join() === 'Owner Basmati Rice' && (await owner.state()).owner === true, await owner.names());
  check('opposite: the owner\'s passcode opens the owner\'s home exactly as before (same cookie)', built && owner.cookie.includes('pk=' + (await A.sessionToken(w.env))), owner.cookie.slice(0, 12));
  check('the address is kept once, to sign her in again; Google\'s token itself is not kept', w.dump().includes('asha@example.com') && !w.dump().includes('eyJ'), null);
  for (const [what, pth, method] of [['the scorecard', '/api/scorecard', 'GET'], ['the review of misses', '/api/review', 'GET'], ['the list of homes', '/api/homes', 'GET'], ['making a friend\'s code', '/api/homes', 'POST']]) {
    const r = await asha.call(method, pth, method === 'POST' ? { name: 'X' } : undefined);
    check('a signed-up person cannot reach ' + what, r.status === 403 && r.data.error === 'owner_only', [r.status, r.data]);
  }
  check('nobody gets in without signing in', (await stranger.call('GET', '/api/items')).status === 401, null);
});

// ---- 2. a token that is not really Google's, or not for this app, opens nothing ----
await section('Bad tokens', async () => {
  const w = world(), p = w.person('10.0.1.1');
  const now = Math.floor(Date.now() / 1000);
  const bad = [
    ['a token made for another app', await idToken({ email: 'm@example.com', aud: 'someone-else.apps.googleusercontent.com' })],
    ['a token that has run out', await idToken({ email: 'm@example.com', exp: now - 60 })],
    ['a token from somewhere that is not Google', await idToken({ email: 'm@example.com', iss: 'https://accounts.evil.example' })],
    ['a token signed with another key under the same key name', await idToken({ email: 'm@example.com' }, { key: OTHER })],
    ['a token that says it needs no signature', await idToken({ email: 'm@example.com' }, { alg: 'none' })],
    ['a token whose address Google has not checked', await idToken({ email: 'm@example.com', email_verified: false })],
    ['a token with no address', await idToken({ email: '' })],
    ['a token whose contents were changed after signing', (await idToken({ email: 'm@example.com' })).replace(/\.([^.]+)\./, (m, mid) => '.' + b64u(JSON.stringify({ ...JSON.parse(Buffer.from(mid, 'base64url')), email: 'owner@example.com' })) + '.')],
    ['plain rubbish', 'not.a.token'],
    ['nothing at all', ''],
  ];
  for (const [what, tok] of bad) {
    const r = await p.google(tok);
    check(what + ' opens nothing', r.status === 401 && r.data.error === 'bad_token' && !/pk=[a-z]/.test((r.res.headers.getSetCookie() || []).join()), [r.status, r.data]);
  }
  check('  ...and none of them made a home or an account', w.count('accounts') === 0 && w.count('homes') === 0, [w.count('accounts'), w.count('homes')]);
  check('opposite: Google\'s own token, straight after, is let in', (await p.google({ email: 'm@example.com' })).status === 200, null);
  const off = world({ GOOGLE_CLIENT_ID: null }), q = off.person('10.0.1.2');
  const o = await q.call('GET', '/api/signin/options');
  check('with no Google app set, the screen is told Google sign-in is off', o.status === 200 && o.data.google === '', o.data);
  const r = await q.google({ email: 'm@example.com' });
  check('  ...and a Google token is refused, however good', r.status === 503 && r.data.error === 'signin_off' && off.count('accounts') <= 0, [r.status, r.data]);
  check('opposite: with sign-up off, the owner\'s passcode still opens Stocker', (await q.open('test1234', 'Sush')).status === 200, null);
  const x = await w.person('10.0.1.3').call('POST', '/api/signin/google', { credential: await idToken({ email: 'x@example.com' }) }, { origin: 'https://evil.example' });
  check('another website cannot sign anyone in', x.status === 403, [x.status, x.data]);
});

// ---- 3. the sign-in cookie ----
await section('Cookies', async () => {
  const w = world(), asha = w.person('10.0.2.1'), ben = w.person('10.0.2.2'), thief = w.person('10.0.2.9');
  await asha.google({ email: 'asha@example.com' }); await asha.add('Asha Oat Milk');
  await ben.google({ email: 'ben@example.com' });
  const pk = (asha.cookie.match(/pk=([^;]+)/) || [])[1] || '', benPk = (ben.cookie.match(/pk=([^;]+)/) || [])[1] || '';
  check('the cookie is an account cookie, kept from page scripts and sent only to Stocker', /^a\.[a-z0-9]{6,16}\.\d{4}-\d{2}-\d{2}\.[0-9a-f]{64}$/.test(pk), pk.slice(0, 30));
  const parts = pk.split('.'), bparts = benPk.split('.');
  const swap = ['a', bparts[1], parts[2], parts[3]].join('.');
  check('her cookie with another account\'s name in it opens nothing', (await thief.call('GET', '/api/items', null, { cookie: 'pk=' + swap })).status === 401, null);
  const redated = ['a', parts[1], '2031-01-01', parts[3]].join('.');
  check('her cookie with its date changed opens nothing', (await thief.call('GET', '/api/items', null, { cookie: 'pk=' + redated })).status === 401, null);
  const acct = w.db.prepare("SELECT * FROM accounts WHERE email = 'asha@example.com'").get() || {};
  const old = built ? await A.acctToken(w.env, acct, new Date(Date.now() - 31 * 86400000).toISOString().slice(0, 10)) : '';
  const recent = built ? await A.acctToken(w.env, acct, new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10)) : '';
  check('a cookie more than thirty days old opens nothing, even a real one', !!old && (await thief.call('GET', '/api/items', null, { cookie: 'pk=' + old })).status === 401, old.slice(0, 20));
  check('opposite: a real cookie twenty days old still opens her home', !!recent && (await thief.call('GET', '/api/items', null, { cookie: 'pk=' + recent })).status === 200, recent.slice(0, 20));
  const phone2 = w.person('10.0.2.3'); await phone2.google({ email: 'asha@example.com' });
  const out = await asha.call('POST', '/api/signout/all');
  check('"sign out everywhere" locks every phone of that account', out.status === 200 && (await phone2.call('GET', '/api/items')).status === 401 && (await asha.call('GET', '/api/items', null, { cookie: 'pk=' + pk })).status === 401, out.data);
  check('  ...and nobody else\'s', (await ben.call('GET', '/api/items')).status === 200, null);
  check('opposite: she signs in again and her things are there', (await phone2.google({ email: 'asha@example.com' })).status === 200 && (await phone2.names()).join() === 'Asha Oat Milk', await phone2.names());
});

// ---- 4. a code sent by email ----
await section('Email code', async () => {
  const off = world({ MAIL_KEY: null }), q = off.person('10.0.3.9');
  mail.length = 0;
  const no = await q.askCode('carla@example.com');
  check('with no mail service set, the email code is off and nothing is sent', no.status === 503 && no.data.error === 'email_off' && mail.length === 0 && (await q.call('GET', '/api/signin/options')).data.email === false, [no.status, no.data, mail.length]);

  const w = world(), carla = w.person('10.0.3.1'), dev = w.person('10.0.3.2');
  check('opposite: with a mail service, the screen is told the email code is on', (await carla.call('GET', '/api/signin/options')).data.email === true, null);
  const asked = await carla.askCode('Carla@Example.com');
  const m = lastMail('carla@example.com');
  check('a six-digit code is sent to that address, and only there', asked.status === 200 && mail.length === 1 && /^\d{6}$/.test(codeIn(m)), [asked.data, mail.map((x) => x.to)]);
  check('  ...in Tote\'s voice: short, no emoji, says how long it lasts and what to do if it was not you', !!m && m.text.length < 400 && /10 minutes/.test(m.text) && /ignore/i.test(m.text) && !/[\u{1F300}-\u{1FAFF}]/u.test(m.text) && (m.text.match(/!/g) || []).length <= 1, m && m.text);
  check('  ...and the mail key goes to the mail service, never into the message', !!m && /mail-key-for-tests/.test(m.auth || '') && !/mail-key/.test(m.text + m.subject), m && m.auth);
  const code = codeIn(m);
  check('the code itself is not kept in the database', !!code && !w.dump().includes(code), null);
  const wrong = await dev.useCode('carla@example.com', code === '000000' ? '111111' : '000000');
  check('a wrong code opens nothing', wrong.status === 401 && wrong.data.error === 'wrong_code' && w.count('accounts') === 0, [wrong.status, wrong.data]);
  check('the right code for another address opens nothing', (await dev.useCode('dev@example.com', code)).status === 401, null);
  const ok = await carla.useCode('carla@example.com', code);
  check('the right code opens a home of her own', ok.status === 200 && ok.data.fresh === true && (await carla.state()).owner === false, ok.data);
  check('a code works once: used again, it opens nothing', (await dev.useCode('carla@example.com', code)).status === 401, null);
  await carla.add('Carla Tortillas');
  const viaGoogle = await dev.google({ email: 'carla@example.com' });
  check('the same address through Google later opens the same home', viaGoogle.status === 200 && viaGoogle.data.fresh === false && (await dev.names()).join() === 'Carla Tortillas' && w.count('accounts') === 1, [viaGoogle.data, w.count('accounts')]);

  // five wrong tries and the code is dead
  const eve = w.person('10.0.3.3'), target = 'dana@example.com';
  await w.person('10.0.3.4').askCode(target);
  const real = codeIn(lastMail(target));
  let last = null; for (let i = 0; i < 5; i++) last = await eve.useCode(target, String(100000 + i === Number(real) ? 999999 : 100000 + i));
  const after = await w.person('10.0.3.4').useCode(target, real);
  check('after five wrong tries the code is dead: even the right one then opens nothing', after.status !== 200 && w.db.prepare('SELECT COUNT(*) AS n FROM accounts WHERE email = ?').get(target).n === 0, [last && last.data, after.data]);
  // a code that has run out
  await w.person('10.0.3.5').askCode('eli@example.com');
  const eliCode = codeIn(lastMail('eli@example.com'));
  try { w.db.prepare("UPDATE signin_codes SET expires = ? WHERE email = 'eli@example.com'").run(Date.now() - 1000); } catch (e) {}
  check('a code that has run out opens nothing', !!eliCode && (await w.person('10.0.3.5').useCode('eli@example.com', eliCode)).status === 401, eliCode);
  // not a flood
  const before = mail.length, fl = w.person('10.0.3.6');
  let statuses = []; for (let i = 0; i < 5; i++) statuses.push((await fl.askCode('flo@example.com')).status);
  check('no more than three codes go to one address in ten minutes', mail.length - before === 3 && statuses.slice(3).every((s) => s === 429), [mail.length - before, statuses]);
  const sentBefore = mail.length;
  for (const badAddr of ['not an address', 'a@b', '', 'x@y.z\nBcc: all@example.com', 'a'.repeat(200) + '@example.com']) await fl.askCode(badAddr);
  check('something that is not an address is refused and nothing is sent', mail.length === sentBefore, mail.slice(sentBefore).map((x) => x.to));
  const known = await w.person('10.0.3.7').askCode('carla@example.com'), unknown = await w.person('10.0.3.8').askCode('nobody-yet@example.com');
  check('asking for a code never tells whether an address already has a home', JSON.stringify(known.data) === JSON.stringify(unknown.data) && known.status === unknown.status, [known.data, unknown.data]);
  check('the only places the Worker reached were Google\'s keys and the mail service', outside.every((u) => /googleapis\.com\/oauth2\/v3\/certs|api\.resend\.com\/emails/.test(u)), [...new Set(outside)]);
});

// ---- 5. the cap ----
await section('The cap', async () => {
  const w = world({ HOMES_MAX: '3' }), owner = w.person('10.0.4.1');
  await owner.open('test1234', 'Sush');
  const a = w.person('10.0.4.2'), b = w.person('10.0.4.3'), c = w.person('10.0.4.4'), d = w.person('10.0.4.5');
  await a.google({ email: 'a@example.com' }); await a.add('A Rice');
  await b.email('b@example.com');
  const friend = await owner.call('POST', '/api/homes', { name: 'Friend' });
  check('a friend\'s code counts as a home too', friend.status === 200 && w.count('homes') === 3, [friend.status, w.count('homes')]);
  const full = await d.google({ email: 'd@example.com' });
  check('once the homes are all taken, a new person is told Stocker is full', full.status === 403 && full.data.error === 'full' && full.data.waiting === true, [full.status, full.data]);
  check('  ...no home is made, and their place is kept on the waiting list', w.count('homes') === 3 && w.count('accounts') === 2 && w.db.prepare("SELECT COUNT(*) AS n FROM waitlist WHERE email = 'd@example.com'").get().n === 1, [w.count('homes'), w.count('accounts')]);
  await d.google({ email: 'd@example.com' });
  check('  ...once, however often they try', w.count('waitlist') === 1, w.count('waitlist'));
  const fullMail = await c.email('c@example.com');
  check('the same through an email code', fullMail.status === 403 && fullMail.data.error === 'full' && w.count('waitlist') === 2, [fullMail.status, fullMail.data]);
  check('the sign-in screen is told there are no places', (await d.call('GET', '/api/signin/options')).data.places === false, null);
  check('the owner cannot go past the cap with friends\' codes either', (await owner.call('POST', '/api/homes', { name: 'One more' })).data.error === 'full', null);
  check('opposite: someone who already has a home still signs in when Stocker is full', (await w.person('10.0.4.6').google({ email: 'a@example.com' })).status === 200, null);
  const st = await owner.call('GET', '/api/homes');
  check('the owner sees how many homes there are, how many places are left and who is waiting', st.status === 200 && st.data.max === 3 && (st.data.homes || []).length === 3 && st.data.waiting === 2, { max: st.data.max, n: (st.data.homes || []).length, waiting: st.data.waiting });
  check('  ...and which homes are sign-ups, which cannot be given a code', (st.data.homes || []).filter((h) => h.signup).length === 2 && (await owner.call('POST', '/api/homes/code', { id: ((st.data.homes || []).find((h) => h.signup) || {}).id })).status === 400, st.data.homes);
  const gone = await a.call('POST', '/api/home/delete', { confirm: 'delete' });
  const now = await d.google({ email: 'd@example.com' });
  check('opposite: when someone deletes their home, a place opens for the next person', gone.status === 200 && now.status === 200 && now.data.fresh === true && w.count('waitlist') === 1, [gone.data, now.data]);
  // one network cannot fill the cap by itself
  const w2 = world(), spam = w2.person('10.0.4.99');
  let made = 0; for (let i = 0; i < 8; i++) if ((await spam.google({ email: 'spam' + i + '@example.com', sub: '77' + i })).status === 200) made++;
  check('one phone or network cannot make home after home: it is stopped after a few', made >= 1 && made <= 5 && w2.count('homes') === made, made);
  check('opposite: someone on another network still signs up meanwhile', (await w2.person('10.0.4.98').google({ email: 'fine@example.com' })).status === 200, null);
});

// ---- 6. a home's share of the AI allowance ----
await section('AI share', async () => {
  const w = world({ AI_HOME_DAY: '3', AI_ALL_DAY: '1000' }), owner = w.person('10.0.5.1'), a = w.person('10.0.5.2'), b = w.person('10.0.5.3');
  await owner.open('test1234', 'Sush'); await a.google({ email: 'a@example.com' }); await b.google({ email: 'b@example.com' });
  for (const p of [owner, a, b]) await p.add('Rice');
  const ASK = 'what could go nicely with the rice for a light supper, do you think?';
  const used = async (p, text = ASK) => { const n = w.modelCalls(); const r = await p.say(text); return { calls: w.modelCalls() - n, r }; };
  const first = await used(a);
  check('a signed-up home\'s question that needs the model gets the model', first.calls >= 1 && first.r.status === 200, [first.calls, first.r.data]);
  await used(a); await used(a);
  const fourth = await used(a);
  check('past its daily share, a home\'s question no longer reaches the model', fourth.calls === 0, [fourth.calls, fourth.r.data]);
  check('  ...and Tote says so plainly, instead of failing or inventing', fourth.r.status === 200 && typeof fourth.r.data.reply === 'string' && fourth.r.data.reply.length > 0, [fourth.r.status, fourth.r.data]);
  const plain = await a.say('add milk');
  check('  ...and plain messages still work with the share used up', plain.status === 200 && (await a.names()).includes('Milk'), [plain.data, await a.names()]);
  check('opposite: another home\'s share is untouched', (await used(b)).calls >= 1, null);
  check('opposite: the owner\'s home is not held to a signed-up home\'s share', (await used(owner)).calls >= 1 && (await used(owner)).calls >= 1 && (await used(owner)).calls >= 1 && (await used(owner)).calls >= 1, null);

  const w2 = world({ AI_HOME_DAY: '50', AI_ALL_DAY: '4' }), o2 = w2.person('10.0.5.4'), c = w2.person('10.0.5.5'), d = w2.person('10.0.5.6');
  await o2.open('test1234', 'Sush'); await c.google({ email: 'c@example.com' }); await d.google({ email: 'd@example.com' });
  for (const p of [o2, c, d]) await p.add('Rice');
  const used2 = async (p) => { const n = w2.modelCalls(); const r = await p.say(ASK); return { calls: w2.modelCalls() - n, r }; };
  await used2(c); await used2(c); await used2(d); await used2(d);
  const over = await used2(c), overD = await used2(d), overO = await used2(o2);
  check('past the day\'s ceiling for all homes together, no home reaches the model: the bill has a top', over.calls === 0 && overD.calls === 0 && overO.calls === 0, [over.calls, overD.calls, overO.calls]);
  check('  ...and every home still gets an answer from code', over.r.status === 200 && overO.r.status === 200, [over.r.status, overO.r.status]);
});

// ---- 7. deleting a home ----
await section('Delete my home', async () => {
  const w = world(), owner = w.person('10.0.6.1'), a = w.person('10.0.6.2'), b = w.person('10.0.6.3');
  await owner.open('test1234', 'Sush'); await owner.add('Owner Basmati Rice');
  await a.google({ email: 'a@example.com' }); await a.add('A Secret Chocolate'); await a.say('add milk');
  await b.google({ email: 'b@example.com' }); await b.add('B Paneer');
  const kept = a.cookie;
  check('before: her things are in the database', w.dump().includes('A Secret Chocolate'), null);
  const half = await a.call('POST', '/api/home/delete', {});
  check('deleting needs the word, so one stray tap deletes nothing', half.status === 400 && (await a.names()).includes('A Secret Chocolate'), [half.status, half.data]);
  const tablesBefore = w.tables().length;
  const gone = await a.call('POST', '/api/home/delete', { confirm: 'delete' });
  check('she deletes her home', gone.status === 200 && gone.data.ok === true, gone.data);
  check('  ...and everything of hers is gone from the database: her things, what she typed, her address', !w.dump().includes('A Secret Chocolate') && !w.dump().includes('a@example.com') && w.tables().length < tablesBefore, w.tables().length);
  check('  ...and her old sign-in opens nothing', (await a.call('GET', '/api/items', null, { cookie: kept })).status === 401, null);
  check('  ...and nobody else lost anything', (await b.names()).join() === 'B Paneer' && (await owner.names()).join() === 'Owner Basmati Rice', [await b.names(), await owner.names()]);
  const back = await w.person('10.0.6.4').google({ email: 'a@example.com' });
  check('opposite: she can sign up again later, and starts empty', back.status === 200 && back.data.fresh === true, back.data);
  const own = await owner.call('POST', '/api/home/delete', { confirm: 'delete' });
  check('the owner\'s own home cannot be deleted this way', own.status === 400 && (await owner.names()).join() === 'Owner Basmati Rice', [own.status, own.data]);
  check('nobody deletes a home without being signed in to it', (await w.person('10.0.6.9').call('POST', '/api/home/delete', { confirm: 'delete' })).status === 401, null);
});

// ---- 8. what the newer rounds keep is per home too ----
await section('Per home', async () => {
  const w = world(), owner = w.person('10.0.7.1'), a = w.person('10.0.7.2'), b = w.person('10.0.7.3');
  await owner.open('test1234', 'Sush'); await a.google({ email: 'a@example.com' }); await b.google({ email: 'b@example.com' });
  await a.add('Whole Milk', { unit: 'L', price: 62, currency: 'INR', store: 'Blinkit' });
  const ho = await a.call('POST', '/api/handoff', { store: 'Blinkit' });
  const sa = await a.state(), sb = await b.state(), so = await owner.state();
  check('a home\'s price memory is its own', (sa.items || []).some((i) => i.paid) && w.count('prices') === 0 && !(sb.items || []).some((i) => i.paid), [w.count('prices'), (sa.items || []).map((i) => i.paid)]);
  check('a list handed to a store is remembered for that home only', ho.status === 200 && sa.handoff && sa.handoff.store === 'Blinkit' && !sb.handoff && !so.handoff, [sa.handoff, sb.handoff, so.handoff]);
  await a.call('POST', '/api/profile', { personas: ['mom'], adults: 2, kids: 1, house: ['palm-oil'], members: [{ name: 'Leo', kind: 'child', allergies: ['Peanuts'] }] });
  const pb = (await b.state()).profile || {}, po = (await owner.state()).profile || {};
  check('a home\'s people, allergies and House rules are its own', !JSON.stringify(pb).includes('Leo') && !JSON.stringify(po).includes('Leo') && JSON.stringify((await a.state()).profile || {}).includes('Leo'), [pb, po]);
  check('opposite: the owner\'s review of misses can still see every home, as the privacy notice says', (await owner.call('GET', '/api/review')).status === 200, null);
});

// ---- 9. a hundred homes ----
await section('A hundred homes', async () => {
  const w = world({ HOMES_MAX: '100' }), owner = w.person('10.0.8.1');
  await owner.open('test1234', 'Sush');
  let made = 0;
  for (let i = 0; i < 100; i++) { const p = w.person('10.1.' + Math.floor(i / 200) + '.' + (i % 200)); if ((await p.google({ email: 'home' + i + '@example.com', sub: '9' + i })).status === 200) made++; if (i === 99) { await p.add('Last Home Rice'); await p.say('add milk'); } }
  check('a hundred people sign up and each gets a home', made === 100 && w.count('homes') === 100, [made, w.count('homes')]);
  check('the hundred-and-first is told Stocker is full', (await w.person('10.2.0.1').google({ email: 'late@example.com' })).data.error === 'full', null);
  const rv = await owner.call('GET', '/api/review'), sc = await owner.call('GET', '/api/homes'), it = await owner.call('GET', '/api/items');
  check('with a hundred homes the owner\'s pages still open: the review, the list of homes and her own home', rv.status === 200 && sc.status === 200 && (sc.data.homes || []).length === 100 && it.status === 200, [rv.status, sc.status, it.status]);
  // reminders: every home with a phone gets a turn within the hour
  try { w.db.prepare('UPDATE homes SET phones = 1').run(); } catch (e) {}
  const seen = new Set();
  if (built) {
    const base = Date.UTC(2026, 10, 18, 9, 0, 0);
    const spy = { ...w.env, DB: { prepare: (sql) => { const m = /\bh_([a-z0-9]{6,16})_push_subs\b/.exec(sql); if (m) seen.add(m[1]); return w.env.DB.prepare(sql); }, batch: (l) => w.env.DB.batch(l) } };
    for (let min = 1; min < 60; min++) await A.tickHome(spy, new Date(base + min * 60000)).catch(() => {});
  }
  check('within one hour, reminders are checked for every one of the hundred homes, not only the first 59', seen.size === 100, seen.size);
});

// ---- 10. the pages people see ----
await section('Pages', async () => {
  const read = (f) => { try { return fs.readFileSync(path.join(ROOT, 'public', f), 'utf8'); } catch (e) { return ''; } };
  const app = read('index.html'), priv = read('privacy.html');
  check('there is a privacy notice', priv.length > 1500, priv.length);
  check('  ...that says what is kept, that the maker can read what is typed, where the AI runs and how to delete everything', /email/i.test(priv) && /can read/i.test(priv) && /Cloudflare/i.test(priv) && /delete/i.test(priv) && /Open Food Facts/i.test(priv), null);
  check('  ...and never promises that a food is safe', !/\bis safe\b|allergy[- ]safe|guarantee/i.test(priv), null);
  check('  ...in Tote\'s voice: no emoji, home words', !/[\u{1F300}-\u{1FAFF}]/u.test(priv) && !/\binventory\b|\bSKU\b/i.test(priv.replace(/<[^>]+>/g, ' ')), null);
  check('the sign-in screen links to the privacy notice before anyone signs in', /href="\/privacy\.html"/.test((app.match(/<div class="gate"[\s\S]*?<div class="shell"/) || [''])[0]), null);
  check('the sign-in screen has a place for the Google button and for an email code', /id="gBtn"/.test(app) && /id="mailForm"/.test(app), null);
  check('opposite: the code field for the owner and friends is still there', /id="pin"/.test(app) && /id="gateForm"/.test(app), null);
  check('the household menu lets a signed-up person delete their home', /id="menuDelete"/.test(app) && /\/api\/home\/delete/.test(app), null);
  check('Google\'s script is loaded only from Google, and only when sign-in is shown', /https:\/\/accounts\.google\.com\/gsi\/client/.test(app) && !/<script[^>]+src="https:\/\/accounts\.google\.com/.test(app), null);
});

globalThis.fetch = realFetch;
const passed = results.filter((r) => r[0]).length;
if (process.argv.includes('--json')) console.log(JSON.stringify({ pass: passed, total: results.length }));
else {
  for (const [ok, name, detail] of results) console.log((ok ? '  ok   ' : '  FAIL ') + name + (detail ? '\n         ' + detail : ''));
  console.log('\n' + passed + ' of ' + results.length + ' sign-up checks pass');
}
if (!process.argv.includes('--baseline')) process.exit(passed === results.length ? 0 : 1);
