import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession } from "@/server/auth/session";
import * as sessionMod from "@/server/auth/session";
import {
  runScheduledSessionPurge,
  shouldStartSessionPurge,
  startSessionPurgeLoop,
  stopSessionPurgeLoop,
  _internal,
} from "@/server/auth/session-purge";
import { getDb } from "@/server/db/client";
import { sessions } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { register } from "@/server/auth/service";
import { truncateAll } from "../setup";

const PW = "correct-horse-battery";

describe("session purge scheduler", () => {
  beforeEach(async () => {
    await truncateAll();
    stopSessionPurgeLoop();
  });

  afterEach(() => {
    stopSessionPurgeLoop();
    vi.restoreAllMocks();
  });

  it("shouldStartSessionPurge is off in test, build, and non-Node runtimes", () => {
    expect(
      shouldStartSessionPurge({ NODE_ENV: "test", DATABASE_URL: "postgres://x" }),
    ).toBe(false);
    expect(
      shouldStartSessionPurge({ VITEST: "true", DATABASE_URL: "postgres://x" }),
    ).toBe(false);
    expect(
      shouldStartSessionPurge({
        NEXT_PHASE: "phase-production-build",
        DATABASE_URL: "postgres://x",
      }),
    ).toBe(false);
    expect(
      shouldStartSessionPurge({
        NEXT_RUNTIME: "edge",
        DATABASE_URL: "postgres://x",
      }),
    ).toBe(false);
    expect(shouldStartSessionPurge({ NODE_ENV: "production" })).toBe(false);
  });

  it("shouldStartSessionPurge is on for Node boot with a database URL", () => {
    expect(
      shouldStartSessionPurge({
        NODE_ENV: "production",
        NEXT_RUNTIME: "nodejs",
        DATABASE_URL: "postgres://timely:timely@localhost:5432/timely",
      }),
    ).toBe(true);
  });

  it("runScheduledSessionPurge deletes expired rows", async () => {
    const { user } = await register({ email: "purge@example.com", password: PW });
    await createSession(user.id, new Date(Date.now() - 1000 * 60 * 60 * 24 * 60));
    const count = await runScheduledSessionPurge();
    expect(count).toBeGreaterThanOrEqual(1);
    const rows = await getDb().select().from(sessions).where(eq(sessions.userId, user.id));
    expect(rows.every((row) => row.expiresAt > new Date())).toBe(true);
  });

  it("runScheduledSessionPurge swallows purge failures", async () => {
    vi.spyOn(sessionMod, "purgeExpiredSessions").mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(runScheduledSessionPurge()).resolves.toBeNull();
    expect(spy).toHaveBeenCalled();
  });

  it("startSessionPurgeLoop is idempotent and stops cleanly", async () => {
    const { user } = await register({ email: "loop@example.com", password: PW });
    await createSession(user.id, new Date(Date.now() - 1000 * 60 * 60 * 24 * 60));
    startSessionPurgeLoop(20);
    startSessionPurgeLoop(20);
    expect(_internal.isRunning()).toBe(true);
    await vi.waitFor(async () => {
      const rows = await getDb().select().from(sessions).where(eq(sessions.userId, user.id));
      expect(rows.every((row) => row.expiresAt > new Date())).toBe(true);
    });
    stopSessionPurgeLoop();
    expect(_internal.isRunning()).toBe(false);
    stopSessionPurgeLoop();
  });
});
