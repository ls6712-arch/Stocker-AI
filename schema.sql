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
  source TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS items_name_key ON items(name_key);
CREATE TABLE IF NOT EXISTS purchases (
  name_key TEXT NOT NULL,
  bought TEXT NOT NULL,
  PRIMARY KEY (name_key, bought)
);
CREATE TABLE IF NOT EXISTS log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  source TEXT NOT NULL,
  summary TEXT NOT NULL
);
