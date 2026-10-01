import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, OAUTH_STATE_COOKIE, sanitiseNext } from "@/app/api/auth/google/start/route";

const ENV_SNAPSHOT = {
  id: process.env.GOOGLE_CLIENT_ID,
  secret: process.env.GOOGLE_CLIENT_SECRET,
  redirect: process.env.GOOGLE_REDIRECT_URI,
  nextauth: process.env.NEXTAUTH_URL,
};

function restoreEnv(): void {
  if (ENV_SNAPSHOT.id) process.env.GOOGLE_CLIENT_ID = ENV_SNAPSHOT.id;
  else delete process.env.GOOGLE_CLIENT_ID;
  if (ENV_SNAPSHOT.secret) process.env.GOOGLE_CLIENT_SECRET = ENV_SNAPSHOT.secret;
  else delete process.env.GOOGLE_CLIENT_SECRET;
  if (ENV_SNAPSHOT.redirect) process.env.GOOGLE_REDIRECT_URI = ENV_SNAPSHOT.redirect;
  else delete process.env.GOOGLE_REDIRECT_URI;
  if (ENV_SNAPSHOT.nextauth) process.env.NEXTAUTH_URL = ENV_SNAPSHOT.nextauth;
  else delete process.env.NEXTAUTH_URL;
}

function configure(): void {
  process.env.GOOGLE_CLIENT_ID = "test-client";
  process.env.GOOGLE_CLIENT_SECRET = "test-secret";
  process.env.GOOGLE_REDIRECT_URI = "http://test/api/auth/google/callback";
}

function parseStateCookie(setCookie: string | null): { name: string; value: string; attrs: string } {
  const raw = setCookie ?? "";
  // In Next's response the state cookie starts with "timely_oauth_state=".
  const chunk = raw
    .split(/,(?=[A-Za-z0-9_-]+=)/)
    .find((c) => c.trim().startsWith(`${OAUTH_STATE_COOKIE}=`));
  if (!chunk) throw new Error(`no ${OAUTH_STATE_COOKIE} cookie in Set-Cookie: ${raw}`);
  const [first, ...rest] = chunk.split(";");
  const [name, value] = first.split("=");
  return { name: name.trim(), value: decodeURIComponent(value ?? ""), attrs: rest.join(";") };
}

describe("GET /api/auth/google/start", () => {
  beforeEach(() => {
    configure();
  });
  afterEach(() => {
    restoreEnv();
  });

  it("sanitiseNext allows safe relative paths and defaults everything else to /app", () => {
    expect(sanitiseNext("/app")).toBe("/app");
    expect(sanitiseNext("/app/entries")).toBe("/app/entries");
    expect(sanitiseNext(null)).toBe("/app");
    expect(sanitiseNext("")).toBe("/app");
    expect(sanitiseNext("http://evil.example")).toBe("/app");
    expect(sanitiseNext("//evil.example/path")).toBe("/app");
    expect(sanitiseNext("/\\evil.example")).toBe("/app");
    expect(sanitiseNext("not-a-path")).toBe("/app");
    expect(sanitiseNext("x".repeat(2000))).toBe("/app");
  });

  it("302-redirects to Google with required OAuth params and sets a state cookie", async () => {
    const res = await GET(new Request("http://test/api/auth/google/start"));
    expect(res.status).toBe(302);
    const loc = res.headers.get("location") ?? "";
    const url = new URL(loc);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("test-client");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBeTruthy();

    const cookie = parseStateCookie(res.headers.get("set-cookie"));
    const parsed = JSON.parse(cookie.value) as { s: string; n: string };
    expect(parsed.s).toBe(url.searchParams.get("state"));
    expect(parsed.n).toBe("/app");
    expect(cookie.attrs.toLowerCase()).toContain("httponly");
    expect(cookie.attrs.toLowerCase()).toContain("samesite=lax");
    expect(cookie.attrs.toLowerCase()).toContain("path=/");
  });

  it("preserves a safe next path in the state cookie", async () => {
    const res = await GET(new Request("http://test/api/auth/google/start?next=%2Fapp%2Fentries"));
    const cookie = parseStateCookie(res.headers.get("set-cookie"));
    const parsed = JSON.parse(cookie.value) as { s: string; n: string };
    expect(parsed.n).toBe("/app/entries");
  });

  it("rewrites an unsafe next value to /app before storing it", async () => {
    const res = await GET(
      new Request("http://test/api/auth/google/start?next=https%3A%2F%2Fevil.example%2F"),
    );
    const cookie = parseStateCookie(res.headers.get("set-cookie"));
    const parsed = JSON.parse(cookie.value) as { s: string; n: string };
    expect(parsed.n).toBe("/app");
  });

  it("redirects to /login?error=network when Google env is not configured", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    const res = await GET(new Request("http://test/api/auth/google/start"));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const loc = res.headers.get("location") ?? "";
    expect(new URL(loc).pathname).toBe("/login");
    expect(new URL(loc).searchParams.get("error")).toBe("network");
  });

  it("bounces to the NEXTAUTH_URL origin on config error, never the container host", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    process.env.NEXTAUTH_URL = "https://clockinoff.reubinoff.com";
    const res = await GET(new Request("http://e0a475862be8:3000/api/auth/google/start"));
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.origin).toBe("https://clockinoff.reubinoff.com");
    expect(loc.hostname).not.toBe("e0a475862be8");
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("error")).toBe("network");
  });
});
