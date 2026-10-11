import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

const migrationsDir = join(import.meta.dirname, "migrations");

/**
 * Applies every not-yet-run `*.sql` file in `migrations/`, in filename order,
 * recording each in the `_migrations` table. Returns the files applied now.
 */
export function migrate(db: DatabaseSync): string[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db
      .prepare("SELECT name FROM _migrations")
      .all()
      .map((row) => row.name as string),
  );

  // The numeric prefix (0001_, 0002_, ...) is the apply order.
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const appliedNow: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = readFileSync(join(migrationsDir, file), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
      db.exec("COMMIT");
      appliedNow.push(file);
    } catch (error) {
      db.exec("ROLLBACK");
      throw new Error(`Migration failed: ${file}`, { cause: error });
    }
  }

  return appliedNow;
}
