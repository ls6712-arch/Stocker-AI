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

  const closeCard = async () => { const b = p.locator('main button', { hasText: /^Done$/ }); if (await b.count()) { await b.first().click(); await wait(500); } };
  await closeCard();

  // ---- 3. edit a line of the card: name and how many ----
  await script([
    { when: 'fridge, a shelf', see: 'Muesli | 1 |' },
    { when: 'Muesli', plan: { actions: [A('add', 'Muesli', 1, true, { category: 'Pantry' })] } },
  ]);
  await photo('#shelfFile');
  const edit = p.locator('main button[aria-label="Edit Muesli"]');
  check('Each thing in the card after a photo has an Edit button', (await edit.count()) === 1, await p.locator('main').innerText());
  await edit.click(); await wait(300);
  await p.locator('main form.editrow input[aria-label="Name"]').fill('Sunflower seeds');
  await p.locator('main form.editrow input[aria-label="How many"]').fill('2');
  await shot('scan-04-edit');
  await p.locator('main form.editrow button[type=submit]').click(); await wait(1200);
  const sun = await item('Sunflower seeds');
  check('  ...Save turns "Muesli" into 2 sunflower seeds at home, and muesli is gone', sun && sun.qty === 2 && !(await item('Muesli')), [sun, await item('Muesli')]);
  check('  ...the card now shows the corrected line', /Sunflower seeds/.test(await p.locator('main').innerText()) && !/Muesli/.test(await p.locator('main').innerText()), (await p.locator('main').innerText()).slice(0, 400));
  const x2 = p.locator('main button[aria-label^="That\'s wrong, take back Sunflower seeds"]');
  check('  ...and the corrected line can still be taken back', (await x2.count()) === 1);
  if (await x2.count()) { await x2.click(); await wait(900); }
  check('  ...taking it back removes it', !(await item('Sunflower seeds')), await item('Sunflower seeds'));
  await closeCard();

  // ---- 4. what the camera was unsure of is asked, not added ----
  await script([
    { when: 'fridge, a shelf', see: 'Fridge door | 1 |\nWhole milk | 1 |\nGlass jar | 1 | maybe |\nSour cream (maybe) | 1 |' },
    { when: 'Whole milk', plan: { actions: [A('add', 'Whole Milk', 1, true), A('add', 'Salmon', 1, true, { category: 'Meat' })] } },
  ]);
  await photo('#shelfFile');
  await shot('scan-05-doubts');
  const t4 = await p.locator('main').innerText();
  check('A photo with doubts: milk is added, and "Did I see these right?" asks about the rest', /Did I see these right\?/.test(t4) && /Sour cream\?/i.test(t4) && /Glass jar/i.test(t4) && !!(await item('Whole Milk')), t4.slice(0, 600));
  check('  ...nothing it was unsure of, nor salmon it never saw, is at home yet', !(await item('Sour cream')) && !(await item('Salmon')) && !(await item('Glass jar')), null);
  await p.locator('main li', { hasText: 'Sour cream?' }).locator('button', { hasText: /^Yes$/ }).click(); await wait(1000);
  const sc = await item('Sour cream');
  check('  ...Yes adds sour cream as one', sc && sc.qty === 1 && sc.unsure === 0, sc);
  await p.locator('main li', { hasText: 'Glass jar' }).locator('button', { hasText: /^Name it$/ }).click(); await wait(300);
  await p.locator('main form.editrow input').fill('Mango pickle');
  await p.locator('main form.editrow button[type=submit]').click(); await wait(1000);
  check('  ...Name it on the jar adds what it really is (mango pickle)', !!(await item('Mango pickle')), (await sql('SELECT name FROM items')).map((x) => x.name));
  check('  ...and the questions are gone once answered', !/Did I see these right\?/.test(await p.locator('main').innerText()), (await p.locator('main').innerText()).slice(0, 400));
  await closeCard();

  // ---- 5. a photo with nothing certain asks and changes nothing ----
  const n5 = (await sql('SELECT COUNT(*) AS n FROM items'))[0].n;
  await script([{ when: 'fridge, a shelf', see: 'Unlabelled bag | 1 | maybe |' }]);
  await photo('#shelfFile');
  const t5 = await p.locator('main').innerText();
  check('A photo with only doubts says "I need a hand" and asks', /I need a hand/.test(t5) && /Unlabelled bag/i.test(t5), t5.slice(0, 400));
  check('  ...and nothing at home changed', (await sql('SELECT COUNT(*) AS n FROM items'))[0].n === n5, null);
  await p.locator('main li', { hasText: 'Unlabelled bag' }).locator('button', { hasText: /^No$/ }).click(); await wait(500);
  check('  ...No leaves it out', !/Unlabelled bag/i.test(await p.locator('main').innerText()) && (await sql('SELECT COUNT(*) AS n FROM items'))[0].n === n5, null);

  check('No script errors on the page', errs.length === 0, errs);
  await b.close();
  const failed = R.filter((r) => !r[0]);
  for (const [ok, name, detail] of R) console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '\n     ' + detail));
  console.log('\nShelf scan in the browser: ' + (R.length - failed.length) + ' of ' + R.length + ' checks pass');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
