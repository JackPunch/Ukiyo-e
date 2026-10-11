import type { DatabaseSync } from "node:sqlite";
import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../db/client";
import { migrate } from "../db/migrate";
import { createUser } from "../db/queries/users";
import { resolveAuthConfig } from "./config";
import { SESSION_COOKIE_NAME } from "./cookie";
import { createRequireAdmin, createRequireAuth } from "./middleware";
import { signSessionToken } from "./token";

const config = resolveAuthConfig(
  { jwtSecret: "middleware-test-secret-0123456789-0123456789", cookieSecure: false },
  {},
);

/**
 * The middleware only needs `db` on the instance plus the two decorators, so it
 * is exercised on a minimal app with one protected and one admin-only route
 * instead of the real server.
 */
function buildTestApp(): { app: FastifyInstance; db: DatabaseSync } {
  const db = createDatabase(":memory:");
  migrate(db);

  const app = Fastify();
  app.decorate("db", db);
  app.decorateRequest("user", null);
  app.decorate("requireAuth", createRequireAuth(config));
  app.decorate("requireAdmin", createRequireAdmin());

  app.register(cookie);
  app.get("/protected", { preHandler: app.requireAuth }, async (request) => ({
    user: request.user,
  }));
  app.get(
    "/admin",
    { preHandler: [app.requireAuth, app.requireAdmin] },
    async () => ({ ok: true }),
  );

  return { app, db };
}

describe("auth middleware", () => {
  let app: FastifyInstance;
  let db: DatabaseSync;

  /** Creates a user and returns a session cookie carrying their token. */
  async function sessionFor(
    email: string,
    role: "user" | "admin" = "user",
  ): Promise<{ id: number; cookies: Record<string, string> }> {
    const user = createUser(db, { email, passwordHash: "hash", role });
    const token = await signSessionToken(user.id, config);

    return { id: user.id, cookies: { [SESSION_COOKIE_NAME]: token } };
  }

  beforeEach(() => {
    ({ app, db } = buildTestApp());
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  describe("requireAuth", () => {
    it("answers 401 when the cookie is missing", async () => {
      const response = await app.inject({ method: "GET", url: "/protected" });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: { code: "unauthorized" } });
    });

    it("answers 401 for an invalid cookie", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/protected",
        cookies: { [SESSION_COOKIE_NAME]: "not-a-jwt" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("answers 401 when the user in the token no longer exists", async () => {
      const { id, cookies } = await sessionFor("gone@b.com");
      db.prepare("DELETE FROM users WHERE id = ?").run(id);

      const response = await app.inject({
        method: "GET",
        url: "/protected",
        cookies,
      });

      expect(response.statusCode).toBe(401);
    });

    it("exposes the user without leaking password_hash", async () => {
      const { id, cookies } = await sessionFor("user@b.com");

      const response = await app.inject({
        method: "GET",
        url: "/protected",
        cookies,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        user: expect.objectContaining({
          id,
          email: "user@b.com",
          role: "user",
          pointsBalance: 0,
        }),
      });
      expect(response.body).not.toContain("password_hash");
      expect(response.body).not.toContain("hash");
    });

    it("applies a role change without requiring a new token", async () => {
      const { id, cookies } = await sessionFor("user@b.com");

      const before = await app.inject({
        method: "GET",
        url: "/admin",
        cookies,
      });
      expect(before.statusCode).toBe(403);

      db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(id);

      const after = await app.inject({ method: "GET", url: "/admin", cookies });
      expect(after.statusCode).toBe(200);
    });
  });

  describe("requireAdmin", () => {
    it("answers 403 for a regular user", async () => {
      const { cookies } = await sessionFor("user@b.com");

      const response = await app.inject({
        method: "GET",
        url: "/admin",
        cookies,
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: { code: "forbidden" } });
    });

    it("lets an admin through", async () => {
      const { cookies } = await sessionFor("admin@b.com", "admin");

      const response = await app.inject({
        method: "GET",
        url: "/admin",
        cookies,
      });

      expect(response.statusCode).toBe(200);
    });

    it("prefers 401 over 403 when there is no session", async () => {
      const response = await app.inject({ method: "GET", url: "/admin" });

      expect(response.statusCode).toBe(401);
    });
  });
});
