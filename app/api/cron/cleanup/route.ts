import { NextResponse, type NextRequest } from "next/server";
import { withSystem } from "@/lib/db";
import { safeEqual } from "@/lib/security/hash";

/**
 * Nightly housekeeping (data minimisation): removes expired sessions/tokens, old rate-limit
 * counters and login attempts older than the retention setting.
 * Called by Vercel Cron (vercel.json) or AWS EventBridge with  Authorization: Bearer $CRON_SECRET
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new NextResponse("Unauthorized", { status: 401 });
  const result = await withSystem(async (tx) => {
    const [ret] = await tx`select coalesce((value->>'login_attempts_days')::int, 90) as days from app.settings where key = 'retention'`;
    const days = ret?.days ?? 90;
    const s = await tx`delete from app.sessions where expires_at < now() - interval '7 days' or revoked_at < now() - interval '7 days'`;
    const t = await tx`delete from app.auth_tokens where expires_at < now() - interval '1 day'`;
    const r = await tx`delete from app.rate_limits where window_start < now() - interval '1 day'`;
    const l = await tx`delete from app.login_attempts where at < now() - make_interval(days => ${days})`;
    await tx`select app.audit('cleanup', null, null, ${tx.json({ sessions: s.count, tokens: t.count, rateLimits: r.count, loginAttempts: l.count })})`;
    return { sessions: s.count, tokens: t.count, rateLimits: r.count, loginAttempts: l.count };
  });
  return NextResponse.json({ ok: true, removed: result });
}
