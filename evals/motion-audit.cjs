// Browser check of the motion details (docs/AGENT.md, "Motion details"), each with its opposite:
// presses and entrances scale from 0.97, a wrong code shakes, steps slide in the direction they go, folds open and close
// smoothly, nothing moves by top or left, a theme switch does not set off every transition, and a strip dragged past its
// end resists like a rubber band and springs back keeping the finger's speed.
// Runs against the end-to-end harness with real sign-in on (so the sign-in screen has its steps):
//   E2E_SIGNUP=1 node --no-warnings evals/e2e/server.mjs 8813 &   then   node evals/motion-audit.cjs
const { chromium } = require('playwright');
const BASE = process.env.E2E_URL || 'http://127.0.0.1:8813';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const R = [], check = (name, ok, detail) => R.push([!!ok, name, ok ? '' : String(detail == null ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300)]);
  const errs = [];
  const phone = async (opts) => {
    const c = await b.newContext(Object.assign({ viewport: { width: 390, height: 844 }, hasTouch: true }, opts || {}));
    await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    const p = await c.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('#haveCode:visible', { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(300);
    return { c, p };
  };
  const enter = async (p) => {
    if (await p.locator('#haveCode:visible').count()) { await p.click('#haveCode'); await p.waitForTimeout(450); }
    await p.fill('#who', 'Sush'); await p.fill('#pin', 'test1234'); await p.press('#pin', 'Enter');
    await p.waitForSelector('#app:not([hidden])', { timeout: 8000 }); await p.waitForTimeout(600);
  };
  const shut = async (p) => { for (let i = 0; i < 4 && (await p.locator('dialog[open]').count()); i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(250); } await p.waitForTimeout(450); };
  // sample a property of an element every frame for `ms` (runs inside the page, so no round trips skew the timing)
  const frames = (p, sel, ms, what) => p.evaluate(([s, ms, what]) => new Promise((done) => {
    const out = [], t0 = performance.now();
    (function tick() { const e = document.querySelector(s); if (e) { const cs = getComputedStyle(e), m = new DOMMatrixReadOnly(cs.transform);
      out.push({ t: Math.round(performance.now() - t0), x: m.m41, y: m.m42, a: m.a, o: +cs.opacity, h: e.getBoundingClientRect().height, tr: cs.transitionDuration, an: cs.animationName }); }
      if (performance.now() - t0 < ms) requestAnimationFrame(tick); else done(out); })();
  }), [sel, ms, what]);
  const pressed = async (p, sel) => { const bx = await p.locator(sel).first().boundingBox(); await p.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await p.mouse.down(); await p.waitForTimeout(180);
    const r = await p.evaluate((s) => { const cs = getComputedStyle(document.querySelector(s)); return { a: new DOMMatrixReadOnly(cs.transform).a, o: +cs.opacity }; }, sel);
    await p.mouse.move(2, 400); await p.mouse.up(); await p.waitForTimeout(400); return r; };

  // ================= the sign-in screen (steps, a wrong code) =================
  let { c, p } = await phone();
  const onSignin = await p.locator('#signin:visible').count();
  check('The sign-in screen opens on its first step (sign in), with "I have a code" as the next', onSignin === 1, 'sign-in step not shown');

  // a step forward slides in from the right, a step back from the left; neither fades
  await p.click('#haveCode'); const fwd = await frames(p, '#gateForm', 450);
  const fx = fwd.slice(0, 4).map((f) => f.x), fend = fwd[fwd.length - 1];
  check('A step forward slides in from the right', Math.max(...fx) > 8 && Math.abs(fend.x) < 0.5, fx.concat(['end', fend.x]));
  check('...without fading', fwd.every((f) => f.o > 0.99), fwd.map((f) => f.o).slice(0, 6));
  await p.waitForTimeout(200);
  await p.click('#backSign'); const back = await frames(p, '#signin', 450);
  const bxs = back.slice(0, 4).map((f) => f.x), bend = back[back.length - 1];
  check('A step back slides in from the left', Math.min(...bxs) < -8 && Math.abs(bend.x) < 0.5, bxs.concat(['end', bend.x]));
  check('...without fading', back.every((f) => f.o > 0.99), back.map((f) => f.o).slice(0, 6));
  await p.waitForTimeout(150);
  await p.fill('#mailTo', 'step@stocker.test'); await p.click('#mailGo'); const codeRow = await frames(p, '#mailCodeRow', 450);
  check('The code field arrives as the next step, from the right', codeRow.length && Math.max(...codeRow.slice(0, 4).map((f) => f.x)) > 8 && Math.abs(codeRow[codeRow.length - 1].x) < 0.5, codeRow.slice(0, 5).map((f) => f.x));

  // a wrong code turns the field red and shakes it, then it rests; typing again clears the red
  await p.fill('#mailCode', '000000');
  await p.click('#mailGo'); await p.waitForFunction(() => /isn't right/.test(document.getElementById('gateMsg').textContent), null, { timeout: 4000 }).catch(() => {});
  const mshake = await frames(p, '#mailCode', 600);
  const mm = mshake.map((f) => f.x);
  const mInvalid = await p.evaluate(() => { const e = document.getElementById('mailCode'); return { inv: e.getAttribute('aria-invalid'), border: getComputedStyle(e).borderTopColor }; });
  check('A wrong emailed code is marked wrong (red edge, and told to screen readers)', mInvalid.inv === 'true' && /rgb\((1[5-9]\d|2\d\d), (\d|[1-9]\d), (\d|[1-9]\d)\)/.test(mInvalid.border), mInvalid);
  check('...and the field shakes from side to side, then comes to rest', Math.max(...mm) > 2 && Math.min(...mm) < -2 && Math.abs(mm[mm.length - 1]) < 0.5, mm.slice(0, 12));
  await p.waitForTimeout(150);
  await p.click('#backSign').catch(() => {}); await p.click('#haveCode'); await p.waitForTimeout(450);
  await p.fill('#who', 'Sush'); await p.fill('#pin', 'wrong-one'); await p.press('#pin', 'Enter');
  await p.waitForFunction(() => /isn't right/.test(document.getElementById('gateMsg').textContent), null, { timeout: 4000 }).catch(() => {});
  const pshake = (await frames(p, '#pin', 600)).map((f) => f.x);
  const pInv = await p.evaluate(() => document.getElementById('pin').getAttribute('aria-invalid'));
  check('A wrong passcode is marked wrong and shakes', pInv === 'true' && Math.max(...pshake) > 2 && Math.min(...pshake) < -2 && Math.abs(pshake[pshake.length - 1]) < 0.5, { pInv, x: pshake.slice(0, 12) });
  await p.press('#pin', 'Enter'); await p.waitForTimeout(500);
  const again = (await frames(p, '#pin', 500)).map((f) => f.x);
  check('...and shakes again on a second wrong try', Math.max(...again.map(Math.abs)) > 2, again.slice(0, 10));
  await p.type('#pin', 'x'); await p.waitForTimeout(100);
  check('Typing again takes the red away', (await p.evaluate(() => document.getElementById('pin').getAttribute('aria-invalid'))) !== 'true', 'still marked');
  await p.fill('#pin', 'test1234'); await p.press('#pin', 'Enter'); await p.waitForSelector('#app:not([hidden])', { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(600);
  check('The right code opens the app', await p.locator('#app').isVisible(), 'not in');

  // ================= in the app =================
  await p.evaluate(async () => {
    const A = (name, area) => ({ action: 'add', name, quantity: 2, unit: 'pcs', area, category: 'Pantry', expiry: '', shelfLifeDays: 300, finishDays: 30 });
    const acts = ['Rice', 'Milk', 'Soap', 'Bleach', 'Diapers', 'Dog food', 'Vitamins', 'Toothpaste'].map((n, i) => A(n, ['Kitchen', 'Kitchen', 'Bathroom', 'Cleaning', 'Kids', 'Pets', 'Health', 'Bathroom'][i]));
    await fetch('/api/apply', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: 'bill', actions: acts }) });
  });
  await p.reload(); await p.waitForSelector('#app:not([hidden])'); await p.waitForTimeout(700);

  // the household profile's "More about your home" fold opens and closes smoothly
  const profOpen = await p.locator('#profDlg[open]').count();
  if (!profOpen) { await p.click('#menuBtn'); await p.waitForTimeout(450); await p.click('#menuEdit'); }
  await p.waitForSelector('#profDlg[open]'); await p.waitForTimeout(650);
  check('The page allows height to animate to and from its natural size', (await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('interpolate-size'))).trim() === 'allow-keywords', 'interpolate-size not set');
  await p.locator('#profMore summary').scrollIntoViewIfNeeded();
  const h0 = await p.evaluate(() => document.getElementById('profMore').getBoundingClientRect().height);
  await p.click('#profMore summary'); const unf = (await frames(p, '#profMore', 500)).map((f) => f.h);
  const hEnd = unf[unf.length - 1], mid = unf.filter((h) => h > h0 + 4 && h < hEnd - 4);
  check('A fold opens smoothly instead of snapping', hEnd > h0 + 60 && mid.length >= 3, { h0, hEnd, between: mid.length });
  await p.click('#profMore summary'); const fold = (await frames(p, '#profMore', 500)).map((f) => f.h);
  const fEnd = fold[fold.length - 1], fmid = fold.filter((h) => h > fEnd + 4 && h < hEnd - 4);
  check('...and closes smoothly too', Math.abs(fEnd - h0) < 2 && fmid.length >= 3, { from: hEnd, to: fEnd, between: fmid.length });
  await shut(p);

  // an item opens smoothly in At home
  await p.click('[data-tab=pantry]'); await p.waitForTimeout(400);
  const ih = p.locator('.ihead').first(); await ih.scrollIntoViewIfNeeded(); await ih.click();
  const ip = (await frames(p, '.ipanel', 450)).map((f) => f.h);
  check('An item in At home unfolds from its row instead of appearing at full size', ip.length > 3 && ip[0] < ip[ip.length - 1] - 20 && ip.filter((h) => h > ip[0] + 4 && h < ip[ip.length - 1] - 4).length >= 2, ip.slice(0, 8));
  await ih.click(); await p.waitForTimeout(400);

  // presses scale to 0.97, and what grows in starts from 0.97
  await p.click('[data-tab=today]'); await p.waitForTimeout(300);
  const kinds = {};
  for (const s of ['#bell', '#tellSnap', '#tellMic']) kinds[s] = (await pressed(p, s)).a;
  await p.click('#tellSnap'); await p.waitForTimeout(650); kinds['tile'] = (await pressed(p, '#capDlg button.tile')).a; await shut(p);
  check('Every button scales to 0.97 when pressed (round and icon buttons too)', Object.values(kinds).every((a) => Math.abs(a - 0.97) < 0.004), kinds);
  await p.click('#menuBtn'); await p.waitForTimeout(500);
  const row = await pressed(p, '#menuDlg .menu>button'); await shut(p);
  check('...while a whole row dims instead of shrinking', Math.abs(row.a - 1) < 0.001 && row.o < 0.7, row);
  const starts = await p.evaluate(() => {
    const low = [], seen = [];
    const scan = (rules, ctx) => { for (const r of rules) {
      if (r.cssRules) scan(r.cssRules, r.constructor.name === 'CSSKeyframesRule' || r.constructor.name === 'CSSStartingStyleRule' ? r.constructor.name : ctx);
      if (!r.style) continue; const t = r.style.transform || ''; const m = t.match(/scale\(([\d.]+)\)/); if (!m) continue; const v = +m[1]; if (v >= 1) continue;
      const entering = ctx || /\[hidden\]/.test(r.selectorText || '') || r.constructor.name === 'CSSKeyframeRule';
      if (!entering) continue; seen.push(v); if (v < 0.97) low.push((r.selectorText || r.keyText || '') + ' ' + v); } };
    for (const s of document.styleSheets) { try { scan(s.cssRules, ''); } catch (e) {} }
    return { low, seen };
  });
  check('Nothing grows in from below 0.97 (no scaling from 0 or 0.96)', starts.low.length === 0, starts.low);
  check('...but things still grow in a little (from 0.97, not from full size)', starts.seen.some((v) => Math.abs(v - 0.97) < 0.001), starts.seen);

  // nothing moves by top, left or margin; positions move by transform
  const layout = await p.evaluate(() => {
    const bad = [], ok = ['.ipanel', 'details-content'];
    const props = /(^|,|\s)(top|left|right|bottom|margin[a-z-]*|inset|width)(\s|,|$)/;
    const scan = (rules) => { for (const r of rules) { if (r.cssRules) scan(r.cssRules);
      if (r.constructor.name === 'CSSKeyframesRule') { for (const k of r.cssRules) for (const pr of ['top', 'left', 'right', 'bottom', 'margin-top', 'margin-left', 'width', 'height']) if (k.style.getPropertyValue(pr)) bad.push('@keyframes ' + r.name + ' ' + pr); continue; }
      if (!r.style) continue; const tp = r.style.transitionProperty || ''; const tr = r.style.transition || '';
      const list = (tp || tr).toLowerCase(); if (!list) continue;
      if (props.test(list) || list === 'all' || /(^|,)\s*all\b/.test(list)) bad.push((r.selectorText || '') + ' → ' + list);
      if (/\b(height|block-size)\b/.test(list) && !ok.some((o) => (r.selectorText || '').includes(o))) bad.push((r.selectorText || '') + ' → ' + list); } };
    for (const s of document.styleSheets) { try { scan(s.cssRules); } catch (e) {} }
    return bad;
  });
  check('No transition or animation moves anything by top, left, margin or width', layout.length === 0, layout);
  const toastMoves = await p.evaluate(() => getComputedStyle(document.getElementById('toast')).transitionProperty);
  check('...the bottom message moves by transform', /transform/.test(toastMoves), toastMoves);

  // a theme switch does not set off every transition at once
  await p.evaluate(() => { window.__swap = []; matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => requestAnimationFrame(() => {
    window.__swap.push({ tr: getComputedStyle(document.getElementById('bell')).transitionDuration, anims: document.getAnimations().filter((a) => a instanceof CSSTransition).length }); })); });
  await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForTimeout(300);
  const sw = await p.evaluate(() => window.__swap[0]);
  check('While the theme switches, transitions are off and none run', sw && sw.tr === '0s' && sw.anims === 0, sw);
  await p.waitForTimeout(200);
  const after = await p.evaluate(() => getComputedStyle(document.getElementById('bell')).transitionDuration);
  const pAfter = (await pressed(p, '#bell')).a;
  check('...and come back right after, so a press still answers', /0\.3s/.test(after) && Math.abs(pAfter - 0.97) < 0.004, { after, pAfter });
  await p.emulateMedia({ colorScheme: 'light' }); await p.waitForTimeout(300);

  // a strip of chips dragged past its end resists like a rubber band and springs back
  await p.click('[data-tab=pantry]'); await p.waitForTimeout(500); await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200);
  const cdp = await c.newCDPSession(p);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const strip = await p.evaluate(() => { const r = document.getElementById('rooms').getBoundingClientRect(), e = document.getElementById('rooms'); return { x: r.left, y: r.top + r.height / 2, w: r.width, over: e.scrollWidth - e.clientWidth }; });
  check('The rooms strip is wider than the screen (it scrolls sideways)', strip.over > 20, strip);
  const sx = () => p.evaluate(() => { const e = document.getElementById('rooms'); return { x: new DOMMatrixReadOnly(getComputedStyle(e).transform).m41, sl: e.scrollLeft }; });
  // pull right at the start: past the end
  await touch('touchStart', strip.x + 60, strip.y);
  for (let i = 1; i <= 12; i++) { await touch('touchMove', strip.x + 60 + i * 12, strip.y); await p.waitForTimeout(16); }
  const pulled = await sx();
  check('Dragged past the start, the strip follows the finger with resistance', pulled.x > 15 && pulled.x < 144 * 0.75, pulled);
  await p.waitForTimeout(150);
  await touch('touchEnd'); const ret = await frames(p, '#rooms', 700);
  const rx = ret.map((f) => f.x);
  check('Let go, it springs back to its place and stops there', Math.abs(rx[rx.length - 1]) < 0.5 && rx.every((x) => x > -2), rx.filter((_, i) => i % 3 === 0));
  check('...by a spring in script, not a fixed CSS transition', ret.every((f) => f.tr === '0s'), ret[0] && ret[0].tr);
  // a fast pull outward: on release it keeps the finger's speed before turning back
  await touch('touchStart', strip.x + 60, strip.y);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', strip.x + 60 + i * 20, strip.y); await p.waitForTimeout(8); }
  const atRel = (await sx()).x; await touch('touchEnd'); const flick = (await frames(p, '#rooms', 700)).map((f) => f.x);
  check('Flung outward, it keeps the finger\'s speed for a moment, then springs back', Math.max(...flick.slice(0, 6)) > atRel + 1 && Math.abs(flick[flick.length - 1]) < 0.5, { atRel, first: flick.slice(0, 6), end: flick[flick.length - 1] });
  // in the middle, dragging scrolls the strip and does not stretch it
  await p.evaluate(() => { document.getElementById('rooms').scrollLeft = 30; }); await p.waitForTimeout(100);
  await touch('touchStart', strip.x + 200, strip.y);
  for (let i = 1; i <= 4; i++) { await touch('touchMove', strip.x + 200 - i * 6, strip.y); await p.waitForTimeout(16); }
  const mid2 = await sx(); await touch('touchEnd'); await p.waitForTimeout(400);
  check('A drag that still has room to scroll scrolls, with no stretch', Math.abs(mid2.x) < 0.5 && mid2.sl > 30, mid2);
  // pull left at the end
  await p.evaluate(() => { const e = document.getElementById('rooms'); e.scrollLeft = e.scrollWidth; }); await p.waitForTimeout(150);
  await touch('touchStart', strip.x + strip.w - 60, strip.y);
  for (let i = 1; i <= 12; i++) { await touch('touchMove', strip.x + strip.w - 60 - i * 12, strip.y); await p.waitForTimeout(16); }
  const endPull = await sx(); await touch('touchEnd'); await p.waitForTimeout(700); const endBack = await sx();
  check('Dragged past the far end, it stretches the other way and comes back', endPull.x < -15 && Math.abs(endBack.x) < 0.5, { endPull, endBack });
  // a vertical swipe over the strip scrolls the page, not the strip
  await p.evaluate(() => window.scrollTo(0, 0));
  await touch('touchStart', strip.x + 100, strip.y);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', strip.x + 102, strip.y - i * 14); await p.waitForTimeout(16); }
  const vert = await sx(); await touch('touchEnd'); await p.waitForTimeout(400);
  check('An up-and-down swipe over the strip does not stretch it', Math.abs(vert.x) < 0.5, vert);
  check('The page never scrolls sideways', (await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)), 'page wider than the screen');
  await c.close();

  // ================= with "reduce motion" on =================
  ({ c, p } = await phone({ reducedMotion: 'reduce' }));
  await p.click('#haveCode'); const calmStep = (await frames(p, '#gateForm', 300)).map((f) => f.x);
  check('With "reduce motion" on, a step changes in place, without sliding', calmStep.every((x) => Math.abs(x) < 0.5), calmStep.slice(0, 5));
  await p.fill('#who', 'Sush'); await p.fill('#pin', 'nope-nope'); await p.press('#pin', 'Enter');
  await p.waitForFunction(() => /isn't right/.test(document.getElementById('gateMsg').textContent), null, { timeout: 4000 }).catch(() => {});
  const calmShake = (await frames(p, '#pin', 500)).map((f) => f.x);
  check('...a wrong code turns red without shaking', (await p.evaluate(() => document.getElementById('pin').getAttribute('aria-invalid'))) === 'true' && calmShake.every((x) => Math.abs(x) < 0.5), calmShake.slice(0, 6));
  await p.fill('#pin', 'test1234'); await p.press('#pin', 'Enter'); await p.waitForSelector('#app:not([hidden])', { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(600);
  if (!(await p.locator('#profDlg[open]').count())) { await p.click('#menuBtn'); await p.waitForTimeout(300); await p.click('#menuEdit'); }
  await p.waitForSelector('#profDlg[open]'); await p.waitForTimeout(300);
  await p.locator('#profMore summary').scrollIntoViewIfNeeded();
  await p.click('#profMore summary'); const calmFold = (await frames(p, '#profMore', 250)).map((f) => f.h);
  check('...and a fold opens at once', calmFold.length > 2 && Math.abs(calmFold[0] - calmFold[calmFold.length - 1]) < 1, calmFold.slice(0, 5));
  await shut(p);
  await p.click('[data-tab=pantry]'); await p.waitForTimeout(400);
  const st2 = await p.evaluate(() => { const r = document.getElementById('rooms').getBoundingClientRect(); return { x: r.left, y: r.top + r.height / 2 }; });
  const cdp2 = await c.newCDPSession(p);
  const t2 = (type, x, y) => cdp2.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await t2('touchStart', st2.x + 60, st2.y); for (let i = 1; i <= 10; i++) { await t2('touchMove', st2.x + 60 + i * 12, st2.y); await p.waitForTimeout(16); }
  await t2('touchEnd'); await p.waitForTimeout(60);
  const calmBack = await p.evaluate(() => new DOMMatrixReadOnly(getComputedStyle(document.getElementById('rooms')).transform).m41);
  check('...and a stretched strip is back in place at once, with no bounce', Math.abs(calmBack) < 0.5, calmBack);
  await c.close();

  check('No script errors during the whole walk', errs.length === 0, errs);
  await b.close();
  for (const [ok, name, d] of R) console.log((ok ? '  ok  ' : '  FAIL') + ' ' + name + (ok ? '' : '  -> ' + d));
  const n = R.filter((r) => r[0]).length; console.log('\n' + n + ' of ' + R.length + ' checks passed');
  process.exit(n === R.length ? 0 : 1);
})();
