import { NextRequest, NextResponse } from "next/server";

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
  if (pathname === "/api/auth/me") return true;
  return PROTECTED_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(req: NextRequest): NextResponse {
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
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/app/:path*", "/api/:path*"],
};
