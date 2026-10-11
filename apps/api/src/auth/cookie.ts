import type { FastifyReply } from "fastify";
import type { AuthConfig } from "./config";

export const SESSION_COOKIE_NAME = "ukiyo_session";

/**
 * Attributes shared by every session cookie. `httpOnly` keeps the token out of
 * reach of scripts, and `SameSite=Lax` stops cross-site POSTs from carrying it
 * (docs/auth-design.md §12.2). `Secure` and `Max-Age` come from the config.
 */
const BASE_OPTIONS = {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
} as const;

/**
 * Issues the session cookie. `Max-Age` is derived from the same lifetime as the
 * token, so the cookie never outlives (or dies before) the JWT inside it.
 */
export function setSessionCookie(
  reply: FastifyReply,
  token: string,
  config: AuthConfig,
): void {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    ...BASE_OPTIONS,
    secure: config.cookieSecure,
    maxAge: config.jwtTtlSeconds,
  });
}

/** Clears the session cookie; logout is idempotent and needs no server state. */
export function clearSessionCookie(
  reply: FastifyReply,
  config: AuthConfig,
): void {
  reply.clearCookie(SESSION_COOKIE_NAME, {
    ...BASE_OPTIONS,
    secure: config.cookieSecure,
  });
}
