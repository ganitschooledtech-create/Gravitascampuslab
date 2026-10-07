import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { withSystem } from "@/lib/db";
import { isProd } from "@/lib/env";
import { hashIp, randomToken, sha256 } from "@/lib/security/hash";
import type { Assignment } from "@/lib/permissions";

export const SESSION_COOKIE = "gc_session";

export type SessionUser = {
  id: string;
  sessionId: string;
  loginKind: "email" | "school_pin";
  email: string | null;
  firstName: string;
  lastName: string;
  displayName: string | null;
  locale: "en" | "kn";
  school: { id: string; name: string; code: string; username: string; class: string | null; section: string | null } | null;
  assignments: Assignment[];
};

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

/** Creates a session row and sets the httpOnly cookie. Only the SHA-256 of the token is stored. */
export async function createSession(userId: string, kind: "email" | "school_pin") {
  const token = randomToken(32);
  // School learners use shared lab computers → shorter sessions.
  const hours = kind === "school_pin" ? 8 : 24 * 14;
  const expires = new Date(Date.now() + hours * 3600_000);
  const h = await headers();
  const ip = await clientIp();
  await withSystem(async (tx) => {
    await tx`insert into app.sessions (user_id, token_hash, expires_at, ip_hash, user_agent)
             values (${userId}, ${sha256(token)}, ${expires}, ${hashIp(ip)}, ${h.get("user-agent")?.slice(0, 300) ?? null})`;
    await tx`update app.users set last_login_at = now(), failed_login_count = 0, locked_until = null where id = ${userId}`;
  }, userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    expires,
  });
}

/** Reads the current session once per request (React cache). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  return withSystem(async (tx) => {
    const [row] = await tx`
      select s.id as session_id, s.last_seen_at, u.id, u.login_kind, u.email, u.first_name, u.last_name,
             u.display_name, u.locale,
             sl.school_id, sl.username, sl.class, sl.section, sc.name as school_name, sc.code as school_code, sc.active as school_active
        from app.sessions s
        join app.users u on u.id = s.user_id
        left join app.school_learners sl on sl.user_id = u.id
        left join app.schools sc on sc.id = sl.school_id
       where s.token_hash = ${sha256(token)} and s.revoked_at is null and s.expires_at > now() and u.status = 'active'`;
    if (!row) return null;
    if (row.schoolId && !row.schoolActive) return null;
    if (Date.now() - new Date(row.lastSeenAt).getTime() > 5 * 60_000) {
      await tx`update app.sessions set last_seen_at = now() where id = ${row.sessionId}`;
    }
    const assignments = await tx<Assignment[]>`
      select ra.program_id, ra.school_id, ra.cohort_id, ra.event_id,
             coalesce(array_agg(rp.permission_key) filter (where rp.permission_key is not null), '{}') as permissions
        from app.role_assignments ra
        left join app.role_permissions rp on rp.role_id = ra.role_id
       where ra.user_id = ${row.id}
       group by ra.id`;
    return {
      id: row.id,
      sessionId: row.sessionId,
      loginKind: row.loginKind,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      displayName: row.displayName,
      locale: row.locale,
      school: row.schoolId
        ? { id: row.schoolId, name: row.schoolName, code: row.schoolCode, username: row.username, class: row.class, section: row.section }
        : null,
      assignments: assignments.map((a) => ({ ...a, permissions: a.permissions ?? [] })),
    } satisfies SessionUser;
  });
});

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await withSystem((tx) => tx`update app.sessions set revoked_at = now() where token_hash = ${sha256(token)}`);
  }
  jar.delete(SESSION_COOKIE);
}

export async function revokeAllSessions(userId: string) {
  await withSystem((tx) => tx`update app.sessions set revoked_at = now() where user_id = ${userId} and revoked_at is null`);
}
