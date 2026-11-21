// New allergens (20 Nov 2026): lupin, molluscs, buckwheat, kiwi, banana, peach and coconut.
// Each "should warn" has a "should not warn" beside it. Runs the Worker's real code; the chat checks use a stand-in model that
// is never asked (every answer here comes from code), so every result is exact and costs nothing.
// The test foods and labels were written by Claude from general knowledge, not taken from real packs.
//
//   node --no-warnings evals/allergens2.mjs
import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { loadAgent, ROOT } from './load.mjs';

const A = await loadAgent(['cleanProfile', 'clashOf', 'itemClash', 'labelCheck', 'productFrom']);
const results = [];
const check = (name, pass, detail) => results.push([!!pass, name, pass ? '' : JSON.stringify(detail ?? '').slice(0, 400)]);
const prof = (allergies, members = []) => A.cleanProfile({ personas: ['family4'], adults: 2, kids: members.length, allergies, members });

// ---- 1. the profile keeps each new allergy as a known choice (US spelling of molluscs too) ----
const NEW = ['Lupin', 'Molluscs', 'Buckwheat', 'Kiwi', 'Banana', 'Peach', 'Coconut'];
{
  const p = prof(NEW.map((x) => x.toLowerCase()).concat(['Mollusks']));
  check('profile keeps all seven new allergies as choices, with their own spelling', NEW.every((a) => p.allergies.includes(a)), p.allergies);
  check('  ..."Mollusks" (US spelling) is the same choice, not a second one', p.allergies.filter((a) => /mollus/i.test(a)).length === 1, p.allergies);
}

// ---- 2. names on the list and At home: each allergen by its own name and its other names, and the look-alikes left alone ----
const WARN = {
  Lupin: ['Lupini Beans', 'Lupin Flour', 'Tremocos', 'Altramuces'],
  Molluscs: ['Oyster Sauce', 'Squid Rings', 'Calamari', 'Clams', 'Mussels', 'Scallops', 'Octopus', 'Abalone', 'Cuttlefish', 'Escargot', 'Kanava Fry'],
  Buckwheat: ['Soba Noodles', 'Buckwheat Flour', 'Kuttu Atta', 'Kuttu Ka Atta', 'Kasha', 'Naengmyeon', 'Grechka'],
  Kiwi: ['Kiwi', 'Kiwifruit', 'Gold Kiwis'],
  Banana: ['Bananas', 'Banana Chips', 'Plantains', 'Kela Chips', 'Raw Banana', 'Banana Ketchup', 'Platanos'],
  Peach: ['Peaches', 'Peach Yogurt', 'Nectarines', 'Peach Iced Tea'],
  Coconut: ['Coconut Milk', 'Desiccated Coconut', 'Nariyal Chutney', 'Copra', 'Coconut Oil', 'Thengai Podi', 'Khopra', 'Santan'],
};
const QUIET = {
  Lupin: ['Lentils', 'Lupine Flowers Seeds Packet'], // a garden seed packet is not food: left to Home, not the Kitchen
  Molluscs: ['Oyster Mushrooms', 'King Oyster Mushroom', 'Squid Brand Fish Sauce', 'Shrimp'],
  Buckwheat: ['Whole Wheat Bread', 'Rice Noodles'],
  Kiwi: ['Kale', 'Kidney Beans'],
  Banana: ['Banana Peppers', 'Banana Shallots'],
  Peach: ['Veg Momos', 'Pears', 'Apricots'],
  Coconut: ['Cocoa Powder', 'Coco Pops Cereal', 'Cocktail Onions'],
};
for (const a of NEW) {
  const p = prof([a]);
  for (const n of WARN[a]) { const c = A.clashOf(n, p, 'Kitchen'); check(a + ': "' + n + '" is flagged', c && c.kind === 'allergy' && c.what === a.toLowerCase(), c); }
  for (const n of QUIET[a]) { const c = A.clashOf(n, p, /Seeds Packet/.test(n) ? 'Home' : 'Kitchen'); check(a + ': "' + n + '" is not flagged', !c, c); }
}
// a person's allergy, named, and the older allergies unchanged
{
  const p = prof([], [{ name: 'Mira', kind: 'child', allergies: ['Kiwi'] }]);
  const c = A.clashOf('Kiwi Smoothie', p, 'Kitchen');
  check('Mira\'s kiwi allergy is named for her', c && c.who === 'Mira' && c.what === 'kiwi', c);
  const s = prof(['Shellfish']);
  check('Shellfish still covers squid and clams (no change for homes that chose it)', A.clashOf('Squid Rings', s, 'Kitchen') && A.clashOf('Clams', s, 'Kitchen'), null);
  check('Molluscs alone does not flag shrimp (a crustacean)', !A.clashOf('Shrimp', prof(['Molluscs']), 'Kitchen'), null);
  check('Wheat alone does not flag buckwheat flour', !A.clashOf('Buckwheat Flour', prof(['Wheat']), 'Kitchen'), null);
  check('Coconut does not flag a coconut-free granola', !A.clashOf('Coconut-free Granola', prof(['Coconut']), 'Kitchen'), null);
}

// ---- 3. the world glossary: things whose name does not say it ----
{
  const ic = (name, a) => A.itemClash(name, prof([a]), []).allergy;
  check('glossary: oyster sauce is molluscs', ic('LKK Oyster Flavored Sauce', 'Molluscs') === 'molluscs', ic('LKK Oyster Flavored Sauce', 'Molluscs'));
  check('glossary: dried scallops (conpoy) is molluscs', ic('Conpoy', 'Molluscs') === 'molluscs', ic('Conpoy', 'Molluscs'));
  check('glossary: dried shrimp is not molluscs', ic('Dried Shrimp', 'Molluscs') === '', ic('Dried Shrimp', 'Molluscs'));
  check('glossary: soba is buckwheat', ic('Soba', 'Buckwheat') === 'buckwheat', ic('Soba', 'Buckwheat'));
  check('glossary: tsuyu (soba sauce) is not buckwheat', ic('Mentsuyu', 'Buckwheat') === '', ic('Mentsuyu', 'Buckwheat'));
  check('glossary: gata (coconut milk) is coconut', ic('Gata', 'Coconut') === 'coconut', ic('Gata', 'Coconut'));
  check('glossary: platano maduro is banana', ic('Platano Maduro', 'Banana') === 'banana', ic('Platano Maduro', 'Banana'));
  check('glossary: Binggrae banana milk is banana', ic('Binggrae', 'Banana') === 'banana', ic('Binggrae', 'Banana'));
  check('glossary: basmati rice is none of them', NEW.every((a) => ic('Basmati Rice', a) === ''), null);
}

// ---- 4. a scanned label: the product database's own allergen tags and the ingredient list ----
{
  const prod = (fields) => A.productFrom({ status: 1, product: { product_name: 'Test pack', brands: 'Test', ...fields } });
  const say = (allergies, fields) => (A.labelCheck(prod(fields), prof(allergies)) || {}).text || '';
  let t = say(['Lupin'], { allergens_tags: ['en:lupin'], ingredients_text_en: 'wheat flour, water, salt' });
  check('label: lupin tag is caught, with "check the label"', /contains lupin/.test(t) && /check the label/i.test(t), t);
  t = say(['Lupin'], { traces_tags: ['en:lupin'], ingredients_text_en: 'wheat flour, water' });
  check('label: "may contain lupin" is said as may contain', /may contain lupin/.test(t), t);
  t = say(['Molluscs'], { allergens_tags: ['en:molluscs'], ingredients_text_en: 'sugar, oyster extract, salt' });
  check('label: molluscs tag is caught', /contains molluscs/.test(t), t);
  t = say(['Buckwheat'], { ingredients_text_en: 'buckwheat flour (40%), wheat flour, salt' });
  check('label: buckwheat in the ingredients is caught', /contains buckwheat/.test(t), t);
  t = say(['Coconut'], { ingredients_text_en: 'rice, desiccated coconut, sugar' });
  check('label: desiccated coconut is caught', /contains coconut/.test(t), t);
  t = say(['Banana', 'Kiwi', 'Peach'], { ingredients_text_en: 'apple puree, banana puree, kiwi juice concentrate, peach pieces' });
  check('label: banana, kiwi and peach in one fruit pouch are all caught', /contains banana/.test(t) && /contains kiwi/.test(t) && /contains peach/.test(t), t);
  for (const a of NEW) {
    t = say([a], { allergens_tags: ['en:gluten'], ingredients_text_en: 'wheat flour, water, cocoa butter, salt, yeast' });
    check('label: a plain bread with cocoa butter says nothing about ' + a.toLowerCase(), !new RegExp('contain ' + a.toLowerCase()).test(t) && !new RegExp('contains ' + a.toLowerCase()).test(t), t);
  }
  t = say(['Coconut'], { ingredients_text_en: 'peanuts, salt. contains no coconut.' });
  check('label: "contains no coconut" is not read as coconut', !/contains coconut/.test(t), t);
}

// ---- 5. in chat, answered by code: names the clash and says "check the label", never "it is safe" ----
function d1(db) {
  const fix = (v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v);
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), run: async () => { db.prepare(sql).run(...args.map(fix)); return { success: true }; }, first: async () => db.prepare(sql).get(...args.map(fix)) ?? null, all: async () => ({ results: db.prepare(sql).all(...args.map(fix)) }) });
  return { prepare: (sql) => stmt(sql), batch: async (list) => Promise.all(list.map((s) => s.all())) };
}
{
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  let asked = 0;
  const env = { APP_PIN: 'test1234', TEST_DATES: 'on', DB: d1(db), TEXT_MODEL: 'big', DELEGATE: 'off', ASSETS: { fetch: async () => new Response('') }, AI: { run: async () => { asked++; return { response: 'Sure, that is fine.' }; } } };
  let cookie = '';
  const call = async (method, p, body) => { const res = await A.default.fetch(new Request('https://stocker.test' + p, { method, headers: { cookie, 'content-type': 'application/json', origin: 'https://stocker.test', 'x-today': '2026-11-20' }, body: body ? JSON.stringify(body) : undefined }), env); return { res, data: await res.json().catch(() => ({})) }; };
  const login = await call('POST', '/api/login', { pin: 'test1234', name: 'Sam' });
  cookie = login.res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  for (const [name, unit] of [['Soba Noodles', 'pack'], ['Coconut Milk', 'can'], ['Basmati Rice', 'kg']]) await call('POST', '/api/apply', { source: 'hand', bought: '2026-11-20', actions: [{ action: 'add', name, quantity: 1, unit, area: 'Kitchen', category: 'Pantry', warn: '', expiry: '', shelfLifeDays: 90, finishDays: 30 }] });
  await call('POST', '/api/profile', { personas: ['mom'], adults: 2, kids: 1, members: [{ name: 'Leo', kind: 'child', allergies: ['Buckwheat', 'Coconut'] }] });
  const items = (await call('GET', '/api/items')).data;
  const list = Array.isArray(items) ? items : items.items || [];
  const flag = (n) => (list.find((i) => i.name === n) || {}).warn || '';
  check('At home: soba noodles carry a buckwheat flag for Leo', /buckwheat/i.test(flag('Soba Noodles')), list.map((i) => [i.name, i.warn]));
  check('At home: coconut milk carries a coconut flag for Leo', /coconut/i.test(flag('Coconut Milk')), list.map((i) => [i.name, i.warn]));
  check('At home: basmati rice carries no flag', !flag('Basmati Rice'), flag('Basmati Rice'));
  const r = (await call('POST', '/api/chat', { text: 'can Leo have the soba noodles?' })).data;
  const reply = String(r.reply || '');
  check('"can Leo have the soba noodles?" names buckwheat and says check the label', /buckwheat/i.test(reply) && /check the label/i.test(reply) && !/\bit is safe\b|is fine/i.test(reply), reply);
  const r2 = (await call('POST', '/api/chat', { text: 'can Leo have the basmati rice?' })).data;
  check('"can Leo have the basmati rice?" does not invent a clash', !/contains (?:buckwheat|coconut)|usually contains/i.test(String(r2.reply || '')) && /nothing|no clash/i.test(String(r2.reply || '')) && !/\bit is safe\b/i.test(String(r2.reply || '')), r2.reply);
}

// ---- 6. first sight: names written after the code was finished (node evals/allergens2.mjs --fresh) ----
if (process.argv.includes('--fresh')) {
  results.length = 0;
  const F = JSON.parse(fs.readFileSync(path.join(ROOT, 'evals/allergens2-fresh.json'), 'utf8'));
  for (const [a, names] of Object.entries(F.warn)) for (const n of names) { const c = A.clashOf(n, prof([a]), 'Kitchen'); check('fresh ' + a + ': "' + n + '" is flagged', c && c.what === a.toLowerCase(), c); }
  for (const [a, names] of Object.entries(F.quiet)) for (const n of names) { const c = A.clashOf(n, prof([a]), 'Kitchen'); check('fresh ' + a + ': "' + n + '" is not flagged', !c, c); }
}
const pass = results.filter((r) => r[0]).length;
for (const [ok, name, detail] of results) if (!ok || process.argv.includes('--all')) console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
console.log('\nnew allergens: ' + pass + ' / ' + results.length);
process.exit(pass === results.length ? 0 : 1);
