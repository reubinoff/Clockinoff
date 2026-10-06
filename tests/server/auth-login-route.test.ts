import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as registerPost } from "@/app/api/auth/register/route";
import {
  LOGIN_IP_RATE_LIMIT,
  LOGIN_RATE_LIMIT,
  recordLoginFailure,
  resetAuthRateLimits,
} from "@/server/auth/rate-limit";
import { truncateAll } from "../setup";

const PW = "correct-horse-battery";

function post(url: string, body: unknown, ip = "198.51.100.1"): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login (rate limiting)", () => {
  beforeEach(async () => {
    await truncateAll();
    resetAuthRateLimits();
  });

  it("returns 429 with Retry-After after too many failed credential checks", async () => {
    const ip = "198.51.100.9";
    const email = "limit@example.com";
    // Create the account via the register route so the login path has
    // something real to compare against. Attempts use a fresh IP so the
    // register limiter doesn't trip.
    await registerPost(post("http://test/api/auth/register", { email, password: PW }, "198.51.100.1"));

    for (let i = 0; i < LOGIN_RATE_LIMIT.maxFailures; i += 1) {
      const res = await loginPost(
        post("http://test/api/auth/login", { email, password: "wrong-password" }, ip),
      );
      expect(res.status).toBe(401);
    }
    const blocked = await loginPost(
      post("http://test/api/auth/login", { email, password: PW }, ip),
    );
    expect(blocked.status).toBe(429);
    const retryAfter = blocked.headers.get("retry-after");
    expect(retryAfter).toBeTruthy();
    expect(Number(retryAfter)).toBeGreaterThan(0);

    const body = (await blocked.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
    // Uniform generic auth error — no enumeration via copy.
    expect(body.error.message.toLowerCase()).not.toContain("account");
    expect(body.error.message.toLowerCase()).not.toContain("exists");
  });

  it("does not share the login bucket across different IPs for the same email", async () => {
    const email = "shared@example.com";
    await registerPost(post("http://test/api/auth/register", { email, password: PW }, "198.51.100.2"));

    const attacker = "203.0.113.1";
    for (let i = 0; i < LOGIN_RATE_LIMIT.maxFailures; i += 1) {
      await loginPost(post("http://test/api/auth/login", { email, password: "wrong" }, attacker));
    }
    // Attacker IP is blocked.
    const attackerBlocked = await loginPost(
      post("http://test/api/auth/login", { email, password: PW }, attacker),
    );
    expect(attackerBlocked.status).toBe(429);

    // Legit user on a different IP is not.
    const legit = await loginPost(
      post("http://test/api/auth/login", { email, password: PW }, "198.51.100.33"),
    );
    expect(legit.status).toBe(200);
  });

  it("returns 429 before reading the body once the per-IP ceiling is hit (#151)", async () => {
    const ip = "198.51.100.77";
    for (let i = 0; i < LOGIN_IP_RATE_LIMIT.maxFailures; i += 1) {
      recordLoginFailure(`flood-${i}@example.com`, ip);
    }
    const res = await loginPost(
      new Request("http://test/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(1024 * 1024),
          "x-forwarded-for": ip,
        },
        body: "x".repeat(64),
      }),
    );
    // 429 (not 413) proves the throttle ran before the size-capped parse.
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
  });

  it("rejects a 1 MiB login body with 413 without parsing (#151)", async () => {
    const parseSpy = vi.spyOn(JSON, "parse");
    const before = parseSpy.mock.calls.length;
    const res = await loginPost(
      new Request("http://test/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(1024 * 1024),
          "x-forwarded-for": "198.51.100.50",
        },
        body: "x".repeat(64),
      }),
    );
    expect(res.status).toBe(413);
    expect(parseSpy.mock.calls.length).toBe(before);
    parseSpy.mockRestore();
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION");
  });

  it("rejects an empty login email with 400 before the credential check", async () => {
    const res = await loginPost(
      post("http://test/api/auth/login", { email: "", password: "x", pad: "y" }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION");
  });
});
