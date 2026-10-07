import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Health check for uptime monitors and load balancers (AWS ALB / ECS, Vercel checks). */
export async function GET() {
  try {
    await db()`select 1`;
    return NextResponse.json({ ok: true, db: "up", at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
