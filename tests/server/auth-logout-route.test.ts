import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as logoutPost } from "@/app/api/auth/logout/route";
import { getSessionUser, hashSessionToken, SESSION_COOKIE } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { sessions } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { register } from "@/server/auth/service";
import { truncateAll } from "../setup";

const PW = "correct-horse-battery";

let cookieValue: string | undefined;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieValue === undefined || name !== SESSION_COOKIE
        ? undefined
        : { name: SESSION_COOKIE, value: cookieValue },
  }),
}));

describe("POST /api/auth/logout", () => {
  beforeEach(async () => {
    await truncateAll();
    cookieValue = undefined;
  });

  it("deletes the hashed session row and clears the cookie", async () => {
    const { user, session } = await register({
      email: "out@example.com",
      password: PW,
    });
    cookieValue = session.id;
    const res = await logoutPost();
    expect(res.status).toBe(204);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(new RegExp(`${SESSION_COOKIE}=;`));
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("path=/");
    expect(cookie.toLowerCase()).toMatch(/samesite=lax/);
    expect(await getSessionUser(session.id)).toBeNull();
    const rows = await getDb().select().from(sessions).where(eq(sessions.userId, user.id));
    expect(rows).toHaveLength(0);
    expect(rows.map((r) => r.id)).not.toContain(hashSessionToken(session.id));
  });

  it("is a no-op 204 when no cookie is present", async () => {
    cookieValue = undefined;
    const res = await logoutPost();
    expect(res.status).toBe(204);
  });
});
