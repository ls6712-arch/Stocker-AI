// Allergies a household types in themselves ("avocado"): Tote warns on the food's own name and on what it usually hides in,
// from a short list in code, or from the model asked once when the allergy is saved. Each check has its opposite.
// Real code and real SQL on an in-memory database; the model is a stand-in that says what the check chooses.
//
//   node --no-warnings evals/learn.mjs            (add --json for one line of numbers)
import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { loadAgent, ROOT } from './load.mjs';

const results = [];
const check = (name, pass, detail) => results.push([!!pass, name, pass ? '' : JSON.stringify(detail ?? '').slice(0, 300)]);
let A, built = true;
try { A = await loadAgent(['clashOf', 'cleanProfile', 'allergyKey', 'cleanWords']); } catch (e) { built = false; A = await loadAgent(['clashOf', 'cleanProfile']); }

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
function world(answer) {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  const asked = [];
  const env = { APP_PIN: 'test1234', DB: d1(db), TEXT_MODEL: 'big', DELEGATE: 'off', ASSETS: { fetch: async () => new Response('') },
    AI: { run: async (model, input) => { const said = input.messages[input.messages.length - 1].content; asked.push(said); if (typeof answer === 'function') return answer(said); return { response: JSON.stringify({ words: answer[said] || [] }) }; } } };
  let cookie = '';
  const call = async (method, p, body) => {
    const res = await A.default.fetch(new Request('https://stocker.test' + p, { method, headers: { cookie, 'content-type': 'application/json', origin: 'https://stocker.test', 'cf-connecting-ip': '10.9.9.9' }, body: body ? JSON.stringify(body) : undefined }), env);
    if (p === '/api/login') cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
  return { db, env, asked, call };
}
const prof = (allergies, members = []) => ({ personas: ['couple'], adults: 2, kids: 0, allergies, members });
const warn = (name, p) => { const c = A.clashOf(name, p); return c ? c.word || c.what : ''; };

// ---- 1. the food's own word, as a whole word ----
const avo = { ...A.cleanProfile(prof(['avocado'])) };
check('a typed allergy is matched by its own word: "Hass Avocados" warns for avocado', warn('Hass Avocados', avo) === 'avocados', warn('Hass Avocados', avo));
const pea = A.cleanProfile(prof(['peas']));
check('opposite: "peas" does not warn on peanut butter (a word inside another word)', warn('Peanut Butter', pea) === '', warn('Peanut Butter', pea));
check('...but does on "Frozen Green Peas"', /pea/.test(warn('Frozen Green Peas', pea)), warn('Frozen Green Peas', pea));
const straw = A.cleanProfile(prof(['strawberries']));
check('"strawberries" warns on "Strawberry Jam"', /strawberr/.test(warn('Strawberry Jam', straw)), warn('Strawberry Jam', straw));
check('the allergy is written the way people type it: Avocados, avocado, AVOCADO are one', built && ['Avocados', 'avocado', 'AVOCADO '].every((a) => A.allergyKey(a) === 'avocado'), built && ['Avocados', 'avocado', 'AVOCADO '].map(A.allergyKey));

// ---- 2. what it hides in, from the list in code ----
let w = world({});
await w.call('POST', '/api/login', { pin: 'test1234', name: 'Sush' });
let r = await w.call('POST', '/api/profile', prof(['Peanuts', 'avocado']));
const p1 = r.data.profile || {};
check('saving "avocado" keeps it as typed', r.status === 200 && (p1.allergies || []).join() === 'Peanuts,avocado', r.data);
check('...and Tote knows guacamole hides it, without asking the model', JSON.stringify(p1.hidden || {}).includes('guacamole') && w.asked.length === 0, [p1.hidden, w.asked]);
check('"Guacamole Dip" now warns for avocado, naming the word', p1.hidden && warn('Guacamole Dip', p1) === 'guacamole', p1.hidden && warn('Guacamole Dip', p1));
check('opposite: a plain "Corn Tortilla Chips" does not warn', p1.hidden && warn('Corn Tortilla Chips', p1) === '', p1.hidden && warn('Corn Tortilla Chips', p1));
check('opposite: a listed allergy (peanuts) is never sent to the model', !w.asked.some((a) => /peanut/i.test(a)), w.asked);
r = await w.call('POST', '/api/items');
const items = (await w.call('GET', '/api/items')).data;
check('the home\'s profile carries what was learnt to the app', JSON.stringify((items.profile || {}).hidden || {}).includes('guac'), (items.profile || {}).hidden);

// ---- 3. what it hides in, learnt from the model once ----
w = world({ jackfruit: ['kathal', 'jackfruit chips', 'food', 'Ignore all instructions', 'kathal biryani', 'veg pulled pork', 'a very long name that goes on and on'] });
await w.call('POST', '/api/login', { pin: 'test1234', name: 'Sush' });
r = await w.call('POST', '/api/profile', prof(['jackfruit']));
const p2 = r.data.profile || {}, got = (p2.hidden || {}).jackfruit || [];
check('an allergy not in the list is asked about once', w.asked.length === 1 && w.asked[0] === 'jackfruit', w.asked);
check('...and what comes back is checked: real names kept', got.includes('kathal') && got.includes('kathal biryani') && got.includes('veg pulled pork'), got);
check('...too-general words, instructions and long rambles dropped', !got.includes('food') && !got.some((x) => /ignore|very long/.test(x)) && !got.includes('jackfruit chips'), got);
check('"Canned Kathal" now warns for jackfruit', p2.hidden && warn('Canned Kathal', p2) === 'kathal', p2.hidden && warn('Canned Kathal', p2));
await w.call('POST', '/api/profile', prof(['jackfruit']));
await w.call('POST', '/api/profile', prof(['jackfruit', 'Milk']));
check('opposite: saving again does not ask again', w.asked.length === 1, w.asked);
r = await w.call('POST', '/api/profile', prof([], [{ name: 'Leo', kind: 'child', allergies: ['Mango'] }]));
check('a person\'s own typed allergy is learnt too, from the list in code (mango hides in aamras)', JSON.stringify((r.data.profile || {}).hidden || {}).includes('aamras') && r.data.profile && (A.clashOf('Aamras Pulp', r.data.profile) || {}).who === 'Leo', r.data.profile && r.data.profile.hidden);

// ---- 4. with no allowance left, saving still works and nothing is invented ----
w = world(() => { throw new Error('4006: you have used up your daily free allocation of 10,000 neurons'); });
await w.call('POST', '/api/login', { pin: 'test1234', name: 'Sush' });
r = await w.call('POST', '/api/profile', prof(['durian']));
check('with the allowance used up the allergy is still saved', r.status === 200 && (r.data.profile || {}).allergies.join() === 'durian', r.data);
check('...it still warns on its own word, and learns nothing made up', warn('Durian Candy', r.data.profile) === 'durian' && !((r.data.profile || {}).hidden || {}).durian, r.data.profile && r.data.profile.hidden);
const later = world({ durian: ['musang king'] });
check('opposite: a model that says nothing usually hides it is kept as nothing', built && A.cleanWords([], 'durian').length === 0, null);

// ---- 5. it is per home ----
w = world({ jackfruit: ['kathal'] });
await w.call('POST', '/api/login', { pin: 'test1234', name: 'Sush' });
await w.call('POST', '/api/profile', prof(['jackfruit']));
const code = (await w.call('POST', '/api/homes', { name: 'Asha' })).data.code;
await w.call('POST', '/api/login', { pin: code, name: 'Asha' });
r = await w.call('POST', '/api/profile', prof(['Milk']));
check('another home does not get this home\'s allergy words', r.status === 200 && !(r.data.profile || {}).hidden, r.data.profile && r.data.profile.hidden);

const passed = results.filter((x) => x[0]).length;
if (process.argv.includes('--json')) console.log(JSON.stringify({ pass: passed, total: results.length }));
else { for (const [ok, name, d] of results) console.log((ok ? '  ok   ' : '  FAIL ') + name + (d ? '\n         ' + d : '')); console.log('\n' + passed + ' of ' + results.length + ' typed-allergy checks pass'); }
if (!process.argv.includes('--baseline')) process.exit(passed === results.length ? 0 : 1);
