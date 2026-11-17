// Browser check of the app's fit and finish: does it answer a touch at once, do sheets follow the finger,
// and does it respect the phone's settings for less motion, less transparency, more contrast and larger text.
// Each "does" has its opposite. Run against a local `wrangler dev` on port 8799 with APP_PIN=test1234 in .dev.vars:
//   node evals/finish-audit.cjs
const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:8799/';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const R = [], check = (name, ok, detail) => R.push([!!ok, name, ok ? '' : String(detail == null ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300)]);
  const errs = [];
  const open = async (opts) => {
    const c = await b.newContext(Object.assign({ viewport: { width: 400, height: 820 } }, opts || {}));
    const p = await c.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(URL); await p.waitForTimeout(700);
    if (await p.locator('#gate:not([hidden])').count()) { await p.fill('#who', 'Sush'); await p.fill('#pin', 'test1234'); await p.press('#pin', 'Enter'); await p.waitForTimeout(900); }
    await p.click('#profSkip').catch(() => {}); await p.waitForTimeout(500);
    return { c, p };
  };
  // where the sheet is on screen (px moved down from its place), whether it is shown, and how see-through it is
  const sheet = (p, id) => p.evaluate((i) => { const d = document.getElementById(i), s = getComputedStyle(d); return { open: d.open, shown: s.display !== 'none', y: new DOMMatrixReadOnly(s.transform).m42, opacity: +s.opacity, h: d.getBoundingClientRect().height }; }, id);
  const grabAt = (p, id) => p.evaluate((i) => { const r = document.querySelector('#' + i + ' .grab').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
  const settle = (p) => p.waitForTimeout(800);
  const shut = async (p) => { for (let i = 0; i < 4 && (await p.locator('dialog[open]').count()); i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(250); } await p.waitForTimeout(500); };
  const snap = async (p) => { await shut(p); await p.click('#tellSnap'); await settle(p); };

  // ---------- default settings ----------
  let { c, p } = await open();

  // response: a control answers on the way down, not on release
  const bell = await p.locator('#bell').boundingBox();
  const before = await p.evaluate(() => getComputedStyle(document.getElementById('bell')).transform);
  await p.mouse.move(bell.x + bell.width / 2, bell.y + bell.height / 2); await p.mouse.down(); await p.waitForTimeout(160);
  const held = await p.evaluate(() => new DOMMatrixReadOnly(getComputedStyle(document.getElementById('bell')).transform).a);
  await p.mouse.move(5, 300); await p.mouse.up(); await p.waitForTimeout(450);
  const after = await p.evaluate(() => new DOMMatrixReadOnly(getComputedStyle(document.getElementById('bell')).transform).a);
  check('A button shrinks a little (to 0.97) the moment it is pressed', before === 'none' && Math.abs(held - 0.97) < 0.004, { before, held });
  check('...and returns when let go; sliding off it cancels the tap', after > 0.995 && !(await p.locator('dialog[open]').count()), { after });
  const tabHeld = await (async () => { const t = await p.locator('[data-tab=list]').boundingBox(); await p.mouse.move(t.x + t.width / 2, t.y + t.height / 2); await p.mouse.down(); await p.waitForTimeout(160);
    const r = await p.evaluate(() => { const e = document.querySelector('[data-tab=list]'); return { tab: getComputedStyle(e).transform, icon: new DOMMatrixReadOnly(getComputedStyle(e.querySelector('svg')).transform).a }; }); await p.mouse.move(5, 300); await p.mouse.up(); return r; })();
  check('A tab does not shrink as a whole; only its icon answers', tabHeld.tab === 'none' && tabHeld.icon < 0.95, tabHeld);

  // sheets: arrive from below, leave the same way
  await p.click('#tellSnap'); await p.waitForTimeout(60);
  const early = await sheet(p, 'capDlg'); await settle(p); const rested = await sheet(p, 'capDlg');
  check('A sheet slides up from the bottom edge', early.open && early.y > 40 && rested.y === 0, { early: early.y, rested: rested.y });
  await p.keyboard.press('Escape'); await p.waitForTimeout(90);
  const leaving = await sheet(p, 'capDlg'); await settle(p); const gone = await sheet(p, 'capDlg');
  check('...and leaves along the same path, then is gone', !leaving.open && leaving.shown && leaving.y > 10 && !gone.shown, { leaving, gone: gone.shown });
  await p.click('#bell'); await settle(p); await p.keyboard.press('Escape'); await p.waitForTimeout(60);
  const tb = await p.locator('[data-tab=pantry]').boundingBox(); await p.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2); await p.waitForTimeout(300);
  check('A sheet on its way out does not swallow taps', (await p.evaluate(() => document.querySelector('.tab[aria-current]').dataset.tab)) === 'pantry', 'tab did not change');
  await settle(p);

  // sheets follow the finger
  await snap(p);
  let g = await grabAt(p, 'capDlg');
  await p.mouse.move(g.x, g.y); await p.mouse.down(); await p.mouse.move(g.x, g.y + 40, { steps: 4 }); await p.mouse.move(g.x, g.y + 120, { steps: 8 });
  const dragged = await sheet(p, 'capDlg');
  check('Dragging the handle moves the sheet exactly with the finger', Math.abs(dragged.y - 120) <= 1.5, dragged.y);
  const dim = await p.evaluate(() => +getComputedStyle(document.getElementById('capDlg')).getPropertyValue('--bd'));
  check('...and the dimmed background lightens as it goes', dim < 0.95 && dim > 0.3, dim);
  await p.waitForTimeout(250); await p.mouse.up(); await settle(p);
  const back = await sheet(p, 'capDlg');
  check('Let go slowly before halfway: it returns, still open', back.open && Math.abs(back.y) < 0.5 && Math.abs(dragged.y - 120) <= 1.5, back);

  await snap(p); g = await grabAt(p, 'capDlg');
  await p.mouse.move(g.x, g.y); await p.mouse.down(); await p.mouse.move(g.x, g.y - 150, { steps: 10 });
  const up = await sheet(p, 'capDlg'); await p.mouse.up(); await settle(p);
  check('Pulled up past its place, it resists instead of stopping dead', up.y < -20 && up.y > -110, up.y);

  await snap(p); g = await grabAt(p, 'capDlg');
  await p.mouse.move(g.x, g.y); await p.mouse.down();
  for (let i = 1; i <= 5; i++) { await p.mouse.move(g.x, g.y + i * 16); await p.waitForTimeout(8); }
  const atRelease = await sheet(p, 'capDlg'); await p.mouse.up(); await settle(p);
  const flicked = await sheet(p, 'capDlg');
  check('A short, fast flick closes it, though it was let go well before halfway', atRelease.y < atRelease.h * 0.3 && !flicked.open && !flicked.shown, { releasedAt: atRelease.y, of: atRelease.h, open: flicked.open });

  await snap(p); g = await grabAt(p, 'capDlg');
  await p.mouse.move(g.x, g.y); await p.mouse.down(); await p.mouse.move(g.x, g.y + 200, { steps: 6 }); await p.waitForTimeout(200); await p.mouse.up();
  await p.waitForTimeout(60);
  // the catch is done inside the page, in one go, so the test itself adds no delay between looking and touching
  const mid = await p.evaluate(() => new Promise((done) => { const d = document.getElementById('capDlg'), g = d.querySelector('.grab'), at = () => new DOMMatrixReadOnly(getComputedStyle(d).transform).m42;
    const r = g.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, ev = (type, dy) => g.dispatchEvent(new PointerEvent(type, { pointerId: 7, bubbles: true, cancelable: true, clientX: x, clientY: y + dy, button: 0 }));
    const moving = at(); ev('pointerdown', 0); const caught = at(); ev('pointermove', 30); const follows = at();
    requestAnimationFrame(() => requestAnimationFrame(() => { const stays = at(); setTimeout(() => { ev('pointerup', 30); done({ moving, caught, follows, stays }); }, 200); })); }));
  await settle(p);
  check('Caught again on its way back, it stops there and follows the finger', mid.moving > 5 && mid.moving < 200 && Math.abs(mid.caught - mid.moving) < 0.5 && Math.abs(mid.follows - mid.caught - 30) < 0.5 && Math.abs(mid.stays - mid.follows) < 0.5, mid);
  check('Every sheet has a handle to drag', await p.evaluate(() => [...document.querySelectorAll('dialog.sheet')].every((d) => d.querySelector('.grab'))), 'a sheet has no handle');
  await shut(p);

  // toast
  await p.click('[data-tab=list]'); await p.waitForTimeout(300);
  await p.evaluate(async () => { await fetch('/api/extras', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Finish check' }) }); });
  await p.reload(); await p.waitForTimeout(1000);
  await p.locator('button[aria-label="Mark Finish check as bought"]').click(); await p.waitForTimeout(700);
  const t1 = await p.evaluate(() => { const s = getComputedStyle(document.getElementById('toast')); return { o: +s.opacity, d: s.display }; });
  await p.evaluate(() => { document.getElementById('toast').hidden = true; }); await p.waitForTimeout(80);
  const t2 = await p.evaluate(() => { const e = document.getElementById('toast'), s = getComputedStyle(e); return { hidden: e.hidden, d: s.display }; });
  await p.waitForTimeout(600);
  const t3 = await p.evaluate(() => getComputedStyle(document.getElementById('toast')).display);
  check('The message at the bottom fades out instead of vanishing, and is then gone', t1.o === 1 && t2.hidden && t2.d !== 'none' && t3 === 'none', { t1, t2, t3 });
  await p.evaluate(async () => { const d = await (await fetch('/api/items', { credentials: 'same-origin' })).json(); for (const x of d.extras || []) if (x.text === 'Finish check') await fetch('/api/extras/' + x.id, { method: 'DELETE', credentials: 'same-origin' }); });

  // materials and type
  const bars = () => p.evaluate(() => { const f = (s) => { const c = getComputedStyle(document.querySelector(s)); return c.backdropFilter || c.webkitBackdropFilter || 'none'; }; return { top: f('.appbar'), tabs: f('.tabs') }; });
  const glass = await bars();
  check('The top bar and the tabs are frosted layers the page scrolls under', glass.top !== 'none' && glass.tabs !== 'none', glass);
  const sizes = await p.evaluate(() => { const px = (s) => parseFloat(getComputedStyle(document.querySelector(s)).fontSize); const a = { sub: px('.sub'), tab: px('.tab'), h1: px('h1') }; document.documentElement.style.fontSize = '20px'; const b2 = { sub: px('.sub'), tab: px('.tab'), h1: px('h1') }; const wide = document.documentElement.scrollWidth > innerWidth + 1; document.documentElement.style.fontSize = ''; return { a, b: b2, wide }; });
  check('Text grows with the phone\'s text size setting, every size of it', Math.abs(sizes.b.sub / sizes.a.sub - 1.25) < 0.01 && Math.abs(sizes.b.tab / sizes.a.tab - 1.25) < 0.01 && Math.abs(sizes.b.h1 / sizes.a.h1 - 1.25) < 0.01, sizes);
  check('...without making the page scroll sideways', !sizes.wide, 'page is wider than the screen at the larger size');
  const track = await p.evaluate(() => { const em = (s) => { const c = getComputedStyle(document.querySelector(s)); return parseFloat(c.letterSpacing) / parseFloat(c.fontSize) || 0; }; return { h1: em('h1'), sub: em('.sub') }; });
  check('Large headings are set tighter than small text', track.h1 < -0.02 && track.sub >= 0, track);
  await c.close();

  // ---------- less motion ----------
  ({ c, p } = await open({ reducedMotion: 'reduce' }));
  await p.click('#tellSnap'); await p.waitForTimeout(60); const calm = await sheet(p, 'capDlg'); await settle(p); const calm2 = await sheet(p, 'capDlg');
  check('With "reduce motion" on, a sheet fades in and does not slide', calm.y === 0 && calm.opacity < 1 && calm2.opacity === 1, { calm, calm2 });
  await snap(p);
  g = await grabAt(p, 'capDlg'); await p.mouse.move(g.x, g.y); await p.mouse.down(); await p.mouse.move(g.x, g.y + 60, { steps: 4 }); await p.waitForTimeout(250); await p.mouse.up(); await p.waitForTimeout(60);
  const calm3 = await sheet(p, 'capDlg');
  check('...and a let-go sheet is back in place at once, with no bounce', calm3.open && calm3.y === 0, calm3);
  await shut(p);
  const b2 = await p.locator('#bell').boundingBox(); await p.mouse.move(b2.x + 20, b2.y + 20); await p.mouse.down(); await p.waitForTimeout(160);
  const calmPress = await p.evaluate(() => { const s = getComputedStyle(document.getElementById('bell')); return { t: s.transform, o: +s.opacity }; }); await p.mouse.move(5, 300); await p.mouse.up();
  check('...and a pressed button dims instead of shrinking', calmPress.t === 'none' && calmPress.o < 0.9, calmPress);
  await c.close();

  // ---------- less transparency, more contrast ----------
  ({ c, p } = await open());
  const cdp = await c.newCDPSession(p);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  const solid = await p.evaluate(() => { const f = (s) => { const x = getComputedStyle(document.querySelector(s)); return (x.backdropFilter || 'none') + ' ' + x.backgroundColor; }; return { top: f('.appbar'), tabs: f('.tabs') }; });
  check('With "reduce transparency" on, the bars are solid', /^none rgb\(/.test(solid.top) && /^none rgb\(/.test(solid.tabs), solid);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-contrast', value: 'more' }] });
  const firm = await p.evaluate(() => { const a = getComputedStyle(document.querySelector('.appbar')); return { blur: a.backdropFilter || 'none', edge: a.borderBottomWidth, same: a.borderBottomColor === getComputedStyle(document.body).color }; });
  check('With "increase contrast" on, the bars are solid with a clear edge', firm.blur === 'none' && firm.edge === '1px' && firm.same, firm);
  await c.close();

  check('No script errors during the whole walk', errs.length === 0, errs.join(' | '));
  await b.close();
  let bad = 0; for (const [ok, name, detail] of R) { if (!ok) bad++; console.log((ok ? '  ok  ' : 'FAIL  ') + name + (detail ? '  -> ' + detail : '')); }
  console.log('\n' + (R.length - bad) + ' of ' + R.length + ' checks passed'); process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('audit crashed: ' + e.message); process.exit(2); });
