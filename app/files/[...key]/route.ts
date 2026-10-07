import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { ALLOWED_UPLOADS, readLocal, signedUrl } from "@/lib/storage";

const MIME_BY_EXT = Object.fromEntries(Object.entries(ALLOWED_UPLOADS).map(([m, e]) => [e, m]));

/**
 * Serves stored files.
 *  media/…        → lesson/website media: anyone with the link
 *  submissions/…  → only the learner who uploaded it, or staff allowed (by RLS) to see that submission
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  if (!/^(media|submissions)\/[\w\-./]+$/.test(key) || key.includes("..")) return new NextResponse("Not found", { status: 404 });
  if (key.startsWith("submissions/")) {
    const user = await getSessionUser();
    if (!user) return new NextResponse("Not found", { status: 404 });
    const visible = await withUser(user.id, async (tx) => (await tx`select 1 from app.submissions where file_key = ${key} limit 1`).length > 0);
    if (!visible) return new NextResponse("Not found", { status: 404 });
  }
  const url = await signedUrl(key, 300);
  if (url) return NextResponse.redirect(url, 302);
  try {
    const body = await readLocal(key);
    const ext = key.split(".").pop() ?? "";
    const type = MIME_BY_EXT[ext] ?? "application/octet-stream";
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": type,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
        "Content-Disposition": type.startsWith("image/") || type === "application/pdf" || type === "video/mp4" ? "inline" : "attachment",
        "Cache-Control": key.startsWith("media/") ? "public, max-age=31536000, immutable" : "private, no-store",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
