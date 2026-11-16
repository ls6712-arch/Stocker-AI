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

-- Friends' homes. Each has a personal code (only its hash is kept) and its own copy of every table above, named h_<id>_<table>.
-- The owner's home uses the tables above as they are.
CREATE TABLE IF NOT EXISTS homes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  made TEXT NOT NULL,
  seen TEXT,
  off INTEGER NOT NULL DEFAULT 0,
  phones INTEGER NOT NULL DEFAULT 0
);
