import { createHash } from "node:crypto";
import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";
import { tokenId } from "@/lib/id";

export const SESSION_COOKIE = "timely_session";
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_SESSIONS_PER_USER = 20;

export interface SessionUser {
  id: string;
  email: string;
  timezone: string;
}

export interface CreatedSession {
  /** Raw cookie token. The DB stores only sha256(hex) of this value. */
  id: string;
  expiresAt: Date;
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function createSession(userId: string, now: Date = new Date()): Promise<CreatedSession> {
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
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, email: row.email, timezone: row.timezone };
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
