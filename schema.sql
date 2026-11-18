CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'pcs',
  category TEXT,
  bought TEXT,
  added TEXT NOT NULL,
  store TEXT,
  expiry TEXT,
  expiry_est INTEGER NOT NULL DEFAULT 0,
  finish_days INTEGER NOT NULL DEFAULT 14,
  learned INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  area TEXT,
  essential INTEGER NOT NULL DEFAULT 0,
  low INTEGER NOT NULL DEFAULT 0,
  warn TEXT,
  note TEXT,
  owner TEXT,
  frozen INTEGER NOT NULL DEFAULT 0,
  unsure INTEGER NOT NULL DEFAULT 0,
  nolist INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS items_name_key ON items(name_key);
CREATE TABLE IF NOT EXISTS purchases (
  name_key TEXT NOT NULL,
  bought TEXT NOT NULL,
  qty REAL,
  unit TEXT,
  ran_out TEXT,
  PRIMARY KEY (name_key, bought)
);
CREATE TABLE IF NOT EXISTS log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  source TEXT NOT NULL,
  summary TEXT NOT NULL,
  who TEXT
);
CREATE TABLE IF NOT EXISTS extras (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  who TEXT,
  added TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pics (
  name_key TEXT PRIMARY KEY,
  data BLOB NOT NULL,
  made TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS spend (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT,
  day TEXT NOT NULL,
  area TEXT,
  amount REAL NOT NULL,
  currency TEXT
);
CREATE TABLE IF NOT EXISTS settings (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  kind TEXT NOT NULL,
  said TEXT,
  reply TEXT,
  route TEXT,
  detail TEXT
);
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  who TEXT,
  tz TEXT NOT NULL DEFAULT 'UTC',
  added TEXT NOT NULL,
  last_day TEXT,
  fails INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS reminders (
  name_key TEXT PRIMARY KEY,
  sent INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  muted INTEGER NOT NULL DEFAULT 0,
  answered INTEGER NOT NULL DEFAULT 1,
  last_day TEXT
);
CREATE TABLE IF NOT EXISTS turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  said TEXT,
  route TEXT,
  intent TEXT,
  did TEXT,
  reply TEXT,
  outcome TEXT,
  wanted TEXT,
  label TEXT,
  ms INTEGER
);
CREATE TABLE IF NOT EXISTS cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  said TEXT NOT NULL UNIQUE,
  expect TEXT NOT NULL,
  name TEXT
);
CREATE TABLE IF NOT EXISTS eval_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  done TEXT,
  status TEXT NOT NULL,
  why TEXT,
  trials INTEGER NOT NULL DEFAULT 1,
  version TEXT,
  models TEXT,
  day TEXT,
  cases TEXT,
  total INTEGER NOT NULL DEFAULT 0,
  next INTEGER NOT NULL DEFAULT 0,
  calls INTEGER NOT NULL DEFAULT 0,
  err TEXT,
  wait TEXT,
  summary TEXT
);
CREATE TABLE IF NOT EXISTS eval_trials (
  run INTEGER NOT NULL,
  case_id TEXT NOT NULL,
  trial INTEGER NOT NULL,
  suite TEXT NOT NULL,
  grp TEXT,
  pass INTEGER NOT NULL,
  score REAL NOT NULL,
  voice INTEGER NOT NULL DEFAULT 1,
  failed TEXT,
  said TEXT,
  did TEXT,
  reply TEXT,
  ms INTEGER,
  calls INTEGER,
  tokens INTEGER,
  cost REAL,
  verdict TEXT,
  PRIMARY KEY (run, case_id, trial)
);

-- What the model worked out about products this home bought, so code can file them next time without a model call.
CREATE TABLE IF NOT EXISTS facts (
  name_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT,
  area TEXT,
  category TEXT,
  shelf_days INTEGER,
  finish_days INTEGER,
  seen INTEGER NOT NULL DEFAULT 1,
  at TEXT NOT NULL
);

-- Messages this home has said before that the model understood and nobody undid: replayed for free, even with no AI allowance left.
CREATE TABLE IF NOT EXISTS memo (
  k TEXT PRIMARY KEY,
  actions TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  at TEXT NOT NULL,
  used TEXT,
  bad INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_key TEXT NOT NULL,
  day TEXT NOT NULL,
  unit_price REAL NOT NULL,
  unit TEXT NOT NULL,
  qty REAL,
  amount REAL NOT NULL,
  currency TEXT,
  store TEXT
);
CREATE INDEX IF NOT EXISTS prices_key ON prices(name_key, day);
CREATE TABLE IF NOT EXISTS saves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_key TEXT NOT NULL,
  name TEXT NOT NULL,
  day TEXT NOT NULL,
  left_days INTEGER,
  amount REAL,
  currency TEXT
);

-- Homes other than the owner's. A friend's home is opened by a personal code (only its hash is kept); a signed-up home is opened
-- by its account (acct). Each has its own copy of every table above, named h_<id>_<table>. The owner's home uses the tables above.
CREATE TABLE IF NOT EXISTS homes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  made TEXT NOT NULL,
  seen TEXT,
  off INTEGER NOT NULL DEFAULT 0,
  phones INTEGER NOT NULL DEFAULT 0,
  acct TEXT
);
-- Who signed up: an address and the home it opens. No passwords. epoch goes up on "sign out everywhere".
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  sub TEXT,
  home TEXT NOT NULL,
  made TEXT NOT NULL,
  seen TEXT,
  epoch INTEGER NOT NULL DEFAULT 0,
  agreed TEXT,
  via TEXT
);
-- A code on its way by email: only its hash, for ten minutes, five tries.
CREATE TABLE IF NOT EXISTS signin_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0
);
-- People who signed in when every home was taken.
CREATE TABLE IF NOT EXISTS waitlist (
  email TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  via TEXT
);
-- The owner's photo trials: what each vision model read from the same photo, as text. The photo itself is never kept.
CREATE TABLE IF NOT EXISTS photo_trials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo TEXT NOT NULL,
  at TEXT NOT NULL,
  kind TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  text TEXT,
  ms INTEGER,
  err TEXT
);
