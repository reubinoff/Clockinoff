import { beforeEach, describe, expect, it } from "vitest";
import {
  LOGIN_RATE_LIMIT,
  isLoginRateLimited,
  recordLoginFailure,
  recordLoginSuccess,
  resetLoginRateLimit,
} from "@/server/auth/rate-limit";

describe("auth/rate-limit", () => {
  beforeEach(() => {
    resetLoginRateLimit();
  });

  it("does not limit before the threshold is reached", () => {
    for (let i = 0; i < LOGIN_RATE_LIMIT.maxFailures - 1; i += 1) {
      recordLoginFailure("a@example.com", "1.1.1.1");
      expect(isLoginRateLimited("a@example.com", "1.1.1.1")).toBe(false);
    }
  });

  it("limits after the max failure count within the window", () => {
    for (let i = 0; i < LOGIN_RATE_LIMIT.maxFailures; i += 1) {
      recordLoginFailure("a@example.com", "1.1.1.1");
    }
    expect(isLoginRateLimited("a@example.com", "1.1.1.1")).toBe(true);
  });

  it("scopes the counter to email + IP together", () => {
    for (let i = 0; i < LOGIN_RATE_LIMIT.maxFailures; i += 1) {
      recordLoginFailure("victim@example.com", "1.1.1.1");
    }
    expect(isLoginRateLimited("victim@example.com", "1.1.1.1")).toBe(true);
    expect(isLoginRateLimited("victim@example.com", "2.2.2.2")).toBe(false);
    expect(isLoginRateLimited("other@example.com", "1.1.1.1")).toBe(false);
  });

  it("normalizes email casing and surrounding whitespace", () => {
    for (let i = 0; i < LOGIN_RATE_LIMIT.maxFailures; i += 1) {
      recordLoginFailure("Same@Example.com", "9.9.9.9");
    }
    expect(isLoginRateLimited("  same@example.com ", "9.9.9.9")).toBe(true);
  });

  it("clears the bucket on a successful login", () => {
    for (let i = 0; i < LOGIN_RATE_LIMIT.maxFailures; i += 1) {
      recordLoginFailure("a@example.com", "1.1.1.1");
    }
    expect(isLoginRateLimited("a@example.com", "1.1.1.1")).toBe(true);
    recordLoginSuccess("a@example.com", "1.1.1.1");
    expect(isLoginRateLimited("a@example.com", "1.1.1.1")).toBe(false);
  });

  it("recordLoginSuccess is a no-op when nothing is tracked", () => {
    recordLoginSuccess("nobody@example.com", "0.0.0.0");
    expect(isLoginRateLimited("nobody@example.com", "0.0.0.0")).toBe(false);
  });

  it("expires the bucket once the window passes", () => {
    const start = 1_000_000;
    for (let i = 0; i < LOGIN_RATE_LIMIT.maxFailures; i += 1) {
      recordLoginFailure("a@example.com", "1.1.1.1", start);
    }
    expect(isLoginRateLimited("a@example.com", "1.1.1.1", start)).toBe(true);
    const after = start + LOGIN_RATE_LIMIT.windowMs + 1;
    expect(isLoginRateLimited("a@example.com", "1.1.1.1", after)).toBe(false);
    // A failure after expiry starts a fresh window rather than continuing
    // the exhausted one.
    recordLoginFailure("a@example.com", "1.1.1.1", after);
    expect(isLoginRateLimited("a@example.com", "1.1.1.1", after)).toBe(false);
  });
});
