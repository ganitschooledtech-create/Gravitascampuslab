import "server-only";
import { withSystem } from "@/lib/db";
import { hashIp, randomToken, sha256 } from "@/lib/security/hash";
import { rateLimit } from "@/lib/security/rate-limit";
import { hashSecret, isValidPin, passwordProblem, verifySecret } from "./password";

/**
 * Authentication rules (no cookies here, so this file is unit-testable):
 *  - Per-IP rate limit on all login attempts.
 *  - Per-account lockout after N failures (PIN: 5 → 15 min; password: 8 → 15 min).
 *  - Same generic error for "unknown user" and "wrong secret" (no account probing).
 *  - Every attempt is recorded in app.login_attempts.
 */
type LoginResult = { ok: true; userId: string } | { ok: false; error: string };

type SecuritySettings = { pin_max_attempts: number; pin_lockout_minutes: number; password_max_attempts: number; password_lockout_minutes: number };

async function securitySettings(): Promise<SecuritySettings> {
  const [row] = await withSystem((tx) => tx`select value from app.settings where key = 'security'`);
  return { pin_max_attempts: 5, pin_lockout_minutes: 15, password_max_attempts: 8, password_lockout_minutes: 15, ...(row?.value ?? {}) };
}

async function record(identifier: string, success: boolean, ip: string | null, reason?: string) {
  await withSystem((tx) => tx`insert into app.login_attempts (identifier, success, ip_hash, reason) values (${identifier}, ${success}, ${hashIp(ip)}, ${reason ?? null})`);
}

async function registerFailure(userId: string, max: number, lockMinutes: number) {
  await withSystem((tx) => tx`
    update app.users
       set failed_login_count = case when failed_login_count + 1 >= ${max} then 0 else failed_login_count + 1 end,
           locked_until = case when failed_login_count + 1 >= ${max} then now() + make_interval(mins => ${lockMinutes}) else locked_until end
     where id = ${userId}`);
}

async function ipLimited(ip: string | null) {
  const r = await rateLimit(`login:${hashIp(ip) ?? "unknown"}`, 40, 15 * 60);
  return !r.ok;
}

export async function loginWithPassword(emailRaw: string, password: string, ip: string | null): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase();
  const generic = "Email or password is incorrect.";
  if (!email || !password || password.length > 200) return { ok: false, error: generic };
  if (await ipLimited(ip)) return { ok: false, error: "Too many attempts from this network. Please wait a few minutes." };
  const s = await securitySettings();
  const [u] = await withSystem((tx) => tx`
    select id, password_hash, status, locked_until from app.users where email = ${email} and login_kind = 'email'`);
  if (u?.lockedUntil && new Date(u.lockedUntil) > new Date()) {
    await record(email, false, ip, "locked");
    return { ok: false, error: "This account is temporarily locked after too many attempts. Try again later or reset your password." };
  }
  const valid = await verifySecret(u?.passwordHash, password);
  if (!u || !valid || u.status !== "active") {
    if (u && !valid) await registerFailure(u.id, s.password_max_attempts, s.password_lockout_minutes);
    await record(email, false, ip, !u ? "unknown" : u.status !== "active" ? "inactive" : "bad_password");
    return { ok: false, error: generic };
  }
  await record(email, true, ip);
  return { ok: true, userId: u.id };
}

export async function loginWithPin(schoolCodeRaw: string, usernameRaw: string, pin: string, ip: string | null): Promise<LoginResult> {
  const code = schoolCodeRaw.trim().toUpperCase();
  const username = usernameRaw.trim().toLowerCase();
  const identifier = `${code}/${username}`;
  const generic = "School code, username or PIN is incorrect.";
  if (!code || !username || !isValidPin(pin)) return { ok: false, error: generic };
  if (await ipLimited(ip)) return { ok: false, error: "Too many attempts from this computer. Please wait a few minutes or ask your trainer." };
  const s = await securitySettings();
  const [u] = await withSystem((tx) => tx`
    select u.id, u.password_hash, u.status, u.locked_until
      from app.schools sc
      join app.school_learners sl on sl.school_id = sc.id
      join app.users u on u.id = sl.user_id
     where sc.code = ${code} and sc.active and sl.username = ${username}`);
  if (u?.lockedUntil && new Date(u.lockedUntil) > new Date()) {
    await record(identifier, false, ip, "locked");
    return { ok: false, error: "Too many wrong PINs. Ask your trainer to unlock your account, or wait 15 minutes." };
  }
  const valid = await verifySecret(u?.passwordHash, pin);
  if (!u || !valid || u.status !== "active") {
    if (u && !valid) await registerFailure(u.id, s.pin_max_attempts, s.pin_lockout_minutes);
    await record(identifier, false, ip, !u ? "unknown" : u.status !== "active" ? "inactive" : "bad_pin");
    return { ok: false, error: generic };
  }
  await record(identifier, true, ip);
  return { ok: true, userId: u.id };
}

/** Creates a one-time token (magic link / password reset). Returns null if no such active email user. */
export async function createAuthToken(emailRaw: string, purpose: "magic_link" | "password_reset", ttlMinutes: number) {
  const email = emailRaw.trim().toLowerCase();
  const [u] = await withSystem((tx) => tx`select id, first_name from app.users where email = ${email} and login_kind = 'email' and status = 'active'`);
  if (!u) return null;
  const token = randomToken(32);
  await withSystem(async (tx) => {
    await tx`update app.auth_tokens set used_at = now() where user_id = ${u.id} and purpose = ${purpose} and used_at is null`;
    await tx`insert into app.auth_tokens (user_id, purpose, token_hash, expires_at)
             values (${u.id}, ${purpose}, ${sha256(token)}, now() + make_interval(mins => ${ttlMinutes}))`;
  });
  return { token, userId: u.id as string, firstName: u.firstName as string };
}

/** Consumes a token atomically (single use). */
export async function consumeAuthToken(token: string, purpose: "magic_link" | "password_reset"): Promise<string | null> {
  if (!token || token.length > 100) return null;
  const [row] = await withSystem((tx) => tx`
    update app.auth_tokens set used_at = now()
     where token_hash = ${sha256(token)} and purpose = ${purpose} and used_at is null and expires_at > now()
     returning user_id`);
  if (!row) return null;
  if (purpose === "magic_link") {
    await withSystem((tx) => tx`update app.users set email_verified_at = coalesce(email_verified_at, now()) where id = ${row.userId}`);
  }
  return row.userId;
}

export async function setPassword(userId: string, newPassword: string, actorId?: string) {
  const problem = passwordProblem(newPassword);
  if (problem) throw new Error(problem);
  const h = await hashSecret(newPassword);
  await withSystem(async (tx) => {
    await tx`update app.users set password_hash = ${h}, failed_login_count = 0, locked_until = null where id = ${userId} and login_kind = 'email'`;
    await tx`update app.sessions set revoked_at = now() where user_id = ${userId} and revoked_at is null`;
    await tx`select app.audit('password_set', 'users', ${userId}, null)`;
  }, actorId ?? userId);
}

/** Random 6-digit PIN without trivially guessable patterns. */
export function generatePin(): string {
  const bad = /^(\d)\1{5}$|^(012345|123456|234567|345678|456789|987654|876543|765432|654321|543210)$/;
  for (;;) {
    const n = (crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).toString().padStart(6, "0");
    if (!bad.test(n)) return n;
  }
}
