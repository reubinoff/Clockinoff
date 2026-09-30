import { beforeEach, describe, expect, it } from "vitest";
import { login, register, updateTimezone } from "@/server/auth/service";
import { hashPassword, verifyPassword } from "@/server/auth/passwords";
import {
  createSession,
  deleteSession,
  getSessionUser,
  purgeExpiredSessions,
  sessionCookieOptions,
  SESSION_COOKIE,
} from "@/server/auth/session";
import { ApiError } from "@/lib/errors";
import { PASSWORD_COPY } from "@/lib/password";
import { truncateAll } from "../setup";

const PW = "correct-horse-battery";
const GENERIC_REGISTER_ERROR = "Unable to complete sign-up. Please try again.";

describe("auth", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("hashes and verifies passwords", async () => {
    const hash = await hashPassword("secret-passphrase");
    expect(hash).not.toBe("secret-passphrase");
    expect(await verifyPassword(hash, "secret-passphrase")).toBe(true);
    expect(await verifyPassword(hash, "wrong")).toBe(false);
    expect(await verifyPassword("not-a-hash", "secret-passphrase")).toBe(false);
  });

  it("registers a user and creates a session", async () => {
    const { user, session } = await register({
      email: "a@example.com",
      password: PW,
    });
    expect(user.email).toBe("a@example.com");
    expect(user.timezone).toBe("Asia/Jerusalem");
    expect(session.id).toMatch(/^[A-Za-z0-9_-]+$/);
    const found = await getSessionUser(session.id);
    expect(found?.id).toBe(user.id);
  });

  it("rejects duplicate emails with the same generic error as any other failed sign-up", async () => {
    await register({ email: "dup@example.com", password: PW });
    // Same status + same code + same generic message — no "email taken" leak.
    await expect(
      register({ email: "DUP@example.com", password: PW }),
    ).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION",
      message: GENERIC_REGISTER_ERROR,
    });
  });

  it.each([
    ["not-an-email", PW, "Invalid email"],
    ["ok@example.com", "short", PASSWORD_COPY.tooShort],
    ["ok2@example.com", "aaaaaaaaaaaa", PASSWORD_COPY.tooWeak],
    ["ok3@example.com", "password123456", PASSWORD_COPY.tooWeak],
  ])(
    "rejects invalid registration input (%s / %s)",
    async (email, pw, expectedMessage) => {
      const err = await register({ email, password: pw }).catch((e) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toBe(expectedMessage);
    },
  );

  it("rejects invalid timezone at registration", async () => {
    await expect(
      register({ email: "tz@example.com", password: PW, timezone: "Not/AZone" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("logs in with correct credentials and case-insensitive email", async () => {
    await register({ email: "log@example.com", password: PW });
    const { user, session } = await login({ email: "LOG@example.com", password: PW });
    expect(user.email).toBe("log@example.com");
    expect(await getSessionUser(session.id)).not.toBeNull();
  });

  it("rejects wrong password", async () => {
    await register({ email: "log@example.com", password: PW });
    await expect(login({ email: "log@example.com", password: "nope" })).rejects.toMatchObject({
      status: 401,
    });
  });

  it("rejects login for unknown user", async () => {
    await expect(login({ email: "ghost@example.com", password: PW })).rejects.toMatchObject({
      status: 401,
    });
  });

  it("rejects invalid login input shape", async () => {
    await expect(login({ email: "bad", password: "x" })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("updates timezone", async () => {
    const { user } = await register({ email: "tz2@example.com", password: PW });
    const upd = await updateTimezone(user.id, "UTC");
    expect(upd.timezone).toBe("UTC");
    await expect(updateTimezone(user.id, "")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(updateTimezone(user.id, "Not/AZone")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(updateTimezone("00000000-0000-0000-0000-000000000000", "UTC")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("expired sessions are not returned; can be purged", async () => {
    const { user } = await register({ email: "sess@example.com", password: PW });
    const session = await createSession(user.id, new Date(Date.now() - 1000 * 60 * 60 * 24 * 60));
    expect(await getSessionUser(session.id)).toBeNull();
    const purged = await purgeExpiredSessions();
    expect(purged).toBeGreaterThanOrEqual(1);
  });

  it("deleteSession is idempotent and handles null", async () => {
    await deleteSession(null);
    await deleteSession(undefined);
    await deleteSession("does-not-exist");
    expect(await getSessionUser(null)).toBeNull();
    expect(await getSessionUser("")).toBeNull();
  });

  it("sessionCookieOptions describes cookie shape", () => {
    const opts = sessionCookieOptions(new Date(Date.now() + 60_000));
    expect(opts.name).toBe(SESSION_COOKIE);
    expect(opts.options.httpOnly).toBe(true);
    expect(opts.options.sameSite).toBe("lax");
    expect(opts.options.path).toBe("/");
    expect(opts.options.secure).toBe(false);
  });
});
