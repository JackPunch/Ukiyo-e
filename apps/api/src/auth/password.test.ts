import { describe, expect, it } from "vitest";
import { dummyPasswordHash, hashPassword, verifyPassword } from "./password";

describe("hashPassword", () => {
  it("produces a self-describing scrypt hash", async () => {
    const hash = await hashPassword("correct horse battery staple");
    const [algorithm, n, r, p, salt, digest] = hash.split("$");

    expect(algorithm).toBe("scrypt");
    expect([n, r, p].map(Number)).toEqual([16384, 8, 1]);
    expect(salt).not.toBe("");
    expect(digest).not.toBe("");
  });

  it("never returns the plaintext", async () => {
    const hash = await hashPassword("plaintext-password");
    expect(hash).not.toContain("plaintext-password");
  });

  it("salts every hash, so the same password hashes differently", async () => {
    const [first, second] = await Promise.all([
      hashPassword("same-password"),
      hashPassword("same-password"),
    ]);

    expect(first).not.toBe(second);
  });
});

describe("verifyPassword", () => {
  it("accepts the matching password", async () => {
    const hash = await hashPassword("s3cret-password");
    await expect(verifyPassword(hash, "s3cret-password")).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("s3cret-password");
    await expect(verifyPassword(hash, "s3cret-passwerd")).resolves.toBe(false);
    await expect(verifyPassword(hash, "")).resolves.toBe(false);
  });

  it("verifies both hashes when the same password was salted twice", async () => {
    const first = await hashPassword("same-password");
    const second = await hashPassword("same-password");

    await expect(verifyPassword(first, "same-password")).resolves.toBe(true);
    await expect(verifyPassword(second, "same-password")).resolves.toBe(true);
  });

  it("returns false instead of throwing for malformed hashes", async () => {
    const malformed = [
      "",
      "not-a-hash",
      "scrypt$16384$8$1$c2FsdA==$ZGlnZXN0", // unknown digest length is fine, wrong value is not
      "bcrypt$16384$8$1$c2FsdA==$ZGlnaXQ=",
      "scrypt$0$8$1$c2FsdA==$ZGlnaXQ=",
      "scrypt$16384$0$1$c2FsdA==$ZGlnaXQ=",
      "scrypt$16384$8$1$$",
      "scrypt$99999999$8$1$c2FsdA==$ZGlnaXQ=",
      "scrypt$1048576$32$1$c2FsdA==$ZGlnaXQ=", // within the parsing bounds but beyond maxmem
    ];

    for (const hash of malformed) {
      await expect(verifyPassword(hash, "whatever")).resolves.toBe(false);
    }
  });

  it("never matches the dummy hash used for unknown emails", async () => {
    const dummy = await dummyPasswordHash();

    await expect(verifyPassword(dummy, "anything")).resolves.toBe(false);
    await expect(verifyPassword(dummy, "ukiyo-e-dummy-password")).resolves.toBe(
      true,
    );
  });

  it("memoizes the dummy hash", async () => {
    expect(await dummyPasswordHash()).toBe(await dummyPasswordHash());
  });
});
