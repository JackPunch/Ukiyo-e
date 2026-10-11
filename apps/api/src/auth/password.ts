import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Password hashing with `node:crypto`'s scrypt — no native module, no
 * third-party dependency.
 *
 * Stored format: `scrypt$<N>$<r>$<p>$<saltBase64>$<hashBase64>`
 * The parameters live inside the string, so changing the defaults later does
 * not invalidate existing hashes. See docs/auth-design.md §3.
 */
const ALGORITHM = "scrypt";
/** ~16 MiB of memory per hash, roughly 50-100 ms on typical hardware. */
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
/**
 * Node caps scrypt at 32 MiB by default, which `N=16384, r=8` only just fits
 * under. Set it explicitly so raising N later fails loudly instead of at
 * runtime.
 */
const MAX_MEM = 64 * 1024 * 1024;

/** Bounds when parsing a stored hash: a corrupted string must not buy a huge computation. */
const MAX_N = 1 << 20;
const MAX_R = 32;
const MAX_P = 16;

interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

function derive(
  password: string,
  salt: Buffer,
  keyLength: number,
  params: ScryptParams,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      keyLength,
      { ...params, maxmem: MAX_MEM },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

function toPositiveInt(value: string): number | undefined {
  return /^\d+$/.test(value) ? Number(value) : undefined;
}

/** Hashes a plaintext password into the self-describing format above. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await derive(password, salt, KEY_LENGTH, { N, r: R, p: P });

  return [
    ALGORITHM,
    N,
    R,
    P,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * Verifies a password against a stored hash. Any structural problem (unknown
 * algorithm, malformed numbers, out-of-range parameters) is reported as a
 * failed match rather than an exception, so a damaged row cannot turn a login
 * into a 500.
 */
export async function verifyPassword(
  storedHash: string,
  password: string,
): Promise<boolean> {
  const parts = storedHash.split("$");
  if (parts.length !== 6) return false;

  const [algorithm, nText, rText, pText, saltText, hashText] = parts;
  if (algorithm !== ALGORITHM) return false;

  const n = toPositiveInt(nText);
  const r = toPositiveInt(rText);
  const p = toPositiveInt(pText);
  if (n === undefined || n < 2 || n > MAX_N) return false;
  if (r === undefined || r < 1 || r > MAX_R) return false;
  if (p === undefined || p < 1 || p > MAX_P) return false;
  // scrypt needs 128 * N * r bytes; refuse anything beyond what we allow.
  if (128 * n * r > MAX_MEM) return false;

  const salt = Buffer.from(saltText, "base64");
  const expected = Buffer.from(hashText, "base64");
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const actual = await derive(password, salt, expected.length, { N: n, r, p });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * A hash of a fixed throwaway password. Login verifies against this when the
 * email is unknown, so "no such user" and "wrong password" take comparable time
 * (see docs/auth-design.md §6.3).
 */
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword("ukiyo-e-dummy-password");
  return dummyHash;
}
