import { describe, expect, it } from "vitest";
import { resolveAuthConfig } from "./config";

describe("parseDurationSeconds", () => {
  it.each([
    ["45s", 45],
    ["30m", 1800],
    ["12h", 43200],
    ["7d", 604800],
    ["45", 45],
  ])("parses %s into %i seconds", (input, expected) => {
    const config = resolveAuthConfig(
      { jwtSecret: "x".repeat(32), jwtTtl: input },
      {},
    );

    expect(config.jwtTtlSeconds).toBe(expected);
    expect(config.jwtTtl).toBe(input);
  });

  it.each(["", "7 days", "0d", "-1h", "1w"])(
    "rejects the invalid TTL %j",
    (ttl) => {
      expect(() =>
        resolveAuthConfig({ jwtSecret: "x".repeat(32), jwtTtl: ttl }, {}),
      ).toThrow(/JWT_TTL/);
    },
  );
});

describe("resolveAuthConfig", () => {
  it("refuses to start without a JWT_SECRET", () => {
    expect(() => resolveAuthConfig({}, {})).toThrow(/JWT_SECRET/);
  });

  it("refuses a secret below the minimum length", () => {
    expect(() => resolveAuthConfig({ jwtSecret: "too-short" }, {})).toThrow(
      /JWT_SECRET/,
    );
  });

  it("prefers explicit input over the environment", () => {
    const config = resolveAuthConfig(
      { jwtSecret: "a".repeat(32) },
      { JWT_SECRET: "b".repeat(32), JWT_TTL: "1h" },
    );

    expect(new TextDecoder().decode(config.jwtSecret)).toBe("a".repeat(32));
  });

  it("defaults the TTL to 7 days", () => {
    expect(resolveAuthConfig({ jwtSecret: "x".repeat(32) }, {}).jwtTtl).toBe(
      "7d",
    );
  });

  it("treats the cookie as insecure outside production", () => {
    const config = resolveAuthConfig(
      { jwtSecret: "x".repeat(32) },
      { NODE_ENV: "development" },
    );

    expect(config.cookieSecure).toBe(false);
  });

  it("defaults the cookie to Secure in production", () => {
    const config = resolveAuthConfig(
      { jwtSecret: "x".repeat(32) },
      { NODE_ENV: "production" },
    );

    expect(config.cookieSecure).toBe(true);
  });

  it("lets COOKIE_SECURE override the environment default", () => {
    const config = resolveAuthConfig(
      { jwtSecret: "x".repeat(32) },
      { NODE_ENV: "production", COOKIE_SECURE: "false" },
    );

    expect(config.cookieSecure).toBe(false);
  });
});
