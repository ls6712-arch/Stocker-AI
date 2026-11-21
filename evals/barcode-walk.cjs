// The barcode sheet in a phone-sized browser, with the camera fed a photo (Chromium's stand-in camera plays a video made from a
// barcode photo in evals/barcode-images), against the real Worker and pages under the live content policy (evals/e2e/server.mjs).
// Checks: the camera reads a dim and a tilted pack and looks up the right number; a thumb over the bars looks up nothing; a typed
// number that does not add up is caught before any lookup; a good typed number is looked up; no content-policy errors.
//   npm run test:barcode:walk
const { chromium } = require('playwright');
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = 8817, BASE = 'http://127.0.0.1:' + PORT + '/';
const IMG = path.join(__dirname, 'barcode-images');
const results = [];
const check = (name, pass, detail) => { results.push([!!pass, name]); console.log((pass ? 'PASS ' : 'FAIL ') + name + (pass ? '' : '  ' + JSON.stringify(detail ?? '').slice(0, 300))); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tote-cam-'));
function video(photo) {
  const out = path.join(tmp, photo.replace(/\.jpg$/, '.y4m'));
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-loop', '1', '-i', path.join(IMG, photo), '-t', '4', '-r', '10', '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2', '-pix_fmt', 'yuv420p', out]);
  return out;
}

(async () => {
  if (!fs.existsSync(path.join(IMG, 'photos.json'))) { execFileSync('node', [path.join(ROOT, 'scripts/barcode-images.mjs')], { stdio: 'inherit' }); execFileSync('python3', [path.join(ROOT, 'scripts/barcode-damage.py')], { stdio: 'inherit' }); }
  const srv = spawn('node', ['--no-warnings', path.join(__dirname, 'e2e/server.mjs'), String(PORT)], { stdio: 'ignore' });
  await wait(2500);
  await fetch(BASE + '__products', { method: 'POST', body: JSON.stringify({ '8901063012349': { product_name: 'Aloo Bhujia', brands: 'Haldiram', quantity: '400 g' }, '041196910223': { product_name: 'Organic Whole Milk', brands: 'Horizon', quantity: '0.5 gal' } }) });
  try {
    for (const [photo, want, label] of [['photo-8901063012349-dim.jpg', '8901063012349', 'a dim pack (Indian EAN-13)'], ['photo-041196910223-tilt-12.jpg', '041196910223', 'a tilted pack (US UPC-A)'], ['photo-8901063012349-thumb.jpg', '', 'a thumb over the bars']]) {
      const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + video(photo)] });
      const c = await b.newContext({ viewport: { width: 390, height: 820 }, permissions: ['camera'] });
      const p = await c.newPage();
      const csp = [], looked = [];
      p.on('console', (m) => { if (/Content Security Policy|CompileError|wasm/i.test(m.text())) csp.push(m.text()); });
      p.on('request', (r) => { const m = r.url().match(/\/api\/scan\/barcode\?code=(\d+)/); if (m) looked.push(m[1]); });
      await p.goto(BASE); await wait(800);
      await p.fill('#who', 'Sush'); await p.fill('#pin', 'test1234'); await p.click('#gateForm button'); await wait(1500);
      await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
      await p.click('#tellSnap'); await wait(400); await p.click('#capCode');
      const t0 = Date.now();
      if (want) {
        await p.waitForFunction(() => !document.getElementById('codeDlg').open, null, { timeout: 8000 }).catch(() => {});
        await wait(800);
        check('camera: ' + label + ' is read and the right number looked up (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)', looked.length === 1 && looked[0] === want, looked);
        check('  ...and the camera is off afterwards', await p.evaluate(() => !document.querySelector('#reader video')), null);
      } else {
        await wait(4000);
        check('camera: ' + label + ': nothing is looked up and the sheet stays open', looked.length === 0 && (await p.evaluate(() => document.getElementById('codeDlg').open)), looked);
        // typed numbers, on the same sheet
        await p.fill('#codeInput', '8901063012348'); await p.click('#codeForm button[type=submit]'); await wait(600);
        check('typed: a number that does not add up is caught before any lookup, and the sheet stays open', looked.length === 0 && /do not add up/.test(await p.textContent('#codeNote')) && (await p.evaluate(() => document.getElementById('codeDlg').open)), [looked, await p.textContent('#codeNote')]);
        await p.fill('#codeInput', '8901063012349'); await p.click('#codeForm button[type=submit]'); await wait(1500);
        check('typed: a good number is looked up', looked.length === 1 && looked[0] === '8901063012349', looked);
      }
      check('  ...no content-policy or WebAssembly errors (' + label + ')', csp.length === 0, csp);
      await b.close();
    }
  } finally { srv.kill(); }
  const pass = results.filter((r) => r[0]).length;
  console.log('\nbarcode sheet walk: ' + pass + ' / ' + results.length);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
