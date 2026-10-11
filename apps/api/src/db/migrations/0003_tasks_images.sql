-- Tasks and images — field rationale lives in docs/database-design.md §4 and §5.
-- `tasks` is one image-generation job per row; `images` holds its outputs
-- (1 task -> N images). Deleting a task cascades to its image metadata; the
-- files on disk are removed by the storage layer (roadmap step 7), which SQLite
-- does not manage.

CREATE TABLE tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  status      TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','running','succeeded','failed','canceled')),
  prompt      TEXT NOT NULL,
  model       TEXT,
  params      TEXT,
  points_cost INTEGER NOT NULL DEFAULT 0 CHECK (points_cost >= 0),
  error       TEXT,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  started_at  TEXT,
  finished_at TEXT
);

-- History list: page a user's tasks, newest first.
CREATE INDEX idx_tasks_user_created ON tasks (user_id, created_at DESC);
-- Worker pickup: oldest task in a given state.
CREATE INDEX idx_tasks_status       ON tasks (status, id);

CREATE TABLE images (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL DEFAULT 0,
  file_path  TEXT NOT NULL,
  mime_type  TEXT NOT NULL,
  width      INTEGER,
  height     INTEGER,
  file_size  INTEGER,
  sha256     TEXT,
  source_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Fetch a task's images in display order.
CREATE INDEX idx_images_task ON images (task_id, position);
