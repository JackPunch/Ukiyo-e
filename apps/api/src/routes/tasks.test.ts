import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE_NAME } from "../auth/cookie";
import { createTask, findTaskById } from "../db/queries/tasks";
import { buildTestServer } from "../test-support";

describe("POST /api/tasks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.KIE_API_KEY;
  });

  it("submits to Kie.ai and records the accepted provider task", async () => {
    process.env.KIE_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 200,
          msg: "success",
          data: { taskId: "provider-task-1" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const app = await buildTestServer();
    const registered = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "task@example.com", password: "password1234" },
    });
    const session = registered.cookies.find(
      (cookie) => cookie.name === SESSION_COOKIE_NAME,
    );
    const userId = registered.json().user.id;

    const response = await app.inject({
      method: "POST",
      url: "/api/tasks",
      cookies: { [SESSION_COOKIE_NAME]: session!.value },
      payload: {
        model: "nano-banana-2-1",
        input: {
          prompt: "A test image",
          aspect_ratio: "1:1",
          resolution: "1K",
          output_format: "jpg",
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      providerTaskId: "provider-task-1",
      status: "queued",
    });
    const task = findTaskById(app.db, response.json().taskId);
    expect(task).toMatchObject({
      user_id: userId,
      prompt: "A test image",
      model: "nano-banana-2-1",
      status: "queued",
    });
    expect(JSON.parse(task!.params!).providerTaskId).toBe("provider-task-1");

    await app.close();
  });

  it("returns the task status only to its owner", async () => {
    process.env.KIE_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 200,
          msg: "success",
          data: { taskId: "provider-task-1" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const app = await buildTestServer();
    const registered = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "status@example.com", password: "password1234" },
    });
    const session = registered.cookies[0]!.value;
    const created = await app.inject({
      method: "POST",
      url: "/api/tasks",
      cookies: { [SESSION_COOKIE_NAME]: session },
      payload: {
        model: "nano-banana-2-1",
        input: { prompt: "A test image" },
      },
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/tasks/${created.json().taskId}`,
      cookies: { [SESSION_COOKIE_NAME]: session },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      taskId: created.json().taskId,
      status: "queued",
      error: null,
    });
    await app.close();
  });

  it("lists only the current user's task history", async () => {
    const app = await buildTestServer();
    const registered = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "history@example.com", password: "password1234" },
    });
    const session = registered.cookies[0]!.value;
    const userId = registered.json().user.id;
    createTask(app.db, {
      userId,
      prompt: "History task",
      model: "nano-banana-2-1",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/tasks?limit=10&offset=0",
      cookies: { [SESSION_COOKIE_NAME]: session },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      total: 1,
      limit: 10,
      offset: 0,
      items: [{ prompt: "History task", status: "queued" }],
    });
    await app.close();
  });
});
