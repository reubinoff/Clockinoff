import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { DELETE, GET } from "@/app/api/auth/me/route";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { ADMIN_GUARD } from "@/lib/admin-copy";
import { publicOrigin } from "@/lib/base-url";
import { PASSWORD_MAX_LENGTH } from "@/lib/password";
import { SELF_DELETE_REAUTH_MS, setBeforeSelfDeleteLock } from "@/server/auth/self-delete";
import {
  SELF_DELETE_RATE_LIMIT,
  isSelfDeleteRateLimited,
  resetAuthRateLimits,
} from "@/server/auth/rate-limit";
import { register } from "@/server/auth/service";
import {
  getSessionCreatedAt,
  getSessionUser,
  hashSessionToken,
  SESSION_COOKIE,
  createSession,
} from "@/server/auth/session";
import { setPendingAuditInsert } from "@/server/services/admin";
import { getDb } from "@/server/db/client";
import {
  auditEvents,
  clients,
  projects,
  sessions,
  tags,
  timeEntries,
  users,
} from "@/server/db/schema";
import {
  forgetQaSweepPassword,
  qaSweepPrefix,
  rememberQaSweepPassword,
  setQaSweepDeleter,
} from "../helpers";
import { truncateAll } from "../setup";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieValue === undefined || name !== SESSION_COOKIE
        ? undefined
        : { name: SESSION_COOKIE, value: cookieValue },
  }),
}));

const PW = "correct-horse-battery";

let cookieValue: string | undefined;
let seq = 0;

function nextEmail(): string {
  seq += 1;
  return `${qaSweepPrefix()}${seq}-${Date.now()}@ex.com`;
}

setQaSweepDeleter(async (email, password) => {
  const login = await loginPost(
    new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email, password }),
    }),
  );
  if (login.status === 401) return true;
  if (login.status !== 200) return false;
  const setCookie = login.headers.get("set-cookie") ?? "";
  const match = new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(setCookie);
  cookieValue = match?.[1];
  if (!cookieValue) return false;
  const del = await DELETE(call({ password, confirmEmail: email }));
  const me = await GET();
  cookieValue = undefined;
  return del.status === 204 && me.status === 401;
});

async function makeRegisteredUser(email = nextEmail()): Promise<{
  id: string;
  email: string;
  token: string;
}> {
  const { user, session } = await register({ email, password: PW });
  rememberQaSweepPassword(email, PW);
  return { id: user.id, email: user.email, token: session.id };
}

function appOrigin(): string {
  return publicOrigin(new Request("http://localhost:3000/api/auth/me"));
}

function call(
  body: unknown,
  headers: Record<string, string> = {},
  rawBody?: string,
): Request {
  const finalHeaders = new Headers({
    "content-type": "application/json",
    origin: appOrigin(),
  });
  for (const [key, value] of Object.entries(headers)) {
    if (value === "") finalHeaders.delete(key);
    else finalHeaders.set(key, value);
  }
  return new Request("http://localhost:3000/api/auth/me", {
    method: "DELETE",
    headers: finalHeaders,
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
}

async function errorBody(res: Response): Promise<{ error: { code: string; message: string } }> {
  return (await res.json()) as { error: { code: string; message: string } };
}

describe("DELETE /api/auth/me", () => {
  beforeEach(async () => {
    await truncateAll();
    resetAuthRateLimits();
    setPendingAuditInsert(null);
    setBeforeSelfDeleteLock(null);
    cookieValue = undefined;
  });

  it("GET /api/auth/me is private and not stored", async () => {
    const account = await makeRegisteredUser();
    cookieValue = account.token;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = (await res.json()) as { email: string };
    expect(body.email).toBe(account.email);

    cookieValue = undefined;
    const anon = await GET();
    expect(anon.status).toBe(401);
    expect(anon.headers.get("cache-control")).toBe("private, no-store");
  });

  it("deletes the signed-in user, cascades rows, clears the cookie, and audits", async () => {
    const account = await makeRegisteredUser();
    cookieValue = account.token;
    const db = getDb();
    const [client] = await db
      .insert(clients)
      .values({ userId: account.id, name: "Acme" })
      .returning();
    const [project] = await db
      .insert(projects)
      .values({ userId: account.id, name: "Build", clientId: client.id })
      .returning();
    await db.insert(tags).values({ userId: account.id, name: "focus" });
    await db.insert(timeEntries).values({
      userId: account.id,
      projectId: project.id,
      description: "cascade",
      startAt: new Date(Date.now() - 60_000),
      endAt: new Date(),
    });
    const other = await createSession(account.id);

    const res = await DELETE(
      call(
        { password: PW, confirmEmail: `  ${account.email.toUpperCase()}  `, id: "ignored" },
        {
          "x-client-ip": "203.0.113.10",
          "x-forwarded-for": "1.1.1.1, 9.9.9.9",
          cookie: `${SESSION_COOKIE}=${account.token}`,
          "user-agent": "vitest-self-delete",
        },
      ),
    );
    expect(res.status).toBe(204);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(new RegExp(`${SESSION_COOKIE}=;`));
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("path=/");
    expect(cookie.toLowerCase()).toMatch(/samesite=lax/);

    expect(await getSessionUser(account.token)).toBeNull();
    expect(await getSessionUser(other.id)).toBeNull();
    expect(await db.select().from(users).where(eq(users.id, account.id))).toHaveLength(0);
    expect(await db.select().from(clients).where(eq(clients.userId, account.id))).toHaveLength(0);
    expect(await db.select().from(projects).where(eq(projects.userId, account.id))).toHaveLength(0);
    expect(await db.select().from(tags).where(eq(tags.userId, account.id))).toHaveLength(0);
    expect(await db.select().from(timeEntries).where(eq(timeEntries.userId, account.id))).toHaveLength(
      0,
    );
    expect(await db.select().from(sessions).where(eq(sessions.userId, account.id))).toHaveLength(0);

    const audits = await db.select().from(auditEvents);
    expect(audits).toHaveLength(1);
    expect(audits[0]?.action).toBe("user.self_delete");
    expect(audits[0]?.actorEmail).toBe(account.email);
    expect(audits[0]?.targets).toEqual([{ id: account.id, email: account.email }]);
    expect(audits[0]?.clientIp).toBe("203.0.113.10");
    expect(audits[0]?.clientIp).not.toBe("1.1.1.1");
    expect(audits[0]?.forwardedFor).toContain("1.1.1.1, 9.9.9.9");
    expect(audits[0]?.userAgent).toBe("vitest-self-delete");
    expect(audits[0]?.createdAt).toBeInstanceOf(Date);
    expect(audits[0]?.status).toBe("completed");
    expect(audits[0]?.sessionIdHash).toBe(hashSessionToken(account.token));
    forgetQaSweepPassword(account.email);
  });

  it("rejects a confirm mismatch without deleting or counting the attempt", async () => {
    const account = await makeRegisteredUser();
    cookieValue = account.token;
    const res = await DELETE(
      call({ password: "wrong-password", confirmEmail: "other@ex.com" }, { "x-client-ip": "203.0.113.20" }),
    );
    expect(res.status).toBe(400);
    expect((await errorBody(res)).error.code).toBe("VALIDATION");
    const db = getDb();
    expect(await db.select().from(users).where(eq(users.id, account.id))).toHaveLength(1);
    expect(isSelfDeleteRateLimited(account.id, "203.0.113.20")).toBe(false);
    forgetQaSweepPassword(account.email);
  });

  it("rejects a password longer than the argon2 cap before hashing", async () => {
    const account = await makeRegisteredUser();
    cookieValue = account.token;
    const ip = "203.0.113.41";
    const res = await DELETE(
      call(
        { password: "x".repeat(PASSWORD_MAX_LENGTH + 1), confirmEmail: account.email },
        { "x-client-ip": ip },
      ),
    );
    expect(res.status).toBe(400);
    expect((await errorBody(res)).error.code).toBe("VALIDATION");
    expect(isSelfDeleteRateLimited(account.id, ip)).toBe(false);
    expect(await getDb().select().from(users).where(eq(users.id, account.id))).toHaveLength(1);
    forgetQaSweepPassword(account.email);
  });

  it("rejects a confirm value longer than 254 characters", async () => {
    const account = await makeRegisteredUser();
    cookieValue = account.token;
    const res = await DELETE(
      call({ password: PW, confirmEmail: `${"a".repeat(255)}@ex.com` }),
    );
    expect(res.status).toBe(400);
    expect(await getDb().select().from(users).where(eq(users.id, account.id))).toHaveLength(1);
    forgetQaSweepPassword(account.email);
  });

  it("counts a missing password as a failed attempt", async () => {
    const account = await makeRegisteredUser();
    cookieValue = account.token;
    const ip = "203.0.113.40";
    const res = await DELETE(call({ confirmEmail: account.email }, { "x-client-ip": ip }));
    expect(res.status).toBe(401);
    expect((await errorBody(res)).error.message).toBe("Invalid email or password");
    expect(isSelfDeleteRateLimited(account.id, ip)).toBe(false);
    for (let i = 0; i < SELF_DELETE_RATE_LIMIT.maxFailures - 1; i += 1) {
      const again = await DELETE(call({ confirmEmail: account.email }, { "x-client-ip": ip }));
      expect(again.status).toBe(401);
    }
    const blocked = await DELETE(call({ password: PW, confirmEmail: account.email }, { "x-client-ip": ip }));
    expect(blocked.status).toBe(429);
    expect(await getDb().select().from(users).where(eq(users.id, account.id))).toHaveLength(1);
    forgetQaSweepPassword(account.email);
  });

  it("counts wrong passwords and returns 429 once the bucket is exhausted", async () => {
    const account = await makeRegisteredUser();
    cookieValue = account.token;
    const ip = "203.0.113.30";
    for (let i = 0; i < SELF_DELETE_RATE_LIMIT.maxFailures; i += 1) {
      const res = await DELETE(
        call({ password: "not-the-password", confirmEmail: account.email }, { "x-client-ip": ip }),
      );
      expect(res.status).toBe(401);
      expect((await errorBody(res)).error.message).toBe("Invalid email or password");
    }
    const blocked = await DELETE(
      call({ password: PW, confirmEmail: account.email }, { "x-client-ip": ip }),
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    expect((await errorBody(blocked)).error.code).toBe("RATE_LIMITED");
    expect(await getDb().select().from(users).where(eq(users.id, account.id))).toHaveLength(1);
    forgetQaSweepPassword(account.email);
  });

  it("returns 429 on the 6th wrong password from a different X-Client-IP", async () => {
    const account = await makeRegisteredUser();
    cookieValue = account.token;
    for (let i = 1; i <= 6; i += 1) {
      const res = await DELETE(
        call(
          { password: "not-the-password", confirmEmail: account.email },
          { "x-client-ip": `203.0.113.${i}`, "x-forwarded-for": `198.51.100.${i}` },
        ),
      );
      if (i < 6) {
        expect(res.status).toBe(401);
      } else {
        expect(res.status).toBe(429);
        expect((await errorBody(res)).error.code).toBe("RATE_LIMITED");
      }
    }
    expect(await getDb().select().from(users).where(eq(users.id, account.id))).toHaveLength(1);
    forgetQaSweepPassword(account.email);
  });

  it("requires a Google sign-in created within the last 5 minutes", async () => {
    const email = nextEmail();
    const db = getDb();
    const [row] = await db
      .insert(users)
      .values({ email, passwordHash: null, googleSub: "google|self-delete-fresh", timezone: "Asia/Jerusalem" })
      .returning();
    const fresh = await createSession(row.id, new Date());
    cookieValue = fresh.id;
    const ok = await DELETE(call({ confirmEmail: email }));
    expect(ok.status).toBe(204);
    expect(await db.select().from(users).where(eq(users.id, row.id))).toHaveLength(0);

    const staleEmail = nextEmail();
    const [staleUser] = await db
      .insert(users)
      .values({
        email: staleEmail,
        passwordHash: null,
        googleSub: "google|self-delete-stale",
        timezone: "Asia/Jerusalem",
      })
      .returning();
    const signedInAt = new Date(Date.now() - SELF_DELETE_REAUTH_MS - 60_000);
    const stale = await createSession(staleUser.id, signedInAt);
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date(), expiresAt: new Date(Date.now() + 60 * 60 * 1000) })
      .where(eq(sessions.id, hashSessionToken(stale.id)));
    cookieValue = stale.id;
    await getSessionUser(stale.id);
    const createdAt = await getSessionCreatedAt(stale.id);
    expect(createdAt?.getTime()).toBe(signedInAt.getTime());
    const res = await DELETE(call({ confirmEmail: staleEmail }));
    expect(res.status).toBe(401);
    expect((await errorBody(res)).error.message).toBe("reauth_required");
    expect(await db.select().from(users).where(eq(users.id, staleUser.id))).toHaveLength(1);
  });

  it("still requires reauth when a refreshed session is older than 5 minutes", async () => {
    const email = nextEmail();
    const db = getDb();
    const [row] = await db
      .insert(users)
      .values({
        email,
        passwordHash: null,
        googleSub: "google|self-delete-refresh",
        timezone: "Asia/Jerusalem",
      })
      .returning();
    const signedInAt = new Date(Date.now() - 10 * 60 * 1000);
    const session = await createSession(row.id, signedInAt);
    await db
      .update(sessions)
      .set({
        lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .where(eq(sessions.id, hashSessionToken(session.id)));
    cookieValue = session.id;
    await getSessionUser(session.id);
    expect((await getSessionCreatedAt(session.id))?.getTime()).toBe(signedInAt.getTime());
    const res = await DELETE(call({ confirmEmail: email }));
    expect(res.status).toBe(401);
    expect((await errorBody(res)).error.message).toBe("reauth_required");
    expect(await db.select().from(users).where(eq(users.id, row.id))).toHaveLength(1);
  });

  it("returns 403 when Origin is missing, the string null, or a mismatch", async () => {
    const account = await makeRegisteredUser();
    cookieValue = account.token;
    const referer = appOrigin();
    const missing = await DELETE(
      call({ password: PW, confirmEmail: account.email }, { origin: "", referer }),
    );
    expect(missing.status).toBe(403);
    const literalNull = await DELETE(
      call(
        { password: PW, confirmEmail: account.email },
        { origin: "null", referer },
      ),
    );
    expect(literalNull.status).toBe(403);
    expect((await errorBody(literalNull)).error.code).toBe("FORBIDDEN");
    const mismatch = await DELETE(
      call(
        { password: PW, confirmEmail: account.email },
        { origin: "https://evil.example", referer },
      ),
    );
    expect(mismatch.status).toBe(403);
    expect(await getDb().select().from(users).where(eq(users.id, account.id))).toHaveLength(1);
    forgetQaSweepPassword(account.email);
  });

  it("returns 403 for an admin and never 409, reading the role inside the transaction", async () => {
    const account = await makeRegisteredUser();
    cookieValue = account.token;
    const db = getDb();
    await db.update(users).set({ role: "admin" }).where(eq(users.id, account.id));
    const res = await DELETE(call({ password: PW, confirmEmail: account.email }));
    expect(res.status).toBe(403);
    const body = await errorBody(res);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toBe(ADMIN_GUARD.adminRemove);
    expect(await db.select().from(users).where(eq(users.id, account.id))).toHaveLength(1);

    await db.update(users).set({ role: "user" }).where(eq(users.id, account.id));
    setBeforeSelfDeleteLock(async () => {
      await getDb().update(users).set({ role: "admin" }).where(eq(users.id, account.id));
    });
    const raced = await DELETE(call({ password: PW, confirmEmail: account.email }));
    expect(raced.status).toBe(403);
    expect((await errorBody(raced)).error.code).not.toBe("CONFLICT");
    expect(await db.select().from(users).where(eq(users.id, account.id))).toHaveLength(1);
    forgetQaSweepPassword(account.email);
  });

  it("rolls back when the audit insert throws", async () => {
    const account = await makeRegisteredUser();
    cookieValue = account.token;
    setPendingAuditInsert(async () => {
      throw new Error("audit down");
    });
    const res = await DELETE(call({ password: PW, confirmEmail: account.email }));
    expect(res.status).toBe(500);
    expect(await getDb().select().from(users).where(eq(users.id, account.id))).toHaveLength(1);
    expect(await getDb().select().from(auditEvents)).toHaveLength(0);
    forgetQaSweepPassword(account.email);
  });

  it("returns 401 for a second call with the same cookie", async () => {
    const account = await makeRegisteredUser();
    cookieValue = account.token;
    const first = await DELETE(call({ password: PW, confirmEmail: account.email }));
    expect(first.status).toBe(204);
    const second = await DELETE(call({ password: PW, confirmEmail: account.email }));
    expect(second.status).toBe(401);
    forgetQaSweepPassword(account.email);
  });

  it("invalidates every session for the user", async () => {
    const account = await makeRegisteredUser();
    const other = await createSession(account.id);
    cookieValue = account.token;
    const res = await DELETE(call({ password: PW, confirmEmail: account.email }));
    expect(res.status).toBe(204);
    cookieValue = other.id;
    expect(await getSessionUser(other.id)).toBeNull();
    const me = await GET();
    expect(me.status).toBe(401);
    forgetQaSweepPassword(account.email);
  });

  it("returns 401 when no session cookie is present", async () => {
    cookieValue = undefined;
    const res = await DELETE(call({ password: PW, confirmEmail: "nobody@ex.com" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for a bad JSON body", async () => {
    const account = await makeRegisteredUser();
    cookieValue = account.token;
    const res = await DELETE(call(undefined, {}, "{"));
    expect(res.status).toBe(400);
    expect(await getDb().select().from(users).where(eq(users.id, account.id))).toHaveLength(1);
    forgetQaSweepPassword(account.email);
  });
});
