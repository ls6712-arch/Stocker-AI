// The photo pipeline in a phone-sized browser: the real Worker and page, the stand-in models of evals/e2e/server.mjs, and a
// drawn test fridge (evals/e2e/fridge.jpg) whose packs sit at known places. Checks what the person sees, each with its opposite.
//
//   npm run test:pipeline:browser
// Screenshots go to evals/e2e/shots/ (not committed).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.env.E2E_URL || 'http://127.0.0.1:8815';
const SHOTS = path.join(__dirname, 'e2e', 'shots');
const FRIDGE = path.join(__dirname, 'e2e', 'fridge.jpg');
fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  const errs = [], sent = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of 4(01|04|29)|ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED/.test(m.text())) errs.push('console: ' + m.text()); });
  p.on('request', (r) => { if (r.method() === 'POST' && /\/api\//.test(r.url())) sent.push({ url: new URL(r.url()).pathname, body: r.postData() || '' }); });
  const R = [], check = (name, ok, detail) => { R.push([!!ok, name, ok ? '' : String(detail == null ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400)]); };
  const wait = (ms) => p.waitForTimeout(ms);
  const ctl = async (u, body) => (await fetch(BASE + u, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json();
  const script = (rules) => ctl('/__script', { rules });
  const sql = (q, args) => ctl('/__sql', { sql: q, args });
  const item = async (name) => (await sql('SELECT * FROM items WHERE lower(name) = lower(?)', [name]))[0];
  const A = (name) => ({ action: 'add', name, note: '', inferred: false, quantity: 1, quantityKnown: true, unit: 'pcs', area: 'Kitchen', category: 'Dairy', expiryDate: '', shelfLifeDays: 7, daysToFinish: 7, price: 0, warn: '' });
  const shot = (n) => p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true });
  const snap = async () => {
    await p.click('#tellSnap'); await wait(300);
    await p.setInputFiles('#shelfFile', FRIDGE); await wait(2500);
    if (await p.locator('#licDlg[open]').count()) { await p.click('#licOk'); await wait(2500); }
  };
  const closeCard = async () => { const d = p.locator('main button', { hasText: /^Done$/ }); if (await d.count()) { await d.first().click(); await wait(500); } };

  await p.goto(BASE); await wait(800);
  await p.fill('#who', 'Sush'); await p.fill('#pin', 'test1234'); await p.click('#gateForm button'); await wait(1200);
  if (await p.locator('#helloDlg[open]').count()) { await p.click('#helloSkip'); await wait(450); }
  for (let i = 0; i < 4 && (await p.locator('dialog[open]').count()); i++) { await p.keyboard.press('Escape'); await wait(200); }

  // where the drawn packs are, as fractions of the photo: milk, tub, jar, door handle
  const BOXES = { milk: [0.08, 0.5, 0.3, 0.92], tub: [0.35, 0.7, 0.52, 0.92], jar: [0.58, 0.62, 0.72, 0.92], door: [0.8, 0.1, 0.95, 0.5] };
  const obj = ([x0, y0, x1, y1]) => ({ x_min: x0, y_min: y0, x_max: x1, y_max: y1 });

  // ---- 1. a photo through find, crop, read: the card shows the photo with a box round each thing ----
  await script([
    { find: [obj(BOXES.milk), obj(BOXES.tub), obj(BOXES.jar), obj(BOXES.door)] },
    // read in reading order, top to bottom: the door handle, the milk jug, the jar, the tub
    { reads: ['none', 'Whole milk, 1 gallon | sure', 'Mango pickle | maybe', 'Daisy cottage cheese | sure'] },
    { when: 'Whole milk', plan: { actions: [A('Whole milk, 1 gallon'), A('Daisy cottage cheese')] } },
  ]);
  await snap();
  await shot('pipe-01-card');
  const fig = p.locator('main figure.shot');
  check('After a photo, the card shows the photo itself', (await fig.count()) === 1 && (await fig.locator('img').count()) === 1, await p.locator('main').innerText());
  const boxes = await p.$$eval('main figure.shot .bx', (els) => els.map((e) => ({ cls: e.className, label: e.getAttribute('aria-label'), text: e.textContent })));
  check('  ...with one box round each of the 4 things found', boxes.length === 4, boxes);
  check('  ...milk and cottage cheese marked added (green), the jar marked to check (amber), the door handle left out', boxes.filter((x) => /added/.test(x.cls)).length === 2 && boxes.filter((x) => /asked/.test(x.cls)).length === 1 && boxes.filter((x) => /none/.test(x.cls)).length === 1, boxes);
  check('  ...each box is named for a screen reader with what happened ("Whole milk, 1 gallon, added")', boxes.some((x) => x.label === 'Whole milk, 1 gallon, added') && boxes.some((x) => /Mango pickle\?, I need you to check/i.test(x.label)) && boxes.some((x) => /left out/.test(x.label)), boxes.map((x) => x.label));
  // the box sits on the pack: its place on screen against the photo's place on screen
  const geo = await p.evaluate(() => { const img = document.querySelector('main figure.shot img').getBoundingClientRect(); return [...document.querySelectorAll('main figure.shot .bx')].map((e) => { const r = e.getBoundingClientRect(); return { label: e.getAttribute('aria-label'), x: (r.left - img.left) / img.width, y: (r.top - img.top) / img.height, w: r.width / img.width, h: r.height / img.height }; }); });
  const milkBox = geo.find((g) => /^Whole milk/.test(g.label));
  check('  ...and each box sits on its pack in the photo (within 1% of where the milk jug is drawn)', milkBox && Math.abs(milkBox.x - 0.08) < 0.01 && Math.abs(milkBox.y - 0.5) < 0.01 && Math.abs(milkBox.w - 0.22) < 0.01 && Math.abs(milkBox.h - 0.42) < 0.01, geo);
  check('A key under the photo says what each colour means and counts them', /2 added · 1 to check · 1 left out/.test(await p.locator('main figure.shot + .legend + figcaption').innerText()), await p.locator('main').innerText());
  await p.locator('main figure.shot .bx.added').first().click(); await wait(300);
  check('Tapping a box lights up its line in the card', (await p.locator('main li.hl').count()) === 1 && /Whole milk/.test(await p.locator('main li.hl').innerText()), await p.locator('main li.hl').count());
  await p.locator('main li[data-id]', { hasText: 'Daisy cottage cheese' }).locator('.grow').first().click({ position: { x: 5, y: 5 } }); await wait(300);
  check('Tapping a line lights up its box in the photo', /Daisy cottage cheese, added/.test((await p.locator('main figure.shot .bx.hl').getAttribute('aria-label')) || ''), await p.locator('main figure.shot .bx.hl').count());
  await p.locator('main li', { hasText: 'Mango pickle?' }).locator('button', { hasText: /^Yes$/ }).click(); await wait(1000);
  const after = await p.$$eval('main figure.shot .bx', (els) => els.map((e) => e.className));
  check('Answering Yes turns the amber box green', after.filter((x) => /added/.test(x)).length === 3 && !after.some((x) => /asked/.test(x)) && !!(await item('Mango pickle')), after);
  check('The card fits the phone: nothing scrolls sideways', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  const find = sent.find((x) => x.url === '/api/scan/shelf/find'), read = sent.find((x) => x.url === '/api/scan/shelf/read');
  const cr = read ? JSON.parse(read.body).crops : [];
  check('The phone sent the photo once to find the packs, then one cut-out per pack', !!find && cr.length === 4 && cr.every((x) => /^data:image\/jpeg/.test(x.image)), [!!find, cr.length]);
  check('  ...each cut-out is smaller than the photo (only the pack, at most 640 pixels)', read && cr.every((x) => x.image.length < JSON.parse(find.body).image.length), null);
  await p.emulateMedia({ colorScheme: 'dark' }); await wait(300); await shot('pipe-02-card-dark'); await p.emulateMedia({ colorScheme: 'light' });
  await closeCard();
  check('Done closes the card and the photo with it', (await p.locator('main figure.shot').count()) === 0);

  // ---- 2. opposite: nothing found, so the whole photo is read the old way, and no picture is drawn ----
  await script([{ find: [] }, { when: 'fridge, a shelf', see: 'Orange juice | 1 |' }, { when: 'Orange juice', plan: { actions: [A('Orange juice')] } }]);
  await snap();
  check('Opposite: when no pack is found, the whole photo is read the old way (orange juice added)', !!(await item('Orange juice')), (await sql('SELECT name FROM items')).map((x) => x.name));
  check('  ...and the card has no picture with boxes', (await p.locator('main figure.shot').count()) === 0);
  await closeCard();

  check('No script errors on the page', errs.length === 0, errs);
  await b.close();
  const failed = R.filter((r) => !r[0]);
  for (const [ok, name, detail] of R) console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '\n     ' + detail));
  console.log('\nPhoto pipeline in the browser: ' + (R.length - failed.length) + ' of ' + R.length + ' checks pass');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
