import { beforeEach, describe, expect, it } from "vitest";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as registerPost } from "@/app/api/auth/register/route";
import {
  LOGIN_RATE_LIMIT,
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
});
