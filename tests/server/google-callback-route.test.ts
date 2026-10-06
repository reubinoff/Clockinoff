import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/auth/google/callback/route";
import { serialiseOAuthState } from "@/lib/oauth-next";
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

function stateCookie(
  state: string,
  next = "/app",
  extras?: { intent?: "connect"; uid?: string },
): string {
  const payload =
    extras?.intent === "connect"
      ? { s: state, n: next, i: "connect" as const, uid: extras.uid ?? "missing-uid" }
      : { s: state, n: next };
  return `timely_oauth_state=${encodeURIComponent(serialiseOAuthState(payload))}`;
}

function unsignedConnectCookie(state: string, uid: string, next = "/app/account"): string {
  const value = encodeURIComponent(JSON.stringify({ s: state, n: next, i: "connect", uid }));
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
  nextauth: process.env.NEXTAUTH_URL,
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
  if (ENV.nextauth) process.env.NEXTAUTH_URL = ENV.nextauth;
  else delete process.env.NEXTAUTH_URL;
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

  it("password-account refuse: existing email/password user is not attached and lands on the banner", async () => {
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
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("error")).toBe("google_password_account");
    expect(loc.searchParams.has("email")).toBe(false);
    expect(extractCookie(res, SESSION_COOKIE)).toBeNull();

    const db = getDb();
    const rows = await db
      .select({ id: users.id, passwordHash: users.passwordHash, googleSub: users.googleSub })
      .from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(existing.id);
    expect(rows[0].googleSub).toBeNull();
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

  describe("Azure reverse-proxy regression: Location must use NEXTAUTH_URL origin", () => {
    beforeEach(() => {
      process.env.NEXTAUTH_URL = "https://clockinoff.reubinoff.com";
    });

    // Simulate the production topology: Azure App Service forwards the
    // request to the container, and `req.url` carries the internal
    // container hostname. If we ever rebuild Locations from that URL
    // again, the browser lands on DNS NXDOMAIN after Google consent.
    function internalRequest(opts: {
      code?: string | null;
      state?: string | null;
      cookie?: string;
      errorParam?: string;
    }): Request {
      const url = new URL("http://e0a475862be8:3000/api/auth/google/callback");
      if (opts.code) url.searchParams.set("code", opts.code);
      if (opts.state) url.searchParams.set("state", opts.state);
      if (opts.errorParam) url.searchParams.set("error", opts.errorParam);
      const headers: Record<string, string> = {};
      if (opts.cookie) headers.cookie = opts.cookie;
      return new Request(url, { method: "GET", headers });
    }

    it("sends happy-path Location to the public origin, not the container host", async () => {
      mockGoogleFetch({
        idToken: makeIdToken({ sub: "google|public-1", email: "public@example.com" }),
      });
      const res = await GET(
        internalRequest({ code: "code-1", state: "s1", cookie: stateCookie("s1") }),
      );
      const loc = new URL(res.headers.get("location") ?? "");
      expect(loc.origin).toBe("https://clockinoff.reubinoff.com");
      expect(loc.hostname).not.toBe("e0a475862be8");
    });

    it("sends the cancel bounce to the public origin on error=access_denied", async () => {
      const res = await GET(
        internalRequest({ errorParam: "access_denied", cookie: stateCookie("abc") }),
      );
      const loc = new URL(res.headers.get("location") ?? "");
      expect(loc.origin).toBe("https://clockinoff.reubinoff.com");
      expect(loc.searchParams.get("error")).toBe("cancelled");
    });

    it("sends the network-error bounce to the public origin on state mismatch", async () => {
      const res = await GET(
        internalRequest({ code: "abc", state: "attacker", cookie: stateCookie("real") }),
      );
      const loc = new URL(res.headers.get("location") ?? "");
      expect(loc.origin).toBe("https://clockinoff.reubinoff.com");
      expect(loc.searchParams.get("error")).toBe("network");
    });

    it("sends the unverified bounce to the public origin on email_verified=false", async () => {
      mockGoogleFetch({ idToken: makeIdToken({ email_verified: false }) });
      const res = await GET(
        internalRequest({ code: "code-1", state: "s1", cookie: stateCookie("s1") }),
      );
      const loc = new URL(res.headers.get("location") ?? "");
      expect(loc.origin).toBe("https://clockinoff.reubinoff.com");
      expect(loc.searchParams.get("error")).toBe("unverified");
    });
  });

  it("does not emit an off-site Location when signed state carries a control-char next", async () => {
    mockGoogleFetch({
      idToken: makeIdToken({ sub: "google|redir-1", email: "redir@example.com" }),
    });
    const res = await GET(
      callbackRequest({
        code: "code-1",
        state: "s1",
        cookie: stateCookie("s1", "/\t/evil.example"),
      }),
    );
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.origin).toBe("http://test");
    expect(loc.hostname).not.toBe("evil.example");
    expect(loc.pathname).toBe("/app");
  });

  it("preserves a safe `next` from the state cookie when signing in an existing user", async () => {
    mockGoogleFetch({
      idToken: makeIdToken({ sub: "google|deep-1", email: "deep@example.com" }),
    });
    const first = await GET(
      callbackRequest({ code: "code-a", state: "s0", cookie: stateCookie("s0") }),
    );
    expect(first.status).toBe(302);

    vi.restoreAllMocks();
    configure();
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

  it("Settings connect: matching email attaches Google and lands on /app/account?google=connected", async () => {
    const { user, session } = await register({
      email: "a@example.com",
      password: "correct-horse-battery",
    });
    mockGoogleFetch({
      idToken: makeIdToken({ sub: "google|connect-1", email: "a@example.com" }),
    });
    const res = await GET(
      callbackRequest({
        code: "code-1",
        state: "s1",
        cookie: `${stateCookie("s1", "/app/account", { intent: "connect", uid: user.id })}; ${SESSION_COOKIE}=${session.id}`,
      }),
    );
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.pathname).toBe("/app/account");
    expect(loc.searchParams.get("google")).toBe("connected");

    const db = getDb();
    const rows = await db
      .select({ googleSub: users.googleSub })
      .from(users)
      .where(eq(users.id, user.id));
    expect(rows[0].googleSub).toBe("google|connect-1");
  });

  it("Settings connect: mismatched Google email stays on Account with the mismatch error", async () => {
    const { user, session } = await register({
      email: "a@example.com",
      password: "correct-horse-battery",
    });
    mockGoogleFetch({
      idToken: makeIdToken({ sub: "google|other", email: "other@example.com" }),
    });
    const res = await GET(
      callbackRequest({
        code: "code-1",
        state: "s1",
        cookie: `${stateCookie("s1", "/app/account", { intent: "connect", uid: user.id })}; ${SESSION_COOKIE}=${session.id}`,
      }),
    );
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.pathname).toBe("/app/account");
    expect(loc.searchParams.get("error")).toBe("google_email_mismatch");
  });

  it("Settings connect: unverified Google email stays on Account", async () => {
    const { user, session } = await register({
      email: "a@example.com",
      password: "correct-horse-battery",
    });
    mockGoogleFetch({ idToken: makeIdToken({ email_verified: false }) });
    const res = await GET(
      callbackRequest({
        code: "code-1",
        state: "s1",
        cookie: `${stateCookie("s1", "/app/account", { intent: "connect", uid: user.id })}; ${SESSION_COOKIE}=${session.id}`,
      }),
    );
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.pathname).toBe("/app/account");
    expect(loc.searchParams.get("error")).toBe("network");
  });

  it("Settings connect: Google cancel stays on Account", async () => {
    const res = await GET(
      callbackRequest({
        errorParam: "access_denied",
        cookie: stateCookie("abc", "/app/account", { intent: "connect", uid: "starter" }),
      }),
    );
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.pathname).toBe("/app/account");
    expect(loc.searchParams.get("error")).toBe("network");
  });

  it("Settings connect without a session bounces to login", async () => {
    mockGoogleFetch({
      idToken: makeIdToken({ sub: "google|anon", email: "anon@example.com" }),
    });
    const res = await GET(
      callbackRequest({
        code: "code-1",
        state: "s1",
        cookie: stateCookie("s1", "/app/account", { intent: "connect", uid: "starter" }),
      }),
    );
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("next")).toBe("/app/account");
    expect(extractCookie(res, SESSION_COOKIE)).toBeNull();
  });

  it("Settings connect: start as A, callback as B does not attach to either user", async () => {
    const { user: userA } = await register({
      email: "a-starter@example.com",
      password: "correct-horse-battery",
    });
    const { user: userB, session: sessionB } = await register({
      email: "b-callback@example.com",
      password: "correct-horse-battery",
    });
    mockGoogleFetch({
      idToken: makeIdToken({ sub: "google|swap", email: "b-callback@example.com" }),
    });
    const res = await GET(
      callbackRequest({
        code: "code-1",
        state: "s1",
        cookie: `${stateCookie("s1", "/app/account", { intent: "connect", uid: userA.id })}; ${SESSION_COOKIE}=${sessionB.id}`,
      }),
    );
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.pathname).toBe("/app/account");
    expect(loc.searchParams.get("error")).toBe("network");
    expect(loc.searchParams.get("google")).toBeNull();

    const db = getDb();
    const rows = await db
      .select({ id: users.id, googleSub: users.googleSub })
      .from(users);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === userA.id)?.googleSub).toBeNull();
    expect(rows.find((r) => r.id === userB.id)?.googleSub).toBeNull();
  });

  it("Settings connect: unsigned state is rejected and does not attach", async () => {
    const { user, session } = await register({
      email: "a@example.com",
      password: "correct-horse-battery",
    });
    mockGoogleFetch({
      idToken: makeIdToken({ sub: "google|unsigned", email: "a@example.com" }),
    });
    const res = await GET(
      callbackRequest({
        code: "code-1",
        state: "s1",
        cookie: `${unsignedConnectCookie("s1", user.id)}; ${SESSION_COOKIE}=${session.id}`,
      }),
    );
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("error")).toBe("network");

    const db = getDb();
    const rows = await db
      .select({ googleSub: users.googleSub })
      .from(users)
      .where(eq(users.id, user.id));
    expect(rows[0].googleSub).toBeNull();
  });

  it("Settings connect: tampered state signature is rejected and does not attach", async () => {
    const { user, session } = await register({
      email: "a@example.com",
      password: "correct-horse-battery",
    });
    const signed = serialiseOAuthState({
      s: "s1",
      n: "/app/account",
      i: "connect",
      uid: user.id,
    });
    const [body, sig] = signed.split(".");
    const tampered = `${body}.${sig.slice(0, -1)}x`;
    mockGoogleFetch({
      idToken: makeIdToken({ sub: "google|tamper", email: "a@example.com" }),
    });
    const res = await GET(
      callbackRequest({
        code: "code-1",
        state: "s1",
        cookie: `timely_oauth_state=${encodeURIComponent(tampered)}; ${SESSION_COOKIE}=${session.id}`,
      }),
    );
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("error")).toBe("network");

    const db = getDb();
    const rows = await db
      .select({ googleSub: users.googleSub })
      .from(users)
      .where(eq(users.id, user.id));
    expect(rows[0].googleSub).toBeNull();
  });
});
