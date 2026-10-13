import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import AdminUsersPage from "@/app/admin/users/page";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { makeUser } from "../helpers";
import { truncateAll } from "../setup";

let cookieValue: string | undefined;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () =>
      cookieValue === undefined ? undefined : { name: "timely_session", value: cookieValue },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

describe("admin users page", () => {
  beforeEach(async () => {
    await truncateAll();
    cookieValue = undefined;
  });

  it("sends anonymous visitors to login and non-admins to the app", async () => {
    await expect(AdminUsersPage()).rejects.toThrow("REDIRECT:/login");

    const member = await makeUser("member-page@ex.com");
    cookieValue = member.session.id;
    await expect(AdminUsersPage()).rejects.toThrow("REDIRECT:/app");

    await getDb().update(users).set({ role: "admin" }).where(eq(users.id, member.user.id));
    const page = await AdminUsersPage();
    expect(page).toBeTruthy();
  });
});
