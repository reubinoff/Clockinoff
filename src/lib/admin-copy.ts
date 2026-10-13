// Exact guardrail strings from the #142 Quiet Pulse brief (Dana, locked
// by Shaul 2026-10-07). The apostrophe is U+2019 so the API toast and
// the disabled-control `title` match character for character.

export const ADMIN_GUARD = {
  selfRemove: "You can’t remove yourself.",
  selfBlock: "You can’t block yourself.",
  selfDemote: "You can’t demote yourself.",
  lastAdmin: "You can’t remove the last admin.",
  lastAdminDemote: "You can’t demote the last admin.",
  adminRemove: "You can’t remove an admin.",
  adminBlock: "You can’t block an admin.",
  generic: "Couldn’t complete that action. Try again.",
} as const;

// #219 design lock. Straight apostrophes, exact strings.
export const BULK_REMOVE_CAP = 25;

export const BULK_REMOVE_COPY = {
  body: "This permanently deletes these accounts and all their time entries. It can't be undone. Admins and your own account are skipped.",
  mismatch: "The number didn't match. Nothing was removed.",
  overCap: "You can remove up to 25 users at a time. Nothing was removed.",
  overCapHint: "You can remove up to 25 users at a time. Deselect some to continue.",
  generic: "Couldn't remove users. Nothing was changed. Try again.",
} as const;

export function bulkRemoveConfirmLabel(count: number): string {
  return `Type ${count} to confirm`;
}

export function bulkRemoveFailureMessage(message: string | undefined | null): string {
  if (message === BULK_REMOVE_COPY.mismatch) return BULK_REMOVE_COPY.mismatch;
  if (message === BULK_REMOVE_COPY.overCap) return BULK_REMOVE_COPY.overCap;
  return BULK_REMOVE_COPY.generic;
}

const KNOWN: ReadonlySet<string> = new Set([
  ADMIN_GUARD.selfRemove,
  ADMIN_GUARD.selfBlock,
  ADMIN_GUARD.selfDemote,
  ADMIN_GUARD.lastAdmin,
  ADMIN_GUARD.lastAdminDemote,
  ADMIN_GUARD.adminRemove,
  ADMIN_GUARD.adminBlock,
]);

export function adminActionErrorMessage(message: string | undefined | null): string {
  if (message && KNOWN.has(message)) return message;
  return ADMIN_GUARD.generic;
}
