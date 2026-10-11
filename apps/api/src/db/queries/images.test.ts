import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../client";
import { migrate } from "../migrate";
import { createUser } from "./users";
import { createTask } from "./tasks";
import {
  createImage,
  deleteImage,
  findImageById,
  listImagesByTask,
} from "./images";

describe("images queries", () => {
  let db: DatabaseSync;
  let taskId: number;

  beforeEach(() => {
    db = createDatabase(":memory:");
    migrate(db);
    const userId = createUser(db, {
      email: "a@b.com",
      passwordHash: "hash",
    }).id;
    taskId = createTask(db, { userId, prompt: "a cat" }).id;
  });

  afterEach(() => {
    db.close();
  });

  describe("createImage", () => {
    it("inserts an image with defaults and returns the row", () => {
      const image = createImage(db, {
        taskId,
        filePath: "images/1.png",
        mimeType: "image/png",
      });

      expect(image).toMatchObject({
        task_id: taskId,
        position: 0,
        file_path: "images/1.png",
        mime_type: "image/png",
        width: null,
        height: null,
        file_size: null,
        sha256: null,
        source_url: null,
      });
      expect(image.id).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(image.created_at))).toBe(false);
    });

    it("honours optional metadata", () => {
      const image = createImage(db, {
        taskId,
        filePath: "images/2.webp",
        mimeType: "image/webp",
        position: 3,
        width: 1024,
        height: 768,
        fileSize: 2048,
        sha256: "abc",
        sourceUrl: "https://example.test/2.webp",
      });

      expect(image).toMatchObject({
        position: 3,
        width: 1024,
        height: 768,
        file_size: 2048,
        sha256: "abc",
        source_url: "https://example.test/2.webp",
      });
    });

    it("rejects an image for a non-existent task", () => {
      expect(() =>
        createImage(db, {
          taskId: 9999,
          filePath: "images/x.png",
          mimeType: "image/png",
        }),
      ).toThrow(/FOREIGN KEY/);
    });
  });

  describe("findImageById", () => {
    it("finds the image", () => {
      const created = createImage(db, {
        taskId,
        filePath: "images/1.png",
        mimeType: "image/png",
      });
      expect(findImageById(db, created.id)?.file_path).toBe("images/1.png");
    });

    it("returns undefined when there is no match", () => {
      expect(findImageById(db, 9999)).toBeUndefined();
    });
  });

  describe("listImagesByTask", () => {
    it("returns an empty list when the task has no images", () => {
      expect(listImagesByTask(db, taskId)).toEqual([]);
    });

    it("orders by position then id", () => {
      const at = (filePath: string, position: number) =>
        createImage(db, { taskId, filePath, mimeType: "image/png", position });
      at("b.png", 1);
      at("a.png", 0);
      at("c.png", 0);

      expect(
        listImagesByTask(db, taskId).map((image) => image.file_path),
      ).toEqual(["a.png", "c.png", "b.png"]);
    });

    it("only returns images for the given task", () => {
      const otherId = createUser(db, {
        email: "b@b.com",
        passwordHash: "hash",
      }).id;
      const otherTaskId = createTask(db, { userId: otherId, prompt: "other" }).id;
      createImage(db, { taskId, filePath: "mine.png", mimeType: "image/png" });
      createImage(db, {
        taskId: otherTaskId,
        filePath: "theirs.png",
        mimeType: "image/png",
      });

      expect(
        listImagesByTask(db, taskId).map((image) => image.file_path),
      ).toEqual(["mine.png"]);
    });
  });

  describe("deleteImage", () => {
    it("deletes the row and reports success", () => {
      const image = createImage(db, {
        taskId,
        filePath: "a.png",
        mimeType: "image/png",
      });

      expect(deleteImage(db, image.id)).toBe(true);
      expect(findImageById(db, image.id)).toBeUndefined();
    });

    it("returns false when nothing matched", () => {
      expect(deleteImage(db, 9999)).toBe(false);
    });
  });

  describe("cascade from tasks", () => {
    it("removes a task's images when the task is deleted", () => {
      const image = createImage(db, {
        taskId,
        filePath: "a.png",
        mimeType: "image/png",
      });

      db.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);

      expect(listImagesByTask(db, taskId)).toEqual([]);
      expect(findImageById(db, image.id)).toBeUndefined();
    });
  });
});
