import type { DatabaseSync } from "node:sqlite";

/** Reasons a ledger entry can carry, mirroring the table's CHECK constraint. */
export type PointReason =
  | "signup_bonus"
  | "task_spend"
  | "task_refund"
  | "admin_adjust";

/** A `point_transactions` row, keyed by the column names SQLite returns. */
export interface PointTransactionRow {
  id: number;
  user_id: number;
  amount: number;
  /** Balance snapshot after this entry, for reconciliation. */
  balance_after: number;
  reason: PointReason;
  ref_type: string | null;
  ref_id: number | null;
  note: string | null;
  created_by: number | null;
  created_at: string;
}

/** Input for {@link recordPointTransaction}. */
export interface RecordPointTransactionInput {
  /** Account owner; must reference an existing `users` row. */
  userId: number;
  /** Positive credits, negative debits. */
  amount: number;
  reason: PointReason;
  /** Related object, e.g. `{ refType: "task", refId: 12 }`. */
  refType?: string | null;
  refId?: number | null;
  /** Free-form note, typically set on admin adjustments. */
  note?: string | null;
  /** Acting admin; null for system entries. */
  createdBy?: number | null;
}

export interface ListPointTransactionsOptions {
  /** Only entries for this user. */
  userId?: number;
  /** Page size. Defaults to 20. */
  limit?: number;
  /** Rows to skip. Defaults to 0. */
  offset?: number;
}

export interface ListPointTransactionsResult {
  items: PointTransactionRow[];
  /** Total entries matching the filters, ignoring pagination. */
  total: number;
}

export class InsufficientPointsError extends Error {
  constructor() {
    super("Insufficient points");
    this.name = "InsufficientPointsError";
  }
}

const COLUMNS = `id, user_id, amount, balance_after, reason, ref_type, ref_id,
  note, created_by, created_at`;

/**
 * Appends a ledger entry and updates `users.points_balance` in one atomic step
 * — the balance is a cache, the ledger is the source of truth. Returns the new
 * row. Throws if the user is unknown or the change would drive the balance
 * below zero (reported as InsufficientPointsError and rolled back).
 *
 * Uses a SAVEPOINT rather than BEGIN so it nests safely inside a caller's
 * transaction, e.g. creating a task and charging points together.
 */
export function recordPointTransaction(
  db: DatabaseSync,
  input: RecordPointTransactionInput,
): PointTransactionRow {
  const savepoint = "record_point_transaction";
  db.exec(`SAVEPOINT ${savepoint}`);
  try {
    const account = db
      .prepare("SELECT points_balance FROM users WHERE id = ?")
      .get(input.userId) as unknown as { points_balance: number } | undefined;
    if (account === undefined) {
      throw new Error(`Unknown user: ${input.userId}`);
    }

    const balanceAfter = account.points_balance + input.amount;
    if (balanceAfter < 0) {
      throw new InsufficientPointsError();
    }

    db.prepare(
      `UPDATE users
          SET points_balance = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ?`,
    ).run(balanceAfter, input.userId);

    const row = db
      .prepare(
        `INSERT INTO point_transactions
           (user_id, amount, balance_after, reason, ref_type, ref_id, note, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING ${COLUMNS}`,
      )
      .get(
        input.userId,
        input.amount,
        balanceAfter,
        input.reason,
        input.refType ?? null,
        input.refId ?? null,
        input.note ?? null,
        input.createdBy ?? null,
      );

    db.exec(`RELEASE ${savepoint}`);
    return row as unknown as PointTransactionRow;
  } catch (error) {
    db.exec(`ROLLBACK TO ${savepoint}`);
    db.exec(`RELEASE ${savepoint}`);
    throw error;
  }
}

/** Looks a ledger entry up by id. */
export function findPointTransactionById(
  db: DatabaseSync,
  id: number,
): PointTransactionRow | undefined {
  const row = db
    .prepare(`SELECT ${COLUMNS} FROM point_transactions WHERE id = ?`)
    .get(id);

  return row as unknown as PointTransactionRow | undefined;
}

/** Returns one page of ledger entries, newest first, plus the total count. */
export function listPointTransactions(
  db: DatabaseSync,
  options: ListPointTransactionsOptions = {},
): ListPointTransactionsResult {
  const { userId, limit = 20, offset = 0 } = options;

  const where = userId === undefined ? "" : "WHERE user_id = ?";
  const filterArgs: number[] = userId === undefined ? [] : [userId];

  const items = db
    .prepare(
      `SELECT ${COLUMNS} FROM point_transactions ${where}
       ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .all(...filterArgs, limit, offset) as unknown as PointTransactionRow[];

  const { count } = db
    .prepare(`SELECT COUNT(*) AS count FROM point_transactions ${where}`)
    .get(...filterArgs) as unknown as { count: number };

  return { items, total: count };
}
