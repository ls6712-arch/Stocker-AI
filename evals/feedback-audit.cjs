// Feedback lands on the right turn (22 Nov). In a phone-sized browser against the e2e server:
//  - Undo on an earlier reply is marked on the message that made that change, not on whatever was said last;
//  - "Not right?" asks with choices, and the next thing typed is never taken as the answer.
//
//   node --no-warnings evals/e2e/server.mjs 8816 &   then   E2E_URL=http://127.0.0.1:8816 node evals/feedback-audit.cjs
const { chromium } = require('playwright');
const BASE = process.env.E2E_URL || 'http://127.0.0.1:8816';
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const R = [], check = (n, ok, d) => R.push([!!ok, n, ok ? '' : JSON.stringify(d).slice(0, 300)]);
  const wait = (ms) => p.waitForTimeout(ms);
  const sql = async (q, args) => (await fetch(BASE + '/__sql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sql: q, args }) })).json();
  const turn = async (said) => (await sql('SELECT id, said, outcome, wanted FROM turns WHERE said = ? ORDER BY id DESC LIMIT 1', [said]))[0];
  const say = async (text) => {
    if (!(await p.locator('#chatText').isVisible())) { await p.click('#tellOpen'); await wait(400); }
    const n = await p.locator('#chatLog .bot').count();
    await p.fill('#chatText', text); await p.press('#chatText', 'Enter');
    await p.waitForFunction((k) => { const x = document.querySelectorAll('#chatLog .bot'); const l = x[x.length - 1]; return x.length > k && l && !/Thinking|Reading the rest/.test(l.textContent); }, n, { timeout: 15000 }).catch(() => {});
    await wait(500);
  };
  await p.goto(BASE); await wait(800);
  await p.fill('#who', 'Sush'); await p.fill('#pin', 'test1234'); await p.click('#gateForm button'); await wait(1200);
  for (let i = 0; i < 4 && (await p.locator('dialog[open]').count()); i++) { await p.keyboard.press('Escape'); await wait(250); }

  // ---- Undo goes to the turn that made the change ----
  await say('bought 2 cartons of oat milk');
  const first = p.locator('#chatLog .bot').nth((await p.locator('#chatLog .bot').count()) - 1);
  check('the purchase shows an Undo', (await first.locator('button', { hasText: 'Undo' }).count()) >= 1, await first.textContent());
  await say("what's on my list?");
  await first.locator('button', { hasText: 'Undo' }).first().click(); await wait(900);
  const a = await turn('bought 2 cartons of oat milk'), q = await turn("what's on my list?");
  check('Undo on the earlier reply is marked on that message', a && a.outcome === 'undo', a);
  check('opposite: the question asked after it is not marked as undone', q && q.outcome !== 'undo', q);

  // ---- "Not right?" asks with choices; the next message is not taken as the answer ----
  await say('what can I cook tonight?');
  const fb = p.locator('#chatLog .bot').last().locator('button.fb');
  check('a reply with no guess offers "Not right?"', (await fb.count()) === 1);
  await fb.click(); await wait(500);
  const ask = p.locator('#chatLog .bot').nth((await p.locator('#chatLog .bot').count()) - 1);
  check('"Not right?" asks with choices', (await ask.locator('button', { hasText: 'Changed nothing' }).count()) === 1 && (await ask.locator('button', { hasText: 'Put it on my list' }).count()) === 1, await ask.textContent());
  await say('bought bananas');
  let c = await turn('what can I cook tonight?');
  check('the next message typed is not stored as what they wanted', c && c.outcome === 'down' && !c.wanted, c);
  await ask.locator('button', { hasText: 'Changed nothing' }).click(); await wait(800);
  c = await turn('what can I cook tonight?');
  check('a choice is stored on the reply it was about', c && c.wanted === 'should have changed nothing', c);
  check('no script errors', errs.length === 0, errs);

  await b.close();
  for (const [ok, n, d] of R) console.log((ok ? '  pass  ' : '  FAIL  ') + n + (ok ? '' : '  ' + d));
  const n = R.filter((r) => r[0]).length; console.log('\nFeedback on the right turn: ' + n + ' of ' + R.length + ' checks pass.');
  process.exit(n === R.length ? 0 : 1);
})();
