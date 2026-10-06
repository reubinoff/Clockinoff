import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { register } from "@/server/auth/service";
import { getSessionUser } from "@/server/auth/session";
import { GoogleAuthError, signInWithGoogle } from "@/server/auth/google";
import { truncateAll } from "../setup";

const PW = "correct-horse-battery";

async function getUser(id: string): Promise<{ passwordHash: string | null; googleSub: string | null; email: string }> {
  const db = getDb();
  const rows = await db
    .select({ email: users.email, passwordHash: users.passwordHash, googleSub: users.googleSub })
    .from(users)
    .where(eq(users.id, id));
  return rows[0];
}

describe("signInWithGoogle", () => {
  beforeEach(async () => {
    await truncateAll();
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

    const session = await getSessionUser(result.session.id);
    expect(session?.id).toBe(result.user.id);
  });

  it("attaches sub to an existing email/password user, keeps their password, no second user", async () => {
    const { user: existing } = await register({
      email: "merge@example.com",
      password: PW,
    });

    const before = await getUser(existing.id);
    expect(before.passwordHash).not.toBeNull();
    expect(before.googleSub).toBeNull();

    const result = await signInWithGoogle({
      sub: "google|merge-1",
      email: "merge@example.com",
    });
    expect(result.isNewUser).toBe(false);
    expect(result.user.id).toBe(existing.id);

    const after = await getUser(existing.id);
    expect(after.googleSub).toBe("google|merge-1");
    // Password is preserved — same hash as before. This is the Shaul lock:
    // attach never clobbers the local credential.
    expect(after.passwordHash).toBe(before.passwordHash);

    const db = getDb();
    const all = await db.select({ id: users.id }).from(users);
    expect(all).toHaveLength(1);
  });

  it("attach is case-insensitive on email (matches the lower(email) unique index)", async () => {
    const { user } = await register({ email: "MixedCase@Example.com", password: PW });
    const result = await signInWithGoogle({
      sub: "google|case-1",
      email: "mixedcase@example.com",
    });
    expect(result.user.id).toBe(user.id);
    const after = await getUser(user.id);
    expect(after.googleSub).toBe("google|case-1");
  });

  it("signs an already-linked user in again when the same sub comes back", async () => {
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
    const { user } = await register({ email: "pinned@example.com", password: PW });
    await signInWithGoogle({ sub: "google|pinned-1", email: "pinned@example.com" });

    await expect(
      signInWithGoogle({ sub: "google|intruder", email: "pinned@example.com" }),
    ).rejects.toBeInstanceOf(GoogleAuthError);

    const after = await getUser(user.id);
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
