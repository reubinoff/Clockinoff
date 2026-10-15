import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { SELF_DELETE_REAUTH_MS } from "@/server/auth/self-delete";
import {
  hashSessionToken,
  LAST_SEEN_THROTTLE_MS,
  createSession,
  getSessionUser,
  sessionCreatedWithin,
  setSessionSideEffects,
} from "@/server/auth/session";
import { login, register } from "@/server/auth/service";
import { getDb } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";
import { makeUser } from "../helpers";
import { truncateAll } from "../setup";

const PW = "correct-horse-battery";

describe("session presence", () => {
  beforeEach(async () => {
    setSessionSideEffects(null);
    await truncateAll();
  });

  afterEach(() => {
    setSessionSideEffects(null);
    vi.restoreAllMocks();
  });

  it("stores the client IP at creation and throttles last_seen_at to 5 minutes", async () => {
    const { user } = await makeUser("seen@ex.com");
    const createdAt = new Date("2026-10-11T12:00:00.000Z");
    const session = await createSession(user.id, createdAt, "203.0.113.10");
    const db = getDb();

    const initial = await db.select().from(sessions).where(eq(sessions.userId, user.id));
    const row = initial.find((item) => item.id === hashSessionToken(session.id));
    expect(row?.clientIp).toBe("203.0.113.10");
    expect(row?.lastSeenAt?.toISOString()).toBe(createdAt.toISOString());

    await getSessionUser(session.id, new Date(createdAt.getTime() + 60_000));
    const mid = await db.select().from(sessions).where(eq(sessions.id, hashSessionToken(session.id)));
    expect(mid[0]?.lastSeenAt?.toISOString()).toBe(createdAt.toISOString());

    const later = new Date(createdAt.getTime() + LAST_SEEN_THROTTLE_MS);
    await getSessionUser(session.id, later);
    const bumped = await db.select().from(sessions).where(eq(sessions.id, hashSessionToken(session.id)));
    expect(bumped[0]?.lastSeenAt?.toISOString()).toBe(later.toISOString());
  });

  it("fills a null last_seen_at on the next authenticated read", async () => {
    const { user } = await makeUser("null-seen@ex.com");
    const token = "raw-token-for-null-last-seen";
    const now = new Date("2026-10-11T15:00:00.000Z");
    await getDb().insert(sessions).values({
      id: hashSessionToken(token),
      userId: user.id,
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      createdAt: now,
      lastSeenAt: null,
    });
    expect(await getSessionUser(token, now)).toMatchObject({ id: user.id });
    const rows = await getDb().select().from(sessions).where(eq(sessions.id, hashSessionToken(token)));
    expect(rows[0]?.lastSeenAt?.toISOString()).toBe(now.toISOString());
  });

  it("records the IP passed into login and register", async () => {
    const registered = await register({
      email: "ip@ex.com",
      password: PW,
      clientIp: "192.0.2.8",
    });
    const regRow = await getDb()
      .select()
      .from(sessions)
      .where(eq(sessions.id, hashSessionToken(registered.session.id)));
    expect(regRow[0]?.clientIp).toBe("192.0.2.8");

    const signedIn = await login({ email: "ip@ex.com", password: PW, clientIp: "192.0.2.9" });
    const loginRow = await getDb()
      .select()
      .from(sessions)
      .where(eq(sessions.id, hashSessionToken(signedIn.session.id)));
    expect(loginRow[0]?.clientIp).toBe("192.0.2.9");
    expect(await getDb().select({ id: users.id }).from(users)).toHaveLength(1);
  });

  it("still signs in when the session client_ip write fails", async () => {
    await register({ email: "ip-fail@ex.com", password: PW, clientIp: "192.0.2.20" });
    const spy = vi.spyOn(logger, "exception").mockImplementation(() => {});
    setSessionSideEffects({
      persistClientIp: async () => {
        throw new Error("client_ip write failed");
      },
    });
    const signedIn = await login({
      email: "ip-fail@ex.com",
      password: PW,
      clientIp: "192.0.2.21",
    });
    expect(signedIn.user.email).toBe("ip-fail@ex.com");
    const row = await getDb()
      .select()
      .from(sessions)
      .where(eq(sessions.id, hashSessionToken(signedIn.session.id)));
    expect(row[0]?.clientIp).toBeNull();
    expect(spy).toHaveBeenCalled();
  });

  it("still returns the user when the last_seen_at write fails", async () => {
    const { user } = await makeUser("seen-fail@ex.com");
    const createdAt = new Date("2026-10-11T12:00:00.000Z");
    const session = await createSession(user.id, createdAt, "203.0.113.40");
    const spy = vi.spyOn(logger, "exception").mockImplementation(() => {});
    setSessionSideEffects({
      touchLastSeen: async () => {
        throw new Error("last_seen write failed");
      },
    });
    const later = new Date(createdAt.getTime() + LAST_SEEN_THROTTLE_MS);
    expect(await getSessionUser(session.id, later)).toMatchObject({ id: user.id });
    const row = await getDb()
      .select()
      .from(sessions)
      .where(eq(sessions.id, hashSessionToken(session.id)));
    expect(row[0]?.lastSeenAt?.toISOString()).toBe(createdAt.toISOString());
    expect(spy).toHaveBeenCalled();
  });

  it("treats a sign-in as fresh only inside the self-delete window", async () => {
    const { user } = await makeUser("fresh@ex.com");
    const session = await createSession(user.id);
    expect(await sessionCreatedWithin(session.id, SELF_DELETE_REAUTH_MS)).toBe(true);
    expect(await sessionCreatedWithin(undefined, SELF_DELETE_REAUTH_MS)).toBe(false);
    const stale = new Date(Date.now() - SELF_DELETE_REAUTH_MS - 1000);
    await getDb()
      .update(sessions)
      .set({ createdAt: stale })
      .where(eq(sessions.id, hashSessionToken(session.id)));
    expect(await sessionCreatedWithin(session.id, SELF_DELETE_REAUTH_MS)).toBe(false);
  });
});
