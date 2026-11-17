// End to end: one household, start to finish, in a phone-sized browser. Every step goes through the screen, the real Worker,
// the stand-in model (evals/e2e/server.mjs) and the database, and is checked on what the person sees AND on how the home ends up.
// Each "does" has its opposite where it matters.
//
//   node --no-warnings evals/e2e/server.mjs 8811 &   then   node evals/e2e/journey.cjs
// Screenshots go to evals/e2e/shots/ (not committed).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.env.E2E_URL || 'http://127.0.0.1:8811';
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  const errs = [], bad = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of 4(01|04|29)|ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED/.test(m.text())) errs.push('console: ' + m.text()); });
  p.on('response', (r) => { if (r.status() >= 500) bad.push(r.status() + ' ' + r.url()); });
  const R = [], check = (name, ok, detail) => { R.push([!!ok, name, ok ? '' : String(detail == null ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400)]); };
  const wait = (ms) => p.waitForTimeout(ms);
  const ctl = async (u, body) => (await fetch(BASE + u, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json();
  const script = (rules) => ctl('/__script', { rules });
  const seen = () => ctl('/__seen');
  const sql = (q, args) => ctl('/__sql', { sql: q, args });
  const item = async (name) => (await sql('SELECT * FROM items WHERE lower(name) = lower(?)', [name]))[0];
  const list = async () => (await sql('SELECT text FROM extras')).map((x) => x.text);
  const api = (method, u, body) => p.evaluate(async ([m, x, bd]) => { const r = await fetch(x, { method: m, credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: bd ? JSON.stringify(bd) : undefined }); return { status: r.status, data: await r.json().catch(() => ({})) }; }, [method, u, body]);
  const shot = (n) => p.screenshot({ path: path.join(SHOTS, n + '.png') });
  const tab = async (t) => { await p.click('[data-tab=' + t + ']'); await wait(300); };
  const closeAll = async () => { for (let i = 0; i < 4 && (await p.locator('dialog[open]').count()); i++) { await p.keyboard.press('Escape'); await wait(200); } };
  const plan = (actions, intent = 'update') => ({ intent, actions });
  const A = (action, name, quantity, x = {}) => ({ action, name, note: '', inferred: false, quantity, quantityKnown: true, unit: 'pcs', area: 'Kitchen', category: 'Pantry', expiryDate: '', shelfLifeDays: 30, daysToFinish: 14, price: 0, warn: '', ...x });
  // say something in the chat and return the text of Tote's last bubble once it has answered
  const say = async (text) => {
    if (!(await p.locator('#chatText').isVisible())) { await p.click('#tellOpen'); await wait(400); }
    const n = await p.locator('#chatLog .bot').count();
    await p.fill('#chatText', text); await p.press('#chatText', 'Enter');
    await p.waitForFunction((k) => { const b = document.querySelectorAll('#chatLog .bot'); const last = b[b.length - 1]; return b.length > k && last && !/Thinking|Reading the rest/.test(last.textContent); }, n, { timeout: 15000 }).catch(() => {});
    await wait(400);
    const last = p.locator('#chatLog .bot').last();
    return ((await last.textContent()) || '').replace(/Not right\?$/, '').trim();
  };

  // ---- 1. signing in ----
  await p.goto(BASE); await wait(800);
  check('Locked on first open: the passcode screen shows and the tabs do not', await p.locator('#gate').isVisible() && !(await p.locator('#tabbar').isVisible()));
  await p.fill('#who', 'Sush'); await p.fill('#pin', 'wrong-one'); await p.click('#gateForm button'); await wait(1200);
  check('A wrong passcode is refused and says so', await p.locator('#gate').isVisible() && /wrong|try again|not right/i.test((await p.textContent('#gateMsg')) || ''), await p.textContent('#gateMsg'));
  await p.fill('#pin', 'test1234'); await p.click('#gateForm button'); await wait(1200);
  check('The right passcode opens the app', !(await p.locator('#gate').isVisible()), await p.textContent('#gateMsg'));
  await shot('01-first-open');

  // ---- 2. making it theirs: a child with a peanut allergy, through the profile sheet ----
  if (await p.locator('#helloDlg[open]').count()) { await p.click('#helloSkip'); await p.waitForTimeout(450); }
  if (!(await p.locator('#profDlg[open]').count())) { await p.click('#menuBtn'); await wait(300); await p.click('#menuEdit'); await wait(400); }
  check('The first-run profile sheet opens', (await p.locator('#profDlg[open]').count()) === 1);
  await p.locator('#profHome button').first().click(); await wait(150);
  await p.locator('#profMembers button', { hasText: 'Add a person' }).click(); await wait(300);
  await p.fill('#memName', 'Leo');
  if (await p.locator('#memKind select').count()) await p.selectOption('#memKind select', { label: 'Child' }).catch(() => {});
  else await p.locator('#memKind button', { hasText: /^Child$/ }).click().catch(() => {});
  await p.locator('#memAll button', { hasText: /^Peanuts$/ }).click(); await wait(100);
  await shot('02-leo-peanuts');
  await p.click('#memSave'); await wait(300);
  await p.click('#profSave'); await wait(900);
  const prof = (await api('GET', '/api/items')).data.profile || {};
  const leo = (prof.members || []).find((m) => m.name === 'Leo');
  check('Saved: Leo, with a peanut allergy, is part of the home', !!leo && leo.allergies.includes('Peanuts'), prof.members);
  await closeAll();

  // ---- 3. a pasted receipt, read by the model ----
  await script([{ when: 'TRADER', plan: plan([A('add', 'Whole Milk', 1, { unit: 'L', category: 'Dairy', price: 3.49 }), A('add', 'Eggs', 12, { category: 'Dairy', price: 4.29 }), A('add', 'Spaghetti', 500, { unit: 'g', price: 1.29 }), A('add', 'Peanut Butter Pretzel Sandwich', 3, { unit: 'pack', category: 'Snacks', price: 4.99 }), A('add', 'Bananas', 6, { category: 'Produce', price: 1.74 }), A('add', 'Greek Yogurt', 1, { unit: 'pack', category: 'Dairy', price: 5.49 })]) }]);
  await p.click('#tellSnap'); await wait(300); await p.click('#capType'); await wait(300);
  await p.fill('#typeText', "TRADER JOE'S\nWHOLE MILK 1L 3.49\nEGGS LARGE 12CT 4.29\nSPAGHETTI 500G 1.29\nPB PRETZEL SANDWICH 3PK 4.99\nBANANAS 6 1.74\nGREEK YOGURT 5.49\nVISA 4111111111111111 TOTAL 21.29");
  await p.click('#typeForm button[type=submit]'); await wait(1500);
  if (await p.locator('#licDlg[open]').count()) { await p.click('#licOk'); await wait(1500); }
  await shot('03-receipt-read');
  const names = (await sql('SELECT name FROM items')).map((x) => x.name);
  check('The receipt puts all six things at home', ['Whole Milk', 'Eggs', 'Spaghetti', 'Peanut Butter Pretzel Sandwich', 'Bananas', 'Greek Yogurt'].every((n) => names.includes(n)), names);
  const s3 = await seen();
  check('The card number printed on the receipt never reached the model', s3.length >= 1 && !s3.some((x) => /4111/.test(x.said)), s3.map((x) => x.said.slice(-60)));
  await closeAll(); await tab('pantry');
  const pb = p.locator('.ihead', { hasText: 'Peanut Butter Pretzel Sandwich' });
  check('At home, the peanut butter sandwich is flagged for Leo', (await pb.locator('.pill.bad', { hasText: /peanut/i }).count()) >= 1, await pb.textContent().catch(() => 'not found'));
  check('...and the bananas are not flagged', (await p.locator('.ihead', { hasText: 'Bananas' }).locator('.pill.bad').count()) === 0);
  await shot('04-at-home');

  // ---- 4. everyday messages read by code, with no model call ----
  await script([{ when: '*', answer: 'The model should not have been asked.' }]);
  let r = await say("we're out of milk");
  check('"we\'re out of milk": milk is used up and goes on the list', (await item('Whole Milk')).qty === 0 && /milk/i.test(r), r);
  check('...with no model call', (await seen()).length === 0, (await seen()).length);
  r = await say('used 2 eggs');
  check('"used 2 eggs" takes two off', (await item('Eggs')).qty === 10 && /2/.test(r), r);
  await p.locator('#chatLog .bot').last().locator('button', { hasText: 'Undo' }).first().click(); await wait(700);
  check('Undo in the chat puts them back', (await item('Eggs')).qty === 12, (await item('Eggs')).qty);
  r = await say('do we have bananas?');
  check('"do we have bananas?" is answered by code with the amount', /6/.test(r) && /banana/i.test(r) && (await seen()).length === 0, r);
  await shot('05-code-chat');

  // ---- 5. a dish: the model guesses, the person confirms ----
  await script([{ when: 'carbonara', plan: plan([A('use', 'Spaghetti', 250, { unit: 'g', inferred: true }), A('use', 'Eggs', 3, { inferred: true })]) }]);
  r = await say('made carbonara for dinner tonight');
  check('A dish is a guess: Tote asks before changing anything', /yes, update/i.test(r) && (await item('Spaghetti')).qty === 500, r);
  await p.locator('#chatLog .bot').last().locator('button', { hasText: 'Yes, update' }).click(); await wait(900);
  check('"Yes, update" takes the spaghetti and eggs off', (await item('Spaghetti')).qty === 250 && (await item('Eggs')).qty === 9, [(await item('Spaghetti')).qty, (await item('Eggs')).qty]);

  // ---- 6. what the model says about food, in a home with an allergy ----
  await script([{ when: 'lunch', answer: 'You could pack the Peanut Butter Pretzel Sandwich and some Bananas!!! \u{1F34C}\u{1F389} Both are easy to grab.' }]);
  r = await say('what should Leo take for lunch tomorrow?');
  check('The model offered the peanut sandwich for Leo\'s lunch: Tote does not pass it on', !/pack the peanut|peanut butter pretzel sandwich and/i.test(r) && /Leo is marked no peanuts/i.test(r) && /check the label/i.test(r), r);
  check('...the bananas are still suggested', /Bananas/.test(r), r);
  check('...and the emoji and "!!!" are gone', !/\p{Extended_Pictographic}/u.test(r) && !/!!/.test(r), r);
  await shot('06-allergy-answer');
  await script([{ when: 'snack', answer: 'Yes, that is fine for Leo. He can have it after school.' }]);
  r = await say('and is that snack in the cupboard alright for him after school');
  check('"Yes, that is fine for Leo" is not passed on; Tote says to check the label', !/fine for Leo/i.test(r) && /check the label/i.test(r), r);
  await script([{ when: 'yogurt', answer: 'The Greek Yogurt is a good snack for Leo, best by Friday.' }]);
  r = await say('what about the yogurt for his snack?');
  check('Opposite: yogurt, which clashes with nothing Leo avoids, is still suggested', /Greek Yogurt is a good snack/i.test(r), r);

  // ---- 7. private details ----
  await script([{ when: '*', plan: plan([A('add', 'Oat Milk', 1, { unit: 'L', category: 'Dairy' })]), answer: 'Noted.' }]);
  await say('deliver to 12 Oak Street, Apt 4B, Jersey City NJ 07302 and grab some oat milk from the corner store too');
  const oat = !!(await item('Oat Milk'));
  await say('my password is Hunter2!x, anyway the kids got through the oat milk thing already somehow');
  const s7 = await seen(), turns = await sql('SELECT said, reply FROM turns');
  check('An address and a password typed in the chat never reach the model', !s7.some((x) => /12 Oak|Apt 4B|07302|Hunter2/.test(x.said + x.sys)), s7.map((x) => x.said.slice(0, 120)));
  check('...and are not kept in the record of what was said', !turns.some((t) => /12 Oak|07302|Hunter2/.test(t.said + ' ' + t.reply)), turns.slice(-3));
  check('...while the rest of the message still did its job (oat milk added)', oat, (await sql('SELECT name FROM items')).map((x) => x.name));

  // ---- 8. what the model gets wrong is not believed ----
  await script([{ when: 'wholesale', plan: plan([A('add', 'Sugar', 1e12, { unit: 'kg' })]) }]);
  r = await say('picked up sugar at the wholesale club on the way home');
  const sugar = await item('Sugar');
  check('A model reading of 1,000,000,000,000 kg of sugar is kept as one, marked as a guess', !!sugar && sugar.qty === 1 && sugar.unsure === 1, sugar);
  await script([{ when: 'odd', plan: plan([A('destroy', 'Caviar', 3), A('purchase', 'Truffles', 2)]) }]);
  r = await say('something odd happened with the shopping I think');
  check('Actions the app does not know ("destroy", "purchase") change nothing and claim nothing', !(await item('Caviar')) && !(await item('Truffles')) && !/I added/i.test(r), r);
  await script([{ when: 'cupboard', plan: plan(['Rice', 'Pasta', 'Flour', 'Oats', 'Lentils', 'Salt', 'Sugar', 'Tea', 'Coffee', 'Honey', 'Jam'].map((n) => A('set', n, 2))) }]);
  const before8 = (await sql('SELECT COUNT(*) AS n FROM items'))[0].n;
  r = await say('counted the whole cupboard this afternoon, here is what is there');
  check('Eleven changes in one message are refused, and Tote says so', /not changed anything/i.test(r) && (await sql('SELECT COUNT(*) AS n FROM items'))[0].n === before8 && (await item('Sugar')).qty === 1, r);
  await shot('07-limits');

  // ---- 9. the list ----
  await closeAll(); await tab('list');
  await p.fill('#extraText', 'dish soap'); await p.locator('#v-list form button[type=submit]').click(); await wait(900);
  const L = await list();
  check('The list has the milk that ran out and the dish soap typed in', (await p.locator('#v-list').textContent()).match(/Whole Milk/) && L.some((x) => /dish soap/i.test(x)), L);
  await shot('08-list');
  const big = await api('PATCH', '/api/items/' + (await item('Bananas')).id, { qty: 1e9 });
  check('An amount changed by hand cannot go past the ceiling', big.status === 200 && (await item('Bananas')).qty === 1000, (await item('Bananas')).qty);
  await api('PATCH', '/api/items/' + (await item('Bananas')).id, { qty: 6 });

  // ---- 10. the AI allowance runs out ----
  await script([{ when: '*', fail: 'quota' }]);
  r = await say('had a few bits from the farmers market this morning, the usual things');
  check('When the AI allowance runs out mid-message, Tote says so and changes nothing', /allowance/i.test(r) && !(await item('Farmers Market')), r);
  r = await say('add bread');
  check('...and plain messages still work by code', (await list()).some((x) => /bread/i.test(x)) && /bread/i.test(r), r);
  await shot('09-allowance-out');

  // ---- 11. the scorecard page and signing out ----
  await closeAll();
  const sc = await c.newPage(); const scErr = []; sc.on('pageerror', (e) => scErr.push(e.message));
  await sc.goto(BASE + '/scorecard.html'); await sc.waitForTimeout(1500);
  check('The scorecard page opens for the signed-in home with no script errors', !scErr.length && (await sc.locator('body').textContent()).length > 200, scErr);
  await sc.close();
  await p.click('#menuBtn'); await wait(300);
  await p.click('#lockBtn').catch(async () => { await closeAll(); await api('POST', '/api/logout'); await p.reload(); });
  await wait(800);
  check('Locking shows the passcode screen again', await p.locator('#gate').isVisible());
  check('...and the data is closed to that phone until the passcode is entered', (await api('GET', '/api/items')).status === 401);

  // ---- pictures ----
  const pics = await sql('SELECT name_key, length(data) AS n FROM pics');
  check('A thing with no picture is remembered as tried, so it is not drawn again on every view', pics.length >= 6 && pics.every((x) => x.n >= 1), pics.slice(0, 4));

  // ---- throughout ----
  check('No server errors (5xx) during the whole journey', !bad.length, bad);
  check('No script errors on the page during the whole journey', !errs.length, errs);

  await b.close();
  for (const [ok, name, d] of R) console.log((ok ? '  pass  ' : '  FAIL  ') + name + (d ? '\n          ' + d : ''));
  const n = R.filter((x) => x[0]).length;
  console.log('\nEnd to end: ' + n + ' of ' + R.length + ' checks pass.');
  process.exit(n === R.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
