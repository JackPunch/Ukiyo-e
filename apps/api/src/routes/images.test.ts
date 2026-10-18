import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "../auth/cookie";
import { createImage } from "../db/queries/images";
import { createTask } from "../db/queries/tasks";
import { buildTestServer } from "../test-support";

const storageRoot = join(process.cwd(), ".test-image-storage");

describe("GET /api/images/:imageId", () => {
  afterEach(async () => {
    delete process.env.STORAGE_ROOT;
    await rm(storageRoot, { recursive: true, force: true });
  });

  it("serves an image only to its task owner", async () => {
    process.env.STORAGE_ROOT = storageRoot;
    const app = await buildTestServer();
    const registered = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "image@example.com", password: "password1234" },
    });
    const session = registered.cookies.find(
      (cookie) => cookie.name === SESSION_COOKIE_NAME,
    )!.value;
    const task = createTask(app.db, {
      userId: registered.json().user.id,
      prompt: "image",
    });
    const filePath = "images/1/test.png";
    await mkdir(join(storageRoot, "images", "1"), { recursive: true });
    await writeFile(join(storageRoot, filePath), "test image");
    const image = createImage(app.db, {
      taskId: task.id,
      filePath,
      mimeType: "image/png",
      fileSize: 10,
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/images/${image.id}`,
      cookies: { [SESSION_COOKIE_NAME]: session },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("image/png");
    expect(response.body).toBe("test image");
    await app.close();
  });
});
