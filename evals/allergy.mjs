// Allergy guard: what Tote may say about food in a home with an allergy, whatever the model writes.
// Each check has its opposite. Runs the Worker's real code and SQL against an in-memory database, with a stand-in model
// that answers with a reply we choose (several are the real replies from 16 Nov 2026), so every result here is exact.
//
//   node --no-warnings evals/allergy.mjs
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
const DAY = '2026-11-16';
const A = await loadAgent(['cleanProfile']);

const LEO = { personas: ['mom'], adults: 2, kids: 1, members: [{ name: 'Leo', kind: 'child', allergies: ['Peanuts'] }] };
const KITCHEN = [['Peanut Butter Pretzel Sandwich', 3, 'pack', 'Snacks'], ['Bartlett Pears', 1, 'lb', 'Produce'], ['Beef Hot Dogs', 1, 'pack', 'Meat'], ['Unsalted Butter', 1, 'pack', 'Dairy'], ['Whole Milk', 1, 'L', 'Dairy'], ['Eggs', 12, 'pcs', 'Dairy'], ['Greek Yogurt', 1, 'pack', 'Dairy']];

// a home whose model always answers with `says` (a string, or a function of the prompt)
async function home(profile, says, items = KITCHEN) {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  const seen = [];
  const env = { APP_PIN: 'test1234', DB: d1(db), TEXT_MODEL: 'big', DELEGATE: 'off', ASSETS: { fetch: async () => new Response('') },
    AI: { run: async (model, input) => { seen.push(input); if (says === null) throw new Error('4006: you have used up your daily free allocation of 10,000 neurons'); return { response: typeof says === 'function' ? says(input) : says }; } } };
  let cookie = '';
  const call = async (method, p, body) => {
    const res = await A.default.fetch(new Request('https://stocker.test' + p, { method, headers: { cookie, 'content-type': 'application/json', origin: 'https://stocker.test', 'x-today': DAY }, body: body ? JSON.stringify(body) : undefined }), env);
    return { status: res.status, data: await res.json().catch(() => ({})) , res };
  };
  const login = await call('POST', '/api/login', { pin: 'test1234', name: 'Sam' });
  cookie = login.res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  for (const [name, qty, unit, category] of items) await call('POST', '/api/apply', { source: 'hand', bought: DAY, actions: [{ action: 'add', name, quantity: qty, unit, area: 'Kitchen', category, warn: '', expiry: '', shelfLifeDays: 5, finishDays: 10 }] });
  if (profile) await call('POST', '/api/profile', profile);
  return { call, seen, say: async (text) => (await call('POST', '/api/chat', { text })).data, calls: () => seen.length };
}
const OFFERS = /\b(?:pack|put|try|use|have|give|make|eat|like)\b[^.?!]{0,60}\b(?:peanut butter|pretzel sandwich)|(?:peanut butter|pretzel sandwich)[^.?!]{0,40}\b(?:would be|is a good|are a good|is great|are great|is perfect|sounds good)/i;
const WHY = /Leo is marked no peanuts/;
const LABEL = /check the label/i;

// ---- 1. the model offers something that clashes: the offer never reaches the household, and Tote says why ----
{
  // the real reply of 16 Nov, 17:49 UTC
  let h = await home(LEO, 'I do not see any Peanut Butter tracked at home, only Peanut Butter Pretzel Sandwich. Would you like to put a Peanut Butter Pretzel Sandwich in Leo\'s lunchbox?');
  let r = await h.say("What should go in Leo's lunchbox tomorrow?");
  check('real reply of 16 Nov ("Would you like to put a Peanut Butter Pretzel Sandwich in Leo\'s lunchbox?") is not passed on', !OFFERS.test(r.reply) && WHY.test(r.reply) && LABEL.test(r.reply), r.reply);
  check('  ...and the model was asked, so this is the guard at work', h.calls() === 1, h.calls());

  h = await home(LEO, 'You could pack the Peanut Butter Pretzel Sandwich and some Bartlett Pears. Both are easy to grab.');
  r = await h.say('What can I pack for lunchboxes tomorrow?');
  check('"what can I pack for lunchboxes": a sandwich with peanut in the name is not offered', !OFFERS.test(r.reply) && WHY.test(r.reply) && LABEL.test(r.reply), r.reply);
  check('  ...and no sentence is left hanging ("Both are easy to grab")', !/^Both\b|\. Both\b/.test(r.reply), r.reply);
  check('  ...and the pears in the same sentence are still suggested', /Bartlett Pears/.test(r.reply), r.reply);

  h = await home(LEO, 'A peanut butter sandwich with a pear would be quick. You also have Beef Hot Dogs, best before Saturday.');
  r = await h.say('I am starving, what can I eat right now?');
  check('a food that is not tracked but has the allergen in its name ("a peanut butter sandwich") is not offered', !OFFERS.test(r.reply) && /no peanuts/.test(r.reply) && LABEL.test(r.reply), r.reply);
  check('  ...and the rest of the answer is kept', /Beef Hot Dogs/.test(r.reply), r.reply);

  h = await home(LEO, 'Why not give him the peanut butter pretzel sandwich? It is not too messy.');
  r = await h.say("What snack can Leo have after school?");
  check('"why not give him..." and "it is not too messy" do not count as a warning', !OFFERS.test(r.reply) && WHY.test(r.reply) && LABEL.test(r.reply), r.reply);

  h = await home({ personas: ['student'], adults: 1, allergies: ['Tree nuts'] }, 'Try the Almond Granola with the Greek Yogurt.', KITCHEN.concat([['Almond Granola', 1, 'pack', 'Pantry']]));
  r = await h.say('What can I have for breakfast?');
  check('an allergy of the whole home (tree nuts): almond granola is not offered', !/try the almond/i.test(r.reply) && /no tree nuts/.test(r.reply) && LABEL.test(r.reply), r.reply);

  h = await home(LEO, 'You could make hot dogs with the Beef Hot Dogs, or pad thai with crushed peanuts if you pick up noodles.');
  r = await h.say('What can I cook tonight?');
  check('"hot dogs, or pad thai with crushed peanuts": the peanut idea goes, the hot dogs stay', !/pad thai|crushed/i.test(r.reply) && /Beef Hot Dogs/.test(r.reply) && /no peanuts/.test(r.reply) && LABEL.test(r.reply), r.reply);
  h = await home(LEO, 'You have 3 pack of Peanut Butter Pretzel Sandwich and 1 lb of Bartlett Pears.');
  r = await h.say('what do we have for snacks?');
  check('asked about snacks, a list of what is at home is kept, with the reason to skip the sandwich', /^You have 3 pack of Peanut Butter Pretzel Sandwich and 1 lb of Bartlett Pears\./.test(r.reply) && WHY.test(r.reply) && LABEL.test(r.reply), r.reply);
  r = await h.say('how many pretzel sandwiches are left in the cupboard?');
  check('opposite: asked only how many are left, the count is given with nothing added', /3 pack of peanut butter pretzel sandwich/i.test(r.reply) && !/marked no|left out/.test(r.reply), r.reply);
  // the opposite: nothing clashes, so the model's answer goes through word for word
  const fine = 'You could pack Bartlett Pears and Beef Hot Dogs. Both are close to their best before date.';
  h = await home(LEO, fine);
  r = await h.say('What can I pack for lunchboxes tomorrow?');
  check('opposite: an answer with nothing that clashes is passed on unchanged', r.reply === fine, r.reply);
  h = await home(null, 'You could pack the Peanut Butter Pretzel Sandwich and some Bartlett Pears.');
  r = await h.say('What can I pack for lunchboxes tomorrow?');
  check('opposite: a home with no allergy gets the peanut butter sandwich suggested as usual', /Peanut Butter Pretzel Sandwich/.test(r.reply) && !/marked no/.test(r.reply), r.reply);
  h = await home({ personas: ['mom'], adults: 2, kids: 1, members: [{ name: 'Leo', kind: 'child', allergies: ['Milk'] }] }, 'Whole Milk is best before Friday, my estimate.');
  r = await h.say('how long will the milk keep for?');
  check('opposite: a plain fact about something at home is not treated as an offer (milk allergy, "how long will the milk keep")', /^Whole Milk is best before Friday/.test(r.reply) && !/marked no/.test(r.reply), r.reply);
  h = await home(LEO, 'I would not put the Peanut Butter Pretzel Sandwich in, because Leo has a peanut allergy. Bartlett Pears would work.');
  r = await h.say("What should go in Leo's lunchbox tomorrow?");
  check('opposite: a model answer that already warns keeps its warning and its other idea', /would not put/.test(r.reply) && /Bartlett Pears would work/.test(r.reply), r.reply);
}

// ---- 2. anything said about an allergy ends with "check the label" ----
{
  // the real reply of 16 Nov, 17:51 UTC
  let h = await home(LEO, 'I would not suggest that, there is a peanut allergy at home.');
  let r = await h.say("What about something nutty for Leo's snack?");
  check('real reply of 16 Nov ("there is a peanut allergy at home") now says check the label', LABEL.test(r.reply), r.reply);
  h = await home(LEO, 'Yes, the pears are safe for Leo.');
  r = await h.say("What about a pear for Leo's snack?");
  check('a "safe" claim is removed and the reply says "check the label" (it said "check the pack")', !/\bsafe\b/i.test(r.reply) && LABEL.test(r.reply) && !/check the pack/i.test(r.reply), r.reply);
  h = await home(LEO, 'You have 12 eggs, best before 30 Nov.');
  r = await h.say('how many eggs are in the fridge door?');
  check('opposite: an answer that is not about allergies gets no label line', !LABEL.test(r.reply), r.reply);
}

// ---- 3. "can Leo have it?" is answered by code when they shorten the name ----
{
  const asks = async (text, says = 'I am not sure about that one.') => { const h = await home(LEO, says); const r = await h.say(text); return { reply: r.reply, calls: h.calls(), changes: (r.changes || []).length }; };
  for (const q of ['is the pretzel sandwich ok for leo', 'Can Leo have the sandwich?', 'ok to give leo those pretzel sandwiches?']) {
    const r = await asks(q);
    check('"' + q + '": No, with who and why, by code', /^No\./.test(r.reply) && WHY.test(r.reply) && /peanut butter pretzel sandwich/.test(r.reply) && LABEL.test(r.reply) && r.calls === 0 && !r.changes, r);
  }
  let r = await asks('could my husband have the pretzel sandwiches');
  check('"could my husband have the pretzel sandwiches": says who it is not for, by code', WHY.test(r.reply) && LABEL.test(r.reply) && !/^Yes/.test(r.reply) && r.calls === 0, r);
  r = await asks('Can I give Leo a pb sandwich?');
  check('"a pb sandwich" is read as peanut butter', /^No\./.test(r.reply) && WHY.test(r.reply) && LABEL.test(r.reply) && r.calls === 0, r);
  r = await asks('can leo have a pb&j');
  check('"a pb&j" is read as peanut butter', /^No\./.test(r.reply) && WHY.test(r.reply) && LABEL.test(r.reply) && r.calls === 0, r);
  // the opposite: a short word that belongs to a different thing is not answered about the sandwich
  r = await asks('Can Leo have butter?');
  check('opposite: "can Leo have butter?" is about the butter, not the peanut butter sandwich', !/^No\b/.test(r.reply) && !/peanut butter pretzel/.test(r.reply) && /unsalted butter/.test(r.reply) && LABEL.test(r.reply) && !/\bsafe\b/.test(r.reply), r);
  r = await asks('Can Leo have a ham sandwich?', 'I do not see a ham sandwich at home.');
  check('opposite: "a ham sandwich" is not answered as if it were the peanut butter one', !/^No\b/.test(r.reply) && !/peanut/.test(r.reply), r);
  r = await asks('Can Leo have the pears?');
  check('opposite: no clash in the name is never "yes" or "safe", and still says check the label', !/^(No|Yes)\b/.test(r.reply) && !/\bsafe\b/i.test(r.reply) && LABEL.test(r.reply) && r.calls === 0, r);
}

// ---- 4. dinner ideas: a dinner that needs something that clashes is not shown ----
{
  const cards = JSON.stringify({ meals: [
    { name: 'Peanut Butter Pretzel Bake', minutes: 20, why: 'Uses the sandwiches', uses: [{ name: 'Peanut Butter Pretzel Sandwich', quantity: 1 }, { name: 'Eggs', quantity: 2 }], missing: [] },
    { name: 'Hot Dog Satay Skewers', minutes: 25, why: 'Uses the hot dogs', uses: [{ name: 'Beef Hot Dogs', quantity: 1 }], missing: ['Peanut sauce'] },
    { name: 'Pear and Yogurt Bowls', minutes: 10, why: 'Uses the pears before Saturday', uses: [{ name: 'Bartlett Pears', quantity: 1 }, { name: 'Greek Yogurt', quantity: 1 }], missing: [] },
  ] });
  let h = await home(LEO, cards);
  let r = (await h.call('POST', '/api/meals', {})).data;
  const names = (r.meals || []).map((m) => m.name);
  check('a dinner that uses the peanut butter sandwiches is not shown', !names.some((n) => /Peanut/.test(n)), names);
  check('a dinner that needs peanut sauce from the shop is not shown', !names.some((n) => /Satay/.test(n)), names);
  check('opposite: the dinner with nothing that clashes is shown', names.includes('Pear and Yogurt Bowls'), names);
  const sent = JSON.stringify(h.seen[0] || '');
  check('the model is not even shown the food that clashes', h.seen.length === 1 && !/Peanut Butter Pretzel Sandwich \(/.test(sent) && /Bartlett Pears \(/.test(sent), sent.slice(-400));
  h = await home(null, cards);
  r = (await h.call('POST', '/api/meals', {})).data;
  check('opposite: a home with no allergy sees all three dinners', (r.meals || []).length === 3, (r.meals || []).map((m) => m.name));
}

const failed = results.filter((r) => !r[0]);
for (const [ok, name, detail] of results) console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + name + (ok ? '' : '\n        ' + detail));
console.log('\n' + (results.length - failed.length) + ' of ' + results.length + ' allergy-guard checks pass');
if (process.argv.includes('--json')) console.log(JSON.stringify({ pass: results.length - failed.length, total: results.length }));
process.exit(failed.length ? 1 : 0);
