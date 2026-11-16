// Browser walk-through of the competitor round (16 Nov 2026), at phone width: instant replies, the order screenshot,
// handing the list to a store, the empty pack, freshness at a glance and what things cost last time.
// Run against a local `wrangler dev` on port 8799 with APP_PIN=test1234 in .dev.vars, on an EMPTY local database
// (the command to empty it is at the top of evals/uat-audit.cjs; also clear `prices`, `saves` and the `handoff` row in `settings`).
//   node evals/compete-audit.cjs
const { chromium } = require('playwright');
const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
const URL = 'http://127.0.0.1:8799/';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const c = await b.newContext({ viewport: { width: 400, height: 820 } });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const R = [], check = (name, ok, detail) => R.push([!!ok, name, ok ? '' : String(detail === undefined ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300)]);
  const post = (path, body, method) => p.evaluate(async ([pa, bo, me]) => { const r = await fetch(pa, { method: me || 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: bo ? JSON.stringify(bo) : undefined }); return r.json().catch(() => ({})); }, [path, body, method]);
  const state = () => p.evaluate(async () => (await fetch('/api/items', { credentials: 'same-origin' })).json());
  const A = (name, o = {}) => ({ action: 'add', name, quantity: o.qty || 1, unit: o.unit || 'pcs', area: o.area || 'Kitchen', category: o.cat || 'Pantry', expiry: o.exp || '', shelfLifeDays: 0, finishDays: 10, price: o.price || 0 });

  await p.goto('about:blank'); await p.goto(URL);
  await p.fill('#who', 'Sush'); await p.fill('#pin', 'test1234'); await p.click('#gateForm button'); await p.waitForTimeout(900); await p.click('#profSkip').catch(() => {});
  await post('/api/profile', { personas: ['mom'], adults: 2, kids: 1, stores: ['Zepto'] });
  await post('/api/apply', { source: 'bill', bought: d(-5), store: 'Zepto', currency: 'INR', actions: [A('Whole Milk', { unit: 'L', price: 62, cat: 'Dairy', exp: d(6) }), A('Baby Spinach', { price: 40, cat: 'Produce', exp: d(2) }), A('Paneer', { cat: 'Dairy', exp: d(1) }), A('Old Yogurt', { cat: 'Dairy', exp: d(-1) }), A('Eggs', { qty: 12, cat: 'Dairy' }), A('Coffee'), A('Dish Soap', { area: 'Cleaning', cat: 'Dishes' })] });
  await post('/api/extras', { text: 'Diapers (size 4)' });
  await p.reload(); await p.waitForTimeout(900);

  // ---- 5. freshness at a glance ----
  await p.click('[data-tab=pantry]'); await p.waitForTimeout(300);
  const fresh = await p.locator('#freshBar').innerText().catch(() => '');
  check('At home shows dated kitchen food as fresh, to use soon and past the date', /1\s*fresh/.test(fresh) && /2 to use soon/.test(fresh) && /1 past the date/.test(fresh), fresh);
  check('the bar has a spoken label, so the colours are not the only way to read it', /1 fresh, 2 to use soon, 1 past the date/.test((await p.locator('#freshBar .fresh').getAttribute('aria-label').catch(() => '')) || ''), await p.locator('#freshBar .fresh').getAttribute('aria-label').catch(() => ''));
  const box = await p.locator('#freshBar .card').boundingBox().catch(() => null);
  check('the card fits a phone screen without sideways scrolling', box && box.x >= 0 && box.x + box.width <= 400 && (await p.evaluate(() => document.documentElement.scrollWidth)) <= 400, box);
  await p.locator('#freshBar button', { hasText: 'to use soon' }).click(); await p.waitForTimeout(300);
  const shown = await p.locator('.ihead').allInnerTexts();
  check('tapping "to use soon" shows only those things', shown.length === 3 && shown.some((t) => /Spinach/.test(t)) && !shown.some((t) => /Coffee|Eggs/.test(t)), shown);
  await p.click('[data-tab=pantry]');
  await p.locator('.room', { hasText: 'Cleaning' }).first().click().catch(() => {}); await p.waitForTimeout(200);
  check('opposite: in another room the kitchen bar is not shown', !(await p.locator('#freshBar .card').count()), await p.locator('#freshBar').innerText().catch(() => ''));
  await p.locator('.room', { hasText: 'Whole home' }).first().click().catch(() => {});

  // ---- 1. instant replies ----
  await p.click('[data-tab=today]'); await p.waitForTimeout(200);
  await p.evaluate(() => { const t = document.querySelector('#toteHome'); if (t) t.click(); });
  await p.waitForSelector('#chatDlg[open]', { timeout: 3000 }).catch(async () => { await p.evaluate(() => window.openChat && window.openChat()); });
  const open = await p.locator('#chatDlg[open]').count();
  if (!open) await p.evaluate(() => document.getElementById('chatDlg').showModal());
  await p.fill('#chatText', "I think I made some kind of stew with whatever was around. We're out of milk. Put wipes on the list.");
  const t0 = Date.now(); await p.click('#chatGo');
  await p.waitForFunction(() => /milk/i.test((document.querySelectorAll('#chatLog .bot')[document.querySelectorAll('#chatLog .bot').length - 2] || document.querySelector('#chatLog .bot:last-child') || {}).textContent || '') || [...document.querySelectorAll('#chatLog .bot')].some((x) => /out of Whole Milk|last of the Whole Milk/i.test(x.textContent)), null, { timeout: 5000 }).catch(() => {});
  const ms = Date.now() - t0;
  const bots = await p.locator('#chatLog .bot').allInnerTexts();
  const first = bots.find((t) => /Whole Milk/i.test(t)) || '';
  check('a long message: the certain parts are shown at once (' + ms + ' ms on a local copy)', /Whole Milk/i.test(first) && /wipes/i.test(first) && ms < 3000, { ms, bots });
  check('each certain change has its own Undo', (await p.locator('#chatLog .chg').count()) >= 2, await p.locator('#chatLog .chg').count());
  await p.waitForTimeout(2500);
  const bots2 = await p.locator('#chatLog .bot').allInnerTexts();
  check('the part only a model can read gets its own reply after it, and never claims a change', bots2.length >= 2 && !/I (added|took off|put)/.test(bots2[bots2.length - 1]) && !/Reading the rest/.test(bots2[bots2.length - 1]), bots2);
  const s1 = await state();
  check('the home matches what was said: milk is out, wipes are on the list', s1.items.find((i) => i.name === 'Whole Milk').qty === 0 && s1.extras.some((x) => /wipes/i.test(x.text)), { milk: s1.items.find((i) => i.name === 'Whole Milk'), extras: s1.extras });
  await p.fill('#chatText', 'do we have eggs');
  await p.click('#chatGo'); await p.waitForTimeout(1500);
  const bots3 = await p.locator('#chatLog .bot').allInnerTexts();
  check('opposite: a one-sentence message goes the usual way and is answered once', /12/.test(bots3[bots3.length - 1]) && bots3.length === bots2.length + 1, bots3);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  if (await p.locator('#chatDlg[open]').count()) await p.evaluate(() => document.getElementById('chatDlg').close());

  // ---- 6. what it cost last time, and 3. handing the list to a store ----
  await p.click('[data-tab=list]'); await p.waitForTimeout(400);
  const list = await p.locator('#v-list').innerText();
  check('the list says what milk cost last time, in rupees', /Whole Milk[\s\S]{0,160}₹\s?62 last time/.test(list), list);
  check('and what the known part of the list came to', /About ₹\s?62 last time for 1 of these 3/.test(list), list);
  check('opposite: wipes and diapers, never bought, show no price', !/wipes[\s\S]{0,60}last time/i.test(list.split('Whole Milk')[1] || '') && !/Diapers[^\n]*\n[^\n]*last time/.test(list), list);
  const shopBtn = p.locator('#v-list button', { hasText: 'Shop at' });
  check('the store saved in the profile is the one offered', /Shop at Zepto/.test(await shopBtn.innerText().catch(() => '')), await shopBtn.innerText().catch(() => ''));
  check('opposite: nothing has been handed over before a tap', !(await state()).handoff, (await state()).handoff);
  await shopBtn.click(); await p.waitForSelector('#shopDlg[open]');
  const links = await p.locator('#shopList a').evaluateAll((as) => as.map((a) => [a.textContent, a.href, a.target, a.rel]));
  check('every thing on the list opens as a search at that store, in a new tab', links.length === 3 && links.every((l) => /^https:\/\/www\.zeptonow\.com\/search\?query=/.test(l[1]) && l[2] === '_blank' && /noopener/.test(l[3])), links);
  check('a note in brackets stays at home: the store is sent "Diapers", not the size note', links.some((l) => /query=Diapers$/.test(l[1])) && !links.some((l) => /size/i.test(l[1])), links);
  check('one button copies the whole list and opens the store', /Copy the list and open Zepto/.test(await p.locator('#shopGo').innerText()), await p.locator('#shopGo').innerText());
  await c.route('https://www.zeptonow.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>store</title>' }));
  const [pop] = await Promise.all([c.waitForEvent('page', { timeout: 4000 }).catch(() => null), p.locator('#shopList a').first().click()]);
  if (pop) await pop.close().catch(() => {});
  await p.waitForTimeout(500);
  const s2 = await state();
  check('after the tap, only the store name and the day are remembered', s2.handoff && s2.handoff.store === 'Zepto' && Object.keys(s2.handoff).sort().join() === 'day,store', s2.handoff);
  check('and the list itself is untouched', s2.extras.length === s1.extras.length, s2.extras);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  if (await p.locator('#shopDlg[open]').count()) await p.evaluate(() => document.getElementById('shopDlg').close());
  await p.reload(); await p.waitForTimeout(900); await p.click('[data-tab=today]'); await p.waitForTimeout(300);
  const today = await p.locator('#v-today').innerText();
  check('Today asks for the order screen when the order arrives', /Has your Zepto order arrived\?/.test(today) && /screenshot/.test(today), today.slice(0, 400));
  await p.locator('#v-today button', { hasText: 'Not now' }).click(); await p.waitForTimeout(500);
  check('"Not now" takes the card away, and it stays away', !/order arrived/.test(await p.locator('#v-today').innerText()) && !(await state()).handoff, (await state()).handoff);

  // ---- 2. and 4. the capture sheet ----
  await p.evaluate(() => document.getElementById('capDlg').showModal()); await p.waitForTimeout(200);
  const tiles = await p.locator('#capDlg .tile').evaluateAll((ts) => ts.map((t) => ({ text: t.innerText.replace(/\s+/g, ' ').trim(), w: Math.round(t.getBoundingClientRect().width), h: Math.round(t.getBoundingClientRect().height) })));
  check('the receipt tile says an order screenshot works too', tiles.some((t) => /Receipt or order/.test(t.text) && /screenshot of your order/.test(t.text)), tiles);
  check('there is an Empty pack tile', tiles.some((t) => /Empty pack/.test(t.text) && /onto your list/.test(t.text)), tiles);
  check('six tiles of one width, in three full rows, each big enough for a thumb', tiles.length === 6 && new Set(tiles.map((t) => t.w)).size === 1 && tiles.every((t) => t.h >= 44), tiles);
  check('the receipt tile takes a picture from the camera or the photo library (so a screenshot can be picked)', (await p.locator('#billFile').getAttribute('accept')) === 'image/*' && (await p.locator('#billFile').getAttribute('capture')) === null);
  let asked = '';
  await p.route('**/api/scan/barcode*', (r) => { asked = r.request().url(); const empty = /empty=1/.test(asked); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(empty ? { kind: 'barcode', empty: true, pack: 'Kissan 500 g', tracked: false, intent: 'update', store: '', bought: '', currency: '', actions: [{ action: 'list', name: 'Mixed Fruit Jam', note: 'Kissan 500 g', inferred: false, sure: true, quantity: 1, unit: 'pcs', area: 'Kitchen', category: 'Other', warn: '', expiry: '', shelfLifeDays: 0, price: 0, finishDays: 14 }] } : { kind: 'barcode', actions: [], intent: 'update', store: '', bought: '', currency: '' }) }); });
  await p.click('#capEmpty'); await p.waitForSelector('#codeDlg[open]');
  check('Empty pack opens the scanner with its own title', /Scan the empty pack/.test(await p.locator('#codeH').innerText()), await p.locator('#codeH').innerText());
  await p.fill('#codeInput', '8901030865278'); await p.click('#codeForm button[type=submit]'); await p.waitForTimeout(1500);
  check('the scan is sent as an empty pack', /empty=1/.test(asked), asked);
  const s3 = await state();
  check('it is on the list with its brand and size, and nothing was added at home', s3.extras.some((x) => /Mixed Fruit Jam \(Kissan 500 g\)/.test(x.text)) && !s3.items.some((i) => /jam/i.test(i.name)), s3.extras);
  check('Today says so, with Undo', /On your list: Mixed Fruit Jam \(Kissan 500 g\)/.test(await p.locator('#v-today').innerText()) && (await p.locator('#v-today button', { hasText: 'Undo all' }).count()) === 1, (await p.locator('#v-today').innerText()).slice(0, 300));
  await p.locator('#v-today button', { hasText: 'Undo all' }).click(); await p.waitForTimeout(900);
  check('Undo takes it back off the list', !(await state()).extras.some((x) => /Jam/.test(x.text)), (await state()).extras);
  await p.evaluate(() => { document.querySelectorAll('dialog[open]').forEach((x) => x.close()); document.getElementById('capDlg').showModal(); }); await p.waitForTimeout(200);
  asked = '';
  await p.click('#capCode'); await p.waitForSelector('#codeDlg[open]');
  check('opposite: Barcode still opens the usual scanner', /Scan a barcode/.test(await p.locator('#codeH').innerText()), await p.locator('#codeH').innerText());
  await p.fill('#codeInput', '8901030865278'); await p.click('#codeForm button[type=submit]'); await p.waitForTimeout(900);
  check('opposite: and its scan is not sent as an empty pack', asked && !/empty/.test(asked), asked);

  // ---- 5. food used in time ----
  await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((x) => x.close()));
  const sp = (await state()).items.find((i) => i.name === 'Baby Spinach');
  await post('/api/items/' + sp.id, { qty: 0 }, 'PATCH');
  await p.reload(); await p.waitForTimeout(900); await p.click('[data-tab=pantry]'); await p.waitForTimeout(300);
  check('finishing the spinach with two days left is counted as used in time, with what it cost', /Used in time this month: 1 thing, about ₹\s?40/.test(await p.locator('#freshBar').innerText()), await p.locator('#freshBar').innerText());

  check('no script errors on any screen', !errs.length, errs);
  const failed = R.filter((r) => !r[0]);
  for (const r of R) console.log((r[0] ? '  pass  ' : '  FAIL  ') + r[1] + (r[2] ? '\n          ' + r[2] : ''));
  console.log('\nCompetitor round in the browser: ' + (R.length - failed.length) + ' of ' + R.length + ' checks pass.');
  await b.close();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
