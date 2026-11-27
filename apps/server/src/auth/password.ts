// The admin password: only its scrypt hash is kept, in the environment file of the server.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

/** `scrypt:<salt>:<key>`, both in hexadecimal: the value of ADMIN_PASSWORD_HASH. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString("hex")}:${scryptSync(password, salt, KEY_LENGTH).toString("hex")}`;
}

/** False for a wrong password, and for a hash that is absent or not written by `hashPassword`. */
export function verifyPassword(password: string, hash: string | null): boolean {
  const [scheme, salt, key] = (hash ?? "").split(":");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "hex");
  if (expected.length !== KEY_LENGTH) return false;
  return timingSafeEqual(scryptSync(password, Buffer.from(salt, "hex"), KEY_LENGTH), expected);
}
