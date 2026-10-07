import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { GET as listUsers } from "@/app/api/admin/users/route";
import { POST as bulkUsers } from "@/app/api/admin/users/bulk/route";
import { DELETE as deleteUser, GET as getUser } from "@/app/api/admin/users/[id]/route";
import { POST as blockUser } from "@/app/api/admin/users/[id]/block/route";
import { POST as unblockUser } from "@/app/api/admin/users/[id]/unblock/route";
import { POST as promoteUser } from "@/app/api/admin/users/[id]/promote/route";
import { POST as demoteUser } from "@/app/api/admin/users/[id]/demote/route";
import { GET as stats } from "@/app/api/admin/stats/route";
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

function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("admin routes", () => {
  beforeEach(async () => {
    await truncateAll();
    cookieValue = undefined;
  });

  it("returns 401 without a session and 403 for a non-admin on every admin route", async () => {
    const anon = await listUsers(new Request("http://test/api/admin/users"));
    expect(anon.status).toBe(401);
    const anonBulk = await bulkUsers(
      new Request("http://test/api/admin/users/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "block", ids: ["00000000-0000-4000-8000-000000000001"] }),
      }),
    );
    expect(anonBulk.status).toBe(401);

    const { session, user } = await makeUser("member@ex.com");
    cookieValue = session.id;
    const id = user.id;
    const routes = [
      listUsers(new Request("http://test/api/admin/users")),
      getUser(new Request("http://test/api/admin/users/" + id), ctx(id)),
      deleteUser(new Request("http://test/api/admin/users/" + id), ctx(id)),
      blockUser(new Request("http://test/api/admin/users/" + id + "/block"), ctx(id)),
      unblockUser(new Request("http://test/api/admin/users/" + id + "/unblock"), ctx(id)),
      promoteUser(new Request("http://test/api/admin/users/" + id + "/promote"), ctx(id)),
      demoteUser(new Request("http://test/api/admin/users/" + id + "/demote"), ctx(id)),
      stats(new Request("http://test/api/admin/stats?from=2026-10-01&to=2026-10-07")),
      bulkUsers(
        new Request("http://test/api/admin/users/bulk", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "block", ids: [id] }),
        }),
      ),
    ];
    const results = await Promise.all(routes);
    for (const res of results) {
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("FORBIDDEN");
    }
  });

  it("lets an admin list users and rejects a bad query", async () => {
    const { session, user } = await makeUser("boss@ex.com");
    await getDb().update(users).set({ role: "admin" }).where(eq(users.id, user.id));
    cookieValue = session.id;
    const ok = await listUsers(new Request("http://test/api/admin/users?q=boss"));
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { total: number; users: { role: string }[] };
    expect(body.total).toBe(1);
    expect(body.users[0].role).toBe("admin");

    const bad = await listUsers(new Request("http://test/api/admin/users?page=0"));
    expect(bad.status).toBe(400);

    const badId = await getUser(new Request("http://test/api/admin/users/nope"), ctx("nope"));
    expect(badId.status).toBe(400);

    const missingStats = await stats(new Request("http://test/api/admin/stats"));
    expect(missingStats.status).toBe(400);
  });

  it("bulk-blocks eligible users and rejects a bad body", async () => {
    const { session, user } = await makeUser("boss-bulk@ex.com");
    const member = await makeUser("member-bulk@ex.com");
    await getDb().update(users).set({ role: "admin" }).where(eq(users.id, user.id));
    cookieValue = session.id;

    const ok = await bulkUsers(
      new Request("http://test/api/admin/users/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "block", ids: [member.user.id, user.id] }),
      }),
    );
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { applied: number; skipped: number };
    expect(body).toEqual({ applied: 1, skipped: 1 });

    const badAction = await bulkUsers(
      new Request("http://test/api/admin/users/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "nope", ids: [member.user.id] }),
      }),
    );
    expect(badAction.status).toBe(400);

    const badId = await bulkUsers(
      new Request("http://test/api/admin/users/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "promote", ids: ["nope"] }),
      }),
    );
    expect(badId.status).toBe(400);

    const empty = await bulkUsers(
      new Request("http://test/api/admin/users/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "promote", ids: [] }),
      }),
    );
    expect(empty.status).toBe(400);
  });
});
