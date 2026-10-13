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
import { ADMIN_GUARD, BULK_REMOVE_COPY } from "@/lib/admin-copy";
import { getDb } from "@/server/db/client";
import { auditEvents, users } from "@/server/db/schema";
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

    const sorted = await listUsers(
      new Request(
        "http://test/api/admin/users?sort=created%3Bdrop%20table%20users&dir=asc",
      ),
    );
    expect(sorted.status).toBe(403);
    const sortedBody = (await sorted.json()) as { error: { code: string } };
    expect(sortedBody.error.code).toBe("FORBIDDEN");
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

    const older = await makeUser("mmm-route-sort@ex.com");
    const newer = await makeUser("aaa-route-sort@ex.com");
    await getDb()
      .update(users)
      .set({ createdAt: new Date("2020-01-01T00:00:00.000Z") })
      .where(eq(users.id, older.user.id));
    await getDb()
      .update(users)
      .set({ createdAt: new Date("2024-01-01T00:00:00.000Z") })
      .where(eq(users.id, newer.user.id));

    const fallback = await listUsers(
      new Request("http://test/api/admin/users?q=route-sort&sort=password&dir=sideways"),
    );
    expect(fallback.status).toBe(200);
    const fallbackBody = (await fallback.json()) as { users: { email: string }[] };
    expect(fallbackBody.users.map((row) => row.email)).toEqual([
      "aaa-route-sort@ex.com",
      "mmm-route-sort@ex.com",
    ]);

    const byEmail = await listUsers(
      new Request("http://test/api/admin/users?q=route-sort&sort=email&dir=asc"),
    );
    expect(byEmail.status).toBe(200);
    const emailBody = (await byEmail.json()) as { users: { email: string }[] };
    expect(emailBody.users.map((row) => row.email)).toEqual([
      "aaa-route-sort@ex.com",
      "mmm-route-sort@ex.com",
    ]);

    const unsafeSorts = [
      ["Email", "asc"],
      ["email", "ASC"],
      ["CREATED", "Desc"],
      ["created); drop table users; --", "asc"],
      ["email", "asc; delete from users"],
      ["' OR 1=1 --", "desc, (select 1)"],
    ];
    for (const [sort, dir] of unsafeSorts) {
      const res = await listUsers(
        new Request(
          `http://test/api/admin/users?q=route-sort&sort=${encodeURIComponent(sort)}&dir=${encodeURIComponent(dir)}`,
        ),
      );
      expect(res.status).toBe(200);
      const unsafeBody = (await res.json()) as { users: { email: string }[] };
      expect(unsafeBody.users.map((row) => row.email)).toEqual([
        "aaa-route-sort@ex.com",
        "mmm-route-sort@ex.com",
      ]);
    }

    const byEmailDesc = await listUsers(
      new Request("http://test/api/admin/users?q=route-sort&sort=email&dir=desc"),
    );
    const emailDescBody = (await byEmailDesc.json()) as { users: { email: string }[] };
    expect(emailDescBody.users.map((row) => row.email)).toEqual([
      "mmm-route-sort@ex.com",
      "aaa-route-sort@ex.com",
    ]);

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

    const refused = await bulkUsers(
      new Request("http://test/api/admin/users/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "block", ids: [member.user.id, user.id] }),
      }),
    );
    expect(refused.status).toBe(400);
    const refusedBody = (await refused.json()) as { error: { message: string } };
    expect(refusedBody.error.message).toBe(ADMIN_GUARD.selfBlock);
    const still = await getDb().select({ blockedAt: users.blockedAt }).from(users).where(eq(users.id, member.user.id));
    expect(still[0]?.blockedAt).toBeNull();

    const ok = await bulkUsers(
      new Request("http://test/api/admin/users/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "block", ids: [member.user.id] }),
      }),
    );
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { applied: number; skipped: number };
    expect(body).toEqual({ applied: 1, skipped: 0 });

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

  it("bulk-remove skips admins and the caller and checks confirmCount", async () => {
    const { session, user } = await makeUser("boss-remove@ex.com");
    const member = await makeUser("member-remove@ex.com");
    const otherAdmin = await makeUser("other-remove@ex.com");
    await getDb().update(users).set({ role: "admin" }).where(eq(users.id, user.id));
    await getDb().update(users).set({ role: "admin" }).where(eq(users.id, otherAdmin.user.id));
    cookieValue = session.id;

    const mismatch = await bulkUsers(
      new Request("http://test/api/admin/users/bulk", {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": "req-mismatch" },
        body: JSON.stringify({
          action: "remove",
          ids: [member.user.id, otherAdmin.user.id, user.id],
          confirmCount: 3,
        }),
      }),
    );
    expect(mismatch.status).toBe(400);
    expect(((await mismatch.json()) as { error: { message: string } }).error.message).toBe(
      BULK_REMOVE_COPY.mismatch,
    );
    expect(await getDb().select().from(auditEvents)).toHaveLength(0);

    const missingCount = await bulkUsers(
      new Request("http://test/api/admin/users/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "remove", ids: [member.user.id] }),
      }),
    );
    expect(missingCount.status).toBe(400);

    const over = await bulkUsers(
      new Request("http://test/api/admin/users/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "remove",
          ids: Array.from({ length: 26 }, () => member.user.id),
          confirmCount: 1,
        }),
      }),
    );
    expect(over.status).toBe(400);
    expect(((await over.json()) as { error: { message: string } }).error.message).toBe(
      BULK_REMOVE_COPY.overCap,
    );
    const memberStill = await getDb().select({ id: users.id }).from(users).where(eq(users.id, member.user.id));
    expect(memberStill).toHaveLength(1);

    const selfDelete = await deleteUser(
      new Request("http://test/api/admin/users/" + user.id),
      ctx(user.id),
    );
    expect(selfDelete.status).toBe(400);
    const adminDelete = await deleteUser(
      new Request("http://test/api/admin/users/" + otherAdmin.user.id),
      ctx(otherAdmin.user.id),
    );
    expect(adminDelete.status).toBe(400);

    const ok = await bulkUsers(
      new Request("http://test/api/admin/users/bulk", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-ok",
          "x-forwarded-for": "198.51.100.8, 203.0.113.50",
        },
        body: JSON.stringify({
          action: "remove",
          ids: [member.user.id, otherAdmin.user.id, user.id],
          confirmCount: 1,
        }),
      }),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ applied: 1, skipped: 2 });
    const gone = await getDb().select({ id: users.id }).from(users).where(eq(users.id, member.user.id));
    expect(gone).toHaveLength(0);
    const audit = await getDb().select().from(auditEvents);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorUserId: user.id,
      action: "remove",
      requestId: "req-ok",
      clientIp: "198.51.100.8",
      targetIds: [member.user.id],
    });
  });
});
