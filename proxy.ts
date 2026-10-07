import { NextResponse, type NextRequest } from "next/server";

/**
 * Fast first gate: no session cookie → send to login. The real session check
 * (database lookup) happens in the server layouts, so a forged cookie gets nowhere.
 */
export function proxy(req: NextRequest) {
  const has = req.cookies.has("gc_session");
  if (!has) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

export const config = { matcher: ["/learn/:path*", "/studio/:path*"] };
