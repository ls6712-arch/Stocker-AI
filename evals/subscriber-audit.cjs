// Subscriber walk-through, 18 Nov 2026, in a phone-sized browser: the screen-side fixes, each with its opposite.
// Run against a fresh local server:  node --no-warnings evals/e2e/server.mjs 8799 & node evals/subscriber-audit.cjs
const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:8799/';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 400, height: 820 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const R = [], check = (name, ok, detail) => R.push([!!ok, name, ok ? '' : JSON.stringify(detail ?? '').slice(0, 300)]);
  const wait = (ms) => p.waitForTimeout(ms);
  const api = (method, path, body) => p.evaluate(async ([m, u, x]) => (await fetch(u, { method: m, credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: x ? JSON.stringify(x) : undefined })).json(), [method, path, body]);
  const day = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  await p.goto(URL); await p.fill('#who', 'Sam'); await p.fill('#pin', 'test1234'); await p.click('#gateForm button'); await wait(900); await p.click('#helloSkip').catch(() => {});
  await api('POST', '/api/apply', { source: 'hand', auto: false, actions: [
    { action: 'add', name: 'Diapers', quantity: 1, unit: 'pcs', area: 'Kitchen', category: 'Pantry' },
    { action: 'add', name: 'Iceberg Lettuce', quantity: 1, unit: 'pcs', area: 'Kitchen', category: 'Produce', expiry: day(1) },
    { action: 'add', name: 'Ground Chicken', quantity: 1, unit: 'lb', area: 'Kitchen', category: 'Meat', expiry: day(1) },
    { action: 'add', name: 'Greek Yogurt', quantity: 2, unit: 'pack', area: 'Kitchen', category: 'Dairy' },
  ] });
  await p.reload(); await wait(1000);

  // the bell: lettuce is not sent to the freezer, chicken is
  await p.click('#bell'); await p.waitForSelector('#nudgeDlg[open]');
  const rows = await p.$$eval('#nudgeList .nudge', (n) => n.map((x) => x.textContent));
  const let_ = rows.find((t) => /lettuce/i.test(t)) || '', chk = rows.find((t) => /chicken/i.test(t)) || '';
  check('the lettuce row does not say to freeze it', let_ && !/freezer/i.test(let_), rows);
  check('opposite: the chicken row still offers the freezer', /freezer/i.test(chk), rows);
  const dot = Number((await p.textContent('#bellDot')) || 0);
  check('the bell count matches the rows in its sheet', dot === rows.length, [dot, rows.length]);
  await p.keyboard.press('Escape'); await wait(500);

  // At home: diapers can be moved to Kids, Diapering
  await p.click('.tab[data-tab="pantry"]'); await wait(600);
  await p.fill('#search', 'Diapers'); await wait(500);
  await p.locator('#v-pantry .name', { hasText: /^Diapers$/ }).first().click(); await wait(500);
  const sel = p.locator('select[aria-label="Move Diapers to another room"]');
  check('the open item has a room picker, showing where it is now', (await sel.count()) === 1 && (await sel.inputValue()) === 'Kitchen|Pantry', await sel.count());
  await sel.selectOption('Kids|Diapering'); await wait(1200);
  const it = ((await api('GET', '/api/items')).items || []).find((i) => i.name === 'Diapers');
  check('picking Kids, Diapering moves it there', it && it.area === 'Kids' && it.category === 'Diapering', it);
  const lettuceOpen = async () => { await p.reload(); await wait(1000); await p.click('.tab[data-tab="pantry"]'); await wait(600); await p.fill('#search', 'Iceberg'); await wait(500); await p.locator('#v-pantry .name', { hasText: /^Iceberg Lettuce$/ }).first().click(); await wait(500); return p.locator('button', { hasText: 'Put in freezer' }).count(); };
  check('an open lettuce has no "Put in freezer" button', (await lettuceOpen()) === 0);

  // the list: typed lower case comes out tidy; yogurt says Greek Yogurt is at home
  await p.click('.tab[data-tab="list"]'); await wait(600);
  await api('POST', '/api/extras', { text: 'dish soap' });
  const y = await api('POST', '/api/extras', { text: 'Yogurt' });
  check('the list line is "Dish soap", and yogurt is told about the Greek Yogurt at home', ((await api('GET', '/api/items')).extras || []).some((x) => x.text === 'Dish soap' && x.kind === 'Dishes') && y.have && y.have.name === 'Greek Yogurt', y);

  check('no script errors', errs.length === 0, errs);
  await b.close();
  for (const [ok, name, d] of R) console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  ->  ' + d));
  const n = R.filter((r) => r[0]).length;
  console.log('Subscriber walk-through: ' + n + ' of ' + R.length + ' checks pass');
  process.exit(n === R.length ? 0 : 1);
})();
