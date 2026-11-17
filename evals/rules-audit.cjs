// Browser walk-through of House rules, round 1, at phone width.
// Run against a local `wrangler dev` on port 8799 with APP_PIN=test1234 in .dev.vars, on an EMPTY local database
// (the command to empty it is at the top of evals/uat-audit.cjs):
//   node evals/rules-audit.cjs
const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:8799/';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const c = await b.newContext({ viewport: { width: 400, height: 820 } });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const R = [], check = (name, ok, detail) => R.push([!!ok, name, ok ? '' : String(detail ?? '')]);
  const pressed = (box, name) => p.evaluate(([bx, n]) => { const x = [...document.querySelectorAll('#' + bx + ' .chip')].find((e) => e.textContent === n); return x ? x.getAttribute('aria-pressed') : 'missing'; }, [box, name]);
  const tap = (box, name) => p.locator('#' + box + ' .chip', { hasText: new RegExp('^' + name + '$') }).click();
  await p.goto(URL); await p.fill('#who', 'Sush'); await p.fill('#pin', 'test1234'); await p.click('#gateForm button'); await p.waitForSelector('#helloDlg[open]', { timeout: 8000 });
  await p.click('#helloSkip'); await p.waitForTimeout(450); await p.click('#menuBtn'); await p.waitForTimeout(450); await p.click('#menuEdit'); await p.waitForSelector('#profDlg[open]', { timeout: 8000 });
  check('the household sheet offers house rules', await p.locator('#profHouse .chip').count() >= 5, await p.locator('#profHouse .chip').count());
  check('opposite: no house rule is chosen for a new home', (await p.locator('#profHouse .chip[aria-pressed=true]').count()) === 0);
  check('opposite: house rules cannot be typed in, only picked', (await p.locator('#profHouse .chip.add', { hasText: /add/i }).count()) === 0);
  await p.locator('#profHome button').first().click();
  await tap('profHouse', 'Less sugar'); await tap('profHouse', 'No palm oil');
  check('a tapped rule shows as chosen', (await pressed('profHouse', 'No palm oil')) === 'true' && (await pressed('profHouse', 'Less sugar')) === 'true');
  await p.locator('#profHouse .chip.add', { hasText: 'More' }).click();
  check('More shows the rest of the menu', (await pressed('profHouse', 'Fewer preservatives')) === 'false', await pressed('profHouse', 'Fewer preservatives'));
  const box = await p.locator('#profHouse').boundingBox();
  check('the chips fit the phone, with no sideways scroll', box && box.x >= 0 && box.x + box.width <= 400 && (await p.evaluate(() => document.querySelector('#profDlg').scrollWidth <= document.querySelector('#profDlg').clientWidth + 1)), JSON.stringify(box));
  check('the save button is ready', !(await p.locator('#profSave').isDisabled()), 'a household type must be picked first');
  await p.click('#profSave'); await p.waitForTimeout(900); await p.reload(); await p.waitForTimeout(900);
  const saved = await p.evaluate(async () => (await (await fetch('/api/items', { credentials: 'same-origin' })).json()).profile);
  check('the rules are kept after a reload', saved && Array.isArray(saved.house) && saved.house.includes('No palm oil') && saved.house.includes('Less sugar') && saved.house.length === 2, JSON.stringify(saved && saved.house));
  await p.evaluate(() => document.getElementById('menuEdit').click()); await p.waitForSelector('#profDlg[open]');
  check('and shown as chosen when the sheet is opened again', (await pressed('profHouse', 'No palm oil')) === 'true');
  await tap('profHouse', 'No palm oil');
  await p.locator('#profMembers .chip.add, #profPeople .chip.add, button.chip.add', { hasText: 'Add a person' }).first().click(); await p.waitForSelector('#memDlg[open]');
  check('a person has their own house rules', await p.locator('#memHouse .chip').count() >= 5);
  await p.fill('#memName', 'Leo'); await tap('memHouse', 'Less sugar'); await p.click('#memSave'); await p.waitForTimeout(300);
  await p.click('#profSave'); await p.waitForTimeout(900);
  const again = await p.evaluate(async () => (await (await fetch('/api/items', { credentials: 'same-origin' })).json()).profile);
  check('a rule taken off is gone', again && again.house.join() === 'Less sugar', JSON.stringify(again && again.house));
  check('one person keeps their own rule', again && again.members[0] && again.members[0].name === 'Leo' && again.members[0].house.join() === 'Less sugar', JSON.stringify(again && again.members));
  check('opposite: nothing broke on the page', errs.length === 0, errs.join(' | '));
  for (const [ok, name, detail] of R) console.log((ok ? '  ok   ' : '  FAIL ') + name + (detail ? '  ' + detail : ''));
  console.log('House rules, walk-through: ' + R.filter((r) => r[0]).length + ' of ' + R.length + ' checks pass.');
  await b.close(); process.exit(R.every((r) => r[0]) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
