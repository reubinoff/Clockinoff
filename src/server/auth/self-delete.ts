import { eq } from "drizzle-orm";
import { ADMIN_GUARD } from "@/lib/admin-copy";
import { errors } from "@/lib/errors";
import { getDb } from "@/server/db/client";
import { auditEvents, users } from "@/server/db/schema";
import { deleteUserCascade, insertSelfDeletePendingAudit } from "@/server/services/admin";
import { verifyPassword } from "./passwords";
import { deleteAllSessionsForUser, getSessionCreatedAt } from "./session";

export const SELF_DELETE_REAUTH_MS = 5 * 60 * 1000;
export const CONFIRM_EMAIL_MAX = 254;

export interface SelfDeleteInput {
  userId: string;
  accountEmail: string;
  sessionToken: string;
  password?: string;
  confirmEmail: string;
  requestId: string;
  clientIp: string | null;
  forwardedFor: string | null;
  userAgent: string | null;
  sessionIdHash: string | null;
}

let beforeSelfDeleteLock: (() => Promise<void>) | null = null;

export function setBeforeSelfDeleteLock(fn: (() => Promise<void>) | null): void {
  beforeSelfDeleteLock = fn;
}

export function confirmEmailMatches(accountEmail: string, confirmEmail: string): boolean {
  const trimmed = confirmEmail.trim();
  if (trimmed.length === 0 || trimmed.length > CONFIRM_EMAIL_MAX) return false;
  return trimmed.toLowerCase() === accountEmail.trim().toLowerCase();
}

export async function deleteOwnAccount(input: SelfDeleteInput): Promise<void> {
  if (!confirmEmailMatches(input.accountEmail, input.confirmEmail)) {
    throw errors.validation("Email confirmation does not match");
  }

  const db = getDb();
  const [account] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  if (!account) throw errors.unauthorized();

  if (account.passwordHash) {
    const password = input.password ?? "";
    const ok = password.length > 0 && (await verifyPassword(account.passwordHash, password));
    if (!ok) throw errors.unauthorized("Invalid email or password");
  } else {
    const createdAt = await getSessionCreatedAt(input.sessionToken);
    const age = createdAt ? Date.now() - createdAt.getTime() : Number.POSITIVE_INFINITY;
    if (age > SELF_DELETE_REAUTH_MS) throw errors.unauthorized("reauth_required");
  }

  await db.transaction(async (tx) => {
    if (beforeSelfDeleteLock) await beforeSelfDeleteLock();
    const [locked] = await tx
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1)
      .for("update");
    if (!locked) throw errors.unauthorized();
    if (locked.role === "admin") throw errors.forbidden(ADMIN_GUARD.adminRemove);

    const auditId = await insertSelfDeletePendingAudit(tx, {
      actorUserId: locked.id,
      actorEmail: locked.email,
      action: "user.self_delete",
      targets: [{ id: locked.id, email: locked.email }],
      requestId: input.requestId,
      clientIp: input.clientIp,
      forwardedFor: input.forwardedFor,
      userAgent: input.userAgent,
      sessionIdHash: input.sessionIdHash,
    });
    const deleted = await deleteUserCascade(tx, locked.id);
    await deleteAllSessionsForUser(locked.id, tx);
    await tx
      .update(auditEvents)
      .set({
        status: "completed",
        result: { removed: [{ id: locked.id, deleted }], skipped: [], failed: [] },
        completedAt: new Date(),
      })
      .where(eq(auditEvents.id, auditId));
  });
}
