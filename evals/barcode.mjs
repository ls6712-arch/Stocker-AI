// Barcode numbers, offline and exact (20 Nov 2026): the check digit, UPC-E written out, the other length of the same product, and
// a typed slip told apart from an unknown product. The Worker's rules and the app's (public/barcode.js) must agree.
// The product database is a stand-in; the numbers are made up with valid (or deliberately wrong) check digits.
//   node --no-warnings evals/barcode.mjs
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { DatabaseSync } from 'node:sqlite';
import { loadAgent, ROOT } from './load.mjs';

const A = await loadAgent(['gtinOf', 'gtinTwin']);
const box = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public/barcode.js'), 'utf8'), { globalThis: box, window: box });
const C = box.StockerCode;
const results = [];
const check = (name, pass, detail) => results.push([!!pass, name, pass ? '' : JSON.stringify(detail ?? '').slice(0, 300)]);

// ---- 1. the rules, in the Worker and in the app ----
const CASES = [
  // [typed or read, format the camera reported, what to look up ('' = refuse)]
  ['8901063012349', 'EAN13', '8901063012349'], ['8901063012348', 'EAN13', ''], ['890106301234', '', ''],
  ['041196910223', 'UPCA', '041196910223'], ['0041196910223', 'UPCA', '041196910223'], ['0041196910223', 'EAN13', '041196910223'], ['041196910224', 'UPCA', ''],
  ['96385074', 'EAN8', '96385074'], ['96385075', 'EAN8', ''],
  ['04241007', 'UPCE', '042000004107'], ['0042000004107', 'UPCE', '042000004107'], ['0190000000008', 'UPCE', ''], ['14241007', '', ''],
  ['10012345000017', '', '10012345000017'], ['10012345000018', '', ''],
  ['8901 0630 1234 9', '', '8901063012349'],
];
for (const [raw, f, want] of CASES) {
  const app = C.normal(raw, f);
  check('app: ' + raw + (f ? ' (' + f + ')' : '') + ' -> ' + (want || 'refused'), app === want, app);
  if ((f === 'UPCE' && raw.length !== 8) || (raw.length === 13 && raw[0] === '0')) continue; // the Worker only ever gets what the app sends, or what a person typed
  const w = A.gtinOf(raw);
  check('Worker: ' + raw + ' -> ' + (want || 'refused'), want ? w.code === want : w.bad, w);
}
check('Worker: short in-store codes still go through as before', A.gtinOf('123456').code === '123456', A.gtinOf('123456'));
check('a UPC-A is also filed as the EAN-13 with a 0 in front, and back', A.gtinTwin('041196910223') === '0041196910223' && A.gtinTwin('0041196910223') === '041196910223' && A.gtinTwin('8901063012349') === '', null);
check('app: a typed slip is told apart from a number that is not a barcode length', C.typedWrong('8901063012348') && !C.typedWrong('8901063012349') && !C.typedWrong('12345'), null);
{
  const st = C.Steady(2);
  const a = st.feed('8901063012349', 'EAN13'), b = st.feed('8901063012348', 'EAN13'), c = st.feed('8901063012349', 'EAN13');
  check('steady read: one frame is never enough, and a misread in between does not count', a === '' && b === '' && c === '8901063012349', [a, b, c]);
  const s2 = C.Steady(2);
  const d = s2.feed('8901063012349', 'EAN13'), e = s2.feed('4006040000129', 'EAN13'), f = s2.feed('8901063012349', 'EAN13');
  check('steady read: two different valid numbers in a row start the count again', d === '' && e === '' && f === '', [d, e, f]);
}

// ---- 2. through the Worker, with a stand-in product database ----
function d1(db) {
  const fix = (v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v);
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), run: async () => { db.prepare(sql).run(...args.map(fix)); return { success: true }; }, first: async () => db.prepare(sql).get(...args.map(fix)) ?? null, all: async () => ({ results: db.prepare(sql).all(...args.map(fix)) }) });
  return { prepare: (sql) => stmt(sql), batch: async (list) => Promise.all(list.map((s) => s.all())) };
}
{
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  const env = { APP_PIN: 'test1234', TEST_DATES: 'on', DB: d1(db), TEXT_MODEL: 'big', DELEGATE: 'off', ASSETS: { fetch: async () => new Response('') }, AI: { run: async () => { throw new Error('4006: you have used up your daily free allocation of 10,000 neurons'); } } };
  let cookie = '';
  const call = async (method, p, body) => { const res = await A.default.fetch(new Request('https://stocker.test' + p, { method, headers: { cookie, 'content-type': 'application/json', origin: 'https://stocker.test', 'x-today': '2026-11-20' }, body: body ? JSON.stringify(body) : undefined }), env); return { status: res.status, res, data: await res.json().catch(() => ({})) }; };
  const login = await call('POST', '/api/login', { pin: 'test1234', name: 'Sam' });
  cookie = login.res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  // the database files this US pack under its 13-digit form only, as Open Food Facts often does
  const asked = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (u) => { const m = String(u).match(/product\/(\d+)\.json/); asked.push(m && m[1]); const p = m && m[1] === '0041196910223' ? { product_name: 'Organic Whole Milk', brands: 'Horizon', quantity: '0.5 gal' } : null; return new Response(JSON.stringify(p ? { status: 1, product: p } : { status: 0, status_verbose: 'product not found' }), { status: p ? 200 : 404 }); };
  try {
    let r = await call('GET', '/api/scan/barcode?code=041196910223');
    check('a UPC-A filed only as its EAN-13 is still found (2 lookups)', r.status === 200 && JSON.stringify(r.data.actions || []).includes('Whole Milk') && asked.length === 2, [r.status, r.data, asked]);
    asked.length = 0;
    r = await call('GET', '/api/scan/barcode?code=041196910224');
    check('a number whose check digit is wrong is refused before any lookup', r.status === 400 && r.data.error === 'bad_code' && asked.length === 0, [r.status, r.data, asked]);
    asked.length = 0;
    r = await call('GET', '/api/scan/barcode?code=8901063012349');
    check('an unknown but valid number is "unknown product" (both lengths tried at most once each)', r.status === 404 && r.data.error === 'unknown_product' && asked.length === 1, [r.status, r.data, asked]);
    asked.length = 0;
    r = await call('GET', '/api/scan/barcode?code=04241007');
    check('a typed UPC-E is looked up as its UPC-A, then its EAN-13', asked[0] === '042000004107' && asked[1] === '0042000004107', asked);
  } finally { globalThis.fetch = real; }
}

// ---- 3. the app uses it: the old reader is gone, and the page may compile the new one ----
{
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8'), app = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
  const hdr = fs.readFileSync(path.join(ROOT, 'public/_headers'), 'utf8');
  check('the app loads barcode.js and no longer loads html5-qrcode', /src="\/barcode\.js"/.test(html) && !/html5-qrcode/.test(html) && !/Html5Qrcode/.test(app), null);
  check('the camera loop takes a code only through the steady read', /StockerCode\.Steady\(2\)/.test(app) && /steady\.feed\(/.test(app), null);
  check('a typed number is checked before lookup', /typedWrong\(raw\)/.test(app), null);
  check('the reader files are in the app, and the WebAssembly is the one the loader expects', fs.existsSync(path.join(ROOT, 'public/vendor/zxing_reader.wasm')) && fs.readFileSync(path.join(ROOT, 'public/vendor/zxing-reader.js'), 'utf8').includes('85d46f55d7c86a4d09bb04273367408b19c324f582d040d018aecb25a9a82942'), null);
  check("the page may compile WebAssembly ('wasm-unsafe-eval'), still no JavaScript eval", /script-src[^;]*'wasm-unsafe-eval'/.test(hdr) && !/'unsafe-eval'/.test(hdr), null);
}

const pass = results.filter((r) => r[0]).length;
for (const [ok, name, detail] of results) if (!ok || process.argv.includes('--all')) console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
console.log('\nbarcode numbers: ' + pass + ' / ' + results.length);
process.exit(pass === results.length ? 0 : 1);
