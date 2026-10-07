import { NextRequest, NextResponse } from "next/server";
import { publicOrigin } from "@/lib/base-url";

const SESSION_COOKIE = "timely_session";
const PROTECTED_APP_PREFIX = "/app";
const PROTECTED_API_PREFIXES = [
  "/api/clients",
  "/api/projects",
  "/api/tags",
  "/api/timer",
  "/api/entries",
  "/api/export",
];

function isProtected(pathname: string): boolean {
  if (pathname === "/app" || pathname.startsWith(`${PROTECTED_APP_PREFIX}/`)) return true;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  if (pathname === "/api/auth/me") return true;
  if (pathname === "/api/admin" || pathname.startsWith("/api/admin/")) return true;
  return PROTECTED_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Next 16 renamed the `middleware` file+export convention to `proxy`.
// The behaviour is identical: gate `/app/*` and the authenticated API tree
// on the session cookie, return 401 JSON for APIs and redirect `/app` to
// `/login` with a `?next=` return URL.
export function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const hasCookie = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (!isProtected(pathname)) return NextResponse.next();
  if (hasCookie) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
      { status: 401 },
    );
  }
  // Same bug class as the Google OAuth NXDOMAIN incident: `req.nextUrl`
  // carries the internal container hostname behind Azure's reverse proxy,
  // so cloning it leaks `e0a475862be8:3000` into the Location of every
  // unauth /app visit. Resolve the origin through `publicOrigin()` so the
  // Location stays on the configured public domain whenever NEXTAUTH_URL
  // is set, and falls back to the request's own origin for local dev.
  const target = new URL("/login", publicOrigin(req));
  target.searchParams.set("next", pathname);
  return NextResponse.redirect(target);
}

export const config = {
  matcher: ["/app/:path*", "/admin", "/admin/:path*", "/api/:path*"],
};
