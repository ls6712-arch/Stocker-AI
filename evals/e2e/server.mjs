// End-to-end harness: the real Worker (src/index.js) and the app's own pages, on a real SQLite database, with a stand-in model
// whose answers each test chooses. Nothing here reaches Cloudflare or a real model, so a journey can be repeated exactly.
//
//   node --no-warnings evals/e2e/server.mjs [port]     (then: node evals/e2e/journey.cjs)
//
// Test-only routes, never part of the Worker:
//   POST /__script  { rules: [{ when, plan?, answer?, see?, fail? }] }   how the stand-in model answers (first rule whose
//                   `when` regex matches the user's message wins; `plan` for reading an update, `answer` for a reply,
//                   `see` for a photo, `fail: "quota"` to act as if the AI allowance ran out)
//   GET  /__seen    everything the model was sent since the last /__script
//   POST /__sql     { sql, args }  read the database
// With E2E_SIGNUP=1 real sign-in is on, with stand-ins for Google's keys and the mail service (E2E_HOMES_MAX sets the cap):
//   GET  /__token?email=…   a sign-in token as Google would give it, signed with the stand-in key
//   GET  /__mail            every message the mail stand-in was asked to send
import http from 'http';
import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { loadAgent, ROOT } from '../load.mjs';

const PORT = Number(process.argv[2] || 8811);
const W = await loadAgent(['evalVersion']);
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
// D1 takes an ArrayBuffer for a blob; node:sqlite wants a Uint8Array
const fix = (v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v instanceof ArrayBuffer ? new Uint8Array(v) : v);
const stmt = (sql, args = []) => ({
  bind: (...a) => stmt(sql, a),
  run: async () => { db.prepare(sql).run(...args.map(fix)); return { success: true }; },
  first: async () => db.prepare(sql).get(...args.map(fix)) ?? null,
  all: async () => ({ results: db.prepare(sql).all(...args.map(fix)) }),
});
const DB = { prepare: (sql) => stmt(sql), batch: async (list) => Promise.all(list.map((s) => s.all())) };

let rules = [], seen = [];
const userText = (input) => { const m = (input.messages || []).filter((x) => x.role === 'user').pop(); const c = m ? m.content : input.prompt || ''; return typeof c === 'string' ? c : JSON.stringify(c); };
const AI = {
  run: async (model, input) => {
    const said = userText(input), sys = JSON.stringify(input.messages || '');
    seen.push({ model, said, sys: sys.slice(0, 4000), schema: !!input.response_format });
    const reading = /You keep an inventory/.test(sys), photo = Array.isArray((input.messages || []).find((x) => x.role === 'user')?.content) || !!input.image;
    const r = rules.find((x) => x.when && x.when !== '*' && new RegExp(x.when, 'i').test(said)) || rules.find((x) => x.when === '*');
    if (model === 'image') return { image: '' }; // no pictures are drawn in the harness
    if (r && r.fail === 'quota') throw new Error('4006: you have used up your daily free allocation of 10,000 neurons');
    // the photo pipeline: the detector answers with the rule's boxes, and each cut-out is read in turn from the rule's reads
    if (input.task === 'detect') { const f = rules.find((x) => x.find); return { objects: (f && f.find) || [] }; }
    if (photo && !input.image) { const f = rules.find((x) => x.reads); if (f) { const k = (f.k = (f.k || 0) + 1); return { response: f.reads[k - 1] ?? '' }; } }
    if (photo) return { response: (r && r.see) || '' };
    if (reading) return { response: JSON.stringify(r && r.plan ? { intent: 'update', store: '', purchaseDate: '', currency: '', ...r.plan } : { intent: 'question', store: '', purchaseDate: '', currency: '', actions: [] }) };
    if (/suggest home-cooked dinners/i.test(sys)) return { response: JSON.stringify({ meals: (r && r.meals) || [] }) };
    return { response: (r && r.answer) || 'I am not sure about that one.' };
  },
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.txt': 'text/plain' };
const SITE_HEADERS = Object.fromEntries(fs.readFileSync(path.join(ROOT, 'public/_headers'), 'utf8').split('\n').filter((l) => /^\s+[A-Za-z-]+:/.test(l)).map((l) => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const ASSETS = { fetch: async (req) => {
  let p = decodeURIComponent(new URL(req.url).pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, 'public', path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!f.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return new Response('not found', { status: 404 });
  // The same headers the live site sends (public/_headers, '/*' block), so every walk runs under the real content policy.
  return new Response(fs.readFileSync(f), { headers: { ...SITE_HEADERS, 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' } });
} };
const env = { APP_PIN: 'test1234', TEST_DATES: 'on', DB, AI, ASSETS, TEXT_MODEL: 'big', SMALL_MODEL: 'small', VISION_MODEL: 'vision', SPEECH_MODEL: 'speech', IMAGE_MODEL: 'image', DELEGATE: 'on', CF_VERSION: { id: 'e2e00000' }, PHOTO_PIPELINE: process.env.E2E_PIPELINE || 'off' };

// ---- real sign-in, when asked for: Google's keys and the mail service are stand-ins, so nothing leaves this machine ----
const SIGNUP = !!process.env.E2E_SIGNUP, mail = [];
let mint = null;
if (SIGNUP) {
  const { webcrypto } = await import('node:crypto');
  const b64u = (x) => Buffer.from(x).toString('base64url');
  const pair = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await webcrypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'e2e', alg: 'RS256', use: 'sig' };
  Object.assign(env, { GOOGLE_CLIENT_ID: 'e2e.apps.googleusercontent.com', MAIL_KEY: 'e2e-mail-key', MAIL_FROM: 'Tote <tote@stocker.test>', HOMES_MAX: process.env.E2E_HOMES_MAX || '100', CONTACT: 'hello@stocker.test' });
  mint = async (email) => {
    const now = Math.floor(Date.now() / 1000), name = email.split('@')[0];
    const data = b64u(JSON.stringify({ alg: 'RS256', kid: 'e2e', typ: 'JWT' })) + '.' + b64u(JSON.stringify({ iss: 'https://accounts.google.com', aud: env.GOOGLE_CLIENT_ID, sub: String(email.length) + '0042', email, email_verified: true, given_name: name[0].toUpperCase() + name.slice(1), iat: now - 5, exp: now + 3600 }));
    return data + '.' + b64u(await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(data)));
  };
  globalThis.fetch = async (input, init = {}) => {
    const u = String(typeof input === 'string' ? input : input.url);
    if (/googleapis\.com\/oauth2\/v3\/certs/.test(u)) return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'content-type': 'application/json' } });
    if (/api\.resend\.com\/emails/.test(u)) { const b = JSON.parse(init.body); mail.push({ to: [].concat(b.to)[0], subject: b.subject, text: b.text }); return new Response('{"id":"e2e"}', { status: 200 }); }
    return new Response('no network in the harness', { status: 599 });
  };
}

const body = (req) => new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); });
http.createServer(async (req, res) => {
  const buf = await body(req), url = 'http://127.0.0.1:' + PORT + req.url;
  try {
    if (req.url === '/__script') { const j = JSON.parse(buf.toString() || '{}'); rules = j.rules || []; seen = []; res.end('{"ok":true}'); return; }
    if (req.url === '/__seen') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(seen)); return; }
    if (SIGNUP && req.url.startsWith('/__token')) { res.end(await mint(new URL(url).searchParams.get('email') || 'asha@example.com')); return; }
    if (SIGNUP && req.url === '/__mail') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(mail)); return; }
    if (req.url === '/__sql') { const j = JSON.parse(buf.toString()); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(db.prepare(j.sql).all(...(j.args || [])))); return; }
    const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const r = await W.default.fetch(new Request(url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : buf }), env);
    const h = {}; r.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; });
    const cookies = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    // the Worker marks its cookie Secure; a local test browser on http would drop it, so that one word goes
    if (cookies.length) h['set-cookie'] = cookies.map((c) => c.replace(/;\s*Secure/i, ''));
    res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { console.error(e); res.writeHead(599); res.end(String(e && e.stack)); }
}).listen(PORT, '127.0.0.1', () => console.log('e2e server on http://127.0.0.1:' + PORT));
