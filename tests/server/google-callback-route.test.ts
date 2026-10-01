import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/auth/google/callback/route";
import { register } from "@/server/auth/service";
import { getSessionUser, SESSION_COOKIE } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { truncateAll } from "../setup";

const CLIENT_ID = "test-client";

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function makeIdToken(overrides: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: "google|user-1",
    email: "a@example.com",
    email_verified: true,
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    exp: now + 300,
    ...overrides,
  };
  return `${b64url({ alg: "RS256" })}.${b64url(payload)}.signature`;
}

function stateCookie(state: string, next = "/app"): string {
  const value = encodeURIComponent(JSON.stringify({ s: state, n: next }));
  return `timely_oauth_state=${value}`;
}

function callbackRequest(opts: {
  code?: string | null;
  state?: string | null;
  cookie?: string;
  errorParam?: string;
}): Request {
  const url = new URL("http://test/api/auth/google/callback");
  if (opts.code) url.searchParams.set("code", opts.code);
  if (opts.state) url.searchParams.set("state", opts.state);
  if (opts.errorParam) url.searchParams.set("error", opts.errorParam);
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.cookie = opts.cookie;
  return new Request(url, { method: "GET", headers });
}

function extractCookie(res: Response, name: string): { value: string; attrs: string } | null {
  const raw = res.headers.get("set-cookie") ?? "";
  const chunk = raw
    .split(/,(?=[A-Za-z0-9_-]+=)/)
    .find((c) => c.trim().startsWith(`${name}=`));
  if (!chunk) return null;
  const [first, ...rest] = chunk.split(";");
  const [, value] = first.split("=");
  return { value: decodeURIComponent(value ?? ""), attrs: rest.join(";") };
}

function mockGoogleFetch(opts: {
  tokenOk?: boolean;
  idToken?: string;
  tokenStatus?: number;
  tokenBody?: unknown;
}): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.startsWith("https://oauth2.googleapis.com/token")) {
      if (opts.tokenOk === false) {
        return new Response(JSON.stringify(opts.tokenBody ?? { error: "bad" }), {
          status: opts.tokenStatus ?? 400,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          id_token: opts.idToken ?? makeIdToken(),
          access_token: "atk",
          token_type: "Bearer",
          expires_in: 3599,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`unexpected fetch to ${urlStr}`);
  });
}

const ENV = {
  id: process.env.GOOGLE_CLIENT_ID,
  secret: process.env.GOOGLE_CLIENT_SECRET,
  redirect: process.env.GOOGLE_REDIRECT_URI,
};
function configure(): void {
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
  process.env.GOOGLE_CLIENT_SECRET = "test-secret";
  process.env.GOOGLE_REDIRECT_URI = "http://test/api/auth/google/callback";
}
function restore(): void {
  if (ENV.id) process.env.GOOGLE_CLIENT_ID = ENV.id;
  else delete process.env.GOOGLE_CLIENT_ID;
  if (ENV.secret) process.env.GOOGLE_CLIENT_SECRET = ENV.secret;
  else delete process.env.GOOGLE_CLIENT_SECRET;
  if (ENV.redirect) process.env.GOOGLE_REDIRECT_URI = ENV.redirect;
  else delete process.env.GOOGLE_REDIRECT_URI;
}

describe("GET /api/auth/google/callback", () => {
  beforeEach(async () => {
    await truncateAll();
    configure();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    restore();
  });

  it("redirects to /login?error=cancelled when Google returns error=access_denied", async () => {
    const res = await GET(
      callbackRequest({ errorParam: "access_denied", cookie: stateCookie("abc") }),
    );
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("error")).toBe("cancelled");
  });

  it("rejects when the state cookie is missing", async () => {
    const res = await GET(callbackRequest({ code: "abc", state: "s1" }));
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("error")).toBe("network");
  });

  it("rejects when the state cookie does not match the query state (CSRF guard)", async () => {
    const res = await GET(
      callbackRequest({ code: "abc", state: "attacker-state", cookie: stateCookie("real-state") }),
    );
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.searchParams.get("error")).toBe("network");
  });

  it("rejects when the code query param is missing even if state matches", async () => {
    const res = await GET(callbackRequest({ state: "s1", cookie: stateCookie("s1") }));
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.searchParams.get("error")).toBe("network");
  });

  it("fails closed with error=unverified when Google reports email_verified=false", async () => {
    mockGoogleFetch({ idToken: makeIdToken({ email_verified: false }) });
    const res = await GET(
      callbackRequest({ code: "code-1", state: "s1", cookie: stateCookie("s1") }),
    );
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.searchParams.get("error")).toBe("unverified");
    expect(extractCookie(res, SESSION_COOKIE)).toBeNull();
  });

  it("fails to error=network when the token exchange is non-2xx", async () => {
    mockGoogleFetch({ tokenOk: false, tokenStatus: 400, tokenBody: { error: "invalid_grant" } });
    const res = await GET(
      callbackRequest({ code: "code-1", state: "s1", cookie: stateCookie("s1") }),
    );
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.searchParams.get("error")).toBe("network");
  });

  it("happy path for a brand-new user: sets session cookie, lands on /app?welcome=1", async () => {
    mockGoogleFetch({
      idToken: makeIdToken({ sub: "google|new-1", email: "new@example.com" }),
    });
    const res = await GET(
      callbackRequest({ code: "code-1", state: "s1", cookie: stateCookie("s1") }),
    );
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.pathname).toBe("/app");
    expect(loc.searchParams.get("welcome")).toBe("1");

    const cookie = extractCookie(res, SESSION_COOKIE);
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.attrs.toLowerCase()).toContain("httponly");
    expect(cookie?.attrs.toLowerCase()).toContain("samesite=lax");

    const sessionUser = await getSessionUser(cookie!.value);
    expect(sessionUser?.email).toBe("new@example.com");

    const db = getDb();
    const rows = await db
      .select({ passwordHash: users.passwordHash, googleSub: users.googleSub })
      .from(users)
      .where(eq(users.id, sessionUser!.id));
    expect(rows[0].googleSub).toBe("google|new-1");
    expect(rows[0].passwordHash).toBeNull();
  });

  it("attach path: existing email/password user signs in with Google, keeps password, no welcome", async () => {
    const { user: existing } = await register({
      email: "merge@example.com",
      password: "correct-horse-battery",
    });

    mockGoogleFetch({
      idToken: makeIdToken({ sub: "google|merge-1", email: "merge@example.com" }),
    });
    const res = await GET(
      callbackRequest({ code: "code-1", state: "s1", cookie: stateCookie("s1") }),
    );
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.pathname).toBe("/app");
    // Not a new user → no welcome=1.
    expect(loc.searchParams.get("welcome")).toBeNull();

    const cookie = extractCookie(res, SESSION_COOKIE);
    const sessionUser = await getSessionUser(cookie!.value);
    expect(sessionUser?.id).toBe(existing.id);

    const db = getDb();
    const rows = await db
      .select({ passwordHash: users.passwordHash, googleSub: users.googleSub })
      .from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0].googleSub).toBe("google|merge-1");
    expect(rows[0].passwordHash).not.toBeNull();
  });

  it("already-linked user: same sub returning → sign in, no welcome, same user", async () => {
    mockGoogleFetch({
      idToken: makeIdToken({ sub: "google|linked-1", email: "linked@example.com" }),
    });
    const first = await GET(
      callbackRequest({ code: "code-a", state: "s1", cookie: stateCookie("s1") }),
    );
    const firstCookie = extractCookie(first, SESSION_COOKIE);
    const firstUser = await getSessionUser(firstCookie!.value);

    vi.restoreAllMocks();
    configure();
    mockGoogleFetch({
      idToken: makeIdToken({ sub: "google|linked-1", email: "linked@example.com" }),
    });
    const second = await GET(
      callbackRequest({ code: "code-b", state: "s2", cookie: stateCookie("s2") }),
    );
    const loc = new URL(second.headers.get("location") ?? "");
    expect(loc.pathname).toBe("/app");
    expect(loc.searchParams.get("welcome")).toBeNull();

    const secondCookie = extractCookie(second, SESSION_COOKIE);
    const secondUser = await getSessionUser(secondCookie!.value);
    expect(secondUser?.id).toBe(firstUser?.id);
  });

  it("preserves a safe `next` from the state cookie when signing in an existing user", async () => {
    await register({ email: "deep@example.com", password: "correct-horse-battery" });
    mockGoogleFetch({
      idToken: makeIdToken({ sub: "google|deep-1", email: "deep@example.com" }),
    });
    const res = await GET(
      callbackRequest({
        code: "code-1",
        state: "s1",
        cookie: stateCookie("s1", "/app/entries"),
      }),
    );
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.pathname).toBe("/app/entries");
    expect(loc.searchParams.get("welcome")).toBeNull();
  });
});
