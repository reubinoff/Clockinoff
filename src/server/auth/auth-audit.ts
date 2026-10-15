import { capAuditForwardedFor, capAuditUserAgent } from "@/lib/audit-user-agent";
import { logger } from "@/lib/logger";
import { getDb } from "@/server/db/client";
import { auditEvents, type AuditTarget } from "@/server/db/schema";

// Point-in-time auth events. Inserted as completed rows. Logout and
// session deletes do not update or delete these rows.
export const AUTH_AUDIT = {
  register: "auth.register",
  loginSuccess: "auth.login_success",
  loginFailure: "auth.login_failure",
  logout: "auth.logout",
} as const;

export type AuthAuditAction = (typeof AUTH_AUDIT)[keyof typeof AUTH_AUDIT];

// Failed login stores the submitted address only. 254 matches the
// register/login email length check. Lowercase matches the login lookup
// so the row is not a second copy of the raw header.
export const LOGIN_FAILURE_EMAIL_MAX = 254;

// One JSON object on the error stream. App Insights alerts on `event`.
// `type` is the audit action. `error_class` is the thrown value's name.
// Nothing else: no message, no request fields.
export const AUDIT_WRITE_FAILED = "audit_write_failed";

const ERROR_CLASS_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

function errorClassName(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  return ERROR_CLASS_NAME.test(name) ? name : "Error";
}

export function loginFailureActorEmail(email: string): string {
  return email.trim().toLowerCase().slice(0, LOGIN_FAILURE_EMAIL_MAX);
}

export interface AuthAuditEvent {
  action: AuthAuditAction;
  actorUserId: string | null;
  actorEmail: string;
  targets: AuditTarget[];
  requestId: string;
  clientIp: string | null;
  forwardedFor: string | null;
  userAgent: string | null;
  sessionIdHash: string | null;
}

type AuthAuditInsert = (row: AuthAuditEvent) => Promise<void>;

async function insertAuthAudit(row: AuthAuditEvent): Promise<void> {
  await getDb().insert(auditEvents).values({
    actorUserId: row.actorUserId,
    actorEmail: row.actorEmail,
    action: row.action,
    targets: row.targets,
    requestId: row.requestId,
    clientIp: row.clientIp,
    forwardedFor: row.forwardedFor,
    userAgent: row.userAgent,
    sessionIdHash: row.sessionIdHash,
    status: "completed",
    completedAt: new Date(),
  });
}

let insertAuthAuditFn: AuthAuditInsert = insertAuthAudit;

export function setAuthAuditInsert(fn: AuthAuditInsert | null): void {
  insertAuthAuditFn = fn ?? insertAuthAudit;
}

// Login, register, and logout keep going when the insert throws. The
// response stays the auth result (201/200/204/401/500 from the auth
// path). Self-delete stays fail-closed in its own transaction.
export async function recordAuthEvent(input: AuthAuditEvent): Promise<void> {
  const failure = input.action === AUTH_AUDIT.loginFailure;
  const row: AuthAuditEvent = {
    action: input.action,
    actorUserId: failure ? null : input.actorUserId,
    actorEmail: failure ? loginFailureActorEmail(input.actorEmail) : input.actorEmail,
    targets: failure ? [] : input.targets,
    requestId: input.requestId,
    clientIp: input.clientIp,
    forwardedFor: capAuditForwardedFor(input.forwardedFor),
    userAgent: capAuditUserAgent(input.userAgent),
    sessionIdHash: failure ? null : input.sessionIdHash,
  };
  try {
    await insertAuthAuditFn(row);
  } catch (err) {
    // Whole line is JSON. The catch value's message is not included; it
    // can carry the statement text and the request.
    logger.error(
      JSON.stringify({
        event: AUDIT_WRITE_FAILED,
        type: row.action,
        error_class: errorClassName(err),
      }),
    );
  }
}
