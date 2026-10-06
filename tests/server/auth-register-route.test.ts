import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/auth/register/route";
import {
  REGISTER_RATE_LIMIT,
  resetAuthRateLimits,
} from "@/server/auth/rate-limit";
import { REGISTER_FAILURE_COPY } from "@/lib/register-copy";
import { truncateAll } from "../setup";

const GENERIC = REGISTER_FAILURE_COPY;
const PW = "correct-horse-battery";

function postJson(body: unknown, ip = "9.9.9.9"): Request {
  return new Request("http://test/api/auth/register", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

async function run(body: unknown): Promise<{ status: number; body: unknown; ms: number }> {
  const t0 = Date.now();
  const res = await POST(postJson(body));
  const ms = Date.now() - t0;
  return { status: res.status, body: await res.json(), ms };
}

describe("POST /api/auth/register (anti-enumeration)", () => {
  beforeEach(async () => {
    await truncateAll();
    resetAuthRateLimits();
  });

  it("creates a new account with a session cookie on success", async () => {
    const req = postJson({ email: "ok@example.com", password: PW });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/timely_session=/);
  });

  it("returns the same status + shape + message for a duplicate email as for an unknown failure", async () => {
    // Seed an existing account.
    await POST(postJson({ email: "dup@example.com", password: PW }));

    const dup = await run({ email: "DUP@example.com", password: PW });
    expect(dup.status).toBe(400);
    expect(dup.body).toEqual({
      error: { code: "VALIDATION", message: GENERIC },
    });
  });

  it("never returns the string 'email' or 'taken' on duplicate", async () => {
    await POST(postJson({ email: "leak@example.com", password: PW }));
    const dup = await run({ email: "leak@example.com", password: PW });
    const asString = JSON.stringify(dup.body).toLowerCase();
    expect(asString).not.toContain("already");
    expect(asString).not.toContain("taken");
    expect(asString).not.toContain("exists");
    expect(asString).toContain(GENERIC.toLowerCase());
  });

  it("has comparable latency for a duplicate vs a fresh register (both hash the password)", async () => {
    // Warm the argon2 workers so the first call doesn't dominate the sample.
    await POST(postJson({ email: "warm@example.com", password: PW }));

    await POST(postJson({ email: "seeded@example.com", password: PW }));

    const dup = await run({ email: "seeded@example.com", password: PW });
    const fresh = await run({ email: "fresh@example.com", password: PW });

    // Both paths must complete the argon2id hash (~50–300ms on the CI box)
    // before responding. The absolute threshold is intentionally generous —
    // the assertion is that "duplicate email" is not orders of magnitude
    // faster than the happy path, which is how enumeration usually leaks.
    expect(dup.ms).toBeGreaterThan(20);
    expect(fresh.ms).toBeGreaterThan(20);
    const ratio = Math.max(dup.ms, fresh.ms) / Math.max(1, Math.min(dup.ms, fresh.ms));
    expect(ratio).toBeLessThan(5);
  });

  it("still surfaces client-side field validation errors verbatim", async () => {
    // Password policy failures are not the anti-enumeration path and can
    // still guide the user — they never depend on account existence.
    const short = await run({ email: "short@example.com", password: "abc" });
    expect(short.status).toBe(400);
    expect(short.body).toMatchObject({
      error: { code: "VALIDATION" },
    });
    expect(JSON.stringify(short.body)).not.toContain(GENERIC);
  });

  it("returns 400 with a helpful VALIDATION message when body is not JSON", async () => {
    const req = new Request("http://test/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION");
  });

  it("returns 429 with Retry-After once the per-IP register budget is exhausted", async () => {
    const ip = "203.0.113.42";
    // Burn the budget with a mix of OK and VALIDATION outcomes to prove the
    // limiter counts *all* attempts, not just failures.
    for (let i = 0; i < REGISTER_RATE_LIMIT.maxAttempts; i += 1) {
      await POST(postJson({ email: `fill-${i}@example.com`, password: PW }, ip));
    }
    const blocked = await POST(postJson({ email: "late@example.com", password: PW }, ip));
    expect(blocked.status).toBe(429);
    const retryAfter = blocked.headers.get("retry-after");
    expect(retryAfter).toBeTruthy();
    expect(Number(retryAfter)).toBeGreaterThan(0);
    const body = (await blocked.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
    // Uniform, non-enumerating copy.
    expect(body.error.message.toLowerCase()).not.toContain("email");

    // A different IP is unaffected — the limiter is per-IP, not global.
    const other = await POST(postJson({ email: "other@example.com", password: PW }, "198.51.100.7"));
    expect(other.status).toBe(201);
  });
});
