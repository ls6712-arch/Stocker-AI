// Browser walk-through of the defects from the 16 Nov 2026 user acceptance test, at phone width.
// Run against a local `wrangler dev` on port 8799 with APP_PIN=test1234 in .dev.vars, on an EMPTY local database:
//   npx wrangler d1 execute pantry-keeper --local --command "DELETE FROM items; DELETE FROM extras; DELETE FROM purchases; DELETE FROM log; DELETE FROM turns; DELETE FROM feedback; DELETE FROM settings WHERE k IN ('profile') OR k LIKE 'dish:%'"
//   node evals/uat-audit.cjs
const { chromium } = require('playwright');
const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
const URL = 'http://127.0.0.1:8799/';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const c = await b.newContext({ viewport: { width: 400, height: 820 } });
  const p = await c.newPage();
  const errs = [], bad = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('response', (r) => { if (r.status() >= 500) bad.push(r.status() + ' ' + r.url()); });
  const R = [], check = (name, ok, detail) => R.push([!!ok, name, ok ? '' : String(detail == null ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300)]);
  const wait = (ms) => p.waitForTimeout(ms);
  const api = (method, path, body, day) => p.evaluate(async ([m, u, bd, dy]) => { const r = await fetch(u, { method: m, credentials: 'same-origin', headers: Object.assign({ 'content-type': 'application/json' }, dy ? { 'x-today': dy } : {}), body: bd ? JSON.stringify(bd) : undefined }); return { status: r.status, data: await r.json().catch(() => ({})) }; }, [method, path, body || null, day || null]);
  const home = async () => (await api('GET', '/api/items')).data;
  const item = async (name) => (await home()).items.find((i) => i.name === name);
  const toast = async () => (await p.locator('#toast:not([hidden]) #toastMsg').textContent().catch(() => '')) || '';
  const tab = async (t) => { await p.click('[data-tab=' + t + ']'); await wait(250); };
  const closeAll = async () => { for (let i = 0; i < 4 && (await p.locator('dialog[open]').count()); i++) { await p.keyboard.press('Escape'); await wait(200); } };

  await p.goto(URL); await p.fill('#who', 'Sush'); await p.fill('#pin', 'test1234'); await p.click('#gateForm button'); await wait(900); await p.click('#helloSkip').catch(() => {});
  const A = (name, q, unit, area, category, exp, extra) => Object.assign({ action: 'add', name, quantity: q, unit, area, category, expiry: exp || '', shelfLifeDays: exp ? 0 : 300, finishDays: 30 }, extra || {});
  await api('POST', '/api/profile', { personas: ['mom'], adults: 1, kids: 3, buddy: 'Bagsy', members: [{ name: 'Leo', kind: 'child', allergies: ['Peanuts'] }] });
  await api('POST', '/api/apply', { source: 'bill', bought: d(-5), actions: [
    A('Iceberg Lettuce', 2, 'lb', 'Kitchen', 'Produce', d(2)), A('Baby Spinach', 1, 'pack', 'Kitchen', 'Produce', d(1)), A('Whole Milk', 1, 'L', 'Kitchen', 'Dairy', d(3)), A('Strawberries', 1, 'pack', 'Kitchen', 'Produce', d(2)),
    A('Tortillas', 8, 'pcs', 'Kitchen', 'Bakery', d(3)), A('Peanut Butter Pretzel Sandwich', 6, 'pcs', 'Kitchen', 'Snacks'), A('Dumplings', 1, 'pack', 'Kitchen', 'Frozen', '', { warn: 'contains wheat' }),
    A('Ground Chicken', 1, 'lb', 'Kitchen', 'Meat', d(6)), A('Chicken Thighs', 2, 'lb', 'Kitchen', 'Meat', d(6)), A('Coffee', 1, 'pack', 'Kitchen', 'Pantry'), A('Baby Wash', 1, 'pcs', 'Kids', 'Kids care')] });
  await api('PATCH', '/api/items/' + (await item('Coffee')).id, { qty: 0, out: true });
  for (const t of ['Cheese', 'Almond milk']) await api('POST', '/api/extras', { text: t });
  await p.reload(); await wait(1000);

  // ---- bug 4: one number on Today and the bell, and the sheet lists all of them
  const head = await p.locator('#v-today .hero h2').textContent();
  const words = { One: 1, Two: 2, Three: 3 }, nHead = words[(head.match(/^(One|Two|Three)\b/) || [])[1]] || Number((head.match(/^(\d+)/) || [])[1] || 0);
  const dot = Number((await p.textContent('#bellDot')).trim());
  await p.click('#bell'); await p.waitForSelector('#nudgeDlg[open]');
  const rows = await p.locator('#nudgeList .nudge').count();
  check('Today headline, the bell and the rows in its sheet all show the same number', nHead > 3 && nHead === dot && dot === rows, { head, dot, rows });
  check('The sheet lists every use-soon item, not just today\'s', (await p.locator('#nudgeList .nudge', { hasText: /days? left/ }).count()) >= 4, await p.locator('#nudgeList').textContent());
  await closeAll();

  // ---- bugs 1 and 9: flags follow the household's allergies
  await tab('pantry');
  check('Peanut butter sandwich is flagged for Leo at home', await p.locator('.ihead', { hasText: 'Peanut Butter Pretzel Sandwich' }).locator('.pill.bad', { hasText: /peanut/i }).count() === 1, await p.locator('.ihead', { hasText: 'Peanut Butter Pretzel' }).textContent().catch(() => 'not found'));
  check('Dumplings are not flagged for wheat when nobody avoids wheat', await p.locator('.ihead', { hasText: 'Dumplings' }).locator('.pill.bad').count() === 0, await p.locator('.ihead', { hasText: 'Dumplings' }).textContent().catch(() => 'not found'));

  // ---- bug 7: "Used it all" has Undo
  await tab('today');
  const line = p.locator('#v-today .need .rows .row', { has: p.locator('button', { hasText: 'Used it all' }) }).first(), firstName = await line.locator('.name').first().textContent();
  const before = await item(firstName);
  await line.locator('button', { hasText: 'Used it all' }).click(); await wait(900);
  check('"Used it all" says what it did and offers Undo', /used up/i.test(await toast()) && (await p.locator('#toastBtn:not([hidden])').count()) === 1 && (await item(firstName)).qty === 0, await toast());
  await p.click('#toastBtn'); await wait(900);
  check('Undo puts the amount back exactly', (await item(firstName)).qty === before.qty, [before.qty, (await item(firstName)).qty]);

  // ---- bug 8: Threw it away and Remove can be undone
  await tab('pantry'); await p.fill('#search', 'Iceberg'); await wait(250); await p.locator('.ihead').first().click(); await wait(200);
  await p.locator('.ipanel .acts button', { hasText: 'Threw it away' }).click(); await wait(800);
  const gone = !(await item('Iceberg Lettuce'));
  await p.click('#toastBtn'); await wait(900);
  const back = await item('Iceberg Lettuce');
  check('"Threw it away" offers Undo, and Undo restores the item as it was', gone && back && back.qty === 2 && back.unit === 'lb' && (await home()).waste === 0, [gone, back]);
  await p.fill('#search', 'Tortillas'); await wait(250); await p.locator('.ihead').first().click(); await wait(200);
  await p.locator('.ipanel button.danger', { hasText: 'Remove' }).click(); await wait(700);
  const gone2 = !(await item('Tortillas'));
  await p.click('#toastBtn'); await wait(900);
  check('"Remove" offers Undo, and Undo restores the item', gone2 && !!(await item('Tortillas')) && (await item('Tortillas')).qty === 8, [gone2, await item('Tortillas')]);
  await p.fill('#search', '');

  // ---- bugs 5, 6, 14: the list
  await tab('list');
  await p.fill('#extraText', '2 gallons whole milk, birthday candles and size 5 diapers'); await p.locator('#v-list form button[type=submit]').click(); await wait(900);
  let ex = (await home()).extras.map((x) => x.text);
  check('A long line of three things becomes three rows, with no server error', ex.includes('Birthday candles') && ex.includes('Size 5 diapers') && ex.some((x) => /whole milk/i.test(x)) && !bad.length && !/wrong|connection/i.test(await toast()), [ex, bad, await toast()]);
  await p.locator('#v-list .rowbtn', { hasText: 'Birthday candles' }).click(); await p.waitForSelector('#rowDlg[open]');
  await p.fill('#rowText', 'Birthday candles, gold'); await p.click('#rowMore'); await p.click('#rowSave'); await wait(800);
  ex = (await home()).extras.map((x) => x.text);
  check('A list row can be renamed and given a quantity', ex.includes('Birthday candles, gold ×2'), ex);
  await p.locator('#v-list .rowbtn', { hasText: 'Birthday candles' }).click(); await p.waitForSelector('#rowDlg[open]'); await p.click('#rowOff'); await wait(800);
  const off = !(await home()).extras.some((x) => /candles/.test(x.text));
  await p.click('#toastBtn'); await wait(1200);
  check('A list row can be removed, and Undo brings it back with its quantity', off && (await home()).extras.some((x) => x.text === 'Birthday candles, gold ×2'), [off, (await home()).extras.map((x) => x.text)]);
  await p.locator('#v-list .row', { hasText: 'Cheese' }).locator('.check').click(); await wait(800);
  const ticked = !(await home()).extras.some((x) => x.text === 'Cheese');
  check('Ticking a row says so and offers Undo', ticked && /Ticked off Cheese/.test(await toast()) && (await p.locator('#toastBtn:not([hidden])').count()) === 1, await toast());
  await p.click('#toastBtn'); await wait(900);
  check('Undo after a tick puts it back', (await home()).extras.some((x) => x.text === 'Cheese'));
  await p.locator('#v-list .rowbtn', { hasText: 'Coffee' }).click(); await p.waitForSelector('#rowDlg[open]'); await p.click('#rowOff'); await wait(800);
  const coffee = await item('Coffee');
  check('Something tracked can come off the list without leaving home', coffee && coffee.nolist === 1 && (await p.locator('#v-list .rowbtn', { hasText: 'Coffee' }).count()) === 0, coffee);
  await api('POST', '/api/extras', { text: 'Peanut butter cups' }); await p.reload(); await wait(900); await tab('list');
  check('Something with peanut in its name is flagged on the list too', (await p.locator('#v-list .rowbtn', { hasText: 'Peanut butter cups' }).locator('.pill.bad', { hasText: /peanut/i }).count()) === 1, await p.locator('#v-list').textContent());
  await api('POST', '/api/extras', { text: 'Yogurt' });
  await api('POST', '/api/apply', { source: 'bill', bought: d(0), actions: [A('Greek Yogurt', 1, 'pcs', 'Kitchen', 'Dairy', d(10))] });
  check('Buying Greek yogurt clears "Yogurt" from the list', !(await home()).extras.some((x) => x.text === 'Yogurt'), (await home()).extras.map((x) => x.text));

  // ---- bug 13: the add form sorts like chat does
  await p.reload(); await wait(900); await tab('pantry'); await p.click('#addHere'); await p.waitForSelector('#addDlg[open]');
  check('From Whole home the add sheet is not titled "Add to the kitchen"', (await p.textContent('#addH')) === 'Add something', await p.textContent('#addH'));
  await p.fill('#addName', 'Diapers'); await p.click('#addGo'); await wait(900);
  const dia = await item('Diapers');
  check('Diapers added by hand land in Kids, not the kitchen cupboard', dia && dia.area === 'Kids' && /kids/i.test(await toast()), [dia, await toast()]);
  await closeAll();

  // ---- bug 9: Fix on a learned habit shows the item whatever room was open
  for (const day of [d(-9), d(-6), d(-3)]) await api('POST', '/api/apply', { source: 'bill', bought: day, actions: [A('Oat Milk', 1, 'L', 'Kitchen', 'Drinks')] }, day);
  await p.reload(); await wait(900); await tab('pantry'); await p.locator('#rooms .room', { hasText: 'Kids' }).click(); await wait(200);
  await tab('log'); await p.locator('#v-log button', { hasText: 'Fix' }).first().click(); await wait(400);
  check('"Fix" opens the item itself, not an empty Kids room', (await p.locator('.ihead', { hasText: 'Oat Milk' }).count()) === 1 && !/Nothing in/.test(await p.textContent('#pantryList')), await p.textContent('#pantryList'));
  await p.fill('#search', '');

  // ---- bug 11: on the list is not "have"
  await tab('log');
  const tile = p.locator('#v-log .tile', { hasText: 'Friday taco night' });
  await tile.click(); await p.waitForSelector('#kitDlg[open]'); await p.click('#kitAll'); await wait(2500);
  const kitSub = await p.textContent('#kitSub');
  check('A kit whose things are only on the list does not say "You have everything"', !/You have everything/.test(kitSub) && /on your list/.test(kitSub), kitSub);
  await closeAll(); await wait(300);
  check('...and its tile does not say "All set"', !/All set/.test(await tile.textContent()) && /on your list/.test(await tile.textContent()), await tile.textContent());

  // ---- bug 17: the helper's own name everywhere
  check('Renamed helper: tab title, menu and microphone use the new name', /Bagsy/.test(await p.title()) && (await p.getAttribute('#tellMic', 'aria-label')) === 'Talk to Bagsy' && (await p.textContent('#menuScoreT')) === 'How Bagsy is doing', [await p.title(), await p.getAttribute('#tellMic', 'aria-label'), await p.textContent('#menuScoreT')]);

  // ---- bugs 2, 12, 20: chat
  await tab('today'); await p.click('#tellOpen'); await p.waitForSelector('#chatDlg[open]');
  const ask = async (t) => { await p.fill('#chatText', t); await p.keyboard.press('Enter'); await p.waitForFunction(() => { const m = [...document.querySelectorAll('#chatLog .msg.bot')].pop(); return m && !/^Thinking/.test(m.textContent) && !document.querySelector('#chatGo').disabled; }, null, { timeout: 30000 }); return (await p.locator('#chatLog .msg.bot').last().textContent()) || ''; };
  const which = await ask("We're out of chicken");
  check('"We\'re out of chicken" asks which one and changes nothing', /Which one/i.test(which) && (await item('Ground Chicken')).qty === 1 && (await item('Chicken Thighs')).qty === 2, which);
  const no = await ask("Can I put the peanut butter pretzel sandwiches in Leo's lunchbox?");
  check('"Can Leo have the peanut butter sandwiches?" is answered No, with the reason', /^No\. Leo is marked no peanuts/.test(no) && /check the label/i.test(no), no);
  const tips = await p.locator('#chatTips').textContent();
  check('No suggestion to cook with the flagged sandwich', !/make with the peanut butter pretzel/i.test(tips), tips);
  const many = await ask('take everything off my shopping list except cheese');
  check('More than ten at once is refused plainly, and nothing changes', /more than I change in one go/.test(many) && (await home()).extras.length > 10, many);
  for (const x of (await home()).extras.slice(5)) if (x.text !== 'Cheese') await api('DELETE', '/api/extras/' + x.id);
  const clear = await ask('take everything off my shopping list except cheese');
  const left = (await home()).extras.map((x) => x.text);
  check('"Take everything off my list except cheese" leaves cheese, and never says "at home"', left.join() === 'Cheese' && !/at home/.test(clear), [clear, left]);
  await closeAll(); await p.goto(URL + 'scorecard.html'); await wait(700);
  check('The scorecard page uses the helper\'s own name', /Bagsy scorecard/.test(await p.textContent('h1')), await p.textContent('h1'));
  await p.goBack(); await wait(1000); await p.click('#tellOpen'); await p.waitForSelector('#chatDlg[open]');
  const kept = await p.textContent('#chatLog');
  check('The conversation is still there after visiting another page', /out of chicken/i.test(kept) && /Which one/i.test(kept), kept.slice(0, 200));
  await closeAll();

  // ---- bug 10: "I got N things wrong lately" then "Show me" opens the review
  await api('POST', '/api/chat', { text: 'add bananas to the list' });
  await api('POST', '/api/feedback', { kind: 'down', said: 'add bananas to the list', reply: 'x', route: 'update' });
  await p.reload(); await wait(1000); await p.click('#bell'); await p.waitForSelector('#nudgeDlg[open]');
  const wrong = p.locator('#nudgeList .nudge', { hasText: /wrong lately/ });
  const hasWrong = await wrong.count();
  if (hasWrong) { await wrong.locator('button', { hasText: 'Show me' }).click(); await wait(1500); }
  check('"Show me" on "I got things wrong lately" opens the review page', hasWrong === 1 && /\/evals(\.html)?#real/.test(p.url()), [hasWrong, p.url()]);
  await p.goto(URL); await wait(1000);

  // ---- bugs 15, 16: profile
  await p.click('#menuBtn'); await p.waitForSelector('#menuDlg[open]'); await p.click('#menuEdit'); await p.waitForSelector('#profDlg[open]');
  const vegan = p.locator('#profStyle .tile', { hasText: 'A plant-based home' });
  await vegan.click(); await wait(150);
  const onAfterPick = await p.locator('#profDiet .chip[aria-pressed=true]', { hasText: /Vegan/ }).count();
  await vegan.click(); await wait(150);
  check('Removing the Vegan style switches the Vegan diet off again', onAfterPick === 1 && (await p.locator('#profDiet .chip[aria-pressed=true]', { hasText: /Vegan/ }).count()) === 0, onAfterPick);
  await p.locator('#profHome .tile', { hasText: 'Family of four' }).click(); await wait(150);
  check('Picking another kind of home does not overwrite the people already counted', /1/.test(await p.locator('#profPeople label').first().textContent()) && /3/.test(await p.locator('#profPeople label').nth(1).textContent()), await p.textContent('#profPeople'));
  await p.locator('#profHome .tile', { hasText: 'Family of four' }).click();
  await p.evaluate(() => { document.getElementById('profMore').open = true; }); await p.fill('#profBudget', '-900'); await p.click('#profSave'); await wait(500);
  const stillOpen = await p.locator('#profDlg[open]').count(), msg = await p.evaluate(() => document.getElementById('profBudget').validationMessage);
  check('A budget of -900 is refused with a reason, not silently dropped', stillOpen === 1 && /below zero/.test(msg), [stillOpen, msg]);
  await p.fill('#profBudget', '900'); await p.click('#profSave'); await wait(900);
  check('A real budget is saved', ((await home()).profile || {}).budget === 900, (await home()).profile);
  await api('POST', '/api/apply', { source: 'bill', bought: d(0), currency: 'USD', actions: [A('Basmati Rice', 1, 'kg', 'Kitchen', 'Pantry', '', { price: 12 })] });
  await p.reload(); await wait(900); await tab('log');
  check('...and shown beside what was spent', /Spent this month of your \$900 budget/.test(await p.textContent('#v-log')), (await p.textContent('#v-log')).match(/Spent this month.{0,40}/));

  // ---- phone width, and a clean walk
  let wide = [];
  for (const t of ['today', 'pantry', 'list', 'log']) { await tab(t); const w = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); if (w[0] > w[1] + 1) wide.push(t + ' ' + w.join('>')); }
  check('No sideways scrolling of the page at phone width', !wide.length, wide);
  check('No server errors during the whole walk', !bad.length, bad);
  check('No script errors during the whole walk', !errs.length, errs.slice(0, 3).join(' | '));
  let pass = 0; for (const [ok, name, detail] of R) { if (ok) pass++; console.log((ok ? '  ok  ' : 'FAIL  ') + name + (ok || !detail ? '' : '  ->  ' + detail)); }
  console.log('\n' + pass + ' of ' + R.length + ' checks passed');
  await b.close();
  process.exit(pass === R.length ? 0 : 1);
})().catch((e) => { console.error('audit crashed:', e.message); process.exit(2); });
