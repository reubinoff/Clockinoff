import { createHash } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";
import { tokenId } from "@/lib/id";
import { logger } from "@/lib/logger";
import { asUserRole, type UserRole, type UserStatus } from "@/lib/admin-role";

export const SESSION_COOKIE = "timely_session";
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_SESSIONS_PER_USER = 20;
export const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  timezone: string;
  role: UserRole;
  status: UserStatus;
}

export function sessionUserFromRow(row: {
  id: string;
  email: string;
  timezone: string;
  role: string;
  blockedAt: Date | null;
}): SessionUser {
  return {
    id: row.id,
    email: row.email,
    timezone: row.timezone,
    role: asUserRole(row.role),
    status: row.blockedAt ? "blocked" : "active",
  };
}

export interface CreatedSession {
  /** Raw cookie token. The DB stores only sha256(hex) of this value. */
  id: string;
  expiresAt: Date;
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function createSession(
  userId: string,
  now: Date = new Date(),
  clientIp: string | null = null,
): Promise<CreatedSession> {
  const db = getDb();
  const rawToken = tokenId(32);
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
  await db.transaction(async (tx) => {
    await tx.insert(sessions).values({
      id: tokenHash,
      userId,
      expiresAt,
      createdAt: now,
      lastSeenAt: now,
      clientIp: null,
    });
    const extras = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.createdAt), desc(sessions.id))
      .offset(MAX_SESSIONS_PER_USER);
    if (extras.length > 0) {
      await tx.delete(sessions).where(
        inArray(
          sessions.id,
          extras.map((row) => row.id),
        ),
      );
    }
  });
  if (clientIp) {
    try {
      await sessionSideEffects.persistClientIp(tokenHash, clientIp);
    } catch (err) {
      logger.exception("[sessions] client_ip write failed", err);
    }
  }
  return { id: rawToken, expiresAt };
}

export async function getSessionUser(
  sessionId: string | null | undefined,
  now: Date = new Date(),
): Promise<SessionUser | null> {
  if (!sessionId) return null;
  const db = getDb();
  const tokenHash = hashSessionToken(sessionId);
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      timezone: users.timezone,
      role: users.role,
      blockedAt: users.blockedAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1);
  const row = rows[0];
  if (!row || row.blockedAt) return null;
  try {
    await sessionSideEffects.touchLastSeen(tokenHash, now);
  } catch (err) {
    logger.exception("[sessions] last_seen_at write failed", err);
  }
  return sessionUserFromRow(row);
}

async function persistSessionClientIp(tokenHash: string, clientIp: string): Promise<void> {
  await getDb().update(sessions).set({ clientIp }).where(eq(sessions.id, tokenHash));
}

async function touchSessionLastSeen(tokenHash: string, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - LAST_SEEN_THROTTLE_MS);
  await getDb()
    .update(sessions)
    .set({ lastSeenAt: now })
    .where(
      and(
        eq(sessions.id, tokenHash),
        or(isNull(sessions.lastSeenAt), lte(sessions.lastSeenAt, cutoff)),
      ),
    );
}

const realSessionSideEffects = {
  persistClientIp: persistSessionClientIp,
  touchLastSeen: touchSessionLastSeen,
};

let sessionSideEffects = realSessionSideEffects;

export function setSessionSideEffects(
  next: Partial<typeof realSessionSideEffects> | null,
): void {
  sessionSideEffects = next ? { ...realSessionSideEffects, ...next } : realSessionSideEffects;
}

export async function deleteSession(sessionId: string | null | undefined): Promise<void> {
  if (!sessionId) return;
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.id, hashSessionToken(sessionId)));
}

export async function purgeExpiredSessions(now: Date = new Date()): Promise<number> {
  const db = getDb();
  const res = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, now))
    .returning({ id: sessions.id });
  return res.length;
}

export function sessionCookieOptions(expiresAt: Date): {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    secure: boolean;
    sameSite: "lax";
    path: "/";
    expires: Date;
  };
} {
  return {
    name: SESSION_COOKIE,
    value: "",
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    },
  };
}

export const _internal = { sql };
