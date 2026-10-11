-- Points ledger — design and rationale live in docs/database-design.md §6.
-- Append-only: every credit or debit is one row. `users.points_balance` is a
-- cache of the running total; recordPointTransaction() updates both in one
-- atomic step. `user_id` deliberately has no ON DELETE action: a user that
-- still owns ledger rows cannot be deleted, so history is never silently wiped.

CREATE TABLE point_transactions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  amount        INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason        TEXT NOT NULL
                  CHECK (reason IN ('signup_bonus','task_spend','task_refund','admin_adjust')),
  ref_type      TEXT,
  ref_id        INTEGER,
  note          TEXT,
  created_by    INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Per-user history, newest first.
CREATE INDEX idx_point_tx_user_created
  ON point_transactions (user_id, created_at DESC);
