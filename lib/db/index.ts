import "server-only";
import postgres from "postgres";
import { env } from "@/lib/env";

/**
 * Database access layer.
 *
 * Plain PostgreSQL via postgres.js — no vendor-specific API — so the same code runs on
 * Supabase today and AWS RDS/Aurora later (just change DATABASE_URL).
 *
 *  withUser(userId, fn)  → runs fn inside a transaction as the restricted role `app_user`
 *                          with app.user_id set. Row Level Security decides what is visible.
 *                          Use this for EVERYTHING done on behalf of a user.
 *  withSystem(fn, actor) → runs with the server's own privileges (RLS bypassed). Only for
 *                          auth, grading and background jobs, after explicit checks.
 */
export type Tx = postgres.TransactionSql<Record<string, never>>;

const g = globalThis as unknown as { __gcSql?: postgres.Sql };

export function db(): postgres.Sql {
  if (!g.__gcSql) {
    const e = env();
    g.__gcSql = postgres(e.DATABASE_URL, {
      max: e.DATABASE_POOL_MAX,
      prepare: false, // required for transaction-mode poolers (Supabase Supavisor, RDS Proxy, PgBouncer)
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: e.DATABASE_SSL === "true" ? "require" : false,
      transform: { column: { from: postgres.toCamel }, undefined: null },
      onnotice: () => {},
    });
  }
  return g.__gcSql;
}

export async function withUser<T>(userId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId ?? ""}, true)`;
    await tx.unsafe("set local role app_user");
    return fn(tx as unknown as Tx);
  }) as Promise<T>;
}

export async function withSystem<T>(fn: (tx: Tx) => Promise<T>, actorId?: string | null): Promise<T> {
  return db().begin(async (tx) => {
    if (actorId) await tx`select set_config('app.user_id', ${actorId}, true)`;
    return fn(tx as unknown as Tx);
  }) as Promise<T>;
}

/** Postgres error code for "insufficient privilege" (raised by our RLS guards). */
export function isPermissionError(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  return code === "42501";
}
export function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string })?.code === "23505";
}
