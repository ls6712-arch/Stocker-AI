// Lean test: what Tote can do with no model at all, measured on the live task list.
// Every task in public/evals/cases.json runs through the real evalCase() with a model that refuses every call, so:
//  - a task that finishes without calling the model is graded exactly as the live run would grade it (nothing random is involved);
//  - a task that needs the model is counted as "needs the model" and not graded here.
// It answers two questions without spending a single model call:
//  1. With the daily AI allowance used up, does Stocker still work? (the "Without AI credits" tasks, run offline)
//  2. How many live tasks need no model call at all? (each one is a model call saved on every real message like it)
//
//   node --no-warnings evals/lean.mjs            prints the report
//   node --no-warnings evals/lean.mjs --json     prints the numbers only (used by npm run track)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const src = fs.readFileSync(path.join(ROOT, 'src/index.js'), 'utf8');
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tote-lean-')), 'agent.mjs');
fs.writeFileSync(tmp, src + '\nexport { evalCase };\n');
const T = await import(pathToFileURL(tmp).href);
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/evals/cases.json'), 'utf8'));
const asJson = process.argv.includes('--json');

const NEEDS = 'lean: this task needs the model';
const env = { AI: { run: async () => { throw new Error(NEEDS); } }, TEXT_MODEL: 'none', VISION_MODEL: 'none' };
const rows = [];
for (const c of data.cases) {
  let t = null, needs = false;
  try { t = await T.evalCase(env, { ...c, suite: c.suite || 'regression' }, data.today); } catch (e) { if (String(e && e.message) !== NEEDS) throw e; needs = true; }
  if (t && t.calls > 0) needs = true;
  rows.push({ id: c.id, group: c.group, suite: c.suite || 'regression', offline: !!c.offline, needs, pass: !needs && t.pass, score: needs ? 0 : t.score, failed: t ? t.failed : [], reply: t ? t.reply : '', did: t ? t.did : '' });
}
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const off = rows.filter((r) => r.offline), live = rows.filter((r) => !r.offline), free = live.filter((r) => !r.needs);
const out = {
  offlineTasks: off.length,
  offlinePass: pct(off.filter((r) => r.pass).length, off.length),
  offlinePartial: pct(off.reduce((s, r) => s + r.score, 0), off.length),
  liveTasks: live.length,
  noModel: pct(free.length, live.length),
  noModelPass: pct(free.filter((r) => r.pass).length, free.length),
};
if (asJson) { console.log(JSON.stringify(out)); process.exit(0); }
console.log('Without AI credits (' + off.length + ' tasks, run as if the allowance were used up)');
for (const r of off) console.log('  ' + (r.pass ? 'pass' : 'FAIL') + '  ' + r.id + (r.pass ? '' : '  ' + (r.failed || []).join('; ') + (r.reply ? '  | reply: ' + r.reply.slice(0, 140) : '')));
console.log('\nLive tasks done with no model call (' + free.length + ' of ' + live.length + ')');
for (const r of free) console.log('  ' + (r.pass ? 'pass' : 'FAIL') + '  ' + r.id + (r.pass ? '' : '  ' + (r.failed || []).join('; ') + '  | did: ' + r.did + ' | reply: ' + r.reply.slice(0, 140)));
console.log('\nOffline pass ' + out.offlinePass + '% (partial ' + out.offlinePartial + '%). Live tasks with no model call: ' + out.noModel + '%, and ' + out.noModelPass + '% of those pass.');
