// Security of the app as deployed: what the browser is told to allow, which dates a phone may claim, and what a stranger's
// request can reach. Each check has its opposite. Runs the Worker's real code and SQL against an in-memory database.
//
//   node --no-warnings evals/security.mjs
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
const A = await loadAgent(['cleanProfile']);

// ---- 1. what the browser is told to allow (public/_headers) ----
const hdrs = fs.readFileSync(path.join(ROOT, 'public/_headers'), 'utf8');
const csp = (hdrs.match(/Content-Security-Policy:\s*(.+)/) || [])[1] || '';
const dir = (name) => ((csp.split(';').map((x) => x.trim()).find((x) => x.startsWith(name + ' ')) || '').split(/\s+/).slice(1));
// 20 Nov 2026: 'wasm-unsafe-eval' lets the page compile WebAssembly (the barcode reader, /vendor/zxing_reader.wasm, from the app
// itself); it does not allow eval() or new Function() for JavaScript
check('scripts may come only from the app itself and Google sign-in: no inline scripts, no eval (WebAssembly only)', dir('script-src').length && !dir('script-src').includes("'unsafe-inline'") && !dir('script-src').includes("'unsafe-eval'") && dir('script-src').every((s) => s === "'self'" || s === "'wasm-unsafe-eval'" || s.startsWith('https://accounts.google.com/')), dir('script-src'));
check('no plug-ins, no other site may frame the app, forms post only to the app, no <base> tricks', dir('object-src').join() === "'none'" && dir('frame-ancestors').join() === "'none'" && dir('form-action').join() === "'self'" && dir('base-uri').join() === "'none'", csp);
check('the browser is told to use HTTPS only, for a year, including subdomains', /Strict-Transport-Security:\s*max-age=(\d+);\s*includeSubDomains/.test(hdrs) && Number(hdrs.match(/max-age=(\d+)/)[1]) >= 31536000, hdrs);
check('files are never sniffed as another type, and the app is never shown in a frame', /X-Content-Type-Options:\s*nosniff/.test(hdrs) && /X-Frame-Options:\s*DENY/.test(hdrs), null);
check('the camera and microphone are this app\'s only; location and payments are off', /camera=\(self\)/.test(hdrs) && /microphone=\(self\)/.test(hdrs) && /geolocation=\(\)/.test(hdrs) && /payment=\(\)/.test(hdrs), null);
for (const f of fs.readdirSync(path.join(ROOT, 'public')).filter((x) => x.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(ROOT, 'public', f), 'utf8');
  const inline = (html.match(/<script(?![^>]*\bsrc=)[^>]*>/gi) || []).filter((t) => !/type="application\/(ld\+)?json"/i.test(t));
  const handlers = html.match(/\son[a-z]+\s*=\s*["']/gi) || [];
  check(f + ': no inline script and no inline event handler, so the content policy can forbid them', inline.length === 0 && handlers.length === 0, { inline, handlers });
}

for (const f of ['app.js', 'evals-page.js', 'privacy-page.js', 'scorecard-page.js', 'vendor/tote.js']) {
  const js = fs.readFileSync(path.join(ROOT, 'public', f), 'utf8');
  check(f + ': builds no inline event handlers or javascript: links (the policy would block them and the button would go dead)', !/\son[a-z]+=["'\\]|setAttribute\(['"]on|javascript:/.test(js), f);
}
check('the browser walks run under the live headers, so a blocked script fails a walk before it reaches anyone', /public\/_headers/.test(fs.readFileSync(path.join(ROOT, 'evals/e2e/server.mjs'), 'utf8')), null);

// ---- 2. a stranger's request ----
async function home(env = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  const e = { APP_PIN: 'test1234', DB: d1(db), TEXT_MODEL: 'big', VISION_MODEL: 'vision', DELEGATE: 'off', ASSETS: { fetch: async () => new Response('') }, AI: { run: async () => ({ response: '' }) }, ...env };
  const go = async (method, p, { body, headers = {}, cookie = '' } = {}) => {
    const r = await A.default.fetch(new Request('https://stocker.test' + p, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined }), e);
    return { status: r.status, data: await r.json().catch(() => ({})), r };
  };
  const login = await go('POST', '/api/login', { body: { pin: 'test1234', name: 'Sam' }, headers: { origin: 'https://stocker.test' } });
  const cookie = login.r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return { go, cookie, setCookie: login.r.headers.getSetCookie(), db };
}
{
  const h = await home();
  check('the sign-in cookie cannot be read by page scripts, is sent over HTTPS only, and never to another site', h.setCookie.some((c) => /^pk=/.test(c) && /HttpOnly/.test(c) && /Secure/.test(c) && /SameSite=Strict/.test(c)), h.setCookie);
  const cross = await h.go('POST', '/api/items/restore', { cookie: h.cookie, headers: { origin: 'https://evil.example' }, body: {} });
  check('a change asked for by another website is refused, even with the cookie', cross.status === 403, cross.status);
  const anon = await h.go('GET', '/api/items');
  check('opposite: with no sign-in, nothing at home can be read', anon.status === 401, anon.status);
  const big = await h.go('POST', '/api/chat', { cookie: h.cookie, headers: { origin: 'https://stocker.test', 'content-length': '20000000' }, body: { text: 'hi' } });
  check('a request larger than 9 MB is refused before it is read', big.status === 413, big.status);
  const fake = await h.go('POST', '/api/scan/shelf/read', { cookie: h.cookie, headers: { origin: 'https://stocker.test' }, body: { crops: [{ id: 'b1', image: 'javascript:alert(1)' }] } });
  check('the photo routes are closed when the photo pipeline is off', fake.status === 404, fake.status);
}

// ---- 3. the date a phone may claim ----
{
  const day = (offset) => new Date(Date.now() + offset * 86400e3).toISOString().slice(0, 10);
  const add = async (h, today) => {
    await h.go('POST', '/api/apply', { cookie: h.cookie, headers: { origin: 'https://stocker.test', 'x-today': today }, body: { source: 'text', actions: [{ action: 'add', name: 'Milk ' + today, quantity: 1, unit: 'pcs', area: 'Kitchen', category: 'Dairy', sure: true }] } });
    return h.db.prepare('SELECT added FROM items WHERE name = ?').get('Milk ' + today);
  };
  const h = await home();
  const far = await add(h, '2031-01-01');
  check('a phone cannot claim a date years away (the server\'s own date is used instead)', far && far.added === new Date().toISOString().slice(0, 10), far);
  const past = await add(h, '2020-02-02');
  check('  ...nor one years ago', past && past.added === new Date().toISOString().slice(0, 10), past);
  const local = await add(h, day(-1));
  check('opposite: a phone\'s own date a day behind the server (a time zone) is kept', local && local.added === day(-1), local);
  const ahead = await add(h, day(1));
  check('opposite: and a day ahead', ahead && ahead.added === day(1), ahead);
  const t = await home({ TEST_DATES: 'on' });
  const fixed = await add(t, '2026-03-15');
  check('the offline tests may still fix any date, through a setting production does not have', fixed && fixed.added === '2026-03-15', fixed);
  const w = fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8');
  check('  ...and production\'s settings never switch it on', !/TEST_DATES/.test(w), null);
}

const failed = results.filter((r) => !r[0]);
for (const [ok, name, detail] of results) console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '\n     ' + detail));
console.log('\nSecurity: ' + (results.length - failed.length) + ' of ' + results.length + ' checks pass');
if (failed.length) process.exit(1);
