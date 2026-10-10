import { describe, expect, it } from "vitest";
import { buildServer } from "../server";

describe("GET /api/health", () => {
  it("returns a healthy response", async () => {
    const app = buildServer();

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      service: "ukiyo-e-api",
    });

    await app.close();
  });
});
