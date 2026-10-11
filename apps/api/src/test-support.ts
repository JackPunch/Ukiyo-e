import type { FastifyInstance } from "fastify";
import { buildServer } from "./server";

/**
 * Tests do not load `.env`, so the required auth config is passed explicitly.
 * Values still go through the same validation as in production.
 */
export const TEST_AUTH = {
  jwtSecret: "test-secret-0123456789-0123456789-0123456789",
  cookieSecure: false,
};

/** A server on an isolated in-memory database, ready for `app.inject()`. */
export function buildTestServer(): Promise<FastifyInstance> {
  return buildServer({ databaseUrl: ":memory:", auth: TEST_AUTH });
}
