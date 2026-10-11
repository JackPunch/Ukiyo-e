import { describe, expect, it } from "vitest";
import { buildTestServer } from "../test-support";

describe("GET /api/health", () => {
  it("returns a healthy response", async () => {
    const app = await buildTestServer();

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      service: "ukiyo-e-api",
    });

    await app.close();
  });
});
