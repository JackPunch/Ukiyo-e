import { afterEach, describe, expect, it, vi } from "vitest";
import { createTask, findTaskById } from "./db/queries/tasks";
import { buildTestServer } from "./test-support";
import { runTaskWorkerOnce } from "./worker";

describe("task worker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.KIE_API_KEY;
  });

  it("maps provider generating and success states to local states", async () => {
    process.env.KIE_API_KEY = "test-key";
    const providerFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            msg: "success",
            data: {
              taskId: "provider-task-1",
              model: "nano-banana-2-1",
              state: "generating",
              param: "{}",
              resultJson: null,
              response: null,
              failCode: null,
              failMsg: null,
              costTime: 0,
              completeTime: null,
              createTime: Date.now(),
              creditsConsumed: 0,
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            msg: "success",
            data: {
              taskId: "provider-task-1",
              model: "nano-banana-2-1",
              state: "success",
              param: "{}",
              resultJson: JSON.stringify({ resultUrls: ["https://images.example/test.png"] }),
              response: { resultUrls: ["https://images.example/test.png"] },
              failCode: null,
              failMsg: null,
              costTime: 1,
              completeTime: Date.now(),
              createTime: Date.now(),
              creditsConsumed: 4,
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          Uint8Array.from([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
          ]),
          { status: 200, headers: { "content-type": "image/png" } },
        ),
      );
    const app = await buildTestServer();
      const registered = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email: "worker@example.com", password: "password1234" },
      });
      const task = createTask(app.db, {
        userId: registered.json().user.id,
      prompt: "A test image",
      model: "nano-banana-2-1",
      params: { providerTaskId: "provider-task-1" },
    });

    await runTaskWorkerOnce(app.db, app.log);
    expect(findTaskById(app.db, task.id)?.status).toBe("running");
    await runTaskWorkerOnce(app.db, app.log);
    expect(findTaskById(app.db, task.id)?.status).toBe("succeeded");
    expect(providerFetch).toHaveBeenCalledTimes(3);
    await app.close();
  });
});
