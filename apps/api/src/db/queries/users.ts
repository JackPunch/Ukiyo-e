import type { DatabaseSync } from "node:sqlite";

/** Roles a user can hold. Admins are simply `users` rows with role `admin`. */
export type UserRole = "user" | "admin";

/** A `users` row, keyed by the column names SQLite returns. */
export interface UserRow {
  id: number;
  email: string;
  display_name: string | null;
  password_hash: string;
  role: UserRole;
  points_balance: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Input for {@link createUser}. */
export interface NewUser {
  email: string;
  /** Already-hashed password — never a plaintext password. */
  passwordHash: string;
  displayName?: string | null;
  /** Defaults to `'user'`. */
  role?: UserRole;
  /** Defaults to `0`. */
  pointsBalance?: number;
}

/** Input for {@link registerUser}; role and balance are intentionally absent. */
export interface RegisterUserInput {
  email: string;
  /** Already-hashed password — never a plaintext password. */
  passwordHash: string;
  displayName?: string | null;
}

export interface ListUsersOptions {
  /** Page size. Defaults to 20. */
  limit?: number;
  /** Rows to skip. Defaults to 0. */
  offset?: number;
  /**
   * Case-insensitive (ASCII) substring filter on email or display name. An
   * empty/whitespace value is ignored, so it never filters everything out.
   */
  search?: string;
}

export interface ListUsersResult {
  items: UserRow[];
  /** Total users matching the filter and ignoring pagination, for paging controls. */
  total: number;
}

/**
 * Escapes LIKE metacharacters so a user-supplied term matches literally: without
 * this, searching `%` would match every row and `_` would match any character.
 * The matching `ESCAPE '\'` clause lives in {@link listUsers}.
 */
function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

const COLUMNS = `id, email, display_name, password_hash, role, points_balance,
  last_login_at, created_at, updated_at`;

/**
 * Emails are stored lowercase so the UNIQUE index also catches case variants
 * (see docs/database-design.md §3.3). Applied here so no caller can forget it.
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Inserts a user and returns the created row. Lets the caller set `role` and
 * starting balance, so this is the management / system entry point — public
 * sign-up must go through {@link registerUser} instead. Throws if the email is
 * already taken (SQLite UNIQUE violation).
 */
export function createUser(db: DatabaseSync, input: NewUser): UserRow {
  const row = db
    .prepare(
      `INSERT INTO users (email, password_hash, display_name, role, points_balance)
       VALUES (?, ?, ?, ?, ?)
       RETURNING ${COLUMNS}`,
    )
    .get(
      normalizeEmail(input.email),
      input.passwordHash,
      input.displayName ?? null,
      input.role ?? "user",
      input.pointsBalance ?? 0,
    );

  return row as unknown as UserRow;
}

/**
 * Self-service sign-up: always creates a `'user'` with a zero balance. Role and
 * starting balance are fixed here, so a public registration endpoint cannot be
 * tricked into minting an admin or seeding points.
 */
export function registerUser(
  db: DatabaseSync,
  input: RegisterUserInput,
): UserRow {
  return createUser(db, {
    email: input.email,
    passwordHash: input.passwordHash,
    displayName: input.displayName,
    role: "user",
    pointsBalance: 0,
  });
}

/** Looks a user up by email; matching is case- and whitespace-insensitive. */
export function findUserByEmail(
  db: DatabaseSync,
  email: string,
): UserRow | undefined {
  const row = db
    .prepare(`SELECT ${COLUMNS} FROM users WHERE email = ?`)
    .get(normalizeEmail(email));

  return row as unknown as UserRow | undefined;
}

/** Looks a user up by id. */
export function findUserById(
  db: DatabaseSync,
  id: number,
): UserRow | undefined {
  const row = db.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).get(id);

  return row as unknown as UserRow | undefined;
}

/** Returns one page of users ordered by id, plus the total match count. */
export function listUsers(
  db: DatabaseSync,
  options: ListUsersOptions = {},
): ListUsersResult {
  const { limit = 20, offset = 0 } = options;
  const search = options.search?.trim();

  const where = search
    ? "WHERE (email LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\')"
    : "";
  const filterParams = search
    ? [`%${escapeLikePattern(search)}%`, `%${escapeLikePattern(search)}%`]
    : [];

  const items = db
    .prepare(
      `SELECT ${COLUMNS} FROM users ${where} ORDER BY id LIMIT ? OFFSET ?`,
    )
    .all(...filterParams, limit, offset) as unknown as UserRow[];

  const { count } = db
    .prepare(`SELECT COUNT(*) AS count FROM users ${where}`)
    .get(...filterParams) as unknown as { count: number };

  return { items, total: count };
}

/**
 * Stamps a successful login and returns the updated row (or `undefined` if the
 * user is gone). Defaults to now so callers cannot forget the timestamp.
 */
export function updateUserLastLogin(
  db: DatabaseSync,
  id: number,
  at: string = new Date().toISOString(),
): UserRow | undefined {
  const row = db
    .prepare(
      `UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?
       RETURNING ${COLUMNS}`,
    )
    .get(at, at, id);

  return row as unknown as UserRow | undefined;
}

/**
 * Changes a user's role and returns the updated row. Used by the admin
 * bootstrap, and by the admin system's user management in step 4.
 */
export function updateUserRole(
  db: DatabaseSync,
  id: number,
  role: UserRole,
): UserRow | undefined {
  const row = db
    .prepare(
      `UPDATE users SET role = ?, updated_at = ? WHERE id = ?
       RETURNING ${COLUMNS}`,
    )
    .get(role, new Date().toISOString(), id);

  return row as unknown as UserRow | undefined;
}
