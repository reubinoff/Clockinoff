import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

const SNAPSHOT = {
  secret: process.env.OAUTH_STATE_SECRET,
  node: process.env.NODE_ENV,
};

function restore(): void {
  if (SNAPSHOT.secret) process.env.OAUTH_STATE_SECRET = SNAPSHOT.secret;
  else delete process.env.OAUTH_STATE_SECRET;
  (process.env as { NODE_ENV?: string }).NODE_ENV = SNAPSHOT.node;
}

describe("GET /api/health", () => {
  afterEach(() => {
    restore();
  });

  it("returns 200 when the OAuth state secret is present", async () => {
    process.env.OAUTH_STATE_SECRET = "health-secret";
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 503 in production when OAUTH_STATE_SECRET is missing", async () => {
    delete process.env.OAUTH_STATE_SECRET;
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    const res = await GET();
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
  });
});
