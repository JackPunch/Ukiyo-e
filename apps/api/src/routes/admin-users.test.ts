import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveAuthConfig } from "../auth/config";
import { SESSION_COOKIE_NAME } from "../auth/cookie";
import { signSessionToken } from "../auth/token";
import { createUser } from "../db/queries/users";
import { buildTestServer, TEST_AUTH } from "../test-support";

const authConfig = resolveAuthConfig(TEST_AUTH, {});

describe("admin user routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestServer();
  });

  afterEach(async () => {
    await app.close();
  });

  /** Creates a user directly and returns a session cookie carrying their token. */
  async function cookiesFor(
    email: string,
    role: "user" | "admin" = "user",
  ): Promise<Record<string, string>> {
    const user = createUser(app.db, { email, passwordHash: "hash", role });
    const token = await signSessionToken(user.id, authConfig);

    return { [SESSION_COOKIE_NAME]: token };
  }

  describe("POST /api/admin/users", () => {
    it("answers 401 without a session", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/users",
        payload: { email: "new@b.com", password: "password1234" },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: { code: "unauthorized" } });
    });

    it("answers 403 for a regular user", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/users",
        cookies: await cookiesFor("user@b.com"),
        payload: { email: "new@b.com", password: "password1234" },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: { code: "forbidden" } });
    });

    it("creates a plain user without a session cookie or password leak", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/users",
        cookies: await cookiesFor("admin@b.com", "admin"),
        payload: {
          email: "New@B.com",
          password: "password1234",
          displayName: "Newcomer",
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        user: expect.objectContaining({
          email: "new@b.com",
          displayName: "Newcomer",
          role: "user",
          pointsBalance: 0,
        }),
      });
      expect(response.body).not.toContain("password_hash");
      // The acting admin's session must not be replaced by the created user's.
      expect(response.headers["set-cookie"]).toBeUndefined();
    });

    it("lets the created user log in afterwards", async () => {
      const admin = await cookiesFor("admin@b.com", "admin");
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        cookies: admin,
        payload: { email: "new@b.com", password: "password1234" },
      });

      const login = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "new@b.com", password: "password1234" },
      });

      expect(login.statusCode).toBe(200);
      expect(login.json()).toMatchObject({ user: { email: "new@b.com" } });
    });

    it("answers 409 for a duplicate email regardless of case", async () => {
      const admin = await cookiesFor("admin@b.com", "admin");
      createUser(app.db, { email: "taken@b.com", passwordHash: "hash" });

      const response = await app.inject({
        method: "POST",
        url: "/api/admin/users",
        cookies: admin,
        payload: { email: "Taken@B.com", password: "password1234" },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ error: { code: "email_taken" } });
    });

    it("answers 400 for an invalid body", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/users",
        cookies: await cookiesFor("admin@b.com", "admin"),
        payload: { email: "not-an-email", password: "short" },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe("validation_error");
      expect(body.error.details.map((d: { path: string }) => d.path)).toEqual(
        expect.arrayContaining(["email", "password"]),
      );
    });
  });

  describe("GET /api/admin/users", () => {
    it("answers 403 for a regular user", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/admin/users",
        cookies: await cookiesFor("user@b.com"),
      });

      expect(response.statusCode).toBe(403);
    });

    it("returns a page with the pagination envelope", async () => {
      const admin = await cookiesFor("admin@b.com", "admin");
      createUser(app.db, { email: "a@b.com", passwordHash: "hash" });

      const response = await app.inject({
        method: "GET",
        url: "/api/admin/users",
        cookies: admin,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toMatchObject({ total: 2, limit: 20, offset: 0 });
      expect(body.items).toHaveLength(2);
      expect(body.items[0]).not.toHaveProperty("password_hash");
    });

    it("filters by keyword", async () => {
      const admin = await cookiesFor("admin@b.com", "admin");
      createUser(app.db, { email: "alice@b.com", passwordHash: "hash" });
      createUser(app.db, { email: "bob@b.com", passwordHash: "hash" });

      const response = await app.inject({
        method: "GET",
        url: "/api/admin/users?q=alice",
        cookies: admin,
      });

      const body = response.json();
      expect(body.total).toBe(1);
      expect(body.items.map((user: { email: string }) => user.email)).toEqual([
        "alice@b.com",
      ]);
    });

    it("treats an empty q as no filter", async () => {
      const admin = await cookiesFor("admin@b.com", "admin");
      createUser(app.db, { email: "a@b.com", passwordHash: "hash" });

      const response = await app.inject({
        method: "GET",
        url: "/api/admin/users?q=",
        cookies: admin,
      });

      expect(response.json().total).toBe(2);
    });

    it("answers 400 for out-of-range pagination", async () => {
      const admin = await cookiesFor("admin@b.com", "admin");

      for (const query of ["limit=101", "limit=0", "offset=-1", "limit=abc"]) {
        const response = await app.inject({
          method: "GET",
          url: `/api/admin/users?${query}`,
          cookies: admin,
        });

        expect(response.statusCode, query).toBe(400);
        expect(response.json().error.code).toBe("validation_error");
      }
    });
  });
});
