/**
 * Auth configuration, resolved once at startup by `buildServer`.
 * See docs/auth-design.md §8.
 */
export interface AuthConfigInput {
  jwtSecret?: string;
  jwtTtl?: string;
  cookieSecure?: boolean;
}

export interface AuthConfig {
  /** HS256 signing key (already encoded to bytes). */
  jwtSecret: Uint8Array;
  /** Token lifetime, e.g. `7d`. */
  jwtTtl: string;
  /** The same lifetime in seconds — the session cookie's `Max-Age` source. */
  jwtTtlSeconds: number;
  /** Whether the session cookie carries the `Secure` attribute. */
  cookieSecure: boolean;
}

declare module "fastify" {
  interface FastifyInstance {
    authConfig: AuthConfig;
  }
}

/**
 * Minimum key length. A missing or short key makes the process fail at startup
 * instead of silently falling back to a value anyone could have signed a token
 * with.
 */
export const MIN_JWT_SECRET_LENGTH = 32;

const DEFAULT_JWT_TTL = "7d";
const DURATION_PATTERN = /^(\d+)([smhd])?$/;
const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86400 } as const;

/**
 * Parses `7d` / `12h` / `30m` / `45s` / `45` (seconds) into seconds. Invalid
 * values throw, so a typo in `JWT_TTL` is caught at startup rather than
 * producing a cookie whose lifetime disagrees with the token's.
 */
export function parseDurationSeconds(value: string): number {
  const match = DURATION_PATTERN.exec(value);
  if (!match) {
    throw new Error(
      `JWT_TTL 取值不合法：${value}（示例：45s / 30m / 12h / 7d）`,
    );
  }

  const [, amount, unit] = match;
  const seconds =
    Number(amount) * UNIT_SECONDS[(unit ?? "s") as keyof typeof UNIT_SECONDS];
  if (seconds <= 0) {
    throw new Error(`JWT_TTL 必须大于 0：${value}`);
  }

  return seconds;
}

/**
 * `COOKIE_SECURE` wins when set; otherwise HTTPS is assumed in production only.
 * The local Docker compose deployment is plain HTTP, so it sets this to false.
 */
function resolveCookieSecure(env: NodeJS.ProcessEnv): boolean {
  if (env.COOKIE_SECURE !== undefined) return env.COOKIE_SECURE === "true";
  return env.NODE_ENV === "production";
}

/** Explicit input (tests) wins over the environment; both are validated. */
export function resolveAuthConfig(
  input: AuthConfigInput = {},
  env: NodeJS.ProcessEnv = process.env,
): AuthConfig {
  const secret = input.jwtSecret ?? env.JWT_SECRET;
  if (!secret || secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET 缺失或过短：至少需要 ${MIN_JWT_SECRET_LENGTH} 个字符（生成示例：openssl rand -base64 48）`,
    );
  }

  const jwtTtl = input.jwtTtl ?? env.JWT_TTL ?? DEFAULT_JWT_TTL;

  return {
    jwtSecret: new TextEncoder().encode(secret),
    jwtTtl,
    jwtTtlSeconds: parseDurationSeconds(jwtTtl),
    cookieSecure: input.cookieSecure ?? resolveCookieSecure(env),
  };
}
