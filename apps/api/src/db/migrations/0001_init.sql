-- Initial schema. `projects` is a deliberately minimal starting point to
-- prove the migration pipeline end to end; replace or extend it once the real
-- domain model is settled.

CREATE TABLE IF NOT EXISTS projects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
