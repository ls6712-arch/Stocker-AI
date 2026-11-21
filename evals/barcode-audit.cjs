// Barcode photos, read in a real browser by the app's own reader (public/vendor/html5-qrcode.min.js), the way the camera does:
// each photo becomes a short run of camera frames (a little shake, light and sensor noise each frame), read one by one.
// Two ways of taking a code are scored on the same frames:
//   before: the first thing read with 6 or more digits (the app until 20 Nov 2026)
//   after:  public/barcode.js: ZXing-C++ (WebAssembly) on a wider box, then the same valid number twice, check digit and UPC-E
//           written out. (A phone with its own barcode reader, Android Chrome, uses that instead; this browser has none.)
// The photos are made by scripts/barcode-images.mjs and scripts/barcode-damage.py (made-up numbers, drawn and damaged by code).
//   node evals/barcode-audit.cjs [--frames=8] [--only=dim] [--fresh]   (--fresh: the first-sight set; score it, never tune on it)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const FRESH = process.argv.includes('--fresh');
const IMG = path.join(__dirname, FRESH ? 'barcode-images-fresh' : 'barcode-images');
const FRAMES = Number((process.argv.find((a) => a.startsWith('--frames=')) || '').split('=')[1]) || 8;
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
// the photos are not kept in git (12 MB): they are drawn the first time, the same every time
if (!fs.existsSync(path.join(IMG, 'photos.json'))) {
  const { execFileSync } = require('child_process');
  execFileSync('node', [path.join(ROOT, 'scripts/barcode-images.mjs')].concat(FRESH ? ['--set=fresh'] : []), { stdio: 'inherit' });
  execFileSync('python3', [path.join(ROOT, 'scripts/barcode-damage.py')].concat(FRESH ? ['fresh'] : []), { stdio: 'inherit' });
}
const photos = JSON.parse(fs.readFileSync(path.join(IMG, 'photos.json'), 'utf8')).filter((p) => !ONLY || p.damage === ONLY);
const TYPES = { '.wasm': 'application/wasm', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.html': 'text/html' };

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const file = u === '/' ? null : u.startsWith('/img/') ? path.join(IMG, u.slice(5)) : u === '/vendor/html5-qrcode.min.js' ? path.join(__dirname, 'vendor-before', 'html5-qrcode.min.js') : path.join(ROOT, 'public', u);
  if (!file) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><div id="r" style="display:none"></div><script src="/vendor/html5-qrcode.min.js"></script><script src="/barcode.js"></script>'); }
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(base + '/');
  await page.waitForFunction(() => window.Html5Qrcode && window.StockerCode);
  const rows = [];
  const t0 = Date.now();
  for (const p of photos) {
    // the frames for one photo: seeded by the file name, so every run sees the same frames
    const reads = await page.evaluate(async ({ src, frames, seed }) => {
      let s = 0; for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
      const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      const img = new Image(); img.src = src; await img.decode();
      const F = window.Html5QrcodeSupportedFormats;
      const q = new window.Html5Qrcode('r', { verbose: false, formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E] });
      // the part of the camera picture each reader looks at: before, html5-qrcode's 260 x 150 box in a phone-wide viewfinder;
      // after, the app's new box (the middle 90% across, 60% down)
      const crop = (c, fw, fh) => { const o = document.createElement('canvas'); o.width = Math.round(c.width * fw); o.height = Math.round(c.height * fh); o.getContext('2d').drawImage(c, (c.width - o.width) / 2, (c.height - o.height) / 2, o.width, o.height, 0, 0, o.width, o.height); return o; };
      const before = [], after = [];
      for (let i = 0; i < frames; i++) {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const x = c.getContext('2d', { willReadFrequently: true });
        const sc = 1 + (rnd() - 0.5) * 0.06;
        x.setTransform(sc, (rnd() - 0.5) * 0.02, (rnd() - 0.5) * 0.02, sc, (rnd() - 0.5) * 12, (rnd() - 0.5) * 12);
        x.filter = 'brightness(' + (0.92 + rnd() * 0.16) + ')';
        x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height), a = d.data;
        for (let k = 0; k < a.length; k += 4) { const n = (rnd() + rnd() + rnd() - 1.5) * 14; a[k] += n; a[k + 1] += n; a[k + 2] += n; }
        x.putImageData(d, 0, 0);
        const old = crop(c, 0.76, 0.58);
        const blob = await new Promise((r) => old.toBlob(r, 'image/jpeg', 0.9));
        try { const r = await q.scanFileV2(new File([blob], 'f.jpg', { type: 'image/jpeg' }), false); before.push({ text: r.decodedText, format: (r.result && r.result.format && r.result.format.formatName) || '' }); }
        catch (e) { before.push(null); }
        const t = performance.now();
        const got = await window.StockerCode.read(crop(c, 0.9, 0.6), { noNative: true });
        after.push(got[0] ? { ...got[0], ms: performance.now() - t } : { ms: performance.now() - t });
      }
      return { before, after };
    }, { src: '/img/' + p.file, frames: FRAMES, seed: p.file });
    const policy = await page.evaluate((reads) => {
      const firstOld = reads.before.find((r) => r && r.text.replace(/\D/g, '').length >= 6);
      const st = window.StockerCode.Steady(2);
      let took = '', at = -1;
      reads.after.forEach((r, i) => { if (!took && r.text) { const c = st.feed(r.text, r.format); if (c) { took = c; at = i; } } });
      return { before: firstOld ? firstOld.text.replace(/\D/g, '') : '', after: took, at };
    }, reads);
    const same = (got) => got === p.code || got === p.gtin || got === '0' + p.gtin || got === p.gtin.replace(/^0/, '');
    rows.push({ ...p, ms: Math.round(reads.after.reduce((t, r) => t + r.ms, 0) / reads.after.length), before: policy.before ? (same(policy.before) ? 'right' : 'wrong') : 'none', after: policy.after ? (same(policy.after) ? 'right' : 'wrong') : 'none', beforeCode: policy.before, afterCode: policy.after, at: policy.at, raw: reads.after.filter((r) => r.text).map((r) => r.text + '/' + r.format).slice(0, 4) });
  }
  await browser.close(); server.close();

  const tally = (list, k) => ({ right: list.filter((r) => r[k] === 'right').length, wrong: list.filter((r) => r[k] === 'wrong').length, none: list.filter((r) => r[k] === 'none').length });
  const byDamage = {};
  for (const r of rows) (byDamage[r.damage] = byDamage[r.damage] || []).push(r);
  console.log('damage        photos  before right/wrong/none   after right/wrong/none');
  for (const [k, list] of Object.entries(byDamage)) { const b = tally(list, 'before'), a = tally(list, 'after'); console.log(k.padEnd(14) + String(list.length).padStart(5) + '   ' + [b.right, b.wrong, b.none].join(' / ').padEnd(24) + [a.right, a.wrong, a.none].join(' / ')); }
  const B = tally(rows, 'before'), A = tally(rows, 'after');
  console.log('\nall           ' + String(rows.length).padStart(5) + '   ' + [B.right, B.wrong, B.none].join(' / ').padEnd(24) + [A.right, A.wrong, A.none].join(' / '));
  for (const r of rows.filter((x) => x.before === 'wrong' || x.after === 'wrong')) console.log('  wrong: ' + r.file + ' before ' + r.beforeCode + ' after ' + r.afterCode + ' reads ' + JSON.stringify(r.raw));
  const out = { at: new Date().toISOString(), frames: FRAMES, before: B, after: A, byDamage: Object.fromEntries(Object.entries(byDamage).map(([k, l]) => [k, { before: tally(l, 'before'), after: tally(l, 'after') }])), seconds: Math.round((Date.now() - t0) / 1000), msPerFrame: Math.round(rows.reduce((t, r) => t + r.ms, 0) / rows.length), firstSteadyFrame: rows.filter((r) => r.at >= 0).reduce((t, r, _, l) => t + (r.at + 1) / l.length, 0).toFixed(2) };
  console.log('reading time per frame (after): ' + out.msPerFrame + ' ms; frames until a steady read: ' + out.firstSteadyFrame);
  if (!ONLY) fs.writeFileSync(path.join(__dirname, FRESH ? 'barcode-report-fresh.json' : 'barcode-report.json'), JSON.stringify(out, null, 1));
  // the bar: no wrong product is ever looked up, and the steady read finds at least as many as before minus the thumb-covered ones
  const ok = A.wrong === 0 && A.right >= B.right - (byDamage.thumb || []).length;
  console.log('\nbarcode photos: ' + (ok ? 'PASS' : 'FAIL') + ' (after: ' + A.right + ' right, ' + A.wrong + ' wrong of ' + rows.length + ')');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); server.close(); process.exit(2); });
