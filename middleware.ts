// Security headers (clickjacking + MIME sniffing). Shell pages, /pay,
// and /privacy are never framed: frame-ancestors 'self'. Deliberate
// exceptions: /widget and /staff/embed MUST be frameable (that is their
// purpose — guest chat + dashboard iframe), and their gates are the
// signed token + origin binding, not headers (stated in README's
// honest limits). API routes get no-store + nosniff (no cacheable or
// sniffable responses anywhere on those paths).

import { NextRequest, NextResponse } from "next/server";

const FRAMEABLE = ["/widget", "/staff/embed"];

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const path = req.nextUrl.pathname;
  if (path.startsWith("/api/")) {
    res.headers.set("X-Content-Type-Options", "nosniff");
    res.headers.set("Cache-Control", "no-store");
    return res;
  }
  if (!FRAMEABLE.some((p) => path === p || path.startsWith(p + "/"))) {
    res.headers.set("Content-Security-Policy", "frame-ancestors 'self'");
    res.headers.set("X-Frame-Options", "SAMEORIGIN");
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/).*)"],
};
