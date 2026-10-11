import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../client";
import { migrate } from "../migrate";
import { createUser } from "./users";
import {
  findPointTransactionById,
  listPointTransactions,
  recordPointTransaction,
} from "./point-transactions";

describe("point transaction queries", () => {
  let db: DatabaseSync;
  let userId: number;

  beforeEach(() => {
    db = createDatabase(":memory:");
    migrate(db);
    userId = createUser(db, { email: "a@b.com", passwordHash: "hash" }).id;
  });

  afterEach(() => {
    db.close();
  });

  function balanceOf(id: number): number {
    const row = db
      .prepare("SELECT points_balance FROM users WHERE id = ?")
      .get(id) as unknown as { points_balance: number };
    return row.points_balance;
  }

  describe("recordPointTransaction", () => {
    it("credits points and updates the cached balance", () => {
      const entry = recordPointTransaction(db, {
        userId,
        amount: 100,
        reason: "signup_bonus",
      });

      expect(entry).toMatchObject({
        user_id: userId,
        amount: 100,
        balance_after: 100,
        reason: "signup_bonus",
        ref_type: null,
        ref_id: null,
        note: null,
        created_by: null,
      });
      expect(entry.id).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(entry.created_at))).toBe(false);
      expect(balanceOf(userId)).toBe(100);
    });

    it("debits points and records the running balance", () => {
      recordPointTransaction(db, {
        userId,
        amount: 100,
        reason: "signup_bonus",
      });

      const spend = recordPointTransaction(db, {
        userId,
        amount: -30,
        reason: "task_spend",
        refType: "task",
        refId: 7,
      });

      expect(spend).toMatchObject({
        amount: -30,
        balance_after: 70,
        ref_type: "task",
        ref_id: 7,
      });
      expect(balanceOf(userId)).toBe(70);
    });

    it("records admin adjustments with a note and actor", () => {
      const adminId = createUser(db, {
        email: "admin@b.com",
        passwordHash: "hash",
        role: "admin",
      }).id;

      const entry = recordPointTransaction(db, {
        userId,
        amount: 25,
        reason: "admin_adjust",
        note: "manual top-up",
        createdBy: adminId,
      });

      expect(entry).toMatchObject({
        reason: "admin_adjust",
        note: "manual top-up",
        created_by: adminId,
      });
    });

    it("refuses to overdraw, leaving no trace", () => {
      recordPointTransaction(db, { userId, amount: 10, reason: "signup_bonus" });

      expect(() =>
        recordPointTransaction(db, {
          userId,
          amount: -11,
          reason: "task_spend",
        }),
      ).toThrow(/CHECK/);

      expect(balanceOf(userId)).toBe(10);
      expect(listPointTransactions(db, { userId }).total).toBe(1);
    });

    it("rejects an unknown user", () => {
      expect(() =>
        recordPointTransaction(db, {
          userId: 9999,
          amount: 5,
          reason: "admin_adjust",
        }),
      ).toThrow(/Unknown user/);
    });

    it("rejects an unknown reason", () => {
      expect(() =>
        recordPointTransaction(db, {
          userId,
          amount: 5,
          // @ts-expect-error - unsupported reason, caught by the CHECK constraint
          reason: "bogus",
        }),
      ).toThrow(/CHECK/);
    });
  });

  describe("findPointTransactionById", () => {
    it("finds the entry", () => {
      const entry = recordPointTransaction(db, {
        userId,
        amount: 5,
        reason: "signup_bonus",
      });
      expect(findPointTransactionById(db, entry.id)?.amount).toBe(5);
    });

    it("returns undefined when there is no match", () => {
      expect(findPointTransactionById(db, 9999)).toBeUndefined();
    });
  });

  describe("listPointTransactions", () => {
    it("returns an empty page for an empty table", () => {
      expect(listPointTransactions(db)).toEqual({ items: [], total: 0 });
    });

    it("orders newest first and paginates", () => {
      for (const amount of [10, 20, 30]) {
        recordPointTransaction(db, { userId, amount, reason: "signup_bonus" });
      }

      const page1 = listPointTransactions(db, { limit: 2 });
      expect(page1.total).toBe(3);
      expect(page1.items.map((entry) => entry.amount)).toEqual([30, 20]);

      const page2 = listPointTransactions(db, { limit: 2, offset: 2 });
      expect(page2.items.map((entry) => entry.amount)).toEqual([10]);
      expect(page2.total).toBe(3);
    });

    it("filters by user", () => {
      const otherId = createUser(db, {
        email: "b@b.com",
        passwordHash: "hash",
      }).id;
      recordPointTransaction(db, { userId, amount: 5, reason: "signup_bonus" });
      recordPointTransaction(db, {
        userId: otherId,
        amount: 9,
        reason: "signup_bonus",
      });

      const result = listPointTransactions(db, { userId });

      expect(result.total).toBe(1);
      expect(result.items.map((entry) => entry.amount)).toEqual([5]);
    });
  });

  describe("deleting the owner", () => {
    it("is refused while the user still has ledger entries", () => {
      recordPointTransaction(db, { userId, amount: 10, reason: "signup_bonus" });

      expect(() =>
        db.prepare("DELETE FROM users WHERE id = ?").run(userId),
      ).toThrow(/FOREIGN KEY/);
    });

    it("succeeds once the ledger is cleared", () => {
      const entry = recordPointTransaction(db, {
        userId,
        amount: 10,
        reason: "signup_bonus",
      });
      db.prepare("DELETE FROM point_transactions WHERE id = ?").run(entry.id);

      expect(() =>
        db.prepare("DELETE FROM users WHERE id = ?").run(userId),
      ).not.toThrow();
    });
  });
});
