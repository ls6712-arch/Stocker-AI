// Simulation: 100 everyday messages through Tote's real code in one made-up home, with no model at all.
// Each message is graded on the checklist (home right, reply right, safe). A message the code cannot read alone is counted as
// "needs the model" and is not graded; it is then replayed as if the day's AI allowance were used up, where it must change nothing wrong.
//   node --no-warnings evals/sim100.mjs --set=1          the set used for fixing (must stay at 100%: part of npm test with --check)
//   node --no-warnings evals/sim100.mjs --set=2          the first-sight set (never tune on it)
//   add --all to print every message, --json=FILE to save the rows; TOTE_SRC=path scores another copy of the Worker
import fs from 'fs';
import { loadAgent } from './load.mjs';
import { HOME, LIST, PROFILE } from './sim/home.mjs';
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const SET = arg('set', '1'), CHECK = process.argv.includes('--check'), ALL = process.argv.includes('--all');
const { CASES } = await import('./sim/set' + SET + '.mjs');
const T = await loadAgent(['takeTurn', 'simRows', 'simApply', 'cleanProfile', 'onVoice']);
const rx = (p) => new RegExp(p, 'iu');
async function turn(text, ai) {
  let calls = 0;
  const env = { DB: null, MEMO: new Map(), TEXT_MODEL: 'none', VISION_MODEL: 'none', AI: { run: async () => { calls++; throw new Error('NOAI'); } } };
  const rows = T.simRows(HOME), list = LIST.slice(), profile = T.cleanProfile(PROFILE);
  let r, threw = false;
  try { r = await T.takeTurn(env, { text, history: [], rows, profile, today: '2026-11-26', ai, learn: false, list: async () => list, reload: async () => rows, apply: async (out) => T.simApply(rows, list, out.actions) }); }
  catch (e) { if (String(e && e.message) !== 'NOAI') throw e; threw = true; r = { actions: [], proposal: [], reply: '' }; }
  return { rows, list, r, calls, threw };
}
function grade(x, out) {
  const { rows, list, r } = out, bad = [];
  const onList = (p) => list.some((l) => rx(p).test(l)) || rows.some((w) => rx(p).test(w.name) && (w.qty <= 0 || w.low) && !w.nolist);
  // home: every thing at home ends at the expected amount, nothing extra, the list as expected
  for (const h of HOME) { const want = x.q && h.name in x.q ? x.q[h.name] : h.qty, got = rows.find((w) => w.name === h.name); if (!got || Math.abs(got.qty - want) > 1e-9) bad.push(['home', h.name + ' ends at ' + (got ? got.qty : 'none') + ', should be ' + want]); }
  const extra = rows.filter((w) => !HOME.some((h) => h.name === w.name));
  for (const [p, lo, hi] of x.add || []) { const g = extra.find((w) => rx(p).test(w.name)); if (!g) bad.push(['home', 'nothing new at home matching ' + p]); else if (g.qty < lo || g.qty > hi) bad.push(['home', g.name + ' added as ' + g.qty]); }
  for (const w of extra) if (!(x.add || []).some(([p]) => rx(p).test(w.name))) bad.push(['home', 'unexpected new thing at home: ' + w.name]);
  for (const p of x.on || []) if (!onList(p)) bad.push(['home', p + ' is not on the list']);
  for (const p of x.off || []) if (onList(p)) bad.push(['home', p + ' is still on the list']);
  const expectList = (l) => (x.on || []).some((p) => rx(p).test(l)) || LIST.includes(l);
  for (const l of list) if (!expectList(l)) bad.push(['home', 'unexpected on the list: ' + l]);
  for (const l of LIST) if (!list.includes(l) && !(x.off || []).some((p) => rx(p).test(l))) bad.push(['home', l + ' left the list']);
  for (const w of rows) { const h = HOME.find((k) => k.name === w.name); if (h && w.low && !(x.on || []).some((p) => rx(p).test(w.name)) && !(x.q && x.q[h.name] === 0)) bad.push(['home', w.name + ' marked low']); }
  const reply = r.reply || '';
  if (!reply.trim()) bad.push(['reply', 'no reply']);
  if (x.has && !rx(x.has).test(reply)) bad.push([x.safe ? 'safe' : 'reply', 'reply lacks /' + x.has + '/']);
  if (x.not && rx(x.not).test(reply)) bad.push([x.safe ? 'safe' : 'reply', 'reply contains /' + x.not + '/']);
  if (!T.onVoice(reply)) bad.push(['reply', 'off voice']);
  return bad;
}
const out = [];
for (const [group, text, x] of CASES) {
  const a = await turn(text, true);
  const needs = a.threw || a.calls > 0;
  const row = { n: out.length + 1, group, text, needs };
  if (!needs) { row.bad = grade(x, a); row.reply = a.r.reply; row.route = a.r.route; }
  else { const b = await turn(text, false); row.reply = b.r.reply || ''; row.route = b.r.route; row.changed = JSON.stringify(b.rows.map((w) => [w.name, w.qty, w.low])) !== JSON.stringify(T.simRows(HOME).map((w) => [w.name, w.qty, w.low])) || b.list.join() !== LIST.join(); row.nocredit = grade(x, b); row.did = (b.r.actions || []).map((k) => k.action + ' ' + k.quantity + ' ' + k.name).join('; '); }
  row.did = row.did || (a.r.actions || []).map((k) => k.action + ' ' + k.quantity + ' ' + k.name).concat((a.r.proposal || []).map((k) => 'asks ' + k.action + ' ' + k.quantity + ' ' + k.name)).join('; ');
  out.push(row);
}
if (arg('json', '')) fs.writeFileSync(arg('json', ''), JSON.stringify(out, null, 1));
const code = out.filter((r) => !r.needs), ok = code.filter((r) => !r.bad.length), model = out.filter((r) => r.needs), harm = model.filter((r) => r.changed && r.nocredit.some((b) => b[0] === 'home'));
const groups = [...new Set(out.map((r) => r.group))];
console.log('Simulation, set ' + SET + ': ' + out.length + ' messages');
for (const g of groups) { const a = out.filter((r) => r.group === g), c = a.filter((r) => !r.needs); console.log('  ' + g.padEnd(24) + String(a.length).padStart(3) + ' sent, ' + String(c.length).padStart(2) + ' by code, ' + String(c.filter((r) => !r.bad.length).length).padStart(2) + ' right, ' + String(a.length - c.length).padStart(2) + ' need the model'); }
for (const r of out) {
  const tag = r.needs ? (harm.includes(r) ? 'HARM ' : 'model') : r.bad.length ? 'WRONG' : 'ok   ';
  if (!ALL && tag !== 'WRONG' && tag !== 'HARM ') continue;
  console.log(String(r.n).padStart(3) + ' ' + tag + ' ' + r.text + '\n        did: ' + (r.did || '-') + ' | reply: ' + (r.reply || '').slice(0, 220) + (r.bad && r.bad.length ? '\n        !! ' + r.bad.map((b) => b.join(': ')).join(' ; ') : '') + (harm.includes(r) ? '\n        !! with no credits: ' + r.nocredit.map((b) => b.join(': ')).join(' ; ') : ''));
}
console.log('By code: ' + code.length + ', right ' + ok.length + ' (' + (code.length ? Math.round((ok.length / code.length) * 1000) / 10 : 0) + '%). Need the model: ' + model.length + ', of which wrong with no credits: ' + harm.length + '.');
if (CHECK && (ok.length < code.length || harm.length || code.length < Number(arg('min', '0')))) { console.error('Simulation set ' + SET + ' went backwards.'); process.exit(1); }
