import "server-only";
import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended argon2id parameters (19 MiB, 2 iterations).
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2 /* argon2id */ } as const;

export const hashSecret = (plain: string) => hash(plain, OPTS);
export async function verifySecret(hashStr: string | null | undefined, plain: string) {
  if (!hashStr) {
    // Spend similar time so attackers cannot detect unknown accounts by timing.
    await hash(plain, OPTS);
    return false;
  }
  try {
    return await verify(hashStr, plain);
  } catch {
    return false;
  }
}

export const PASSWORD_RULES = "At least 10 characters, with letters and numbers.";
export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return "Password must be at least 10 characters.";
  if (pw.length > 200) return "Password is too long.";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "Password must contain letters and numbers.";
  return null;
}
export const isValidPin = (pin: string) => /^\d{6}$/.test(pin);
