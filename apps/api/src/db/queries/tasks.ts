import type { DatabaseSync } from "node:sqlite";

/** Lifecycle states of a task, mirroring the `tasks.status` CHECK constraint. */
export type TaskStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";

/** A `tasks` row, keyed by the column names SQLite returns. */
export interface TaskRow {
  id: number;
  user_id: number;
  status: TaskStatus;
  prompt: string;
  model: string | null;
  /** Raw JSON text; use {@link parseTaskParams} for the parsed object. */
  params: string | null;
  points_cost: number;
  error: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

/** Input for {@link createTask}. */
export interface NewTask {
  /** Owner; must reference an existing `users` row. */
  userId: number;
  prompt: string;
  /** Provider / model identifier, e.g. `'sd-xl'`. */
  model?: string | null;
  /** Provider parameters, serialized to JSON on the way in. */
  params?: Record<string, unknown> | null;
  /** Defaults to `0`. */
  pointsCost?: number;
}

export interface ListTasksOptions {
  /**
   * Owner to list. Required (not optional) so a history query can never
   * accidentally return every user's tasks.
   */
  userId: number;
  /** Only tasks in this state. */
  status?: TaskStatus;
  /** Page size. Defaults to 20. */
  limit?: number;
  /** Rows to skip. Defaults to 0. */
  offset?: number;
}

export interface ListTasksResult {
  items: TaskRow[];
  /** Total tasks matching the filters, ignoring pagination. */
  total: number;
}

export interface WorkerTaskRow extends TaskRow {
  providerTaskId: string;
}

const COLUMNS = `id, user_id, status, prompt, model, params, points_cost, error,
  attempts, created_at, updated_at, started_at, finished_at`;

/** Parses a row's `params` JSON text; returns null when absent or malformed. */
export function parseTaskParams(
  task: TaskRow,
): Record<string, unknown> | null {
  if (task.params === null) return null;
  try {
    return JSON.parse(task.params) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Inserts a task and returns the created row. */
export function createTask(db: DatabaseSync, input: NewTask): TaskRow {
  const row = db
    .prepare(
      `INSERT INTO tasks (user_id, prompt, model, params, points_cost)
       VALUES (?, ?, ?, ?, ?)
       RETURNING ${COLUMNS}`,
    )
    .get(
      input.userId,
      input.prompt,
      input.model ?? null,
      input.params == null ? null : JSON.stringify(input.params),
      input.pointsCost ?? 0,
    );

  return row as unknown as TaskRow;
}

/** Looks a task up by id. */
export function findTaskById(
  db: DatabaseSync,
  id: number,
): TaskRow | undefined {
  const row = db.prepare(`SELECT ${COLUMNS} FROM tasks WHERE id = ?`).get(id);

  return row as unknown as TaskRow | undefined;
}

/** Returns queued or running tasks that still need provider polling. */
export function listWorkerTasks(db: DatabaseSync): WorkerTaskRow[] {
  const rows = db
    .prepare(
      `SELECT ${COLUMNS} FROM tasks
       WHERE status IN ('queued', 'running')
       ORDER BY id ASC`,
    )
    .all() as unknown as TaskRow[];

  return rows.flatMap((task) => {
    const params = parseTaskParams(task);
    const providerTaskId = params?.providerTaskId;
    return typeof providerTaskId === "string"
      ? [{ ...task, providerTaskId }]
      : [];
  });
}

/** Updates a task lifecycle state and its worker metadata. */
export function updateTaskStatus(
  db: DatabaseSync,
  id: number,
  status: TaskStatus,
  options: { error?: string | null; started?: boolean } = {},
): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE tasks
     SET status = ?,
         error = ?,
         attempts = attempts + 1,
         updated_at = ?,
         started_at = CASE WHEN ? = 1 AND started_at IS NULL THEN ? ELSE started_at END,
         finished_at = CASE WHEN ? IN ('succeeded', 'failed') THEN ? ELSE finished_at END
     WHERE id = ?`,
  ).run(
    status,
    options.error ?? null,
    now,
    options.started ? 1 : 0,
    now,
    status,
    now,
    id,
  );
}

/**
 * Returns one page of a user's tasks, newest first, plus the total count.
 * `userId` is required; `status` is an optional extra filter. Both are applied
 * to the count as well as the page.
 */
export function listTasks(
  db: DatabaseSync,
  options: ListTasksOptions,
): ListTasksResult {
  const { userId, status, limit = 20, offset = 0 } = options;

  const filters: string[] = ["user_id = ?"];
  const args: (number | string)[] = [userId];
  if (status !== undefined) {
    filters.push("status = ?");
    args.push(status);
  }
  const where = `WHERE ${filters.join(" AND ")}`;

  const items = db
    .prepare(
      `SELECT ${COLUMNS} FROM tasks ${where}
       ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .all(...args, limit, offset) as unknown as TaskRow[];

  const { count } = db
    .prepare(`SELECT COUNT(*) AS count FROM tasks ${where}`)
    .get(...args) as unknown as { count: number };

  return { items, total: count };
}

/**
 * Deletes a task and, via `ON DELETE CASCADE`, its image rows. Returns whether
 * a row was deleted. Files on disk are removed separately by the storage layer
 * (roadmap step 7); SQLite does not manage them.
 */
export function deleteTask(db: DatabaseSync, id: number): boolean {
  const { changes } = db.prepare("DELETE FROM tasks WHERE id = ?").run(id);

  return changes > 0;
}
