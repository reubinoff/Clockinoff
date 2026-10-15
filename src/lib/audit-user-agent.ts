// Stored on audit_events. Both columns are text. Cap before insert so a
// long header cannot land in the row from any caller. Control characters
// are dropped so the value stays a single line of text (NUL would make
// Postgres reject the insert).

export const AUDIT_USER_AGENT_MAX = 512;
export const AUDIT_FORWARDED_FOR_MAX = 512;

const NON_TEXT = /[\u0000-\u001F\u007F]/g;

function capAuditText(value: string | null | undefined, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(NON_TEXT, "").trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, max);
}

export function capAuditUserAgent(value: string | null | undefined): string | null {
  return capAuditText(value, AUDIT_USER_AGENT_MAX);
}

export function capAuditForwardedFor(value: string | null | undefined): string | null {
  return capAuditText(value, AUDIT_FORWARDED_FOR_MAX);
}
