import { describe, expect, it } from "vitest";
import {
  GOOGLE_AUTH_ERROR_COPY,
  GOOGLE_CONNECTED_TOAST,
  GOOGLE_PASSWORD_ACCOUNT_COPY,
  GOOGLE_PASSWORD_ACCOUNT_CTA,
  GOOGLE_PASSWORD_ACCOUNT_ERROR,
  googleAuthErrorMessage,
  googleEmailMismatchMessage,
  googlePasswordAccountLoginPath,
  isGooglePasswordAccountError,
  isGoogleUnavailableError,
} from "@/lib/google-auth-errors";

describe("googleAuthErrorMessage", () => {
  it("maps the locked user-fault codes to Dana's exact copy", () => {
    expect(googleAuthErrorMessage("cancelled")).toBe("Google sign-in was cancelled.");
    expect(googleAuthErrorMessage("unverified")).toBe("Google email isn't verified.");
    expect(googleAuthErrorMessage("network")).toBe("Couldn't connect to Google. Try again.");
    expect(GOOGLE_AUTH_ERROR_COPY.unavailable).toBe(
      "Google sign-in isn't available right now. Sign in with your email and password, or try again later.",
    );
  });

  it("returns null for empty / null input (no stale error strip)", () => {
    expect(googleAuthErrorMessage(null)).toBeNull();
    expect(googleAuthErrorMessage(undefined)).toBeNull();
    expect(googleAuthErrorMessage("")).toBeNull();
  });

  it("does not paint google_password_account as a red network error", () => {
    expect(isGooglePasswordAccountError(GOOGLE_PASSWORD_ACCOUNT_ERROR)).toBe(true);
    expect(isGooglePasswordAccountError("network")).toBe(false);
    expect(googleAuthErrorMessage(GOOGLE_PASSWORD_ACCOUNT_ERROR)).toBeNull();
  });

  it("does not paint unavailable as a red user-fault error", () => {
    expect(isGoogleUnavailableError("unavailable")).toBe(true);
    expect(isGoogleUnavailableError("network")).toBe(false);
    expect(googleAuthErrorMessage("unavailable")).toBeNull();
  });

  it("falls back to the generic network copy for unknown codes (never leaks the raw code)", () => {
    expect(googleAuthErrorMessage("something-weird")).toBe(GOOGLE_AUTH_ERROR_COPY.network);
  });
});

describe("google password-account helpers", () => {
  it("builds the locked login path without an email prefill", () => {
    expect(googlePasswordAccountLoginPath()).toBe("/login?error=google_password_account");
  });

  it("locks Dana banner / mismatch copy", () => {
    expect(GOOGLE_PASSWORD_ACCOUNT_COPY).toBe(
      "This email already has a Clockinoff password. Sign in with it first, then connect Google from Settings.",
    );
    expect(GOOGLE_PASSWORD_ACCOUNT_CTA).toBe("Sign in with password");
    expect(GOOGLE_CONNECTED_TOAST).toBe("Google connected. You can now sign in either way.");
    expect(googleEmailMismatchMessage("dana@example.com")).toBe(
      "That Google account uses a different email. Connect one that matches dana@example.com.",
    );
  });
});
