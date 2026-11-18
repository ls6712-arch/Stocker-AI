// The photo pipeline: find the packs, cut each one out on the phone, read each cut-out, then the same check by code.
// Each check has its opposite. Runs the Worker's real code and SQL with stand-in models: the detector returns the boxes a
// check chooses, and the reader answers per cut-out (each cut-out's data says which pack it is), so every result is exact.
//
//   node --no-warnings evals/pipeline.mjs
import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { loadAgent, ROOT } from './load.mjs';

function d1(db) {
  const fix = (v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v);
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => { db.prepare(sql).run(...args.map(fix)); return { success: true }; },
    first: async () => db.prepare(sql).get(...args.map(fix)) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args.map(fix)) }),
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => Promise.all(list.map((s) => s.all())) };
}
const results = [];
const check = (name, pass, detail) => results.push([!!pass, name, pass ? '' : JSON.stringify(detail ?? '').slice(0, 500)]);
const DAY = '2026-11-17';
const A = await loadAgent(['cleanBoxes', 'iou', 'boxOf', 'pipelineOn']);
const FIND = '@cf/moondream/moondream3.1-9B-A2B', READ = '@cf/google/gemma-4-26b-a4b-it';
const act = (name) => ({ action: 'add', name, note: '', inferred: false, quantity: 1, quantityKnown: true, unit: 'pcs', area: 'Kitchen', category: 'Dairy', expiryDate: '', shelfLifeDays: 7, daysToFinish: 7, price: 0, warn: '' });
const crop = (tag) => 'data:image/jpeg;base64,' + Buffer.from(tag).toString('base64');

// a home whose detector finds `objects` and whose reader answers `reads[tag]` for the cut-out tagged `tag`
async function home(opts = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  let objects = [], reads = {}, findFails = false, failTags = new Set();
  const calls = [];
  const env = { APP_PIN: 'test1234', DB: d1(db), TEXT_MODEL: 'big', SMALL_MODEL: 'small', VISION_MODEL: 'vision', DELEGATE: 'off', ASSETS: { fetch: async () => new Response('') }, PHOTO_PIPELINE: 'owner', ...(opts.env || {}),
    AI: { run: async (model, input) => {
      calls.push(model);
      if (model === FIND) { if (findFails) throw new Error('detector down'); return { objects }; }
      const parts = (input.messages || []).flatMap((m) => (Array.isArray(m.content) ? m.content : []));
      const img = parts.find((c) => c.type === 'image_url');
      if (model === READ && img) {
        const tag = Buffer.from(img.image_url.url.split(',')[1], 'base64').toString();
        if (failTags.has(tag)) throw new Error('reader failed');
        return { response: reads[tag] ?? '' };
      }
      if (input.image) return { response: 'Milk | unsure |' }; // the old single reading, in the background
      const sys = JSON.stringify(input.messages || '');
      if (/You keep an inventory/.test(sys)) {
        const said = (input.messages || []).filter((m) => m.role === 'user').map((m) => m.content).join('\n');
        // a reading model that turns each line into an add, plus one thing nobody saw
        const names = said.split('\n').map((l) => l.split('|')[0].trim()).filter((n) => n && !/[:]$/.test(n) && n.length < 60);
        return { response: JSON.stringify({ intent: 'update', store: '', purchaseDate: '', currency: '', actions: names.map(act).concat(opts.invent ? [act('Salmon')] : []) }) };
      }
      return { response: '' };
    } } };
  const waits = [];
  const ctx = { waitUntil: (p) => waits.push(p) };
  const mk = async (pin, name) => {
    const r = await A.default.fetch(new Request('https://stocker.test/api/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://stocker.test' }, body: JSON.stringify({ pin, name }) }), env, ctx);
    const ck = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    return async (method, p, body) => {
      const res = await A.default.fetch(new Request('https://stocker.test' + p, { method, headers: { cookie: ck, 'content-type': 'application/json', origin: 'https://stocker.test', 'x-today': DAY }, body: body ? JSON.stringify(body) : undefined }), env, ctx);
      return { status: res.status, data: await res.json().catch(() => ({})) };
    };
  };
  const call = await mk('test1234', 'Sam');
  const set = (o) => { if (o.objects) objects = o.objects; if (o.reads) reads = o.reads; if ('findFails' in o) findFails = o.findFails; if (o.failTags) failTags = new Set(o.failTags); };
  // what the phone does: find, cut each box out (here: a tag per box), read, then save
  const scan = async (tags, c = call) => {
    const f = (await c('POST', '/api/scan/shelf/find', { image: crop('whole'), w: 1000, h: 1000 })).data;
    if (!f.boxes || !f.boxes.length) return { f };
    const d = (await c('POST', '/api/scan/shelf/read', { image: crop('whole'), boxes: f.boxes, crops: f.boxes.map((b, i) => ({ id: b.id, image: crop(tags[i] || 'x') })) })).data;
    const r = (await c('POST', '/api/apply', { source: 'shelf', bought: '', actions: d.actions || [] })).data;
    await Promise.all(waits.splice(0));
    return { f, d, r };
  };
  const item = (n) => db.prepare('SELECT name, qty, unsure FROM items WHERE lower(name) = lower(?)').get(n);
  const trials = () => db.prepare('SELECT model, prompt, text FROM photo_trials ORDER BY id').all();
  const friend = async () => { const code = (await call('POST', '/api/homes', { name: 'Asha' })).data.code; return mk(code, 'Asha'); };
  return { call, set, scan, item, trials, friend, calls, items: () => db.prepare('SELECT name, qty FROM items').all() };
}
const box = (x0, y0, x1, y1, score) => ({ x_min: x0, y_min: y0, x_max: x1, y_max: y1, ...(score != null ? { score } : {}) });

// ---- 1. the boxes worth reading ----
{
  const b = A.cleanBoxes([box(0.1, 0.1, 0.3, 0.4, 0.9), box(0.11, 0.1, 0.31, 0.41, 0.6), box(0.5, 0.5, 0.52, 0.51), box(0, 0, 1, 1), box(0.6, 0.1, 0.8, 0.4, 0.8)], 0, 0);
  check('the same pack found twice is read once (overlap above 0.5 kept once, the surer box)', b.length === 2 && b[0].x === 0.1, b);
  check('a speck and the whole fridge are not packs', !b.some((x) => x.w < 0.05 || x.w > 0.9), b);
  check('boxes come in reading order, top to bottom, left to right, with ids b1, b2...', b[0].x < b[1].x && b.map((x) => x.id).join() === 'b1,b2', b);
  const px = A.cleanBoxes([{ x_min: 100, y_min: 200, x_max: 300, y_max: 600 }], 1000, 1000);
  check('pixel boxes are turned into fractions of the photo', px.length === 1 && px[0].x === 0.1 && px[0].y === 0.2 && px[0].w === 0.2 && px[0].h === 0.4, px);
  check('opposite: pixel boxes with no photo size are dropped, never guessed', A.cleanBoxes([{ x_min: 100, y_min: 200, x_max: 300, y_max: 600 }], 0, 0).length === 0, null);
  check('other shapes a detector may answer in are read too (bbox array; x, y, width, height)', A.cleanBoxes([{ bbox: [0.1, 0.1, 0.3, 0.3] }, { x: 0.5, y: 0.5, width: 0.2, height: 0.2 }], 0, 0).length === 2, null);
  const many = A.cleanBoxes(Array.from({ length: 30 }, (_, i) => box((i % 6) * 0.16, Math.floor(i / 6) * 0.19, (i % 6) * 0.16 + 0.12, Math.floor(i / 6) * 0.19 + 0.15)), 0, 0);
  check('at most 16 packs are read from one photo (cost and time have a ceiling)', many.length === 16, many.length);
  check('garbage from the detector is ignored', A.cleanBoxes([null, 'x', {}, { x_min: 'a' }, box(0.5, 0.5, 0.4, 0.4)], 0, 0).length === 1, null);
  check('overlap is measured the standard way (intersection over union)', Math.abs(A.iou({ x: 0, y: 0, w: 1, h: 1 }, { x: 0.5, y: 0, w: 1, h: 1 }) - 1 / 3) < 1e-9, null);
}

// ---- 2. through the real routes: find, read, save ----
{
  const h = await home({ invent: true });
  h.set({ objects: [box(0.05, 0.6, 0.3, 0.95), box(0.35, 0.65, 0.5, 0.95), box(0.55, 0.65, 0.7, 0.95), box(0.72, 0.6, 0.9, 0.95), box(0.1, 0.1, 0.4, 0.3)],
    reads: { milk: 'Whole milk, 1 gallon | sure', cottage: 'Daisy cottage cheese | sure', tub: 'Sour cream | maybe', jar: 'unlabelled jar | maybe', door: 'none' } });
  const { f, d, r } = await h.scan(['door', 'milk', 'cottage', 'tub', 'jar']);
  check('the detector found 5 packs, and each became a box to cut out', f.boxes.length === 5, f);
  check('what was read for sure is at home (milk, cottage cheese)', !!h.item('Whole milk, 1 gallon') && !!h.item('Daisy cottage cheese'), h.items());
  check('  ...a guess (sour cream) and an unlabelled jar are asked, not added', (d.doubts || []).length === 2 && !h.item('Sour cream') && !h.items().some((x) => /jar/i.test(x.name)), [d.doubts, h.items()]);
  check('  ...a box that was not a product (the door) changes nothing', !h.items().some((x) => /door/i.test(x.name)) && d.marks.find((m) => m.name === '') !== undefined, d.marks);
  check('  ...and the reading model cannot add what no box showed (salmon)', !h.item('Salmon') && (d.unseen || []).includes('Salmon'), d.unseen);
  check('every box comes back with what was read in it, for the picture in the card', d.marks.length === 5 && d.boxes.length === 5 && d.marks.every((m) => d.boxes.some((b) => b.id === m.id)), d.marks);
  check('model calls: one to find, one per box, one to turn the names into changes (5 + 1 here)', d.calls === 6 && h.calls.filter((m) => m === READ).length === 5 && h.calls.filter((m) => m === FIND).length === 1, [d.calls, h.calls]);
  check('the changes were saved with Undo, as with any scan', (r.changes || []).length === 2 && r.changes.every((c) => c.created), r.changes);
}

// ---- 3. when something fails, the scan still works ----
{
  let h = await home();
  h.set({ objects: [box(0.1, 0.5, 0.3, 0.9), box(0.4, 0.5, 0.6, 0.9)], reads: { milk: 'Whole milk | sure', eggs: 'Eggs | sure' }, failTags: ['eggs'] });
  const { d } = await h.scan(['milk', 'eggs']);
  check('a cut-out the reader fails on is left out, never guessed; the rest is saved', !!h.item('Whole milk') && !h.item('Eggs') && d.marks.find((m) => m.failed), [h.items(), d.marks]);
  h = await home();
  h.set({ findFails: true });
  const s = await h.scan([]);
  check('if the detector fails, the phone is told to read the whole photo the old way', s.f.boxes.length === 0 && s.f.failed === true, s.f);
  h = await home();
  h.set({ objects: [] });
  const s2 = await h.scan([]);
  check('opposite: no packs found is an empty answer, not an error (the phone reads the whole photo instead)', s2.f.boxes.length === 0 && !s2.f.failed, s2.f);
  const bad = (await h.call('POST', '/api/scan/shelf/read', { boxes: [], crops: [{ id: 'b1', image: 'not a picture' }, { id: '../x', image: crop('milk') }] })).data;
  check('a cut-out that is not a picture, or a made-up id, is refused', bad.error === 'no_crops', bad);
}

// ---- 4. who gets the pipeline ----
{
  let h = await home();
  const st = (await h.call('GET', '/api/items')).data;
  check('with PHOTO_PIPELINE=owner, the owner\'s app is told to use it', st.pipe === true, st.pipe);
  const asha = await h.friend();
  check('  ...a friend\'s app is not, and the routes are closed to a friend', (await asha('GET', '/api/items')).data.pipe === false && (await asha('POST', '/api/scan/shelf/find', { image: crop('x') })).status === 404, null);
  h = await home({ env: { PHOTO_PIPELINE: 'off' } });
  check('with it off, nobody gets it', (await h.call('GET', '/api/items')).data.pipe === false && (await h.call('POST', '/api/scan/shelf/find', { image: crop('x') })).status === 404, null);
  h = await home({ env: { PHOTO_PIPELINE: 'all' } });
  const a2 = await h.friend();
  check('with it on for all, a friend gets it too', (await a2('GET', '/api/items')).data.pipe === true, null);
  check('opposite: the old single reading of a photo still works when the pipeline is on', (await h.call('POST', '/api/scan/shelf', { image: crop('whole') })).status === 200, null);
}

// ---- 5. the owner's photos: the pipeline and the old reading kept side by side, as text only ----
{
  const h = await home({ env: { PHOTO_TRIAL: 'on' } });
  h.set({ objects: [box(0.1, 0.5, 0.3, 0.9)], reads: { milk: 'Whole milk | sure' } });
  await h.scan(['milk']);
  const t = h.trials();
  check('the pipeline\'s boxes and reads are kept, with the old reading of the same photo beside them', t.length === 2 && t[0].prompt === 'pipeline (live)' && /Whole milk/.test(t[0].text) && t[1].prompt === 'v1 (shadow)', t);
  check('  ...the photo and the cut-outs are never kept', !JSON.stringify(t).includes('base64') && !JSON.stringify(t).includes('data:image'), null);
  const h2 = await home();
  h2.set({ objects: [box(0.1, 0.5, 0.3, 0.9)], reads: { milk: 'Whole milk | sure' } });
  await h2.scan(['milk']);
  check('opposite: with trials off, nothing is kept and the old reading is not run', h2.trials().length === 0 && !h2.calls.includes('vision'), h2.calls);
}

const failed = results.filter((r) => !r[0]);
for (const [ok, name, detail] of results) console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '\n     ' + detail));
console.log('\nPhoto pipeline: ' + (results.length - failed.length) + ' of ' + results.length + ' checks pass');
if (failed.length) process.exit(1);
