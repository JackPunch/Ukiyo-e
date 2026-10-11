import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../client";
import { migrate } from "../migrate";
import { createUser } from "./users";
import {
  createTask,
  deleteTask,
  findTaskById,
  listTasks,
  parseTaskParams,
} from "./tasks";

describe("tasks queries", () => {
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

  describe("createTask", () => {
    it("inserts a task with defaults and returns the row", () => {
      const task = createTask(db, { userId, prompt: "a cat" });

      expect(task).toMatchObject({
        user_id: userId,
        status: "queued",
        prompt: "a cat",
        model: null,
        params: null,
        points_cost: 0,
        error: null,
        attempts: 0,
        started_at: null,
        finished_at: null,
      });
      expect(task.id).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(task.created_at))).toBe(false);
    });

    it("serializes params and honours optional fields", () => {
      const task = createTask(db, {
        userId,
        prompt: "a dog",
        model: "sd-xl",
        params: { width: 512, height: 512, n: 2 },
        pointsCost: 5,
      });

      expect(task.model).toBe("sd-xl");
      expect(task.points_cost).toBe(5);
      expect(JSON.parse(task.params ?? "null")).toEqual({
        width: 512,
        height: 512,
        n: 2,
      });
    });

    it("rejects a negative points cost", () => {
      expect(() =>
        createTask(db, { userId, prompt: "x", pointsCost: -1 }),
      ).toThrow(/CHECK/);
    });

    it("rejects a task for a non-existent user", () => {
      expect(() => createTask(db, { userId: 9999, prompt: "x" })).toThrow(
        /FOREIGN KEY/,
      );
    });
  });

  describe("parseTaskParams", () => {
    it("parses stored JSON", () => {
      const task = createTask(db, { userId, prompt: "x", params: { seed: 1 } });
      expect(parseTaskParams(task)).toEqual({ seed: 1 });
    });

    it("returns null when there are no params", () => {
      const task = createTask(db, { userId, prompt: "x" });
      expect(parseTaskParams(task)).toBeNull();
    });
  });

  describe("findTaskById", () => {
    it("finds the task", () => {
      const created = createTask(db, { userId, prompt: "a cat" });
      expect(findTaskById(db, created.id)?.prompt).toBe("a cat");
    });

    it("returns undefined when there is no match", () => {
      expect(findTaskById(db, 9999)).toBeUndefined();
    });
  });

  describe("listTasks", () => {
    it("returns an empty page for an empty table", () => {
      expect(listTasks(db, { userId })).toEqual({ items: [], total: 0 });
    });

    it("orders newest first and pages with limit and offset", () => {
      for (const prompt of ["t1", "t2", "t3"]) {
        createTask(db, { userId, prompt });
      }

      const page1 = listTasks(db, { userId, limit: 2 });
      expect(page1.total).toBe(3);
      expect(page1.items.map((task) => task.prompt)).toEqual(["t3", "t2"]);

      const page2 = listTasks(db, { userId, limit: 2, offset: 2 });
      expect(page2.items.map((task) => task.prompt)).toEqual(["t1"]);
      expect(page2.total).toBe(3);
    });

    it("filters by user", () => {
      const otherId = createUser(db, {
        email: "b@b.com",
        passwordHash: "hash",
      }).id;
      createTask(db, { userId, prompt: "mine" });
      createTask(db, { userId: otherId, prompt: "theirs" });

      const result = listTasks(db, { userId });

      expect(result.total).toBe(1);
      expect(result.items.map((task) => task.prompt)).toEqual(["mine"]);
    });

    it("filters by status", () => {
      const running = createTask(db, { userId, prompt: "running" });
      createTask(db, { userId, prompt: "queued" });
      db.prepare("UPDATE tasks SET status = 'running' WHERE id = ?").run(
        running.id,
      );

      const result = listTasks(db, { userId, status: "running" });

      expect(result.total).toBe(1);
      expect(result.items.map((task) => task.prompt)).toEqual(["running"]);
    });
  });

  describe("deleteTask", () => {
    it("deletes the row and reports success", () => {
      const task = createTask(db, { userId, prompt: "a cat" });

      expect(deleteTask(db, task.id)).toBe(true);
      expect(findTaskById(db, task.id)).toBeUndefined();
    });

    it("returns false when nothing matched", () => {
      expect(deleteTask(db, 9999)).toBe(false);
    });
  });
});
