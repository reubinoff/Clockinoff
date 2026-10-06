import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/auth/google/start/route";
import { OAUTH_STATE_COOKIE, parseOAuthState, sanitiseNext } from "@/lib/oauth-next";

const ENV_SNAPSHOT = {
  id: process.env.GOOGLE_CLIENT_ID,
  secret: process.env.GOOGLE_CLIENT_SECRET,
  redirect: process.env.GOOGLE_REDIRECT_URI,
  nextauth: process.env.NEXTAUTH_URL,
  oauthState: process.env.OAUTH_STATE_SECRET,
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
  if (ENV_SNAPSHOT.oauthState) process.env.OAUTH_STATE_SECRET = ENV_SNAPSHOT.oauthState;
  else delete process.env.OAUTH_STATE_SECRET;
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
    expect(sanitiseNext("/\t/evil")).toBe("/app");
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
    const parsed = parseOAuthState(cookie.value);
    expect(parsed?.s).toBe(url.searchParams.get("state"));
    expect(parsed?.n).toBe("/app");
    expect(cookie.value.startsWith("{")).toBe(false);
    expect(cookie.attrs.toLowerCase()).toContain("httponly");
    expect(cookie.attrs.toLowerCase()).toContain("samesite=lax");
    expect(cookie.attrs.toLowerCase()).toContain("path=/");
  });

  it("preserves a safe next path in the state cookie", async () => {
    const res = await GET(new Request("http://test/api/auth/google/start?next=%2Fapp%2Fentries"));
    const cookie = parseStateCookie(res.headers.get("set-cookie"));
    const parsed = parseOAuthState(cookie.value);
    expect(parsed?.n).toBe("/app/entries");
  });

  it("stores connect intent in the state cookie when a session is present", async () => {
    const { createSession } = await import("@/server/auth/session");
    const { register } = await import("@/server/auth/service");
    const { truncateAll } = await import("../setup");
    await truncateAll();
    const { user } = await register({
      email: "connect@example.com",
      password: "correct-horse-battery",
    });
    const session = await createSession(user.id);
    const res = await GET(
      new Request("http://test/api/auth/google/start?intent=connect", {
        headers: { cookie: `timely_session=${session.id}` },
      }),
    );
    expect(res.status).toBe(302);
    const cookie = parseStateCookie(res.headers.get("set-cookie"));
    const parsed = parseOAuthState(cookie.value);
    expect(parsed).toMatchObject({ i: "connect", n: "/app/account", uid: user.id });
  });

  it("bounces connect-without-session to /login?next=/app/account", async () => {
    const res = await GET(new Request("http://test/api/auth/google/start?intent=connect"));
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("next")).toBe("/app/account");
  });

  it("bounces connect config failure to /app/account?error=network", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    const { createSession } = await import("@/server/auth/session");
    const { register } = await import("@/server/auth/service");
    const { truncateAll } = await import("../setup");
    await truncateAll();
    const { user } = await register({
      email: "noconfig@example.com",
      password: "correct-horse-battery",
    });
    const session = await createSession(user.id);
    const res = await GET(
      new Request("http://test/api/auth/google/start?intent=connect", {
        headers: { cookie: `timely_session=${session.id}` },
      }),
    );
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.pathname).toBe("/app/account");
    expect(loc.searchParams.get("error")).toBe("network");
  });

  it("rewrites an unsafe next value to /app before storing it", async () => {
    const res = await GET(
      new Request("http://test/api/auth/google/start?next=https%3A%2F%2Fevil.example%2F"),
    );
    const cookie = parseStateCookie(res.headers.get("set-cookie"));
    const parsed = parseOAuthState(cookie.value);
    expect(parsed?.n).toBe("/app");
  });

  it("rewrites a control-char next payload to /app before storing it", async () => {
    const res = await GET(
      new Request("http://test/api/auth/google/start?next=%2F%09%2Fevil.example"),
    );
    const cookie = parseStateCookie(res.headers.get("set-cookie"));
    const parsed = parseOAuthState(cookie.value);
    expect(parsed?.n).toBe("/app");
  });

  it("bounces to /login?error=unavailable when OAUTH_STATE_SECRET is missing", async () => {
    delete process.env.OAUTH_STATE_SECRET;
    const res = await GET(new Request("http://test/api/auth/google/start"));
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("error")).toBe("unavailable");
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
