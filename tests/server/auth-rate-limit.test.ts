import { beforeEach, describe, expect, it } from "vitest";
import {
  LOGIN_RATE_LIMIT,
  REGISTER_RATE_LIMIT,
  isLoginRateLimited,
  isRegisterRateLimited,
  loginRetryAfterSeconds,
  recordLoginFailure,
  recordLoginSuccess,
  recordRegisterAttempt,
  registerRetryAfterSeconds,
  resetAuthRateLimits,
} from "@/server/auth/rate-limit";

describe("auth/rate-limit", () => {
  beforeEach(() => {
    resetAuthRateLimits();
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

  it("reports zero retry-after when no login bucket exists", () => {
    expect(loginRetryAfterSeconds("fresh@example.com", "1.1.1.1")).toBe(0);
  });

  it("reports a positive retry-after once the login bucket is tripped", () => {
    const start = 2_000_000;
    for (let i = 0; i < LOGIN_RATE_LIMIT.maxFailures; i += 1) {
      recordLoginFailure("a@example.com", "1.1.1.1", start);
    }
    const retry = loginRetryAfterSeconds("a@example.com", "1.1.1.1", start);
    expect(retry).toBeGreaterThan(0);
    expect(retry).toBeLessThanOrEqual(Math.ceil(LOGIN_RATE_LIMIT.windowMs / 1000));
    // And drops back to 0 once the window closes.
    const after = start + LOGIN_RATE_LIMIT.windowMs + 1;
    expect(loginRetryAfterSeconds("a@example.com", "1.1.1.1", after)).toBe(0);
  });

  // -------- register limiter --------------------------------------------

  it("does not limit register before the per-IP threshold", () => {
    for (let i = 0; i < REGISTER_RATE_LIMIT.maxAttempts - 1; i += 1) {
      recordRegisterAttempt("5.5.5.5");
      expect(isRegisterRateLimited("5.5.5.5")).toBe(false);
    }
  });

  it("limits register after the per-IP threshold within the window", () => {
    for (let i = 0; i < REGISTER_RATE_LIMIT.maxAttempts; i += 1) {
      recordRegisterAttempt("5.5.5.5");
    }
    expect(isRegisterRateLimited("5.5.5.5")).toBe(true);
    // A different IP is untouched.
    expect(isRegisterRateLimited("6.6.6.6")).toBe(false);
  });

  it("expires the register bucket once the window passes", () => {
    const start = 3_000_000;
    for (let i = 0; i < REGISTER_RATE_LIMIT.maxAttempts; i += 1) {
      recordRegisterAttempt("5.5.5.5", start);
    }
    expect(isRegisterRateLimited("5.5.5.5", start)).toBe(true);
    const after = start + REGISTER_RATE_LIMIT.windowMs + 1;
    expect(isRegisterRateLimited("5.5.5.5", after)).toBe(false);
    recordRegisterAttempt("5.5.5.5", after);
    expect(isRegisterRateLimited("5.5.5.5", after)).toBe(false);
  });

  it("reports retry-after for the register bucket", () => {
    expect(registerRetryAfterSeconds("fresh-ip")).toBe(0);
    const start = 4_000_000;
    for (let i = 0; i < REGISTER_RATE_LIMIT.maxAttempts; i += 1) {
      recordRegisterAttempt("7.7.7.7", start);
    }
    const retry = registerRetryAfterSeconds("7.7.7.7", start);
    expect(retry).toBeGreaterThan(0);
    expect(retry).toBeLessThanOrEqual(Math.ceil(REGISTER_RATE_LIMIT.windowMs / 1000));
  });
});
