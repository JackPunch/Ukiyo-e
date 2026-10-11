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
}

export interface ListUsersResult {
  items: UserRow[];
  /** Total users ignoring pagination, for building paging controls. */
  total: number;
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

/** Returns one page of users ordered by id, plus the total user count. */
export function listUsers(
  db: DatabaseSync,
  options: ListUsersOptions = {},
): ListUsersResult {
  const { limit = 20, offset = 0 } = options;

  const items = db
    .prepare(`SELECT ${COLUMNS} FROM users ORDER BY id LIMIT ? OFFSET ?`)
    .all(limit, offset) as unknown as UserRow[];

  const { count } = db
    .prepare("SELECT COUNT(*) AS count FROM users")
    .get() as unknown as { count: number };

  return { items, total: count };
}
