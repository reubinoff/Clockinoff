import { describe, expect, it } from "vitest";
import { CONFIRM_EMAIL_MAX, confirmEmailMatches } from "@/lib/confirm-email";

describe("confirmEmailMatches", () => {
  it("trims and compares case-insensitively, and rejects empty or over-long input", () => {
    expect(CONFIRM_EMAIL_MAX).toBe(254);
    expect(confirmEmailMatches("Ada@Example.com", "  ada@example.com  ")).toBe(true);
    expect(confirmEmailMatches("ada@example.com", "other@example.com")).toBe(false);
    expect(confirmEmailMatches("ada@example.com", "   ")).toBe(false);
    expect(confirmEmailMatches("ada@example.com", "a".repeat(255))).toBe(false);
  });
});
