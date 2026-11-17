// House rules, round 1 (16 Nov 2026). A home says once what it keeps to ("no palm oil", "less sugar", for everyone or for
// one child) and Tote checks a scanned product's real label data against it. Each check has its opposite:
//   - the hidden names are caught (palmolein, 621, a colour number) and look-alikes are not (palm sugar, "no preservatives");
//   - "high" is a published line (the UK front-of-pack criteria per 100 g of food), never Tote's opinion, and never for a drink;
//   - a house rule is a quiet note; an allergy keeps its plain safety wording; nothing ever says a product is free of anything.
// Runs the Worker's real code. No network and no model.
//
//   node --no-warnings evals/rules.mjs
import { loadAgent } from './load.mjs';

const results = [];
const check = (name, pass, detail) => results.push([!!pass, name, pass ? '' : JSON.stringify(detail ?? '').slice(0, 400)]);
const tryIt = async (name, fn) => { try { await fn(); } catch (e) { check(name + ' (crashed)', false, String((e && e.stack) || e).slice(0, 400)); } };

let A;
try { A = await loadAgent(['labelCheck', 'cleanProfile', 'describe', 'restricted', 'productFrom', 'HOUSE']); } catch (e) { A = await loadAgent(['labelCheck', 'cleanProfile', 'describe', 'restricted']); }

const home = (o = {}) => A.cleanProfile({ personas: ['couple'], adults: 2, kids: 0, ...o });
const prod = (ingredients, o = {}) => ({ name: 'Test product', brand: '', size: '', text: 'Test product', allergens: [], traces: [], labels: [], ingredients: String(ingredients).toLowerCase(), per100: null, drink: false, ...o });
const look = (ingredients, rules, o = {}) => A.labelCheck(prod(ingredients, o.prod), home({ house: rules, ...o.home }));
const text = (r) => (r ? r.text : '');
const FREE = /\b(free (of|from)|does not contain|contains no|no (palm oil|msg|preservatives|artificial)|is safe|safe for)\b/i;

// ---------- the profile holds house rules ----------
await tryIt('profile', async () => {
  const p = home({ house: ['No palm oil', 'Less sugar', 'something made up', '<b>No MSG</b>'], members: [{ name: 'Leo', kind: 'child', house: ['Less sugar', 'nonsense'] }] });
  check('a home can keep house rules', Array.isArray(p.house) && p.house.includes('No palm oil') && p.house.includes('Less sugar'), p.house);
  check('one child can have a house rule', p.members[0] && Array.isArray(p.members[0].house) && p.members[0].house.join() === 'Less sugar', p.members[0]);
  check('opposite: only the rules on the menu are kept, never typed text or markup', Array.isArray(p.house) && p.house.length === 2, p.house);
  check('opposite: a home with no house rules has an empty list, not a missing one', Array.isArray(home().house) && home().house.length === 0, home().house);
  check('the menu has the without rules and the less-of rules', A.HOUSE && ['No palm oil', 'No MSG', 'No artificial colours', 'No artificial sweeteners', 'No hydrogenated oils', 'Fewer preservatives', 'Less sugar', 'Less salt', 'Less fat', 'Less saturated fat'].every((k) => Object.prototype.hasOwnProperty.call(A.HOUSE, k)), A.HOUSE && Object.keys(A.HOUSE));
  const d = A.describe(p);
  check('dinner ideas are told the house rules, as preferences', /house rules/i.test(d) && /palm oil/i.test(d) && /Leo/.test(d), d.slice(0, 600));
  check('opposite: house rules are never described as an allergy', !/allerg[^.]*palm oil/i.test(d), d.slice(0, 600));
  check('opposite: a house rule alone does not switch on allergy warnings by name', A.restricted(home({ house: ['No palm oil'] })) === false);
});

// ---------- hidden names ----------
await tryIt('without', async () => {
  const has = (r, re) => r && r.status === 'note' && re.test(r.text);
  const quiet = (r) => !r || r.status === 'ok';
  check('palm oil by its own name', has(look('wheat flour, palm oil, sugar', ['No palm oil']), /palm oil/i), look('wheat flour, palm oil, sugar', ['No palm oil']));
  check('palm oil as palmolein, and the reply says which name was on the pack', has(look('refined wheat flour, edible vegetable oil (palmolein), salt', ['No palm oil']), /palmolein/i), look('refined wheat flour, edible vegetable oil (palmolein), salt', ['No palm oil']));
  check('palm oil inside a list of vegetable oils', has(look('potatoes, vegetable oils (sunflower, palm), salt', ['No palm oil']), /palm/i), look('potatoes, vegetable oils (sunflower, palm), salt', ['No palm oil']));
  check('palm kernel fat', has(look('sugar, palm kernel fat, cocoa', ['No palm oil']), /palm/i));
  check('opposite: palm sugar is not palm oil', quiet(look('coconut milk, palm sugar, salt', ['No palm oil'])), look('coconut milk, palm sugar, salt', ['No palm oil']));
  check('opposite: hearts of palm are not palm oil', quiet(look('hearts of palm, water, salt', ['No palm oil'])), look('hearts of palm, water, salt', ['No palm oil']));
  check('opposite: a named oil that is not palm says nothing', quiet(look('potatoes, vegetable oil (sunflower), salt', ['No palm oil'])), look('potatoes, vegetable oil (sunflower), salt', ['No palm oil']));
  const vague = look('wheat flour, vegetable oil, sugar', ['No palm oil']);
  check('an unnamed vegetable oil is a guess, said as a guess', vague && vague.status === 'note' && /my guess/i.test(vague.text) && /check the label/i.test(vague.text), vague);
  check('opposite: a guess never says the product lists palm oil', vague && !/lists palm oil/i.test(vague.text), vague);

  check('MSG by its full name', has(look('salt, monosodium glutamate, spices', ['No MSG']), /msg/i));
  check('MSG as flavour enhancer 621', has(look('noodles, salt, flavour enhancer (621), spices', ['No MSG']), /621/), look('noodles, salt, flavour enhancer (621), spices', ['No MSG']));
  check('MSG as E621', has(look('salt, e621, sugar', ['No MSG']), /621/i));
  check('opposite: another flavour enhancer is not MSG', quiet(look('salt, flavour enhancers (627, 631), sugar', ['No MSG'])), look('salt, flavour enhancers (627, 631), sugar', ['No MSG']));
  check('opposite: a pack that says no added MSG is not flagged for MSG', quiet(look('potatoes, oil (sunflower), salt. no added msg.', ['No MSG'])), look('potatoes, oil (sunflower), salt. no added msg.', ['No MSG']));

  check('an artificial colour by name', has(look('sugar, tartrazine, flavouring', ['No artificial colours']), /tartrazine/i));
  check('an artificial colour by number', has(look('sugar, colours (102, 110), flavouring', ['No artificial colours']), /102/), look('sugar, colours (102, 110), flavouring', ['No artificial colours']));
  check('an American colour name', has(look('sugar, corn syrup, red 40, yellow 5', ['No artificial colours']), /red 40|yellow 5/i));
  check('opposite: a natural colour is not flagged', quiet(look('sugar, colour (caramel 150a), beta carotene', ['No artificial colours'])), look('sugar, colour (caramel 150a), beta carotene', ['No artificial colours']));
  check('opposite: "no artificial colours or preservatives" on the pack is not a flag', quiet(look('milk, sugar, cocoa. contains no artificial colours or preservatives.', ['No artificial colours', 'Fewer preservatives'])), look('milk, sugar, cocoa. contains no artificial colours or preservatives.', ['No artificial colours', 'Fewer preservatives']));

  check('an artificial sweetener by name', has(look('water, sucralose, flavouring', ['No artificial sweeteners']), /sucralose/i));
  check('an artificial sweetener by number', has(look('water, sweetener (ins 951), flavouring', ['No artificial sweeteners']), /951/));
  check('opposite: sugar is not an artificial sweetener', quiet(look('water, sugar, honey', ['No artificial sweeteners'])));
  check('hydrogenated fat', has(look('flour, partially hydrogenated vegetable oil, sugar', ['No hydrogenated oils']), /hydrogenated/i));
  check('hydrogenated fat as vanaspati', has(look('maida, vanaspati, sugar', ['No hydrogenated oils']), /vanaspati/i));
  check('a preservative by name', has(look('tomato, sugar, sodium benzoate', ['Fewer preservatives']), /sodium benzoate/i));
  check('a preservative by number', has(look('tomato, sugar, preservative (ins 211)', ['Fewer preservatives']), /211|preservative/i));
  check('opposite: a rule the home did not choose is not checked', quiet(look('wheat flour, palm oil, monosodium glutamate', ['No artificial colours'])), look('wheat flour, palm oil, monosodium glutamate', ['No artificial colours']));
  check('opposite: with no house rules a product with all of it says nothing', A.labelCheck(prod('palm oil, monosodium glutamate, tartrazine, aspartame'), home()) === null);
});

// ---------- "high" is a published line ----------
await tryIt('less of', async () => {
  const n = (per100, rules, drink) => A.labelCheck(prod('wheat flour, sugar', { per100, drink: !!drink }), home({ house: rules }));
  const sweet = n({ sugar: 31, salt: 0.4, fat: 12, sat: 3 }, ['Less sugar']);
  check('a food above 22.5 g of sugar per 100 g is high in sugar', sweet && sweet.status === 'note' && /high in sugar/i.test(sweet.text), sweet);
  check('the reply gives the number and whose line it is', sweet && /31 ?g/.test(sweet.text) && /UK/.test(sweet.text), sweet);
  check('opposite: 22 g of sugar is not high', (n({ sugar: 22, salt: 0.4, fat: 12, sat: 3 }, ['Less sugar']) || {}).status === 'ok', n({ sugar: 22, salt: 0.4, fat: 12, sat: 3 }, ['Less sugar']));
  check('salt above 1.5 g per 100 g is high in salt', /high in salt/i.test(text(n({ sugar: 2, salt: 2.1, fat: 3, sat: 1 }, ['Less salt']))));
  check('opposite: 1.5 g of salt exactly is not high', (n({ sugar: 2, salt: 1.5, fat: 3, sat: 1 }, ['Less salt']) || {}).status === 'ok');
  check('fat above 17.5 g per 100 g is high in fat', /high in fat/i.test(text(n({ sugar: 2, salt: 1, fat: 33, sat: 4 }, ['Less fat']))));
  check('saturated fat above 5 g per 100 g is high in saturated fat', /high in saturated fat/i.test(text(n({ sugar: 2, salt: 1, fat: 12, sat: 9 }, ['Less saturated fat']))));
  check('opposite: only the chosen measure is mentioned', !/salt|fat/i.test(text(n({ sugar: 31, salt: 3, fat: 30, sat: 9 }, ['Less sugar']))), text(n({ sugar: 31, salt: 3, fat: 30, sat: 9 }, ['Less sugar'])));
  const drink = n({ sugar: 31, salt: 0, fat: 0, sat: 0 }, ['Less sugar'], true);
  check('opposite: the food line is never used on a drink', !drink || !/high in sugar/i.test(drink.text), drink);
  const none = A.labelCheck(prod('wheat flour, sugar', { per100: null }), home({ house: ['Less sugar'] }));
  check('opposite: with no nutrition figures Tote says it could not check, and does not call it fine', none && !/high in/i.test(none.text) && /could not/i.test(none.text), none);
  const part = n({ salt: 0.4 }, ['Less sugar']);
  check('opposite: a missing sugar figure is not read as zero', part && !/high in/i.test(part.text) && /could not/i.test(part.text), part);
});

// ---------- whose rule, and how it is said ----------
await tryIt('wording', async () => {
  const kid = A.labelCheck(prod('wheat flour, sugar', { per100: { sugar: 40, salt: 0.2, fat: 5, sat: 1 } }), home({ members: [{ name: 'Leo', kind: 'child', house: ['Less sugar'] }] }));
  check('a rule for one child names the child', kid && /Leo/.test(kid.text) && /high in sugar/i.test(kid.text), kid);
  const note = look('wheat flour, palm oil', ['No palm oil']);
  check('a house rule is a quiet note, not a warning', note && note.status === 'note' && !/before anyone eats|warning|danger|unsafe/i.test(note.text), note);
  check('a house rule note leaves no allergy-style flag on the item', note && note.warn === '', note);
  const both = A.labelCheck(prod('wheat flour, palm oil, peanuts', { allergens: ['en:peanuts'] }), home({ allergies: ['Peanuts'], house: ['No palm oil'] }));
  check('an allergy still gets its plain safety wording', both && both.status === 'warn' && /contains peanuts/i.test(both.text) && /check the pack/i.test(both.text), both);
  check('and the house rule is added after it, not mixed into it', both && /house rules?/i.test(both.text) && both.text.indexOf('peanuts') < both.text.toLowerCase().indexOf('palm oil'), both);
  check('opposite: the allergy flag on the item does not carry the house rule', both && /peanut/i.test(both.warn) && !/palm/i.test(both.warn), both && both.warn);
  const alone = A.labelCheck(prod('wheat flour, palm oil, peanuts', { allergens: ['en:peanuts'] }), home({ allergies: ['Peanuts'] }));
  check('opposite: an allergy home with no house rules reads exactly as before', alone && alone.status === 'warn' && !/house rule/i.test(alone.text), alone);
  for (const r of [note, both, kid, look('water, sugar', ['No palm oil', 'No MSG']), look('', ['No palm oil'])]) check('never says a product is free of anything: ' + String(r && r.status), r && !FREE.test(r.text), r);
  const blank = look('', ['No palm oil']);
  check('a product with no ingredient list is unknown, and says so', blank && blank.status === 'unknown' && /could not check/i.test(blank.text), blank);
  check('opposite: unknown does not talk about allergies in a home that has none', blank && !/allerg/i.test(blank.text), blank);
  const typed = A.labelCheck(prod('flour, palmolein, flavour enhancer (621)'), home({ avoid: ['Palm oil', 'MSG'] }));
  check('palm oil typed under "nobody eats" gets the same hidden names', typed && /palmolein/i.test(typed.text) && /621/.test(typed.text), typed);
  const mush = A.labelCheck(prod('rice, mushrooms, salt'), home({ avoid: ['Mushrooms'] }));
  check('opposite: an ordinary "nobody eats" food still reads as before', mush && mush.status === 'warn' && /has mushrooms/i.test(mush.text), mush);
});

// ---------- the product's own numbers ----------
await tryIt('product', async () => {
  check('a looked-up product keeps its nutrition figures', typeof A.productFrom === 'function');
  if (typeof A.productFrom !== 'function') return;
  const d = (o) => ({ status: 1, product: { product_name: 'Cream Biscuits', brands: 'Acme', quantity: '120 g', ingredients_text: 'Wheat flour, palmolein, sugar', ...o } });
  const p = A.productFrom(d({ nutriments: { sugars_100g: 31.5, salt_100g: 0.61, fat_100g: 21, 'saturated-fat_100g': 10.2 } }));
  check('sugar, salt, fat and saturated fat per 100 g are read', p && p.per100 && p.per100.sugar === 31.5 && p.per100.salt === 0.61 && p.per100.fat === 21 && p.per100.sat === 10.2, p && p.per100);
  const s = A.productFrom(d({ nutriments: { sodium_100g: 0.8 } }));
  check('salt is worked out from sodium when only sodium is given', s && s.per100 && Math.abs(s.per100.salt - 2) < 0.01, s && s.per100);
  check('opposite: no figures means none, not zeros', A.productFrom(d({})).per100 === null, A.productFrom(d({})).per100);
  check('opposite: a figure that is not a number is left out', A.productFrom(d({ nutriments: { sugars_100g: 'lots', salt_100g: 1 } })).per100.sugar === undefined);
  check('opposite: an impossible figure is left out', A.productFrom(d({ nutriments: { sugars_100g: 400, salt_100g: -1 } })).per100 === null, A.productFrom(d({ nutriments: { sugars_100g: 400, salt_100g: -1 } })).per100);
  check('a drink is known as a drink', A.productFrom(d({ categories_tags: ['en:beverages', 'en:sodas'] })).drink === true);
  check('opposite: a biscuit is not a drink', A.productFrom(d({ categories_tags: ['en:snacks', 'en:biscuits'] })).drink === false);
  check('opposite: a product the database does not know is still nothing', A.productFrom({ status: 0 }) === null && A.productFrom(null) === null);
});

// ---------- first sight: labels written after the code was finished; scored, never tuned on ----------
if (process.argv.includes('--heldout')) {
  const fs = await import('fs');
  const set = JSON.parse(fs.readFileSync(new URL('./rules-heldout.json', import.meta.url), 'utf8')).lines;
  const WITHOUT = ['No palm oil', 'No MSG', 'No artificial colours', 'No artificial sweeteners', 'No hydrogenated oils', 'Fewer preservatives'];
  let right = 0, wrongFlags = 0, missed = 0;
  for (const l of set) {
    const got = [], guessed = [];
    for (const k of WITHOUT) { const r = A.labelCheck(prod(l.label), home({ house: [k] })); if (r && r.status === 'note') (/my guess/i.test(r.text) ? guessed : got).push(k); }
    const same = (a, b) => a.slice().sort().join('|') === (b || []).slice().sort().join('|');
    const ok = same(got, l.lists) && same(guessed, l.guess);
    wrongFlags += got.filter((k) => !l.lists.includes(k)).length; missed += l.lists.filter((k) => !got.includes(k)).length;
    if (ok) right++; else console.log('  miss  ' + l.label.slice(0, 70) + '  wanted ' + JSON.stringify(l.lists) + (l.guess ? ' guess ' + JSON.stringify(l.guess) : '') + '  got ' + JSON.stringify(got) + (guessed.length ? ' guess ' + JSON.stringify(guessed) : ''));
  }
  console.log('house rules, first sight: ' + right + ' of ' + set.length + ' labels read exactly right; wrong flags ' + wrongFlags + ', missed ' + missed);
  process.exit(0);
}

const failed = results.filter((r) => !r[0]);
if (process.argv.includes('--json')) { console.log(JSON.stringify({ pass: results.length - failed.length, total: results.length })); process.exit(failed.length ? 1 : 0); }
for (const [ok, name, detail] of results) if (!ok || process.argv.includes('--all')) console.log((ok ? '  ok   ' : '  FAIL ') + name + (detail ? '  ' + detail : ''));
console.log('house rules ' + (results.length - failed.length) + '/' + results.length);
if (failed.length && !process.argv.includes('--baseline')) process.exit(1);
