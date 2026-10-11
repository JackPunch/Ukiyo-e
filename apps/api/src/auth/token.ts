import { SignJWT, jwtVerify } from "jose";
import type { AuthConfig } from "./config";

/**
 * Session JWTs carry only the user id plus timestamps. The role is deliberately
 * absent: authorization always reads the current database row, so a role change
 * takes effect immediately (docs/auth-design.md §5.3).
 */
export async function signSessionToken(
  userId: number,
  config: AuthConfig,
): Promise<string> {
  return new SignJWT()
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(config.jwtTtl)
    .sign(config.jwtSecret);
}

/**
 * Verifies a token and returns the user id it points at, or `undefined` for any
 * failure (bad signature, expired, malformed). Callers treat every failure the
 * same way — a 401 — and never tell the client which one it was.
 */
export async function verifySessionToken(
  token: string,
  config: AuthConfig,
): Promise<number | undefined> {
  try {
    // The algorithms allowlist is required: without it, `alg: none` and
    // algorithm-confusion tokens would be accepted.
    const { payload } = await jwtVerify(token, config.jwtSecret, {
      algorithms: ["HS256"],
    });

    const subject = payload.sub;
    if (typeof subject !== "string" || !/^\d+$/.test(subject)) return undefined;

    const userId = Number(subject);
    return Number.isSafeInteger(userId) && userId > 0 ? userId : undefined;
  } catch {
    return undefined;
  }
}
