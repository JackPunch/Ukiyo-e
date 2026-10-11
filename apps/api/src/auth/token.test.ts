import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { resolveAuthConfig } from "./config";
import { signSessionToken, verifySessionToken } from "./token";

const SECRET = "test-secret-0123456789-0123456789-0123456789";
const config = resolveAuthConfig({ jwtSecret: SECRET }, {});

/** A token signed with a key the API does not know about. */
const otherConfig = resolveAuthConfig({ jwtSecret: "y".repeat(40) }, {});

function base64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

describe("signSessionToken / verifySessionToken", () => {
  it("round-trips the user id", async () => {
    const token = await signSessionToken(42, config);
    await expect(verifySessionToken(token, config)).resolves.toBe(42);
  });

  it("does not put the role in the token", async () => {
    const token = await signSessionToken(7, config);
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    ) as Record<string, unknown>;

    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "sub"]);
  });

  it("rejects a token signed with a different key", async () => {
    const token = await signSessionToken(42, otherConfig);
    await expect(verifySessionToken(token, config)).resolves.toBeUndefined();
  });

  it("rejects a tampered payload", async () => {
    const token = await signSessionToken(42, config);
    const [header, , signature] = token.split(".");
    const forged = `${header}.${base64Url({ sub: "1", exp: 9_999_999_999 })}.${signature}`;

    await expect(verifySessionToken(forged, config)).resolves.toBeUndefined();
  });

  it("rejects a tampered signature", async () => {
    const token = await signSessionToken(42, config);
    const [header, payload] = token.split(".");

    await expect(
      verifySessionToken(`${header}.${payload}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`, config),
    ).resolves.toBeUndefined();
  });

  it("rejects an expired token", async () => {
    const expired = await new SignJWT()
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("42")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(config.jwtSecret);

    await expect(verifySessionToken(expired, config)).resolves.toBeUndefined();
  });

  it("rejects an alg:none token", async () => {
    const token = `${base64Url({ alg: "none", typ: "JWT" })}.${base64Url({
      sub: "42",
    })}.`;

    await expect(verifySessionToken(token, config)).resolves.toBeUndefined();
  });

  it("rejects a token signed with another algorithm", async () => {
    const hs512 = await new SignJWT()
      .setProtectedHeader({ alg: "HS512" })
      .setSubject("42")
      .setExpirationTime("5m")
      .sign(config.jwtSecret);

    await expect(verifySessionToken(hs512, config)).resolves.toBeUndefined();
  });

  it("rejects garbage and non-numeric subjects", async () => {
    const nonNumeric = await new SignJWT()
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("admin")
      .setExpirationTime("5m")
      .sign(config.jwtSecret);

    await expect(verifySessionToken("not-a-jwt", config)).resolves.toBeUndefined();
    await expect(verifySessionToken("", config)).resolves.toBeUndefined();
    await expect(
      verifySessionToken(nonNumeric, config),
    ).resolves.toBeUndefined();
  });
});
