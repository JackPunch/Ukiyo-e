import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_DATABASE_URL = "./data/ukiyo-e.sqlite";

/**
 * `apps/api/` — the base that relative DATABASE_URL values resolve against.
 * Derived from this file's location instead of `process.cwd()`, which differs
 * between `npm run dev:api` (apps/api) and the Docker image (repo root).
 */
const apiRoot = join(import.meta.dirname, "..", "..");

/** Resolves a DATABASE_URL to a filesystem path (or `:memory:` verbatim). */
export function resolveDatabasePath(
  url: string = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
): string {
  if (url === ":memory:") return url;
  // Absolute paths (e.g. /app/data/ukiyo-e.sqlite in Docker) are used as-is.
  if (url.startsWith("/")) return url;
  return join(apiRoot, url);
}

/** Opens the SQLite database, creating its directory, and applies sane PRAGMAs. */
export function createDatabase(url?: string): DatabaseSync {
  const path = resolveDatabasePath(url);
  const inMemory = path === ":memory:";
  if (!inMemory) mkdirSync(dirname(path), { recursive: true });

  const db = new DatabaseSync(path);
  // WAL is unsupported for in-memory databases; the rest are safe everywhere.
  if (!inMemory) db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA synchronous = NORMAL;");

  return db;
}
