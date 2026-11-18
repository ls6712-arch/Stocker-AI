// Shelf and fridge photos in a phone-sized browser: the real Worker, the app's own page and the stand-in model of
// evals/e2e/server.mjs. Checks what the person sees after a photo, each with its opposite.
//
//   npm run test:scan:browser
// Screenshots go to evals/e2e/shots/ (not committed).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.env.E2E_URL || 'http://127.0.0.1:8814';
const SHOTS = path.join(__dirname, 'e2e', 'shots');
const PHOTO = path.join(__dirname, 'e2e', 'blank.jpg');
fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of 4(01|04|29)|ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED/.test(m.text())) errs.push('console: ' + m.text()); });
  const R = [], check = (name, ok, detail) => { R.push([!!ok, name, ok ? '' : String(detail == null ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400)]); };
  const wait = (ms) => p.waitForTimeout(ms);
  const ctl = async (u, body) => (await fetch(BASE + u, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json();
  const script = (rules) => ctl('/__script', { rules });
  const sql = (q, args) => ctl('/__sql', { sql: q, args });
  const item = async (name) => (await sql('SELECT * FROM items WHERE lower(name) = lower(?)', [name]))[0];
  const A = (action, name, quantity, known, x = {}) => ({ action, name, note: '', inferred: false, quantity, quantityKnown: known, unit: 'pcs', area: 'Kitchen', category: 'Dairy', expiryDate: '', shelfLifeDays: 7, daysToFinish: 7, price: 0, warn: '', ...x });
  const shot = (n) => p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true });
  const howMany = async () => (await p.locator('main').innerText()).match(/How many\?/g)?.length || 0;
  const photo = async (input) => {
    await p.click('#tellSnap'); await wait(300);
    await p.setInputFiles(input, PHOTO); await wait(1800);
    if (await p.locator('#licDlg[open]').count()) { await p.click('#licOk'); await wait(1800); }
  };

  // ---- sign in, skip the welcome ----
  await p.goto(BASE); await wait(800);
  await p.fill('#who', 'Sush'); await p.fill('#pin', 'test1234'); await p.click('#gateForm button'); await wait(1200);
  if (await p.locator('#helloDlg[open]').count()) { await p.click('#helloSkip'); await wait(450); }
  for (let i = 0; i < 4 && (await p.locator('dialog[open]').count()); i++) { await p.keyboard.press('Escape'); await wait(200); }

  // ---- 1. the fridge photo of 17 Nov: what the model said, through the real screen ----
  await script([
    { when: 'fridge, a shelf', see: 'Granola | 1 |\nMilk | unsure |\nYogurt | unsure |' },
    { when: 'Granola', plan: { actions: [A('add', 'Granola', 1, true, { category: 'Pantry' }), A('add', 'Milk', 1, false), A('add', 'Yogurt', 1, false)] } },
  ]);
  await photo('#shelfFile');
  await shot('scan-01-fridge');
  const body1 = await p.locator('main').innerText();
  check('After the fridge photo, the card says what was added', /I added 3 things/.test(body1), body1.slice(0, 300));
  check('  ...and asks "How many?" nowhere on the screen', (await howMany()) === 0 && !/could not count/i.test(body1), body1.slice(0, 600));
  const milk = await item('Milk'), yog = await item('Yogurt');
  check('  ...milk and yogurt are each at home as one', milk && milk.qty === 1 && yog && yog.qty === 1, [milk, yog]);
  const x = p.locator('main button[aria-label^="That\'s wrong, take back Milk"]');
  check('  ...and each can still be taken back from the card', (await x.count()) === 1);
  await x.click(); await wait(900);
  check('  ...taking back the milk removes it', !(await item('Milk')), await item('Milk'));
  const doneBtn = p.locator('main button', { hasText: /^Done$/ });
  if (await doneBtn.count()) { await doneBtn.first().click(); await wait(500); }

  // ---- 2. opposite: a receipt line with no amount still asks, but only once on the screen ----
  await script([
    { when: 'grocery bill or receipt', see: 'CORNER STORE\nBUTTER\nBREAD 1 2.49' },
    { when: 'BUTTER', plan: { store: 'Corner Store', actions: [A('add', 'Butter', 1, false), A('add', 'Bread', 1, true, { category: 'Bakery' })] } },
  ]);
  await photo('#billFile');
  await shot('scan-02-receipt');
  check('Opposite: a receipt line with no amount still asks how many, in the card', /could not count these\. How many\?/i.test(await p.locator('main').innerText()), (await p.locator('main').innerText()).slice(0, 500));
  check('  ...and only once on the screen (Today does not ask it again)', (await howMany()) === 1, await howMany());
  const doneBtn2 = p.locator('main button', { hasText: /^Done$/ });
  if (await doneBtn2.count()) { await doneBtn2.first().click(); await wait(600); }
  await shot('scan-03-after-done');
  check('  ...once the card is closed, Today still asks it, once', (await howMany()) === 1, await howMany());

  check('No script errors on the page', errs.length === 0, errs);
  await b.close();
  const failed = R.filter((r) => !r[0]);
  for (const [ok, name, detail] of R) console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '\n     ' + detail));
  console.log('\nShelf scan in the browser: ' + (R.length - failed.length) + ' of ' + R.length + ' checks pass');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
