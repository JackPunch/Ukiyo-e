-- Users table — see docs/database-design.md §3 for field rationale.
-- Also removes the placeholder `projects` table from 0001, which only existed
-- to smoke-test the migration pipeline.

DROP TABLE IF EXISTS projects;

CREATE TABLE users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  email          TEXT NOT NULL UNIQUE,
  display_name   TEXT,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'user'
                   CHECK (role IN ('user', 'admin')),
  points_balance INTEGER NOT NULL DEFAULT 0
                   CHECK (points_balance >= 0),
  last_login_at  TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
