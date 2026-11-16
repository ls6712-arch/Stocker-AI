// Browser walk-through of "needing less", round 1 (16 Nov 2026), at phone width: the list looks ahead to the next shop.
// Run against a local `wrangler dev` on port 8799 with APP_PIN=test1234 in .dev.vars, on an EMPTY local database
// (the command to empty it is at the top of evals/uat-audit.cjs).
//   node evals/less-audit.cjs
const { chromium } = require('playwright');
const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
const URL = 'http://127.0.0.1:8799/';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const c = await b.newContext({ viewport: { width: 400, height: 820 } });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const R = [], check = (name, ok, detail) => R.push([!!ok, name, ok ? '' : String(detail === undefined ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300)]);
  const post = (path, body, method) => p.evaluate(async ([pa, bo, me]) => { const r = await fetch(pa, { method: me || 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: bo ? JSON.stringify(bo) : undefined }); return r.json().catch(() => ({})); }, [path, body, method]);
  const state = () => p.evaluate(async () => (await fetch('/api/items', { credentials: 'same-origin' })).json());
  const A = (name, days, o = {}) => ({ action: 'add', name, quantity: o.qty || 1, unit: o.unit || 'pcs', area: 'Kitchen', category: o.cat || 'Pantry', expiry: '', shelfLifeDays: 0, finishDays: days });
  const buy = (day, acts) => post('/api/apply', { source: 'bill', bought: d(day), store: 'H Mart', actions: acts });
  const soon = () => p.locator('#soonLow');
  const names = async () => (await soon().locator('.name').allInnerTexts()).map((t) => t.trim());
  const openList = async () => { await p.click('[data-tab=list]'); await p.waitForTimeout(350); };

  await p.goto('about:blank'); await p.goto(URL);
  await p.fill('#who', 'Sush'); await p.fill('#pin', 'test1234'); await p.click('#gateForm button'); await p.waitForTimeout(900); await p.click('#profSkip').catch(() => {});
  await post('/api/profile', { personas: ['mom'], adults: 2, kids: 1 });

  // ---- a new home: one shop so far, so nobody knows how often it shops ----
  await buy(-6, [A('Eggs', 7, { cat: 'Dairy' }), A('Oat Milk', 9, { unit: 'L', cat: 'Dairy' }), A('Butter', 8, { cat: 'Dairy' }), A('Sourdough', 10, { cat: 'Bakery' }), A('Olive Oil', 30, { unit: 'L' }), A('Basmati Rice', 9, { unit: 'kg' })]);
  await p.reload(); await p.waitForTimeout(900); await openList();
  let n = await names();
  check('before I know how often this home shops, only what is due by tomorrow is suggested', n.length === 1 && n[0] === 'Eggs', n);
  check('and it is called what it was called before', /Might be running low/.test(await soon().locator('h2').innerText().catch(() => '')), await soon().innerText().catch(() => ''));

  // ---- two earlier shops, six days apart: now it is known ----
  await buy(-18, [A('Bananas', 6, { cat: 'Produce' })]); await buy(-12, [A('Bananas', 6, { cat: 'Produce' })]);
  const ban = (await state()).items.find((i) => i.name === 'Bananas');
  await post('/api/items/' + ban.id, { qty: 0 }, 'PATCH');
  const s = await state();
  check('the app is told this home shops about every 6 days', s.shop && s.shop.known && s.shop.days === 6, s.shop);
  await p.reload(); await p.waitForTimeout(900); await openList();
  n = await names();
  const head = await soon().locator('h2').innerText().catch(() => ''), sub = await soon().locator('p.sub').first().innerText().catch(() => '');
  check('the list now says what may run out before the next shop', /Before your next shop/.test(head) && /about every 6 days/.test(sub) && /My guess/.test(sub), head + ' | ' + sub);
  check('three at most, soonest first', n.length === 3 && n[0] === 'Eggs' && n[1] === 'Butter', n);
  check('the rest wait behind one button', /Show 2 more/.test(await soon().innerText()), await soon().innerText());
  check('opposite: olive oil, good for weeks, is not suggested', !(await soon().innerText()).includes('Olive Oil'));
  const box = await soon().boundingBox(), listTop = await p.locator('#v-list .grp').first().boundingBox().catch(() => null);
  check('it sits above the list, where the decision is made', box && listTop && box.y < listTop.y, { box, listTop });
  check('nothing spills off a phone screen', box && box.x >= 0 && box.x + box.width <= 400 && (await p.evaluate(() => document.documentElement.scrollWidth)) <= 400, box);
  check('each line says it is a guess, and when', /My guess: out by|My guess: about to run out/.test(await soon().locator('.row .sub').first().innerText()), await soon().locator('.row .sub').first().innerText());
  const badge0 = await p.locator('#listBadge').innerText();
  check('opposite: suggestions are not counted as things to buy (the badge counts the list only)', badge0.trim() === '1', badge0);

  await soon().locator('button', { hasText: 'Show 2 more' }).click(); await p.waitForTimeout(250);
  n = await names();
  check('"Show more" shows them all', n.length === 5 && n.includes('Sourdough') && n.includes('Basmati Rice'), n);

  // ---- one tap: add ----
  await soon().locator('button[aria-label="Add Butter to the list"]').click(); await p.waitForTimeout(700);
  const s2 = await state(), butter = s2.items.find((i) => i.name === 'Butter');
  check('one tap puts butter on the list, and the home agrees', butter && butter.low === 1 && (await p.locator('#v-list').innerText()).includes('Butter') && !(await names()).includes('Butter'), { butter, names: await names() });
  check('and says so in a line, never as a claim it did not make', /On your list: Butter/.test(await p.locator('#toast').innerText().catch(() => '')), await p.locator('#toast').innerText().catch(() => ''));
  check('the badge now counts it', (await p.locator('#listBadge').innerText()).trim() === '2', await p.locator('#listBadge').innerText());
  check('opposite: butter is not also left At home as fine and on the list twice', (await p.locator('#v-list .rowbtn', { hasText: 'Butter' }).count()) === 1);

  // ---- one tap: still have it ----
  const before = s2.items.find((i) => i.name === 'Eggs').finish_days;
  await soon().locator('button[aria-label="Still have Eggs"]').click(); await p.waitForTimeout(700);
  const eggs = (await state()).items.find((i) => i.name === 'Eggs');
  check('"Still have it" takes eggs out of the suggestions and gives them longer', !(await names()).includes('Eggs') && eggs.finish_days > before && !eggs.low, { before, eggs: eggs.finish_days, names: await names() });
  check('opposite: nothing was added to the list by that', (await p.locator('#listBadge').innerText()).trim() === '2');

  // ---- buying it clears it ----
  await p.locator('#v-list button[aria-label="Mark Butter as bought"]').click(); await p.waitForTimeout(900);
  const b3 = (await state()).items.find((i) => i.name === 'Butter');
  check('ticking butter off restocks it, and it is not suggested again straight away', b3 && !b3.low && b3.bought === d(0) && !(await names()).includes('Butter'), { b3, names: await names() });

  check('no errors on the page', !errs.length, errs);
  await b.close();
  const failed = R.filter((r) => !r[0]);
  for (const [ok, name, detail] of R) console.log((ok ? '  pass  ' : '  FAIL  ') + name + (detail ? '\n        ' + detail : ''));
  console.log('\nNeeding less, walk-through: ' + (R.length - failed.length) + ' of ' + R.length + ' checks pass.');
  process.exit(failed.length ? 1 : 0);
})();
