import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../client";
import { migrate } from "../migrate";
import {
  createUser,
  findUserByEmail,
  findUserById,
  listUsers,
  registerUser,
} from "./users";

describe("users queries", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createDatabase(":memory:");
    migrate(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("createUser", () => {
    it("inserts a user with defaults and returns the row", () => {
      const user = createUser(db, { email: "a@b.com", passwordHash: "hash" });

      expect(user).toMatchObject({
        email: "a@b.com",
        display_name: null,
        password_hash: "hash",
        role: "user",
        points_balance: 0,
        last_login_at: null,
      });
      expect(user.id).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(user.created_at))).toBe(false);
    });

    it("honours an explicit role, display name and balance", () => {
      const user = createUser(db, {
        email: "admin@b.com",
        passwordHash: "hash",
        displayName: "Admin",
        role: "admin",
        pointsBalance: 50,
      });

      expect(user).toMatchObject({
        display_name: "Admin",
        role: "admin",
        points_balance: 50,
      });
    });

    it("normalizes the email to lowercase and trims it", () => {
      const user = createUser(db, { email: "  A@B.com ", passwordHash: "hash" });
      expect(user.email).toBe("a@b.com");
    });

    it("rejects a duplicate email regardless of case", () => {
      createUser(db, { email: "a@b.com", passwordHash: "hash" });
      expect(() =>
        createUser(db, { email: "A@B.com", passwordHash: "hash" }),
      ).toThrow(/UNIQUE/);
    });
  });

  describe("registerUser", () => {
    it("creates a plain user with a zero balance", () => {
      const user = registerUser(db, {
        email: "new@b.com",
        passwordHash: "hash",
        displayName: "New",
      });

      expect(user).toMatchObject({
        email: "new@b.com",
        display_name: "New",
        role: "user",
        points_balance: 0,
      });
    });

    it("normalizes the email like createUser", () => {
      const user = registerUser(db, {
        email: "  A@B.com ",
        passwordHash: "hash",
      });
      expect(user.email).toBe("a@b.com");
    });

    it("rejects a duplicate email", () => {
      registerUser(db, { email: "a@b.com", passwordHash: "hash" });
      expect(() =>
        registerUser(db, { email: "a@b.com", passwordHash: "hash" }),
      ).toThrow(/UNIQUE/);
    });
  });

  describe("findUserByEmail", () => {
    it("finds a user by exact email", () => {
      const created = createUser(db, { email: "a@b.com", passwordHash: "hash" });
      expect(findUserByEmail(db, "a@b.com")?.id).toBe(created.id);
    });

    it("is case- and whitespace-insensitive", () => {
      const created = createUser(db, { email: "a@b.com", passwordHash: "hash" });
      expect(findUserByEmail(db, " A@B.com ")?.id).toBe(created.id);
    });

    it("returns undefined when there is no match", () => {
      expect(findUserByEmail(db, "nobody@b.com")).toBeUndefined();
    });
  });

  describe("findUserById", () => {
    it("finds a user by id", () => {
      const created = createUser(db, { email: "a@b.com", passwordHash: "hash" });
      expect(findUserById(db, created.id)?.email).toBe("a@b.com");
    });

    it("returns undefined when there is no match", () => {
      expect(findUserById(db, 9999)).toBeUndefined();
    });
  });

  describe("listUsers", () => {
    it("returns an empty page for an empty table", () => {
      expect(listUsers(db)).toEqual({ items: [], total: 0 });
    });

    it("orders by id and reports the total ignoring pagination", () => {
      for (const email of ["a@b.com", "b@b.com", "c@b.com"]) {
        createUser(db, { email, passwordHash: "hash" });
      }

      const result = listUsers(db, { limit: 2, offset: 0 });

      expect(result.total).toBe(3);
      expect(result.items.map((user) => user.email)).toEqual([
        "a@b.com",
        "b@b.com",
      ]);
    });

    it("pages with limit and offset", () => {
      for (const email of ["a@b.com", "b@b.com", "c@b.com"]) {
        createUser(db, { email, passwordHash: "hash" });
      }

      const page2 = listUsers(db, { limit: 2, offset: 2 });

      expect(page2.items.map((user) => user.email)).toEqual(["c@b.com"]);
      expect(page2.total).toBe(3);
    });

    it("defaults to a page size of 20", () => {
      for (let i = 0; i < 25; i++) {
        createUser(db, { email: `u${i}@b.com`, passwordHash: "hash" });
      }

      expect(listUsers(db).items).toHaveLength(20);
      expect(listUsers(db).total).toBe(25);
    });

    it("filters by email or display name substring", () => {
      createUser(db, { email: "alice@b.com", passwordHash: "hash" });
      createUser(db, {
        email: "bob@b.com",
        passwordHash: "hash",
        displayName: "Alice",
      });
      createUser(db, { email: "carol@b.com", passwordHash: "hash" });

      const result = listUsers(db, { search: "alice" });

      expect(result.items.map((user) => user.email)).toEqual([
        "alice@b.com",
        "bob@b.com",
      ]);
      expect(result.total).toBe(2);
    });

    it("matches the search case-insensitively", () => {
      createUser(db, { email: "alice@b.com", passwordHash: "hash" });

      expect(listUsers(db, { search: "ALICE" }).total).toBe(1);
    });

    it("treats LIKE wildcards in the search as literal characters", () => {
      createUser(db, { email: "a_b@b.com", passwordHash: "hash" });
      createUser(db, { email: "axb@b.com", passwordHash: "hash" });
      createUser(db, { email: "50%off@b.com", passwordHash: "hash" });
      createUser(db, { email: "plain@b.com", passwordHash: "hash" });

      // `_` must not act as "any single character".
      expect(
        listUsers(db, { search: "a_b" }).items.map((user) => user.email),
      ).toEqual(["a_b@b.com"]);
      // `%` must not act as "any sequence".
      expect(
        listUsers(db, { search: "%off" }).items.map((user) => user.email),
      ).toEqual(["50%off@b.com"]);
      // A lone wildcard matches literally, not everything.
      expect(listUsers(db, { search: "%" }).total).toBe(1);
    });

    it("ignores a whitespace-only search", () => {
      createUser(db, { email: "a@b.com", passwordHash: "hash" });
      createUser(db, { email: "b@b.com", passwordHash: "hash" });

      expect(listUsers(db, { search: "   " }).total).toBe(2);
    });

    it("combines the search filter with pagination", () => {
      for (const email of [
        "team1@b.com",
        "team2@b.com",
        "team3@b.com",
        "other@b.com",
      ]) {
        createUser(db, { email, passwordHash: "hash" });
      }

      const page = listUsers(db, { search: "team", limit: 2, offset: 1 });

      expect(page.items.map((user) => user.email)).toEqual([
        "team2@b.com",
        "team3@b.com",
      ]);
      expect(page.total).toBe(3);
    });
  });
});
