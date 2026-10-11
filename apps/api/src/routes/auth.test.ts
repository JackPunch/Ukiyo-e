import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureAdminFromEnv } from "../auth/admin-bootstrap";
import { SESSION_COOKIE_NAME } from "../auth/cookie";
import { buildTestServer } from "../test-support";

const CREDENTIALS = { email: "user@example.com", password: "password1234" };

describe("auth routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestServer();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await app.close();
  });

  /** Registers a user and returns the session cookie the response carried. */
  async function registerAndGetCookie(): Promise<Record<string, string>> {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: CREDENTIALS,
    });

    expect(response.statusCode).toBe(201);
    const cookie = response.cookies.find(
      (candidate) => candidate.name === SESSION_COOKIE_NAME,
    );

    return { [SESSION_COOKIE_NAME]: cookie?.value ?? "" };
  }

  describe("POST /api/auth/register", () => {
    it("creates the user, signs them in and returns the public shape", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { ...CREDENTIALS, displayName: "Ukiyo" },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        user: expect.objectContaining({
          email: CREDENTIALS.email,
          displayName: "Ukiyo",
          role: "user",
          pointsBalance: 0,
          lastLoginAt: null,
        }),
      });
      expect(response.body).not.toContain("password");
    });

    it("issues an httpOnly, SameSite=Lax session cookie", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: CREDENTIALS,
      });

      const setCookie = String(response.headers["set-cookie"]);
      expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Lax");
      expect(setCookie).toContain("Path=/");
      expect(setCookie).toContain("Max-Age=604800");
      // TEST_AUTH sets cookieSecure: false, matching the plain-HTTP dev setup.
      expect(setCookie).not.toContain("Secure");
    });

    it("rejects a duplicate email regardless of case", async () => {
      await registerAndGetCookie();

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { ...CREDENTIALS, email: "  User@Example.com " },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ error: { code: "email_taken" } });
    });

    it("rejects invalid input with field details", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email: "not-an-email", password: "short" },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: { code: "validation_error" },
      });
      expect(response.json().error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "email" }),
          expect.objectContaining({ path: "password" }),
        ]),
      );
    });

    it("rejects a missing body", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/register",
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /api/auth/login", () => {
    it("returns the user, a cookie and stamps last_login_at", async () => {
      await registerAndGetCookie();

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: CREDENTIALS,
      });

      expect(response.statusCode).toBe(200);
      const { user } = response.json();
      expect(user).toMatchObject({ email: CREDENTIALS.email, role: "user" });
      expect(Number.isNaN(Date.parse(user.lastLoginAt))).toBe(false);
      expect(response.cookies.map((candidate) => candidate.name)).toContain(
        SESSION_COOKIE_NAME,
      );
    });

    it("answers 401 for a wrong password", async () => {
      await registerAndGetCookie();

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { ...CREDENTIALS, password: "wrong-password" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("gives the same answer for an unknown email (no account enumeration)", async () => {
      await registerAndGetCookie();

      const wrongPassword = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { ...CREDENTIALS, password: "wrong-password" },
      });
      const unknownEmail = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "nobody@example.com", password: "wrong-password" },
      });

      expect(unknownEmail.statusCode).toBe(wrongPassword.statusCode);
      expect(unknownEmail.json()).toEqual(wrongPassword.json());
      expect(unknownEmail.json()).toMatchObject({
        error: { code: "invalid_credentials" },
      });
      expect(unknownEmail.headers["set-cookie"]).toBeUndefined();
    });

    it("rejects an empty password as invalid input", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { ...CREDENTIALS, password: "" },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: { code: "validation_error" },
      });
    });
  });

  describe("GET /api/auth/me", () => {
    it("answers 401 without a session", async () => {
      const response = await app.inject({ method: "GET", url: "/api/auth/me" });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: { code: "unauthorized" } });
    });

    it("returns the signed-in user", async () => {
      const cookies = await registerAndGetCookie();

      const response = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        cookies,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        user: expect.objectContaining({ email: CREDENTIALS.email }),
      });
    });

    it("answers 401 for a tampered cookie", async () => {
      const cookies = await registerAndGetCookie();

      const response = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        cookies: { [SESSION_COOKIE_NAME]: `${cookies[SESSION_COOKIE_NAME]}x` },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("POST /api/auth/logout", () => {
    it("clears the cookie and is idempotent", async () => {
      const cookies = await registerAndGetCookie();

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        cookies,
      });
      const anonymous = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
      });

      expect(response.statusCode).toBe(204);
      expect(anonymous.statusCode).toBe(204);
      expect(String(response.headers["set-cookie"])).toContain(
        `${SESSION_COOKIE_NAME}=;`,
      );
    });

    it("does not invalidate the token server-side", async () => {
      const cookies = await registerAndGetCookie();
      await app.inject({ method: "POST", url: "/api/auth/logout", cookies });

      // Documented limitation: the token stays valid until it expires
      // (docs/auth-design.md §12.1). Clearing the cookie is all logout does.
      const response = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        cookies,
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("admin bootstrap", () => {
    it("creates the admin from the environment and can sign in", async () => {
      vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
      vi.stubEnv("ADMIN_PASSWORD", "admin-password");
      const bootstrapped = await buildTestServer();

      const response = await bootstrapped.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "admin@example.com", password: "admin-password" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().user.role).toBe("admin");
      await bootstrapped.close();
    });

    it("promotes an existing account without resetting its password", async () => {
      await registerAndGetCookie();

      await ensureAdminFromEnv(app.db, app.log, {
        ADMIN_EMAIL: " USER@example.com ",
        ADMIN_PASSWORD: "totally-different",
      });

      const promoted = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: CREDENTIALS,
      });
      const withEnvPassword = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { ...CREDENTIALS, password: "totally-different" },
      });

      expect(promoted.statusCode).toBe(200);
      expect(promoted.json().user.role).toBe("admin");
      expect(withEnvPassword.statusCode).toBe(401);
    });

    it("skips a missing account instead of failing startup", async () => {
      await expect(
        ensureAdminFromEnv(app.db, app.log, {
          ADMIN_EMAIL: "nobody@example.com",
        }),
      ).resolves.toBeUndefined();

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "nobody@example.com", password: "password1234" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("refuses to create an admin with too short a password", async () => {
      await ensureAdminFromEnv(app.db, app.log, {
        ADMIN_EMAIL: "weak@example.com",
        ADMIN_PASSWORD: "short",
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "weak@example.com", password: "short" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("does nothing when ADMIN_EMAIL is unset", async () => {
      await expect(
        ensureAdminFromEnv(app.db, app.log, {}),
      ).resolves.toBeUndefined();
    });
  });
});
