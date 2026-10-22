ALTER TABLE links ADD COLUMN updated_by TEXT;

CREATE TABLE IF NOT EXISTS link_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  name TEXT NOT NULL,
  target TEXT NOT NULL,
  changed_by TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS link_history_path ON link_history (path, id);

-- Starting point for links that already exist.
INSERT INTO link_history (path, name, target, changed_by) SELECT path, name, target, 'migration' FROM links;
