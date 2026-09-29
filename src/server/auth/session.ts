import { and, eq, gt, lt, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";
import { tokenId } from "@/lib/id";

export const SESSION_COOKIE = "timely_session";
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  timezone: string;
}

export interface CreatedSession {
  id: string;
  expiresAt: Date;
}

export async function createSession(userId: string, now: Date = new Date()): Promise<CreatedSession> {
  const db = getDb();
  const id = tokenId(32);
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
  await db.insert(sessions).values({ id, userId, expiresAt });
  return { id, expiresAt };
}

export async function getSessionUser(
  sessionId: string | null | undefined,
  now: Date = new Date(),
): Promise<SessionUser | null> {
  if (!sessionId) return null;
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      timezone: users.timezone,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, now)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, email: row.email, timezone: row.timezone };
}

export async function deleteSession(sessionId: string | null | undefined): Promise<void> {
  if (!sessionId) return;
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.id, sessionId));
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
