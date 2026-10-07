// Env bootstrap for the first admin (#142). Operators set
// `ADMIN_EMAILS` (comma-separated). Matching addresses are created as
// admins and promoted on the next successful sign-in. Removing an
// address from the list does not demote anyone — demotion is an admin
// action (or a direct DB change).

export type UserRole = "user" | "admin";
export type UserStatus = "active" | "blocked";

export function parseAdminEmails(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const email = part.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

export function isBootstrapAdminEmail(
  email: string,
  raw: string | undefined | null = process.env.ADMIN_EMAILS,
): boolean {
  return parseAdminEmails(raw).includes(email.trim().toLowerCase());
}

export function initialRoleForEmail(email: string): UserRole {
  return isBootstrapAdminEmail(email) ? "admin" : "user";
}

export function asUserRole(role: string): UserRole {
  return role === "admin" ? "admin" : "user";
}
