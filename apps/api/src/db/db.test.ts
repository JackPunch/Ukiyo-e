import { describe, expect, it } from "vitest";
import { createDatabase, resolveDatabasePath } from "./client";
import { migrate } from "./migrate";

describe("resolveDatabasePath", () => {
  it("keeps :memory: as-is", () => {
    expect(resolveDatabasePath(":memory:")).toBe(":memory:");
  });

  it("keeps absolute paths as-is", () => {
    expect(resolveDatabasePath("/app/data/ukiyo-e.sqlite")).toBe(
      "/app/data/ukiyo-e.sqlite",
    );
  });

  it("resolves relative paths against apps/api", () => {
    expect(resolveDatabasePath("./data/ukiyo-e.sqlite")).toMatch(
      /apps\/api\/data\/ukiyo-e\.sqlite$/,
    );
  });
});

describe("migrate", () => {
  it("applies pending migrations in filename order, once", () => {
    const db = createDatabase(":memory:");
    try {
      expect(migrate(db)).toEqual(["0001_init.sql", "0002_users.sql"]);
      // Idempotent: a second run applies nothing new.
      expect(migrate(db)).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("replaces the 0001 placeholder with the users table", () => {
    const db = createDatabase(":memory:");
    try {
      migrate(db);
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => row.name as string);
      expect(tables).toContain("users");
      expect(tables).not.toContain("projects");
    } finally {
      db.close();
    }
  });
});

describe("users table", () => {
  it("applies column defaults", () => {
    const db = createDatabase(":memory:");
    try {
      migrate(db);
      db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)").run(
        "a@b.com",
        "hash",
      );
      expect(
        db.prepare("SELECT email, role, points_balance FROM users").get(),
      ).toMatchObject({ email: "a@b.com", role: "user", points_balance: 0 });
    } finally {
      db.close();
    }
  });

  it("rejects duplicate emails, unknown roles and negative balances", () => {
    const db = createDatabase(":memory:");
    try {
      migrate(db);
      const insert =
        "INSERT INTO users (email, password_hash, role, points_balance) VALUES (?, ?, ?, ?)";
      db.prepare(insert).run("a@b.com", "hash", "user", 10);

      expect(() => db.prepare(insert).run("a@b.com", "hash", "user", 0)).toThrow(
        /UNIQUE/,
      );
      expect(() => db.prepare(insert).run("c@d.com", "hash", "root", 0)).toThrow(
        /CHECK/,
      );
      expect(() => db.prepare(insert).run("e@f.com", "hash", "user", -1)).toThrow(
        /CHECK/,
      );
    } finally {
      db.close();
    }
  });
});
