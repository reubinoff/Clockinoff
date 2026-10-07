// Exact guardrail strings from the #142 Quiet Pulse brief (Dana, locked
// by Shaul 2026-10-07). The apostrophe is U+2019 so the API toast and
// the disabled-control `title` match character for character.

export const ADMIN_GUARD = {
  selfRemove: "You can’t remove yourself.",
  selfBlock: "You can’t block yourself.",
  selfDemote: "You can’t demote yourself.",
  lastAdmin: "You can’t remove the last admin.",
  generic: "Couldn’t complete that action. Try again.",
} as const;

const KNOWN: ReadonlySet<string> = new Set([
  ADMIN_GUARD.selfRemove,
  ADMIN_GUARD.selfBlock,
  ADMIN_GUARD.selfDemote,
  ADMIN_GUARD.lastAdmin,
]);

export function adminActionErrorMessage(message: string | undefined | null): string {
  if (message && KNOWN.has(message)) return message;
  return ADMIN_GUARD.generic;
}
