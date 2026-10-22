CREATE TABLE IF NOT EXISTS links (
  path TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  target TEXT NOT NULL,
  foreground TEXT NOT NULL DEFAULT '#111827',
  background TEXT NOT NULL DEFAULT '#FFFFFF',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
