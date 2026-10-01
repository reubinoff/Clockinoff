import { describe, expect, it } from "vitest";
import {
  GOOGLE_AUTH_ERROR_COPY,
  googleAuthErrorMessage,
} from "@/lib/google-auth-errors";

describe("googleAuthErrorMessage", () => {
  it("maps the three locked codes to Dana's exact copy", () => {
    expect(googleAuthErrorMessage("cancelled")).toBe("Google sign-in was cancelled.");
    expect(googleAuthErrorMessage("unverified")).toBe("Google email isn't verified.");
    expect(googleAuthErrorMessage("network")).toBe("Couldn't connect to Google. Try again.");
  });

  it("returns null for empty / null input (no stale error strip)", () => {
    expect(googleAuthErrorMessage(null)).toBeNull();
    expect(googleAuthErrorMessage(undefined)).toBeNull();
    expect(googleAuthErrorMessage("")).toBeNull();
  });

  it("falls back to the generic network copy for unknown codes (never leaks the raw code)", () => {
    expect(googleAuthErrorMessage("something-weird")).toBe(GOOGLE_AUTH_ERROR_COPY.network);
  });
});
