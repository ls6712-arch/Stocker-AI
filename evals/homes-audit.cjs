// Browser walk-through of separate homes, at phone width: the owner makes a personal code for a friend, the friend opens
// a home of her own with it, and neither sees the other's things. Each "can" has its opposite.
// Run against a local `wrangler dev` on port 8799 with APP_PIN=test1234 in .dev.vars:
//   node evals/homes-audit.cjs
const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:8799/';
(async () => {
  const browsers = [];
  const R = [], check = (name, ok, detail) => R.push([!!ok, name, ok ? '' : String(detail == null ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300)]);
  const errs = [], bad = [];
  // Each phone is a browser of its own, and the one not in use is parked on a blank page: the app draws Tote in 3D, which a
  // test browser does in software, and two of them drawing at once leave no time to answer a tap.
  const phone = async () => {
    const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); browsers.push(b);
    const c = await b.newContext({ viewport: { width: 400, height: 820 } });
    await c.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    const p = await c.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('response', (r) => { if (r.status() >= 500) bad.push(r.status() + ' ' + r.url()); });
    return p;
  };
  const signIn = async (p, name, code) => { await p.goto(URL); await p.fill('#who', name); await p.fill('#pin', code); await p.click('#gateForm button'); await p.waitForTimeout(900); await p.click('#helloSkip', { timeout: 1500 }).catch(() => {}); };
  const post = (p, path, body) => p.evaluate(async ([u, d]) => { const r = await fetch(u, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(d) }); return { status: r.status, data: await r.json().catch(() => ({})) }; }, [path, body]);
  const add = (p, name) => post(p, '/api/apply', { source: 'hand', bought: new Date().toISOString().slice(0, 10), actions: [{ action: 'add', name, quantity: 1, unit: 'pcs', area: 'Kitchen', category: 'Pantry', expiry: '', shelfLifeDays: 300, finishDays: 30 }] });
  const park = (p) => p.goto('about:blank');
  const atHome = async (p) => { await p.goto(URL); await p.waitForTimeout(900); await p.click('[data-tab=pantry]'); await p.waitForTimeout(300); return p.locator('#v-pantry').innerText(); };
  const openMenu = async (p) => { if (!p.url().startsWith(URL)) { await p.goto(URL); await p.waitForTimeout(900); } await p.click('[data-tab=today]'); await p.click('#menuBtn'); await p.waitForSelector('#menuDlg[open]'); await p.waitForTimeout(450); };
  const tag = 'T' + Date.now().toString(36).slice(-4).toUpperCase();

  // ---- the owner ----
  const owner = await phone();
  await signIn(owner, 'Sush', 'test1234');
  check('the sign-in screen asks for "Your code", not a passcode only the owner has', (await owner.locator('label[for=pin]').textContent()) === 'Your code');
  check('the owner opens her home with her passcode', await owner.locator('#app').isVisible());
  await add(owner, 'Owner Milk ' + tag);
  await openMenu(owner);
  check('the owner\'s menu has "Friends testing" and "How Tote is doing"', (await owner.locator('#menuHomes').isVisible()) && (await owner.locator('#menuScore').isVisible()));
  await owner.click('#menuHomes'); await owner.waitForSelector('#homesDlg[open]'); await owner.waitForTimeout(450);
  check('no invitation is shown before a code is made', !(await owner.locator('#homesNew').isVisible()));
  await owner.fill('#homesName', 'Asha ' + tag); await owner.click('#homesMake'); await owner.waitForTimeout(900);
  const said = await owner.locator('#homesNewMsg').textContent(), code = (said.match(/[A-Z2-9]{4}-[A-Z2-9]{4}/) || [''])[0];
  check('making a code shows it once, with the friend\'s name', !!code && said.includes('Asha ' + tag), said);
  const inviteText = await owner.locator('#homesInvite').textContent();
  check('the invitation has the link, the code, what to try, and says what the owner can see', inviteText.includes(code) && inviteText.includes('127.0.0.1:8799') && /what should I use first/.test(inviteText) && /I can see what you type/.test(inviteText), inviteText);
  await owner.click('#homesCopy'); await owner.waitForTimeout(300);
  const clip = await owner.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check('"Copy the invitation" copies exactly that text', clip === inviteText, clip.slice(0, 80));
  const row = owner.locator('#homesList .row', { hasText: 'Asha ' + tag });
  check('the friend appears in the list as "Not opened yet"', /Not opened yet/.test(await row.innerText()), await row.innerText().catch(() => 'no row'));
  const box = await row.locator('button').first().boundingBox();
  check('the buttons in the list are big enough for a thumb (40 px or more)', box && box.height >= 40, box);
  const fits = await owner.evaluate(() => { const d = document.querySelector('#homesDlg'); return d.scrollWidth <= d.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1; });
  check('nothing in the sheet runs off the side of the phone', fits);

  // ---- the friend ----
  await park(owner);
  const asha = await phone();
  await signIn(asha, 'Asha', 'ZZZZ-ZZZZ');
  check('a made-up code is refused, in plain words', /code isn't right/.test(await asha.locator('#gateMsg').textContent()) && !(await asha.locator('#app').isVisible()), await asha.locator('#gateMsg').textContent());
  await signIn(asha, 'Asha', code.toLowerCase());
  check('the friend opens Stocker with her code', await asha.locator('#app').isVisible());
  const hers0 = await atHome(asha);
  check('her home is empty: none of the owner\'s things are in it', !hers0.includes('Owner Milk ' + tag), hers0.slice(0, 200));
  await add(asha, 'Asha Rice ' + tag);
  check('what she adds shows in her home', (await atHome(asha)).includes('Asha Rice ' + tag));
  await park(asha);
  const hers = await atHome(owner);
  check('and never in the owner\'s home', !hers.includes('Asha Rice ' + tag) && hers.includes('Owner Milk ' + tag), hers.slice(0, 200));
  await park(owner); await asha.goto(URL); await asha.waitForTimeout(900);
  await openMenu(asha);
  check('her menu has no "Friends testing" and no "How Tote is doing"', !(await asha.locator('#menuHomes').isVisible()) && !(await asha.locator('#menuScore').isVisible()));
  check('her menu still has sharing, reminders and Lock', (await asha.locator('#menuShare').isVisible()) && (await asha.locator('#menuRemind').isVisible()) && (await asha.locator('#lockBtn').isVisible()));
  await asha.click('#menuShare'); await asha.waitForTimeout(450);
  check('sharing with her own household tells her to pass on her code, not a passcode', /tell them your code/.test(await asha.locator('#shareHow').textContent()), await asha.locator('#shareHow').textContent());
  await asha.keyboard.press('Escape');
  check('the scorecard and the list of homes are closed to her', (await post(asha, '/api/homes', { name: 'Eve' })).status === 403 && (await asha.evaluate(async () => (await fetch('/api/scorecard', { credentials: 'same-origin' })).status)) === 403);

  // ---- back with the owner ----
  await park(asha);
  await openMenu(owner); await owner.click('#menuHomes'); await owner.waitForSelector('#homesDlg[open]'); await owner.waitForTimeout(700);
  const row2 = owner.locator('#homesList .row', { hasText: 'Asha ' + tag });
  check('the owner sees that the friend opened it today, and how much she has used it', /Opened today/.test(await row2.innerText()) && /1 at home/.test(await row2.innerText()), await row2.innerText());
  await row2.locator('button', { hasText: 'Turn off' }).click(); await owner.waitForTimeout(800);
  const offRow = owner.locator('#homesList .row', { hasText: 'Asha ' + tag }), offBox = await offRow.boundingBox();
  check('turning her code off says, in her row where it can be read, that nothing was deleted, and offers "Turn on"', /Turned off\. Nothing was deleted/.test(await offRow.innerText()) && /Turn on/.test(await offRow.innerText()) && offBox && offBox.y > 82 && offBox.y + offBox.height <= 820, [await offRow.innerText(), offBox]);
  await asha.goto(URL); await asha.waitForTimeout(900);
  check('her phone is locked at once', (await asha.locator('#gate').isVisible()) && !(await asha.locator('#app').isVisible()));
  await owner.locator('#homesList .row', { hasText: 'Asha ' + tag }).locator('button', { hasText: 'Turn on' }).click(); await owner.waitForTimeout(800);
  const stillThere = async () => { await park(owner); const t = (await asha.locator('#app').isVisible()) && (await atHome(asha)).includes('Asha Rice ' + tag); await park(asha); await openMenu(owner); await owner.click('#menuHomes'); await owner.waitForSelector('#homesDlg[open]'); await owner.waitForTimeout(700); return t; };
  await park(owner); await asha.goto(URL); await asha.waitForTimeout(900);
  check('"Turn on" brings it back: her phone opens again, and her rice is still there', await stillThere());
  const nb = owner.locator('#homesList .row', { hasText: 'Asha ' + tag }).locator('button', { hasText: 'New code' });
  await nb.click(); await owner.waitForTimeout(300);
  check('"New code" asks for a second tap, and says it locks her phone', /locks Asha/.test(await owner.locator('#homesList .row', { hasText: 'Asha ' + tag }).innerText()) && /Tap again/.test(await owner.locator('#homesList .row', { hasText: 'Asha ' + tag }).innerText()) && !(await owner.locator('#homesNew').isVisible()));
  await owner.locator('#homesList .row', { hasText: 'Asha ' + tag }).locator('button', { hasText: 'Tap again' }).click(); await owner.waitForTimeout(900);
  const code2 = ((await owner.locator('#homesNewMsg').textContent()).match(/[A-Z2-9]{4}-[A-Z2-9]{4}/) || [''])[0];
  await park(owner); await asha.goto(URL); await asha.waitForTimeout(900);
  check('the second tap makes a new code and locks the old one', !!code2 && code2 !== code && (await asha.locator('#gate').isVisible()));
  await signIn(asha, 'Asha', code2);
  check('the new code opens the same home', (await asha.locator('#app').isVisible()) && (await atHome(asha)).includes('Asha Rice ' + tag));
  check('no errors in the page and no server errors', !errs.length && !bad.length, errs.concat(bad).join(' | '));

  for (const [ok, name, detail] of R) console.log((ok ? '  ok   ' : '  FAIL ') + name + (detail ? '\n         ' + detail : ''));
  const failed = R.filter((r) => !r[0]).length;
  console.log('\n' + (R.length - failed) + ' of ' + R.length + ' separate-homes browser checks pass');
  for (const x of browsers) await x.close();
  process.exit(failed ? 1 : 0);
})();
