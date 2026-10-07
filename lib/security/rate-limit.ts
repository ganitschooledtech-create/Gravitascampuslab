import "server-only";
import { withSystem } from "@/lib/db";

/**
 * Fixed-window rate limiter backed by Postgres (no Redis needed at our scale).
 * Returns { ok:false, retryAfterSec } when the limit is exceeded.
 */
export async function rateLimit(key: string, limit: number, windowSec: number) {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / (windowSec * 1000)) * windowSec * 1000);
  const [row] = await withSystem(
    (tx) => tx<{ count: number }[]>`
      insert into app.rate_limits (key, window_start, count) values (${key}, ${windowStart}, 1)
      on conflict (key, window_start) do update set count = app.rate_limits.count + 1
      returning count`,
  );
  const ok = row.count <= limit;
  const retryAfterSec = Math.ceil((windowStart.getTime() + windowSec * 1000 - now) / 1000);
  return { ok, remaining: Math.max(0, limit - row.count), retryAfterSec };
}
