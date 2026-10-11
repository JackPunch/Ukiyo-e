import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "./auth/cookie";
import { buildServer } from "./server";
import { buildTestServer } from "./test-support";

describe("buildServer", () => {
  it("refuses to start without a usable JWT_SECRET", async () => {
    await expect(
      buildServer({
        databaseUrl: ":memory:",
        auth: { jwtSecret: "too-short" },
      }),
    ).rejects.toThrow(/JWT_SECRET/);
  });
});

describe("error envelope", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  it("answers 404 with the shared envelope for an unknown route", async () => {
    app = await buildTestServer();

    const response = await app.inject({ method: "GET", url: "/api/nope" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: "not_found", message: "接口不存在", details: null },
    });
  });

  it("answers 404 with the shared envelope for a wrong method too", async () => {
    app = await buildTestServer();

    const response = await app.inject({ method: "PUT", url: "/api/auth/me" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: "not_found" } });
  });

  it("answers 400 with validation_error for a malformed JSON body", async () => {
    app = await buildTestServer();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: "validation_error" },
    });
  });

  it("answers 400 for a JSON content-type with an empty body", async () => {
    app = await buildTestServer();

    // What a body-less POST sends when it wrongly declares a JSON body: the
    // frontend avoids it, and the API still answers in the shared shape.
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { "content-type": "application/json" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: "validation_error" },
    });
  });

  it("keeps Fastify's own status for other client errors", async () => {
    app = await buildTestServer();

    const unsupportedMedia = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "text/csv" },
      payload: "email,password",
    });
    const tooLarge = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        email: "a@b.com",
        password: "x".repeat(1024 * 1024),
      }),
    });

    expect(unsupportedMedia.statusCode).toBe(415);
    expect(unsupportedMedia.json()).toMatchObject({
      error: { code: "validation_error" },
    });
    expect(tooLarge.statusCode).toBe(413);
    expect(tooLarge.json()).toMatchObject({
      error: { code: "validation_error" },
    });
  });

  it("answers 500 with internal_error without leaking the cause", async () => {
    app = await buildTestServer();

    const registered = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "user@example.com", password: "password1234" },
    });
    const cookies = {
      [SESSION_COOKIE_NAME]: String(
        registered.cookies.find((c) => c.name === SESSION_COOKIE_NAME)?.value,
      ),
    };

    // Break the database so the session lookup throws inside `requireAuth`.
    app.db.exec("DROP TABLE users");

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies,
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: { code: "internal_error", message: "服务器内部错误", details: null },
    });
    expect(response.body).not.toContain("no such table");
  });
});
