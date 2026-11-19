// Separate homes: each friend gets a personal code, and each code opens its own private home.
// Every check has its opposite: what a code must open, and what it must never reach.
// Runs the Worker's real code and real SQL against an in-memory database. No network and no model calls:
// the model stand-in refuses every call, and the phone push service is a stand-in that only records what was sent.
//
//   node --no-warnings evals/homes.mjs
import fs from 'fs';
import path from 'path';
import { webcrypto } from 'node:crypto';
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
// The checklist: every chat turn from every home, answered four ways by the owner, with Claude's first pass beside it.
//   node --no-warnings evals/checks.mjs
const results = [];
const check = (name, pass, detail) => results.push([!!pass, name, pass ? '' : JSON.stringify(detail ?? '').slice(0, 400)]);
const DAY = new Date().toISOString().slice(0, 10);
const A = await loadAgent(['scopeSql']);

const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
const env = { APP_PIN: 'test1234', TEST_DATES: 'on', DB: d1(db), AI: { run: async () => { throw new Error('4006: you have used up your daily free allocation of 10,000 neurons'); } }, TEXT_MODEL: 'none', ASSETS: { fetch: async () => new Response('') } };
const person = (ip) => {
  const p = { cookie: '' };
  p.call = async (method, pth, body) => {
    const res = await A.default.fetch(new Request('https://stocker.test' + pth, { method, headers: { cookie: p.cookie, 'content-type': 'application/json', origin: 'https://stocker.test', 'x-today': DAY, 'cf-connecting-ip': ip }, body: body ? JSON.stringify(body) : undefined }), env);
    return { status: res.status, data: await res.json().catch(() => ({})), res };
  };
  p.open = async (code, name) => { const r = await p.call('POST', '/api/login', { pin: code, name }); if (r.status === 200) p.cookie = r.res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; '); return r; };
  return p;
};
const owner = person('10.0.0.1'), asha = person('10.0.0.2'), stranger = person('10.0.0.9');
await owner.open('test1234', 'Sush');
const a = (await owner.call('POST', '/api/homes', { name: 'Asha' })).data;
await asha.open(a.code, 'Asha');
await owner.call('POST', '/api/chat', { text: 'add milk to the list' });
await asha.call('POST', '/api/chat', { text: 'bought 6 eggs' });
await asha.call('POST', '/api/chat', { text: 'do we have rice?' });

// ---- who can see it ----
const list = await owner.call('GET', '/api/checks');
check('the owner sees every chat message from every home, newest first', list.status === 200 && list.data.turns.length === 3 && list.data.turns.some((t) => t.from === 'Asha') && list.data.turns.some((t) => t.from === 'You'), list.data);
check('each message comes with what Tote did and what it said', list.data.turns.every((t) => typeof t.said === 'string' && 'did' in t && typeof t.reply === 'string'), list.data.turns);
check('the four checks are sent with their meaning', list.data.checklist && Object.keys(list.data.checklist).join() === 'understood,home,reply,safe', list.data.checklist);
check('opposite: a friend cannot see the checklist', (await asha.call('GET', '/api/checks')).status === 403);
check('opposite: nobody signed in cannot see it', (await stranger.call('GET', '/api/checks')).status === 401);
check('opposite: a friend cannot mark anything', (await asha.call('POST', '/api/checks', { home: '', turn: 1, answers: { understood: 'yes', home: 'yes', reply: 'yes', safe: 'na' } })).status === 403);
let refused = false; try { A.scopeSql('SELECT * FROM checks', a.id); } catch (e) { refused = true; }
check('opposite: a friend\'s database handle can never reach the checks table', refused);

// ---- marking ----
const eggs = list.data.turns.find((t) => /eggs/.test(t.said)), rice = list.data.turns.find((t) => /rice/.test(t.said)), milk = list.data.turns.find((t) => /milk/.test(t.said));
const r1 = await owner.call('POST', '/api/checks', { home: eggs.home, turn: eggs.id, answers: { understood: 'yes', home: 'yes', reply: 'yes', safe: 'na' } });
check('all yes (safety not needed) is a right answer', r1.status === 200 && r1.data.mark.right === true, r1.data);
const r2 = await owner.call('POST', '/api/checks', { home: rice.home, turn: rice.id, answers: { understood: 'yes', home: 'no', reply: 'yes', safe: 'na' }, should: 'nothing', note: 'a question, it changed the home' });
check('one "no" is a wrong answer, with the note kept', r2.data.mark.right === false && r2.data.mark.note === 'a question, it changed the home', r2.data);
check('"should have changed nothing" becomes a test', db.prepare('SELECT expect FROM cases WHERE said = ?').get('do we have rice?')?.expect === 'nothing');
const r3 = await owner.call('POST', '/api/checks', { home: '', turn: milk.id, answers: { understood: 'yes', home: 'yes', reply: 'yes', safe: 'na' }, should: 'update' });
check('opposite: a right answer never makes a test, even if a "should" is sent', r3.data.mark.should === '' && !db.prepare('SELECT 1 FROM cases WHERE said = ?').get('add milk to the list'));
check('opposite: a missing answer is refused', (await owner.call('POST', '/api/checks', { home: '', turn: milk.id, answers: { understood: 'yes', home: 'yes' } })).status === 400);
check('opposite: "not needed" is only for safety', (await owner.call('POST', '/api/checks', { home: '', turn: milk.id, answers: { understood: 'na', home: 'yes', reply: 'yes', safe: 'na' } })).status === 400);
check('opposite: a turn that does not exist is refused', (await owner.call('POST', '/api/checks', { home: '', turn: 999, answers: { understood: 'yes', home: 'yes', reply: 'yes', safe: 'na' } })).status === 404);
check('opposite: a home that does not exist is refused', (await owner.call('POST', '/api/checks', { home: 'zzzzzzzz', turn: 1, answers: { understood: 'yes', home: 'yes', reply: 'yes', safe: 'na' } })).status === 400);
const xss = await owner.call('POST', '/api/checks', { home: eggs.home, turn: eggs.id, answers: { understood: 'yes', home: 'yes', reply: 'yes', safe: 'na' }, note: '<img src=x onerror=alert(1)> call 555-123-4567' });
check('a note is kept as plain text with private details removed', !/[<>]/.test(xss.data.mark.note) && !/555-123-4567/.test(xss.data.mark.note), xss.data.mark);

// ---- Claude's first pass, and the numbers ----
db.prepare("INSERT INTO checks (home, turn, at, guess, guessed) VALUES ('', ?, ?, ?, ?) ON CONFLICT(home, turn) DO UPDATE SET guess = excluded.guess, guessed = excluded.guessed").run(milk.id, milk.at, JSON.stringify({ understood: 'yes', home: 'no', reply: 'yes', safe: 'na', right: false, note: 'list line missing', should: 'list' }), DAY);
db.prepare("INSERT INTO checks (home, turn, at, guess, guessed) VALUES (?, ?, ?, ?, ?) ON CONFLICT(home, turn) DO UPDATE SET guess = excluded.guess, guessed = excluded.guessed").run(rice.home, rice.id, rice.at, JSON.stringify({ understood: 'yes', home: 'no', reply: 'yes', safe: 'na', right: false }), DAY);
const after = await owner.call('GET', '/api/checks'), s = after.data.summary;
const m = after.data.turns.find((t) => t.id === milk.id && t.home === '');
check('Claude\'s guess sits beside the owner\'s answer and does not replace it', m.guess && m.guess.right === false && m.mark && m.mark.right === true, m);
check('fully right counts only the owner\'s answers: 2 of 3', s.marked === 3 && s.right === 2, s);
check('agreement is counted only where both answered: 1 of 2 (rice agreed, milk did not)', s.compared === 2 && s.agree === 1, s);
check('per home: Asha 1 of 2 right, You 1 of 1', s.perHome.find((p) => p.from === 'Asha')?.right === 1 && s.perHome.find((p) => p.from === 'Asha')?.marked === 2 && s.perHome.find((p) => p.from === 'You')?.right === 1, s.perHome);
check('the most common failure is named (Home right)', s.fails.home === 1 && !s.fails.reply, s.fails);
await owner.call('DELETE', '/api/checks?home=&turn=' + milk.id);
const cleared = (await owner.call('GET', '/api/checks')).data;
check('clearing an answer leaves Claude\'s guess, and the message is to check again', cleared.summary.toDo === 1 && cleared.turns.find((t) => t.id === milk.id && t.home === '').guess, cleared.summary);

const failed = results.filter((r) => !r[0]);
for (const [ok, name, detail] of results) console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + name + (ok ? '' : '\n        ' + detail));
console.log('\n' + (results.length - failed.length) + ' of ' + results.length + ' checklist checks pass');
process.exit(failed.length ? 1 : 0);
