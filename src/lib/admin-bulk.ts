// Shared bulk-eligibility rules for the admin Users page (#194, #219).
// Remove skips every admin and the caller. The server recomputes that
// same set and requires confirmCount to match it. These checks decide
// which toolbar buttons appear and who the confirm dialog counts.

import { ADMIN_GUARD } from "@/lib/admin-copy";

export type AdminActionKind = "remove" | "block" | "unblock" | "promote" | "demote";

export interface BulkSubject {
  id: string;
  role: "user" | "admin";
  status: "active" | "blocked";
}

export function bulkIneligibleReason(
  kind: AdminActionKind,
  user: BulkSubject,
  actorId: string,
  adminsCount: number,
): string | undefined {
  const self = user.id === actorId;
  const sole = user.role === "admin" && adminsCount <= 1;
  if (kind === "remove") {
    if (self) return ADMIN_GUARD.selfRemove;
    if (user.role === "admin") return ADMIN_GUARD.adminRemove;
    return undefined;
  }
  if (kind === "block") {
    if (self) return ADMIN_GUARD.selfBlock;
    if (user.role === "admin") return ADMIN_GUARD.adminBlock;
    if (user.status === "blocked") return "Already blocked";
    return undefined;
  }
  if (kind === "unblock") {
    if (user.status !== "blocked") return "Not blocked";
    return undefined;
  }
  if (kind === "promote") {
    if (user.role === "admin") return "Already an admin";
    return undefined;
  }
  if (user.role !== "admin") return "Not an admin";
  if (sole) return ADMIN_GUARD.lastAdminDemote;
  if (self) return ADMIN_GUARD.selfDemote;
  return undefined;
}

export function isBulkEligible(
  kind: AdminActionKind,
  user: BulkSubject,
  actorId: string,
  adminsCount: number,
): boolean {
  return bulkIneligibleReason(kind, user, actorId, adminsCount) === undefined;
}

export function partitionBulk<T extends BulkSubject>(
  kind: AdminActionKind,
  users: readonly T[],
  actorId: string,
  adminsCount: number,
): { eligible: T[]; skipped: T[] } {
  const eligible: T[] = [];
  const skipped: T[] = [];
  for (const user of users) {
    if (isBulkEligible(kind, user, actorId, adminsCount)) eligible.push(user);
    else skipped.push(user);
  }
  return { eligible, skipped };
}

const VERB: Record<AdminActionKind, string> = {
  remove: "Remove",
  block: "Block",
  unblock: "Unblock",
  promote: "Promote",
  demote: "Demote",
};

const PAST: Record<AdminActionKind, string> = {
  remove: "Removed",
  block: "Blocked",
  unblock: "Unblocked",
  promote: "Promoted",
  demote: "Demoted",
};

export function bulkConfirmTitle(kind: AdminActionKind, count: number): string {
  const noun = count === 1 ? "user" : "users";
  return `${VERB[kind]} ${count} ${noun}?`;
}

export const BULK_SAMPLE_LIMIT = 3;

export function bulkSampleEmails(emails: readonly string[]): { shown: string[]; more: number } {
  const shown = emails.slice(0, BULK_SAMPLE_LIMIT);
  return { shown, more: Math.max(0, emails.length - shown.length) };
}

export function bulkWillSkipLine(skipped: number): string | null {
  if (skipped <= 0) return null;
  if (skipped === 1) return "1 will be skipped.";
  return `${skipped} will be skipped.`;
}

// Remove names who is left out. "K will be skipped" stays plural for 1.
export function bulkRemoveSkipLine(skipped: number): string | null {
  if (skipped <= 0) return null;
  return `${skipped} will be skipped (admins or you).`;
}

// Null when nobody was skipped — the page just refreshes, same as a
// single-row action. A skip is the only bulk outcome that needs a toast.
export function bulkSkippedToast(
  kind: AdminActionKind,
  applied: number,
  skipped: number,
): string | null {
  if (skipped <= 0) return null;
  if (applied <= 0) return `Skipped ${skipped}.`;
  return `${PAST[kind]} ${applied}. Skipped ${skipped}.`;
}
