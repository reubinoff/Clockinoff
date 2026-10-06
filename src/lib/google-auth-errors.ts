// Exact copy locked by Dana (Google auth brief, 2026-10-01).
// Login / register map `?error=<code>` from the OAuth callback to one of
// these three strings. Any unknown code falls through to the "network"
// copy so we never show a raw error ID in the UI.

export type GoogleAuthErrorCode = "cancelled" | "unverified" | "network";

export const GOOGLE_AUTH_ERROR_COPY: Record<GoogleAuthErrorCode, string> = {
  cancelled: "Google sign-in was cancelled.",
  unverified: "Google email isn't verified.",
  network: "Couldn't connect to Google. Try again.",
};

export function googleAuthErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  if (code === "cancelled" || code === "unverified" || code === "network") {
    return GOOGLE_AUTH_ERROR_COPY[code];
  }
  // Unknown but non-empty → use the generic network copy. We never pass a
  // raw code through to the user.
  return GOOGLE_AUTH_ERROR_COPY.network;
}
