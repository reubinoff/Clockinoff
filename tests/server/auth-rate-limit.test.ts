import { beforeEach, describe, expect, it } from "vitest";
import {
  GOOGLE_OAUTH_RATE_LIMIT,
  LOGIN_IP_RATE_LIMIT,
  LOGIN_RATE_LIMIT,
  REGISTER_RATE_LIMIT,
  googleOAuthMapSize,
  googleOAuthRetryAfterSeconds,
  isGoogleOAuthRateLimited,
  isLoginIpRateLimited,
  isLoginRateLimited,
  isRegisterRateLimited,
  loginIpMapSize,
  loginIpRetryAfterSeconds,
  loginMapSize,
  loginRetryAfterSeconds,
  recordGoogleOAuthAttempt,
  recordLoginFailure,
  recordLoginSuccess,
  recordRegisterAttempt,
  registerMapSize,
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

  it("limits one IP across emails after the per-IP ceiling", () => {
    const ip = "8.8.8.8";
    for (let i = 0; i < LOGIN_IP_RATE_LIMIT.maxFailures; i += 1) {
      recordLoginFailure(`e${i}@example.com`, ip);
    }
    expect(isLoginIpRateLimited(ip)).toBe(true);
    expect(isLoginIpRateLimited("9.9.9.9")).toBe(false);
    const retry = loginIpRetryAfterSeconds(ip);
    expect(retry).toBeGreaterThan(0);
    expect(loginIpRetryAfterSeconds("fresh-ip")).toBe(0);
  });

  it("caps the login map and evicts the oldest keys (#145)", () => {
    for (let i = 0; i < LOGIN_RATE_LIMIT.maxFailures; i += 1) {
      recordLoginFailure("keep@example.com", "1.1.1.1");
    }
    expect(isLoginRateLimited("keep@example.com", "1.1.1.1")).toBe(true);

    for (let i = 0; i < LOGIN_RATE_LIMIT.maxBuckets; i += 1) {
      recordLoginFailure(`n${i}@example.com`, "2.2.2.2");
    }
    expect(loginMapSize()).toBe(LOGIN_RATE_LIMIT.maxBuckets);
    expect(isLoginRateLimited("keep@example.com", "1.1.1.1")).toBe(false);
  });

  it("caps the register map at maxBuckets", () => {
    for (let i = 0; i < REGISTER_RATE_LIMIT.maxBuckets + 25; i += 1) {
      recordRegisterAttempt(`203.0.113.${i % 255}-${Math.floor(i / 255)}`);
    }
    expect(registerMapSize()).toBe(REGISTER_RATE_LIMIT.maxBuckets);
  });

  it("sweeps a bounded prefix of expired keys instead of the full map", () => {
    const start = 5_000_000;
    for (let i = 0; i < 80; i += 1) {
      recordLoginFailure(`old${i}@example.com`, "1.1.1.1", start);
    }
    expect(loginMapSize()).toBe(80);
    const after = start + LOGIN_RATE_LIMIT.windowMs + 1;
    recordLoginFailure("fresh@example.com", "1.1.1.1", after);
    // Incremental prune removes at most pruneScan expired keys per write.
    expect(loginMapSize()).toBeLessThan(80);
    expect(loginMapSize()).toBeGreaterThanOrEqual(80 - LOGIN_RATE_LIMIT.pruneScan);
  });

  it("stays O(1) amortised when the login map is already full", () => {
    for (let i = 0; i < LOGIN_RATE_LIMIT.maxBuckets; i += 1) {
      recordLoginFailure(`full${i}@example.com`, "4.4.4.4");
    }
    const started = performance.now();
    for (let i = 0; i < 1_000; i += 1) {
      recordLoginFailure(`extra${i}@example.com`, "5.5.5.5");
    }
    const elapsed = performance.now() - started;
    expect(loginMapSize()).toBe(LOGIN_RATE_LIMIT.maxBuckets);
    expect(loginIpMapSize()).toBeLessThanOrEqual(LOGIN_IP_RATE_LIMIT.maxBuckets);
    expect(elapsed).toBeLessThan(250);
  });

  // -------- Google OAuth limiter ----------------------------------------

  it("limits Google OAuth after the per-IP threshold", () => {
    for (let i = 0; i < GOOGLE_OAUTH_RATE_LIMIT.maxAttempts; i += 1) {
      recordGoogleOAuthAttempt("8.8.8.8");
    }
    expect(isGoogleOAuthRateLimited("8.8.8.8")).toBe(true);
    expect(isGoogleOAuthRateLimited("9.9.9.9")).toBe(false);
  });

  it("expires the Google OAuth bucket once the window passes", () => {
    const start = 6_000_000;
    for (let i = 0; i < GOOGLE_OAUTH_RATE_LIMIT.maxAttempts; i += 1) {
      recordGoogleOAuthAttempt("8.8.8.8", start);
    }
    expect(isGoogleOAuthRateLimited("8.8.8.8", start)).toBe(true);
    const after = start + GOOGLE_OAUTH_RATE_LIMIT.windowMs + 1;
    expect(isGoogleOAuthRateLimited("8.8.8.8", after)).toBe(false);
    recordGoogleOAuthAttempt("8.8.8.8", after);
    expect(isGoogleOAuthRateLimited("8.8.8.8", after)).toBe(false);
  });

  it("sweeps a bounded prefix of expired Google OAuth keys", () => {
    const start = 7_000_000;
    for (let i = 0; i < 80; i += 1) {
      recordGoogleOAuthAttempt(`ip-${i}`, start);
    }
    expect(googleOAuthMapSize()).toBe(80);
    const after = start + GOOGLE_OAUTH_RATE_LIMIT.windowMs + 1;
    recordGoogleOAuthAttempt("fresh-after-prune", after);
    expect(googleOAuthMapSize()).toBeLessThan(80);
    expect(googleOAuthMapSize()).toBeGreaterThanOrEqual(80 - GOOGLE_OAUTH_RATE_LIMIT.pruneScan);
    expect(isGoogleOAuthRateLimited("fresh-after-prune", after)).toBe(false);
  });

  it("reports retry-after for the Google OAuth bucket", () => {
    expect(googleOAuthRetryAfterSeconds("fresh-google-ip")).toBe(0);
    const start = 8_000_000;
    for (let i = 0; i < GOOGLE_OAUTH_RATE_LIMIT.maxAttempts; i += 1) {
      recordGoogleOAuthAttempt("8.8.4.4", start);
    }
    const retry = googleOAuthRetryAfterSeconds("8.8.4.4", start);
    expect(retry).toBeGreaterThan(0);
    expect(retry).toBeLessThanOrEqual(Math.ceil(GOOGLE_OAUTH_RATE_LIMIT.windowMs / 1000));
  });
});
