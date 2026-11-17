// Records today's offline scores, so progress is a line on the scorecard rather than a memory.
// Runs every offline suite, then appends one entry to public/evals/history.json (shown on /scorecard.html).
// Run it before committing a change to Tote: the commit then carries its own score.
//
//   npm run track            run and record
//   npm run track -- --dry   run and print, record nothing
import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { run as paceRun, loadPace } from './pace.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const HIST = path.join(ROOT, 'public/evals/history.json');
const sh = (cmd) => spawnSync(process.execPath, cmd, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } });
const count = (out, re) => { const m = out.match(re); return m ? { pass: Number(m[1]), total: Number(m[2]) } : null; };

const note = (process.argv.find((a) => a.startsWith('--note=')) || '').slice(7);
const entry = { at: new Date().toISOString(), commit: '', note, suites: {} };
try { entry.commit = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch (e) {}

const h = sh(['evals/households.mjs']);
entry.suites.households = { ok: h.status === 0 };
const c = sh(['evals/conversations.mjs', '--json']);
try {
  const rep = JSON.parse(fs.readFileSync(path.join(ROOT, 'evals/report.json'), 'utf8'));
  const pass = rep.checks.reduce((s, x) => s + x.pass, 0), total = rep.checks.reduce((s, x) => s + x.total, 0);
  entry.suites.router = { pass, total, rate: Math.round((pass / total) * 10000) / 100, worst: rep.checks.slice().sort((a, b) => a.rate - b.rate).slice(0, 3).map((x) => x.check + ' ' + Math.round(x.rate * 1000) / 10 + '%') };
} catch (e) { entry.suites.router = { ok: c.status === 0 }; }
const hc = sh(['evals/conversations.mjs', '--corpus=evals/heldout2']);
const held = (hc.stdout.match(/(\d+(?:\.\d+)?)%\s+\d+\/\d+\s+gate/g) || []).map((x) => Number(x.split('%')[0]));
if (held.length) entry.suites.routerHeldOut = { minGate: Math.min(...held), meanGate: Math.round((held.reduce((a, b) => a + b, 0) / held.length) * 10) / 10 };
entry.suites.learning = count(sh(['evals/learning.mjs']).stdout, /Learning: (\d+) \/ (\d+) checks passed/);
entry.suites.measuring = count(sh(['evals/measure.mjs']).stdout, /(\d+) of (\d+) measuring checks pass/);
// without a model: does Stocker still work with the AI allowance used up, and how many live tasks cost no model call at all
try { entry.suites.lean = JSON.parse(sh(['evals/lean.mjs', '--json']).stdout); } catch (e) {}
try { const q = JSON.parse(sh(['evals/quickpath.mjs', '--json']).stdout); entry.suites.quick = { ...q.held, both: q.both }; } catch (e) {}
try { entry.suites.delegate = JSON.parse(sh(['evals/delegate.mjs', '--json']).stdout); } catch (e) {}
// the defects from the 16 Nov 2026 acceptance test, pinned against the real code and SQL
try { entry.suites.acceptance = JSON.parse(sh(['evals/acceptance.mjs', '--json']).stdout.trim().split('\n').pop()); } catch (e) {}
// the competitor round (16 Nov 2026): instant replies, order screens, store hand-off, empty packs, freshness, price memory
try { entry.suites.compete = JSON.parse(sh(['evals/compete.mjs', '--json']).stdout.trim().split('\n').pop()); } catch (e) {}
// needing less, round 1 (16 Nov 2026): the list looks ahead to the next shop; fresh food is mentioned the day before
try { entry.suites.less = JSON.parse(sh(['evals/less.mjs', '--json']).stdout.trim().split('\n').pop()); } catch (e) {}
// house rules, round 1 (16 Nov 2026): the label check reads what a home keeps to, with the names an ingredient hides under
try { entry.suites.rules = JSON.parse(sh(['evals/rules.mjs', '--json']).stdout.trim().split('\n').pop()); } catch (e) {}
// what Tote may say about food in a home with an allergy, whatever the model writes
try { entry.suites.allergy = JSON.parse(sh(['evals/allergy.mjs', '--json']).stdout.trim().split('\n').pop()); } catch (e) {}
// guardrails that hold whatever the model writes or the person types (audit of 17 Nov 2026)
try { entry.suites.guard = JSON.parse(sh(['evals/guard.mjs', '--json']).stdout.trim().split('\n').pop()); } catch (e) {}
// separate homes: a personal code opens its own home, and no home reaches another
try { entry.suites.homes = JSON.parse(sh(['evals/homes.mjs', '--json']).stdout.trim().split('\n').pop()); } catch (e) {}
// real sign-in: Google or a code by email opens a home of one's own, up to a cap, with a share of the AI allowance each
try { entry.suites.signup = JSON.parse(sh(['evals/signup.mjs', '--json']).stdout.trim().split('\n').pop()); } catch (e) {}
const p = await paceRun(await loadPace(), 2, 1000);
entry.suites.pace = { reminderOnTime: p.reminderOnTime, reminderLate: p.reminderLate, reminderEarly: p.reminderEarly, errorDays: p.errorDays, within2: p.within2, livingAlone: p.byHome['works alone'].onTime, student: p.byHome['student alone'].onTime };

const { run: worldRun, loadAgent: worldAgent } = await import('./world.mjs');
const W = await worldAgent();
const w = await worldRun(W, 'heldout2');
entry.suites.world = { overall: w.overall, knows: w.knows, allergy: w.allergy, falseAlarm: w.falseAlarm, diet: w.diet, units: w.units, lines: w.lines, stores: w.stores };
console.log(JSON.stringify(entry, null, 1));
if (!process.argv.includes('--dry')) {
  let hist = [];
  try { hist = JSON.parse(fs.readFileSync(HIST, 'utf8')); } catch (e) {}
  hist.push(entry);
  fs.writeFileSync(HIST, JSON.stringify(hist.slice(-200), null, 1) + '\n');
  console.log('Recorded in public/evals/history.json (' + hist.length + ' entries).');
}
