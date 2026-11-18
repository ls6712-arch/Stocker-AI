// The checklist page in a phone-sized browser, under the live security headers of the local server.
//   node --no-warnings evals/e2e/server.mjs 8799 & node evals/checks-audit.cjs
const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:8799/';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy/.test(m.text())) errs.push(m.text()); });
  const R = [], check = (name, ok, detail) => R.push([!!ok, name, ok ? '' : JSON.stringify(detail ?? '').slice(0, 300)]);
  const wait = (ms) => p.waitForTimeout(ms);
  const api = (method, path, body) => p.evaluate(async ([m, u, x]) => { const r = await fetch(u, { method: m, credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: x ? JSON.stringify(x) : undefined }); return { status: r.status, data: await r.json().catch(() => ({})) }; }, [method, path, body]);

  await p.goto(URL + 'checks.html'); await wait(800);
  check('signed out, the page says to sign in as the owner', /Sign in to Stocker as the owner/.test(await p.textContent('#list')), await p.textContent('#list'));
  await p.goto(URL); await p.fill('#who', 'Sush'); await p.fill('#pin', 'test1234'); await p.click('#gateForm button'); await wait(900); await p.click('#helloSkip').catch(() => {});
  for (const t of ['add milk to the list', 'bought 6 eggs', 'do we have rice?']) await api('POST', '/api/chat', { text: t });
  await p.click('#menuBtn'); await p.waitForSelector('#menuDlg[open]');
  check('the owner\'s menu has "Check Tote\'s answers"', await p.isVisible('#menuChecks'));
  await p.click('#menuChecks'); await wait(1200);
  check('it opens the checklist', /\/checks\.html$/.test(p.url()), p.url());
  check('three messages are waiting to be checked', (await p.$$('article.turn')).length === 3, (await p.$$('article.turn')).length);
  check('the four checks are listed with their meaning', (await p.$$eval('#rules li', (l) => l.length)) === 4);
  const first = p.locator('article.turn').first();
  const said1 = await first.locator('.said').textContent();
  await first.locator('button', { hasText: 'All right' }).click(); await wait(1000);
  check('"All right" marks it and it leaves the "To check" list', (await p.$$('article.turn')).length === 2 && !(await p.textContent('#list')).includes(said1), said1);
  check('the summary says 1 of 1 fully right', /100%/.test(await p.textContent('#sum')) && /1 of 1/.test(await p.textContent('#sum')), await p.textContent('#sum'));
  const next = p.locator('article.turn').first();
  await next.locator('[aria-label="Home right"] button', { hasText: 'No' }).click();
  check('a "No" shows what-should-have-happened, item and note', await next.locator('select[aria-label="What should have happened"]').isVisible());
  await next.locator('[aria-label="Understood"] button', { hasText: 'Yes' }).click();
  await next.locator('[aria-label="Reply right"] button', { hasText: 'Yes' }).click();
  await next.locator('select[aria-label="What should have happened"]').selectOption('nothing');
  await next.locator('input[aria-label="Note"]').fill('a question changed the home');
  await next.locator('button', { hasText: 'Save' }).click(); await wait(1000);
  const got = await api('GET', '/api/checks');
  const wrong = got.data.turns.find((t) => t.mark && !t.mark.right);
  check('saved as wrong, with the failed check, the should-have and the note', wrong && wrong.mark.home === 'no' && wrong.mark.should === 'nothing' && wrong.mark.note === 'a question changed the home', wrong);
  await p.click('[data-show="wrong"]'); await wait(300);
  check('"Wrong" shows it with a red Wrong label', (await p.$$('article.turn')).length === 1 && /Wrong/.test(await p.textContent('article.turn .pill')));
  await p.click('[data-show="all"]'); await wait(300);
  check('"All" shows every message', (await p.$$('article.turn')).length === 3);
  check('no script errors and nothing blocked by the security policy', errs.length === 0, errs);
  await b.close();
  for (const [ok, name, d] of R) console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  ->  ' + d));
  const n = R.filter((r) => r[0]).length;
  console.log('Checklist page: ' + n + ' of ' + R.length + ' checks pass');
  process.exit(n === R.length ? 0 : 1);
})();
