// The first run, in a phone-sized browser: three short steps instead of one long form, in Tote's voice, and a guided
// "Get everything sorted" list for the rest. Each step is checked on the screen and in the database, with its opposite.
//
//   node --no-warnings evals/e2e/server.mjs 8813 &   then   node evals/welcome-audit.cjs      (npm run test:welcome:browser)
// Screenshots go to evals/e2e/shots/ (not committed).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.env.E2E_URL || 'http://127.0.0.1:8813';
const SHOTS = path.join(__dirname, 'e2e', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const errs = [], bad = [];
  const R = [], check = (name, ok, detail) => R.push([!!ok, name, ok ? '' : String(detail == null ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 420)]);
  const sql = async (q, args) => (await fetch(BASE + '/__sql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sql: q, args }) })).json();
  const phone = async () => {
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    const p = await c.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('response', (r) => { if (r.status() >= 500) bad.push(r.status() + ' ' + r.url()); });
    p.wait = (ms) => p.waitForTimeout(ms);
    p.signIn = async (name, code) => { await p.goto(BASE + '/'); await p.waitForSelector('#gateForm:not([hidden])', { timeout: 8000 }); await p.fill('#who', name); await p.fill('#pin', code); await p.click('#gateForm button[type=submit]'); await p.waitForSelector('#app:not([hidden])', { timeout: 8000 }).catch(() => {}); await p.wait(900); };
    p.open = (id) => p.locator('#' + id + '[open]').count();
    p.txt = async (sel) => ((await p.locator(sel).first().textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    p.fits = () => p.evaluate(() => { const d = document.querySelector('#helloDlg'); return { scroll: d.scrollHeight - d.clientHeight, over: d.scrollWidth - d.clientWidth, small: [...d.querySelectorAll('button')].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 40).map((e) => e.id || e.textContent.trim().slice(0, 14)) }; });
    p.profile = () => p.evaluate(async () => (await (await fetch('/api/items', { credentials: 'same-origin' })).json()).profile || null);
    p.shot = (n) => p.screenshot({ path: path.join(SHOTS, 'welcome-' + n + '.png') });
    return p;
  };
  const voice = (t) => !/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(t) && (t.match(/!/g) || []).length <= 1 && !/\binventory\b|\bSKU\b/i.test(t);

  // ---- 1. a new home meets three short steps, not the long form ----
  const p = await phone();
  await p.signIn('Sush', 'test1234');
  const said = [];
  check('A new home is met by the short welcome', (await p.open('helloDlg')) === 1, 'helloDlg not open');
  check('opposite: the long form does not open by itself', (await p.open('profDlg')) === 0, null);
  check('It says there are three steps and this is the first', /1 of 3/.test(await p.txt('#helloStep')), await p.txt('#helloStep'));
  check('Step one asks who is at home, with nothing else on it', /who/i.test(await p.txt('#helloH')) && (await p.locator('#helloIn .qty').count()) === 2 && (await p.locator('#helloIn .tile, #helloIn .chip').count()) === 0, await p.txt('#helloH'));
  const f1 = await p.fits();
  check('Step one fits the phone with no scrolling, and every button is easy to hit', f1.scroll <= 1 && f1.over <= 1 && !f1.small.length, f1);
  const say0 = await p.txt('#helloSay'); said.push(say0);
  await p.click('#helloIn button[aria-label="More children"]'); await p.click('#helloIn button[aria-label="More children"]'); await p.wait(200);
  const say1 = await p.txt('#helloSay'); said.push(say1);
  check('Tote answers the choice: with two children added, its line changes and says so', say1 !== say0 && /two children/i.test(say1), [say0, say1]);
  check('Next is never greyed out', !(await p.locator('#helloNext').isDisabled()), null);
  await p.shot('1-who');
  await p.click('#helloNext'); await p.wait(500);

  check('Step two asks about allergies and how the home eats', /2 of 3/.test(await p.txt('#helloStep')) && (await p.locator('#helloAll .chip').count()) >= 9 && (await p.locator('#helloDiet .chip').count()) >= 4, await p.txt('#helloStep'));
  const say2 = await p.txt('#helloSay'); said.push(say2);
  check('opposite: with nothing picked, Tote does not talk about an allergy', !/keep .* out|check the label/i.test(say2), say2);
  await p.locator('#helloAll .chip', { hasText: /^Peanuts$/ }).click(); await p.wait(200);
  const say3 = await p.txt('#helloSay'); said.push(say3);
  check('With peanuts picked, Tote names it and says to check the label', /peanuts/i.test(say3) && /check the label/i.test(say3) && !/\bis safe\b/i.test(say3), say3);
  await p.locator('#helloDiet .chip', { hasText: /^Vegetarian$/ }).click(); await p.wait(200);
  const f2 = await p.fits();
  check('Step two fits the phone with no scrolling', f2.scroll <= 1 && f2.over <= 1 && !f2.small.length, f2);
  await p.shot('2-table');
  await p.click('#helloBack'); await p.wait(450);
  check('Back returns to step one with the two children still there', /1 of 3/.test(await p.txt('#helloStep')) && /two children/i.test(await p.txt('#helloSay')), await p.txt('#helloSay'));
  await p.click('#helloNext'); await p.wait(450);
  check('...and forward again keeps peanuts and vegetarian picked', (await p.locator('#helloAll .chip[aria-pressed=true]').count()) === 1 && (await p.locator('#helloDiet .chip[aria-pressed=true]').count()) === 1, null);
  await p.click('#helloNext'); await p.wait(500);

  const tiles = await p.evaluate(() => [...document.querySelectorAll('#helloIn .tile')].map((t) => t.querySelector('b').textContent));
  check('Step three offers a short set of homes to pick from, not all twenty', /3 of 3/.test(await p.txt('#helloStep')) && tiles.length >= 4 && tiles.length <= 6, tiles);
  check('...starting with the one that fits two adults and two children', tiles[0] === 'Family of four', tiles);
  check('...with a way to see every kind of home', (await p.locator('#helloAllTypes').count()) === 1, null);
  const f3 = await p.fits();
  check('Step three fits the phone with no scrolling', f3.scroll <= 1 && f3.over <= 1 && !f3.small.length, f3);
  said.push(await p.txt('#helloSay'));
  check('Nothing has to be picked: the last button is ready and says Done', !(await p.locator('#helloNext').isDisabled()) && /done/i.test(await p.txt('#helloNext')), await p.txt('#helloNext'));
  check('opposite: nothing is saved before Done', (await p.profile()) === null, null);
  await p.shot('3-type');
  await p.click('#helloNext'); await p.wait(1100);

  const pr = (await p.profile()) || {};
  check('Done saves the home: two adults, two children, no peanuts, vegetarian', pr.adults === 2 && pr.kids === 2 && (pr.allergies || []).join() === 'Peanuts' && (pr.diet || []).includes('Vegetarian'), pr);
  check('...and with no type picked, Tote goes by who is at home (family of four)', (pr.personas || []).join() === 'family4', pr.personas);
  const fin = await p.txt('#helloH') + ' ' + await p.txt('#helloSay'); said.push(fin);
  check('The last screen says it is set, and offers to start or to get everything sorted', (await p.open('helloDlg')) === 1 && /all set/i.test(fin) && (await p.locator('#helloNext').isVisible()) && (await p.locator('#helloSort').isVisible()), fin);
  check('Everything Tote said on the way keeps its voice: no emoji, at most one exclamation mark', said.every(voice), said.filter((t) => !voice(t)));
  await p.shot('4-set');

  // ---- 2. the guided list ----
  await p.click('#helloSort'); await p.wait(600);
  const rows = async () => p.evaluate(() => [...document.querySelectorAll('#sortList button')].map((r) => ({ key: r.dataset.key, title: r.querySelector('b').textContent, done: r.classList.contains('done') })));
  const r0 = await rows(), count = async () => await p.txt('#sortSub');
  check('"Get everything sorted" opens a list of things to set, each starting with "Set" or "Turn on" or "Name"', (await p.open('sortDlg')) === 1 && r0.length >= 8 && r0.every((r) => /^(Set|Turn on|Name) /.test(r.title)), r0.map((r) => r.title));
  check('What the welcome already asked is ticked: allergies and how you eat', r0.filter((r) => r.done).map((r) => r.key).sort().join() === 'allergies,diet', r0.filter((r) => r.done).map((r) => r.key));
  check('opposite: what was not asked is not ticked (House rules, pets, shopping)', ['house', 'pets', 'shop'].every((k) => r0.some((r) => r.key === k && !r.done)), r0);
  check('It says how far along the home is', new RegExp('^2 of ' + r0.length + ' sorted').test(await count()), await count());
  await p.shot('5-sorted');
  await p.click('#sortList button[data-key=house]'); await p.wait(700);
  const at = await p.evaluate(() => { const d = document.querySelector('#profDlg'), h = document.getElementById('profHouse'); if (!d.open || !h) return null; const a = h.getBoundingClientRect(), v = d.getBoundingClientRect(); return { top: Math.round(a.top - v.top), vis: a.top >= v.top && a.bottom <= v.bottom }; });
  check('Tapping "Set your House rules" opens the full settings at House rules', !!at && at.vis, at);
  await p.locator('#profHouse .chip', { hasText: /^No palm oil$/ }).click(); await p.click('#profSave'); await p.wait(1000);
  const r1 = await rows();
  check('Saving comes back to the list with House rules ticked and the count moved on', (await p.open('sortDlg')) === 1 && r1.some((r) => r.key === 'house' && r.done) && new RegExp('^3 of ' + r1.length + ' sorted').test(await count()), [await count(), r1.filter((r) => r.done).map((r) => r.key)]);
  check('...and the rule is kept in the home', JSON.stringify(((await p.profile()) || {}).house || []).includes('palm'), ((await p.profile()) || {}).house);
  await p.click('#sortList button[data-key=pets]'); await p.wait(600); await p.click('#profSkip'); await p.wait(600);
  const r2 = await rows();
  check('opposite: opening a section and leaving without saving ticks nothing', (await p.open('sortDlg')) === 1 && r2.some((r) => r.key === 'pets' && !r.done), r2.filter((r) => r.done).map((r) => r.key));
  await p.keyboard.press('Escape'); await p.wait(400);
  await p.reload(); await p.waitForSelector('#app:not([hidden])'); await p.wait(900);
  check('opposite: a home that is set up is not asked again', (await p.open('helloDlg')) === 0 && (await p.open('profDlg')) === 0, null);
  await p.click('#menuBtn'); await p.wait(450);
  check('The household menu keeps "Get everything sorted", with the count', (await p.locator('#menuSort').isVisible()) && /3 of \d+ sorted/.test(await p.txt('#menuSort')), await p.txt('#menuSort'));
  await p.click('#menuEdit'); await p.wait(600);
  check('Edit still opens everything at once: all twenty kinds of home and every section', (await p.open('profDlg')) === 1 && (await p.locator('#profHome .tile, #profStyle .tile').count()) === 20 && (await p.locator('#profHouse .chip').count()) >= 5, await p.locator('#profHome .tile, #profStyle .tile').count());

  // ---- 3. someone who says "Not now" ----
  const code = (await p.evaluate(async () => (await (await fetch('/api/homes', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Asha' }) })).json()))).code;
  const q = await phone();
  await q.signIn('Asha', code);
  check('A friend with a code gets the same short welcome', (await q.open('helloDlg')) === 1, code ? 'not open' : 'no code made');
  await q.click('#helloSkip'); await q.wait(500);
  check('"Not now" closes it and saves nothing', (await q.open('helloDlg')) === 0 && (await q.profile()) === null, await q.profile());
  await q.reload(); await q.waitForSelector('#app:not([hidden])'); await q.wait(900);
  check('...and it does not come back on the next visit', (await q.open('helloDlg')) === 0, null);
  await q.click('#menuBtn'); await q.wait(450); await q.click('#menuSort'); await q.wait(500);
  const r3 = await q.evaluate(() => [...document.querySelectorAll('#sortList button')].filter((r) => r.classList.contains('done')).length);
  check('The list is still there for them, with nothing ticked', (await q.open('sortDlg')) === 1 && r3 === 0 && /^0 of/.test(await q.txt('#sortSub')), [r3, await q.txt('#sortSub')]);
  await q.click('#sortList button[data-key=allergies]'); await q.wait(700);
  check('From there the full settings can be saved without picking a kind of home first', (await q.open('profDlg')) === 1 && !(await q.locator('#profSave').isDisabled()), null);
  await q.locator('#profAll .chip', { hasText: /^Milk$/ }).click(); await q.click('#profSave'); await q.wait(1000);
  const qp = (await q.profile()) || {};
  check('...and it saves: no milk, for two adults, as a couple', (qp.allergies || []).join() === 'Milk' && (qp.personas || []).join() === 'couple', qp);
  check('opposite: the first home is untouched by the second', ((await p.profile()) || {}).allergies.join() === 'Peanuts', null);

  check('No server errors (5xx) during the whole walk', !bad.length, bad);
  check('No script errors on any page during the whole walk', !errs.length, errs.slice(0, 4));
  await b.close();
  for (const [ok, name, detail] of R) console.log((ok ? '  pass  ' : '  FAIL  ') + name + (detail ? '\n          ' + detail : ''));
  const n = R.filter((r) => r[0]).length;
  console.log('\nWelcome walk-through: ' + n + ' of ' + R.length + ' checks pass.');
  process.exit(n === R.length ? 0 : 1);
})().catch((e) => { console.error(String((e && e.message) || e).split('\n')[0]); console.log('\nWelcome walk-through: could not run to the end.'); process.exit(2); });
