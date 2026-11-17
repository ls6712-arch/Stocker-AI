// Real sign-in, in a phone-sized browser: the sign-in screen, a code by email, Google, the cap, the owner's list of homes,
// signing out and deleting a home. Each step is checked on the screen and in the database.
// Google's own button cannot load here, so a stand-in button hands the page a token exactly as Google's script would;
// the server checks that token for real (against a stand-in key). The mail service is a stand-in that keeps what it was sent.
//
//   E2E_SIGNUP=1 E2E_HOMES_MAX=2 node --no-warnings evals/e2e/server.mjs 8812 &   then   node evals/signup-audit.cjs
// Screenshots go to evals/e2e/shots/ (not committed).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.env.E2E_URL || 'http://127.0.0.1:8812';
const SHOTS = path.join(__dirname, 'e2e', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const errs = [], bad = [], asked = [];
  const R = [], check = (name, ok, detail) => { R.push([!!ok, name, ok ? '' : String(detail == null ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400)]); };
  const ctl = async (u, body) => (await fetch(BASE + u, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json();
  const sql = (q, args) => ctl('/__sql', { sql: q, args });
  const lastCode = async (to) => { const m = (await ctl('/__mail')).filter((x) => x.to === to).pop(); return m ? (m.text.match(/\b\d{6}\b/) || [''])[0] : ''; };
  // one phone: its own cookies. `fakeGoogle` puts a stand-in for Google's button on the page before the app's script runs.
  const phone = async (fakeGoogle) => {
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => { asked.push(r.request().url()); r.abort(); });
    if (fakeGoogle) await c.addInitScript((email) => {
      window.google = { accounts: { id: {
        initialize: (cfg) => { window.__g = cfg; },
        renderButton: (el) => { const k = document.createElement('button'); k.type = 'button'; k.id = 'gFake'; k.className = 'btn block'; k.textContent = 'Continue with Google'; k.onclick = async () => window.__g.callback({ credential: await (await fetch('/__token?email=' + encodeURIComponent(email))).text() }); el.append(k); },
      } } };
    }, fakeGoogle);
    const p = await c.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|ERR_FAILED|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|ERR_BLOCKED/.test(m.text())) errs.push('console: ' + m.text()); });
    p.on('response', (r) => { if (r.status() >= 500 && r.status() !== 503) bad.push(r.status() + ' ' + r.url()); });
    p.wait = (ms) => p.waitForTimeout(ms);
    p.msg = async () => ((await p.locator('#gateMsg').textContent()) || '').trim();
    p.closeAll = async () => { for (let i = 0; i < 4 && (await p.locator('dialog[open]').count()); i++) { await p.keyboard.press('Escape'); await p.wait(250); } };
    p.inApp = async () => { await p.waitForSelector('#app:not([hidden])', { timeout: 8000 }).catch(() => {}); await p.wait(500); return p.locator('#app').isVisible(); };
    p.menu = async () => { await p.closeAll(); await p.click('#menuBtn'); await p.wait(450); };
    p.shown = (sel) => p.locator(sel).isVisible();
    p.shot = (n) => p.screenshot({ path: path.join(SHOTS, 'signup-' + n + '.png') });
    p.byMail = async (to) => { await p.fill('#mailTo', to); await p.click('#mailGo'); await p.waitForSelector('#mailCodeRow:not([hidden])', { timeout: 5000 }).catch(() => {}); await p.fill('#mailCode', await lastCode(to)); await p.click('#mailGo'); };
    return p;
  };

  // ---- 1. the sign-in screen ----
  const a = await phone();
  await a.goto(BASE + '/'); await a.waitForSelector('#signin:not([hidden])', { timeout: 8000 }).catch(() => {}); await a.wait(400);
  check('A new visitor sees the ways to sign in, not a code field', (await a.shown('#signin')) && (await a.shown('#mailForm')) && !(await a.shown('#gateForm')), await a.msg());
  check('...and is told that signing in makes a home', /Signing in makes one for you/.test(await a.msg()), await a.msg());
  check('The page asks Google for its button, and no other outside site but the lettering', asked.some((u) => u.startsWith('https://accounts.google.com/gsi/client')) && asked.every((u) => /^https:\/\/(accounts\.google\.com\/gsi\/|fonts\.(googleapis|gstatic)\.com\/)/.test(u)), [...new Set(asked)]);
  check('When Google cannot be reached, the screen says so and the email way still works', /Could not reach Google/.test((await a.locator('#gBtn').textContent()) || '') && (await a.shown('#mailGo')), await a.locator('#gBtn').textContent());
  check('The privacy notice is one tap away before signing in', (await a.locator('#signin a[href="/privacy.html"]').count()) === 1, null);
  const fit = await a.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth + 1, small: [...document.querySelectorAll('#signin button, #signin input')].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 44).map((e) => e.id) }));
  check('Nothing on the sign-in screen runs off the side, and every control is at least 44 px tall', !fit.over && !fit.small.length, fit);
  await a.shot('1-gate');

  // ---- 2. a code by email ----
  await a.fill('#mailTo', 'carla@example.com'); await a.click('#mailGo'); await a.waitForSelector('#mailCodeRow:not([hidden])', { timeout: 5000 }).catch(() => {});
  check('Asking for a code says where it went and how long it lasts', /carla@example\.com/.test(await a.msg()) && /10 minutes/.test(await a.msg()) && (await a.shown('#mailCode')), await a.msg());
  const code = await lastCode('carla@example.com');
  await a.fill('#mailCode', code === '000000' ? '111111' : '000000'); await a.click('#mailGo'); await a.wait(1200);
  check('A wrong code is refused in plain words, and the screen stays', /isn't right/.test(await a.msg()) && !(await a.shown('#app')), await a.msg());
  await a.fill('#mailCode', code); await a.click('#mailGo');
  check('The right code opens Stocker', await a.inApp(), await a.msg());
  check('...to the first-run "Make Stocker yours" sheet of a brand-new home', (await a.locator('dialog[open]').count()) === 1 && (await sql('SELECT COUNT(*) AS n FROM accounts'))[0].n === 1, null);
  await a.closeAll();
  await a.evaluate(() => fetch('/api/extras', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Oat milk' }) }));
  await a.menu();
  const menu = async (p) => ({ out: await p.shown('#lockBtn'), outAll: await p.shown('#menuOutAll'), priv: await p.shown('#menuPrivacy'), del: await p.shown('#menuDelete'), homes: await p.shown('#menuHomes'), score: await p.shown('#menuScore'), share: await p.shown('#menuShare'), lock: ((await p.locator('#lockBtn b').textContent()) || '').trim() });
  const ma = await menu(a);
  check('Her menu has Sign out, Sign out everywhere, the privacy notice and Delete my home', ma.out && ma.lock === 'Sign out' && ma.outAll && ma.priv && ma.del, ma);
  check('...and none of the owner\'s pages, nor a way to share a sign-in she cannot share', !ma.homes && !ma.score && !ma.share, ma);
  await a.shot('2-menu');
  await a.click('#lockBtn'); await a.wait(600);
  check('Signing out goes back to the sign-in screen and says so', (await a.shown('#signin')) && /Signed out/.test(await a.msg()), await a.msg());
  check('...and the home is closed to that phone', (await a.evaluate(async () => (await fetch('/api/items', { credentials: 'same-origin' })).status)) === 401, null);
  await a.byMail('carla@example.com');
  check('Signing in again opens the same home: the oat milk is still on her list', (await a.inApp()) && (await a.evaluate(async () => ((await (await fetch('/api/items', { credentials: 'same-origin' })).json()).extras || []).map((x) => x.text).join())) === 'Oat milk' && (await sql('SELECT COUNT(*) AS n FROM accounts'))[0].n === 1, null);
  await a.closeAll();

  // ---- 3. the privacy notice ----
  await a.menu(); await a.click('#menuPrivacy'); await a.waitForSelector('h1', { timeout: 5000 }).catch(() => {}); await a.wait(300);
  const pv = await a.evaluate(() => ({ h: (document.querySelector('h1') || {}).textContent, over: document.documentElement.scrollWidth > innerWidth + 1, contact: (document.getElementById('contact') || {}).textContent, text: document.body.innerText }));
  check('The privacy notice opens from the menu, fits the phone and names who to write to', /What Stocker keeps/.test(pv.h || '') && !pv.over && pv.contact === 'hello@stocker.test' && /Delete my home/.test(pv.text), { h: pv.h, over: pv.over, contact: pv.contact });
  await a.shot('3-privacy');
  await a.click('a.back');
  check('...and "Back to Stocker" returns to her home, still signed in', await a.inApp(), null);
  await a.closeAll();

  // ---- 4. Google ----
  const g = await phone('asha@example.com');
  await g.goto(BASE + '/'); await g.waitForSelector('#gFake', { timeout: 8000 }).catch(() => {});
  check('With Google reachable, its button is on the sign-in screen, made for this app', (await g.shown('#gFake')) && (await g.evaluate(() => window.__g && window.__g.client_id)) === 'e2e.apps.googleusercontent.com', null);
  await g.click('#gFake');
  check('One tap on it opens Stocker', await g.inApp(), await g.msg());
  await g.closeAll();
  const gs = await g.evaluate(async () => (await (await fetch('/api/items', { credentials: 'same-origin' })).json()));
  check('...as Asha, in an empty home of her own: Carla\'s oat milk is not there', gs.me === 'Asha' && (gs.extras || []).length === 0 && gs.owner === false && (await sql('SELECT COUNT(*) AS n FROM homes'))[0].n === 2, { me: gs.me, extras: gs.extras });

  // ---- 5. the cap (two homes in this walk) ----
  const late = await phone();
  await late.goto(BASE + '/'); await late.waitForSelector('#signin:not([hidden])', { timeout: 8000 }).catch(() => {}); await late.wait(300);
  check('With every home taken, the sign-in screen says so before anyone tries', /Every home is taken/.test(await late.msg()), await late.msg());
  await late.byMail('dev@example.com'); await late.wait(900);
  check('A new person is told their place on the waiting list is saved, and is not let in', /waiting list is saved/.test(await late.msg()) && !(await late.shown('#app')) && (await sql("SELECT COUNT(*) AS n FROM waitlist WHERE email = 'dev@example.com'"))[0].n === 1 && (await sql('SELECT COUNT(*) AS n FROM homes'))[0].n === 2, await late.msg());
  await late.shot('4-full');

  // ---- 6. the owner: her code still works, and she sees every home ----
  await late.click('#haveCode'); await late.wait(300);
  check('"I have a code" shows the name and code fields, with a way back', (await late.shown('#pin')) && (await late.shown('#backSign')) && !(await late.shown('#signin')), null);
  await late.fill('#who', 'Sush'); await late.fill('#pin', 'wrong-code'); await late.click('#gateForm button[type=submit]'); await late.wait(1200);
  check('A wrong code is refused', /isn't right/.test(await late.msg()) && !(await late.shown('#app')), await late.msg());
  await late.fill('#pin', 'test1234'); await late.click('#gateForm button[type=submit]');
  check('The owner\'s passcode opens the owner\'s home', (await late.inApp()) && (await late.evaluate(async () => (await (await fetch('/api/items', { credentials: 'same-origin' })).json()).owner)) === true, null);
  await late.menu();
  const mo = await menu(late);
  check('Her menu keeps Friends testing, the scorecard and Lock, and has no Delete my home', mo.homes && mo.score && mo.share && mo.lock === 'Lock Stocker' && !mo.del && !mo.outAll, mo);
  await late.click('#menuHomes'); await late.waitForSelector('#homesList .row', { timeout: 5000 }).catch(() => {}); await late.wait(300);
  const hs = await late.evaluate(() => ({ count: document.getElementById('homesCount').textContent, rows: [...document.querySelectorAll('#homesList .row')].map((r) => ({ name: r.querySelector('.name').textContent, newCode: [...r.querySelectorAll('button')].some((k) => /New code/.test(k.textContent) && !k.hidden) })) }));
  check('The sheet says how many homes are taken and how many people are waiting', /2 of 2 homes taken/.test(hs.count) && /1 person waiting/.test(hs.count), hs.count);
  check('...lists both sign-ups by first name, marked as signed up, with no code to hand out for them', hs.rows.length === 2 && hs.rows.every((r) => /signed up/.test(r.name) && !r.newCode) && hs.rows.some((r) => /Asha/.test(r.name)) && hs.rows.some((r) => /Carla/.test(r.name)), hs.rows);
  await late.shot('5-homes');
  await late.closeAll();

  // ---- 7. delete my home ----
  const home = (await sql("SELECT home FROM accounts WHERE email = 'carla@example.com'"))[0].home;
  await a.menu(); await a.click('#menuDelete'); await a.wait(450);
  check('Delete my home opens a sheet that says what goes and that it cannot be undone', (await a.shown('#delDlg')) && /cannot be undone/.test((await a.locator('#delDlg').textContent()) || ''), null);
  await a.click('#delGo'); await a.wait(400);
  check('One tap deletes nothing: it asks for a second', /Tap again/.test((await a.locator('#delGo').textContent()) || '') && (await sql("SELECT COUNT(*) AS n FROM accounts WHERE email = 'carla@example.com'"))[0].n === 1, await a.locator('#delGo').textContent());
  await a.shot('6-delete');
  await a.click('#delGo'); await a.wait(900);
  check('The second tap deletes it, and the screen says so', (await a.shown('#gate')) && /Your home is deleted/.test(await a.msg()), await a.msg());
  const left = await sql("SELECT name FROM sqlite_master WHERE name LIKE 'h_" + home + "_%'");
  check('...nothing of it is left in the database: no tables, no account, no row in the list of homes', left.length === 0 && (await sql("SELECT COUNT(*) AS n FROM accounts WHERE email = 'carla@example.com'"))[0].n === 0 && (await sql('SELECT COUNT(*) AS n FROM homes WHERE id = ?', [home]))[0].n === 0, left);
  check('...and Asha\'s home and the owner\'s are still there', (await g.evaluate(async () => (await fetch('/api/items', { credentials: 'same-origin' })).status)) === 200 && (await late.evaluate(async () => (await fetch('/api/items', { credentials: 'same-origin' })).status)) === 200, null);
  const next = await phone();
  await next.goto(BASE + '/'); await next.waitForSelector('#signin:not([hidden])', { timeout: 8000 }).catch(() => {}); await next.wait(300);
  check('A place has opened: the next visitor is told signing in makes a home', /Signing in makes one for you/.test(await next.msg()), await next.msg());

  check('No server errors (5xx) during the whole walk', !bad.length, bad);
  check('No script errors on any page during the whole walk', !errs.length, errs.slice(0, 4));
  await b.close();
  for (const [ok, name, detail] of R) console.log((ok ? '  pass  ' : '  FAIL  ') + name + (detail ? '\n          ' + detail : ''));
  const n = R.filter((r) => r[0]).length;
  console.log('\nReal sign-in walk-through: ' + n + ' of ' + R.length + ' checks pass.');
  process.exit(n === R.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
