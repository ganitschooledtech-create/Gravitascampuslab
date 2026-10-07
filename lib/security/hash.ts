import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
/** Hash an IP with a secret pepper: lets us rate-limit and spot abuse without storing raw IPs. */
export const hashIp = (ip: string | null | undefined) => (ip ? sha256(`${env().HASH_PEPPER}:${ip}`).slice(0, 32) : null);
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
