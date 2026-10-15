export const CONFIRM_EMAIL_MAX = 254;

/** Trimmed, case-insensitive match. Empty or over-long input does not match. */
export function confirmEmailMatches(accountEmail: string, confirmEmail: string): boolean {
  const trimmed = confirmEmail.trim();
  if (trimmed.length === 0 || trimmed.length > CONFIRM_EMAIL_MAX) return false;
  return trimmed.toLowerCase() === accountEmail.trim().toLowerCase();
}
