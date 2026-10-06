// Exact copy locked by Dana (Google auth brief, 2026-10-01, plus #122
// password-account refusal, 2026-10-06).
// Login / register map `?error=<code>` from the OAuth callback to one of
// these strings. `google_password_account` is an info banner, not a red
// error — it is handled separately so we never paint it as danger.

export type GoogleAuthErrorCode = "cancelled" | "unverified" | "network";

export const GOOGLE_AUTH_ERROR_COPY: Record<GoogleAuthErrorCode, string> = {
  cancelled: "Google sign-in was cancelled.",
  unverified: "Google email isn't verified.",
  network: "Couldn't connect to Google. Try again.",
};

export const GOOGLE_PASSWORD_ACCOUNT_ERROR = "google_password_account";

export const GOOGLE_PASSWORD_ACCOUNT_COPY =
  "This email already has a Clockinoff password. Sign in with it first, then connect Google from Settings.";

export const GOOGLE_PASSWORD_ACCOUNT_CTA = "Sign in with password";

export const GOOGLE_CONNECTED_TOAST = "Google connected. You can now sign in either way.";

export function isGooglePasswordAccountError(code: string | null | undefined): boolean {
  return code === GOOGLE_PASSWORD_ACCOUNT_ERROR;
}

export function googleAuthErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  if (isGooglePasswordAccountError(code)) return null;
  if (code === "cancelled" || code === "unverified" || code === "network") {
    return GOOGLE_AUTH_ERROR_COPY[code];
  }
  // Unknown but non-empty → use the generic network copy. We never pass a
  // raw code through to the user.
  return GOOGLE_AUTH_ERROR_COPY.network;
}

export function googlePasswordAccountLoginPath(): string {
  return `/login?error=${GOOGLE_PASSWORD_ACCOUNT_ERROR}`;
}

export function googleEmailMismatchMessage(email: string): string {
  return `That Google account uses a different email. Connect one that matches ${email}.`;
}
