import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
// Next 16 renamed the convention to `proxy`; the function has the same
// signature and the same behaviour, so these tests exercise it directly.
import { proxy as middleware } from "@/proxy";

const SNAPSHOT = { nextauth: process.env.NEXTAUTH_URL };

function restoreEnv(): void {
  if (SNAPSHOT.nextauth === undefined) delete process.env.NEXTAUTH_URL;
  else process.env.NEXTAUTH_URL = SNAPSHOT.nextauth;
}

function nextRequest(url: string): NextRequest {
  return new NextRequest(new Request(url, { method: "GET" }));
}

describe("middleware /app guard", () => {
  beforeEach(() => {
    delete process.env.NEXTAUTH_URL;
  });
  afterEach(restoreEnv);

  it("sends an unauth /app visit to the public /login when NEXTAUTH_URL is set, never to the container hostname", () => {
    // Same bug class as the Google OAuth callback NXDOMAIN: behind Azure's
    // proxy, `req.nextUrl` carries the container hostname, which the
    // browser can't resolve.
    process.env.NEXTAUTH_URL = "https://clockinoff.reubinoff.com";
    const res = middleware(nextRequest("http://e0a475862be8:3000/app/entries"));
    const loc = res.headers.get("location") ?? "";
    expect(loc).not.toContain("e0a475862be8");
    const parsed = new URL(loc);
    expect(parsed.origin).toBe("https://clockinoff.reubinoff.com");
    expect(parsed.pathname).toBe("/login");
    expect(parsed.searchParams.get("next")).toBe("/app/entries");
  });

  it("falls back to the request origin when NEXTAUTH_URL is unset (local dev)", () => {
    const res = middleware(nextRequest("http://localhost:3000/app"));
    const parsed = new URL(res.headers.get("location") ?? "");
    expect(parsed.origin).toBe("http://localhost:3000");
    expect(parsed.pathname).toBe("/login");
    expect(parsed.searchParams.get("next")).toBe("/app");
  });

  it("returns 401 JSON for unauth protected API routes instead of redirecting", () => {
    const res = middleware(nextRequest("http://e0a475862be8:3000/api/entries"));
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
  });

  it("lets public paths through without a redirect", () => {
    const res = middleware(nextRequest("http://e0a475862be8:3000/login"));
    expect(res.headers.get("location")).toBeNull();
  });
});
