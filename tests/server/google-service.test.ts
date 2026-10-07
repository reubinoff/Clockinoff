import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { register } from "@/server/auth/service";
import { getSessionUser } from "@/server/auth/session";
import {
  connectGoogleToUser,
  getSignInMethods,
  GoogleAuthError,
  signInWithGoogle,
} from "@/server/auth/google";
import { truncateAll } from "../setup";

const PW = "correct-horse-battery";

async function getUser(id: string): Promise<{
  passwordHash: string | null;
  googleSub: string | null;
  email: string;
  isTest: boolean;
}> {
  const db = getDb();
  const rows = await db
    .select({
      email: users.email,
      passwordHash: users.passwordHash,
      googleSub: users.googleSub,
      isTest: users.isTest,
    })
    .from(users)
    .where(eq(users.id, id));
  return rows[0];
}

describe("signInWithGoogle", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("marks a new Google QA seed is_test", async () => {
    const result = await signInWithGoogle({
      sub: "google|qa-1",
      email: "ariel.qa.run@primesec.ai",
    });
    const row = await getUser(result.user.id);
    expect(row.isTest).toBe(true);
    expect(row.passwordHash).toBeNull();
  });

  it("creates a brand new user, attaches sub, and returns isNewUser=true", async () => {
    const result = await signInWithGoogle({
      sub: "google|new-1",
      email: "newby@example.com",
    });
    expect(result.isNewUser).toBe(true);
    expect(result.user.email).toBe("newby@example.com");
    expect(result.user.timezone).toBe("Asia/Jerusalem");

    const row = await getUser(result.user.id);
    expect(row.googleSub).toBe("google|new-1");
    expect(row.passwordHash).toBeNull();
    expect(row.isTest).toBe(false);

    const session = await getSessionUser(result.session.id);
    expect(session?.id).toBe(result.user.id);
  });

  it("refuses to auto-attach Google onto an existing password account", async () => {
    const { user: existing } = await register({
      email: "merge@example.com",
      password: PW,
    });

    const before = await getUser(existing.id);
    expect(before.passwordHash).not.toBeNull();
    expect(before.googleSub).toBeNull();

    await expect(
      signInWithGoogle({
        sub: "google|merge-1",
        email: "merge@example.com",
      }),
    ).rejects.toMatchObject({
      name: "GoogleAuthError",
      reason: "password_account",
      details: { email: "merge@example.com" },
    });

    const after = await getUser(existing.id);
    expect(after.googleSub).toBeNull();
    expect(after.passwordHash).toBe(before.passwordHash);

    const db = getDb();
    const all = await db.select({ id: users.id }).from(users);
    expect(all).toHaveLength(1);
  });

  it("refuse is case-insensitive on email (matches the lower(email) unique index)", async () => {
    const { user } = await register({ email: "MixedCase@Example.com", password: PW });
    await expect(
      signInWithGoogle({
        sub: "google|case-1",
        email: "mixedcase@example.com",
      }),
    ).rejects.toMatchObject({ reason: "password_account", details: { email: user.email } });
    const after = await getUser(user.id);
    expect(after.googleSub).toBeNull();
  });

  it("Google-only accounts keep today's linking: same sub signs the same user in", async () => {
    const first = await signInWithGoogle({
      sub: "google|linked-1",
      email: "linked@example.com",
    });
    const second = await signInWithGoogle({
      sub: "google|linked-1",
      email: "linked@example.com",
    });
    expect(second.isNewUser).toBe(false);
    expect(second.user.id).toBe(first.user.id);
    // Different session each time (fresh cookie on every sign-in).
    expect(second.session.id).not.toBe(first.session.id);
  });

  it("sub lookup wins even if the user has since changed their primary Google email", async () => {
    const first = await signInWithGoogle({
      sub: "google|moved-1",
      email: "old@example.com",
    });
    const second = await signInWithGoogle({
      sub: "google|moved-1",
      email: "new@example.com",
    });
    expect(second.user.id).toBe(first.user.id);
    const after = await getUser(first.user.id);
    expect(after.email).toBe("old@example.com");
  });

  it("refuses to rebind a user to a different Google sub (anomaly path, fail closed)", async () => {
    const first = await signInWithGoogle({
      sub: "google|pinned-1",
      email: "pinned@example.com",
    });

    await expect(
      signInWithGoogle({ sub: "google|intruder", email: "pinned@example.com" }),
    ).rejects.toBeInstanceOf(GoogleAuthError);

    const after = await getUser(first.user.id);
    expect(after.googleSub).toBe("google|pinned-1");
  });

  it("rejects empty sub / email", async () => {
    await expect(signInWithGoogle({ sub: "", email: "x@example.com" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(signInWithGoogle({ sub: "google|1", email: "" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});

describe("connectGoogleToUser / getSignInMethods", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("connects a matching Google account to a password user", async () => {
    const { user } = await register({ email: "settings@example.com", password: PW });
    const before = await getSignInMethods(user.id);
    expect(before).toEqual({
      hasPassword: true,
      googleConnected: false,
      googleEmail: null,
    });

    const result = await connectGoogleToUser(user.id, {
      sub: "google|settings-1",
      email: "settings@example.com",
    });
    expect(result.email).toBe("settings@example.com");

    const after = await getUser(user.id);
    expect(after.googleSub).toBe("google|settings-1");
    expect(after.passwordHash).not.toBeNull();
    expect(await getSignInMethods(user.id)).toEqual({
      hasPassword: true,
      googleConnected: true,
      googleEmail: "settings@example.com",
    });
  });

  it("connect is case-insensitive on email and idempotent for the same sub", async () => {
    const { user } = await register({ email: "Case@Example.com", password: PW });
    await connectGoogleToUser(user.id, { sub: "google|case-c", email: "case@example.com" });
    const again = await connectGoogleToUser(user.id, {
      sub: "google|case-c",
      email: "CASE@example.com",
    });
    expect(again.email).toBe(user.email);
    const after = await getUser(user.id);
    expect(after.googleSub).toBe("google|case-c");
  });

  it("refuses when the Google email does not match the account", async () => {
    const { user } = await register({ email: "owner@example.com", password: PW });
    await expect(
      connectGoogleToUser(user.id, { sub: "google|other", email: "other@example.com" }),
    ).rejects.toMatchObject({
      reason: "email_mismatch",
      details: { email: "owner@example.com" },
    });
    const after = await getUser(user.id);
    expect(after.googleSub).toBeNull();
  });

  it("refuses to rebind a connected account to a different sub", async () => {
    const { user } = await register({ email: "bound@example.com", password: PW });
    await connectGoogleToUser(user.id, { sub: "google|bound-1", email: "bound@example.com" });
    await expect(
      connectGoogleToUser(user.id, { sub: "google|intruder", email: "bound@example.com" }),
    ).rejects.toMatchObject({ reason: "network" });
    const after = await getUser(user.id);
    expect(after.googleSub).toBe("google|bound-1");
  });

  it("refuses when the Google sub is already linked to another user", async () => {
    await signInWithGoogle({ sub: "google|taken", email: "first@example.com" });
    const { user } = await register({ email: "second@example.com", password: PW });
    await expect(
      connectGoogleToUser(user.id, { sub: "google|taken", email: "second@example.com" }),
    ).rejects.toMatchObject({ reason: "network" });
    const after = await getUser(user.id);
    expect(after.googleSub).toBeNull();
  });

  it("rejects empty identity and missing user", async () => {
    const { user } = await register({ email: "empty@example.com", password: PW });
    await expect(connectGoogleToUser(user.id, { sub: "", email: "empty@example.com" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(connectGoogleToUser(user.id, { sub: "google|x", email: "" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(
      getSignInMethods("00000000-0000-0000-0000-000000000000"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      connectGoogleToUser("00000000-0000-0000-0000-000000000000", {
        sub: "google|x",
        email: "empty@example.com",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses Google sign-in for a blocked user", async () => {
    const created = await signInWithGoogle({ sub: "google|blocked", email: "blocked-g@example.com" });
    await getDb()
      .update(users)
      .set({ blockedAt: new Date() })
      .where(eq(users.id, created.user.id));
    await expect(
      signInWithGoogle({ sub: "google|blocked", email: "blocked-g@example.com" }),
    ).rejects.toBeInstanceOf(GoogleAuthError);
    expect(await getSessionUser(created.session.id)).toBeNull();
  });

  it("creates a Google user as admin when ADMIN_EMAILS matches", async () => {
    process.env.ADMIN_EMAILS = "gadmin@example.com";
    const created = await signInWithGoogle({ sub: "google|admin", email: "gadmin@example.com" });
    expect(created.user.role).toBe("admin");
  });

  it("reports Google-only accounts as password off / Google connected", async () => {
    const created = await signInWithGoogle({ sub: "google|only", email: "only@example.com" });
    expect(await getSignInMethods(created.user.id)).toEqual({
      hasPassword: false,
      googleConnected: true,
      googleEmail: "only@example.com",
    });
  });
});
