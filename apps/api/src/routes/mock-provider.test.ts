import { describe, expect, it } from "vitest";
import { buildTestServer } from "../test-support";

describe("mock provider task API", () => {
  it("creates a task and returns generating then success details", async () => {
    const app = await buildTestServer();
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/mock/jobs/createTask",
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

    expect(createResponse.statusCode).toBe(200);
    const taskId = createResponse.json().data.taskId;
    expect(taskId).toMatch(/^mock_[0-9a-f]+$/);

    const firstQuery = await app.inject({
      method: "GET",
      url: `/api/mock/jobs/recordInfo?taskId=${taskId}`,
    });
    expect(firstQuery.json().data.state).toBe("generating");

    const secondQuery = await app.inject({
      method: "GET",
      url: `/api/mock/jobs/recordInfo?taskId=${taskId}`,
    });
    const result = secondQuery.json();
    expect(result.data.state).toBe("success");
    expect(JSON.parse(result.data.resultJson).resultUrls).toHaveLength(1);
    expect(result.data.response.resultUrls).toHaveLength(1);

    await app.close();
  });

  it("returns the provider-shaped error for an unknown task", async () => {
    const app = await buildTestServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/mock/jobs/recordInfo?taskId=missing",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      code: 422,
      msg: "Task not found",
      data: null,
    });
    await app.close();
  });
});
