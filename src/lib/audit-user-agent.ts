// Stored on audit_events.user_agent. Cap before insert so a long
// header cannot land in the row from any caller.

export const AUDIT_USER_AGENT_MAX = 512;

export function capAuditUserAgent(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, AUDIT_USER_AGENT_MAX);
}
