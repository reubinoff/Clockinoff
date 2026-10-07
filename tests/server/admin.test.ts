import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ADMIN_GUARD } from "@/lib/admin-copy";
import { login, register } from "@/server/auth/service";
import { getSessionUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { projects, sessions, timeEntries, users } from "@/server/db/schema";
import {
  ADMIN_PAGE_SIZE,
  blockAdminUser,
  demoteAdminUser,
  getAdminStats,
  getAdminUser,
  listAdminUsers,
  promoteAdminUser,
  removeAdminUser,
  unblockAdminUser,
} from "@/server/services/admin";
import { startOfDayInZone } from "@/lib/tz";
import { makeUser } from "../helpers";
import { truncateAll } from "../setup";

const PW = "correct-horse-battery";
const TZ = "Asia/Jerusalem";

async function setRole(id: string, role: "user" | "admin"): Promise<void> {
  await getDb().update(users).set({ role }).where(eq(users.id, id));
}

async function insertUser(email: string, role: "user" | "admin" = "user"): Promise<{ id: string }> {
  const [row] = await getDb()
    .insert(users)
    .values({ email, passwordHash: "x", role, timezone: TZ })
    .returning({ id: users.id });
  return row;
}

describe("admin service", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("lists, searches, and paginates users with an entries count", async () => {
    const ids: string[] = [];
    for (let i = 0; i < ADMIN_PAGE_SIZE + 1; i += 1) {
      const row = await insertUser(`page-${String(i).padStart(2, "0")}@ex.com`);
      ids.push(row.id);
    }
    const needle = await insertUser("FindMe@ex.com");
    await getDb().insert(timeEntries).values({
      userId: needle.id,
      description: "one",
      startAt: new Date("2026-10-06T10:00:00Z"),
      endAt: new Date("2026-10-06T11:00:00Z"),
    });

    const page1 = await listAdminUsers({ page: 1 });
    expect(page1.page_size).toBe(ADMIN_PAGE_SIZE);
    expect(page1.total).toBe(ADMIN_PAGE_SIZE + 2);
    expect(page1.users).toHaveLength(ADMIN_PAGE_SIZE);
    expect(page1.admins_count).toBe(0);

    const page2 = await listAdminUsers({ page: 2 });
    expect(page2.users).toHaveLength(2);
    expect(page2.users.length + page1.users.length).toBe(page1.total);

    const found = await listAdminUsers({ q: "findme" });
    expect(found.total).toBe(1);
    expect(found.users[0].email).toBe("FindMe@ex.com");
    expect(found.users[0].entries_count).toBe(1);
    expect(found.users[0].status).toBe("active");
    expect(found.users[0].role).toBe("user");

    const miss = await listAdminUsers({ q: "nobody-home" });
    expect(miss.total).toBe(0);
    expect(miss.users).toEqual([]);
    expect(ids.length).toBeGreaterThan(0);
  });

  it("removes another user and refuses self-removal and the last admin", async () => {
    const actor = await makeUser("actor@ex.com");
    const other = await makeUser("other@ex.com");
    await setRole(actor.user.id, "admin");
    await setRole(other.user.id, "admin");

    await expect(removeAdminUser(actor.user.id, actor.user.id)).rejects.toMatchObject({
      status: 409,
      message: ADMIN_GUARD.selfRemove,
    });

    await removeAdminUser(actor.user.id, other.user.id);
    await expect(getAdminUser(other.user.id)).rejects.toMatchObject({ status: 404 });

    await expect(removeAdminUser(actor.user.id, actor.user.id)).rejects.toMatchObject({
      status: 409,
      message: ADMIN_GUARD.lastAdmin,
    });

    const member = await insertUser("member@ex.com");
    await removeAdminUser(actor.user.id, member.id);
    await expect(getAdminUser(member.id)).rejects.toMatchObject({ status: 404 });
    const sessionsLeft = await getDb()
      .select()
      .from(sessions)
      .where(eq(sessions.userId, other.user.id));
    expect(sessionsLeft).toHaveLength(0);
  });

  it("blocks and unblocks, denies self-block, and kills sessions plus login", async () => {
    const actor = await makeUser("actor-block@ex.com");
    const victim = await register({ email: "victim@ex.com", password: PW });
    await setRole(actor.user.id, "admin");

    await expect(blockAdminUser(actor.user.id, actor.user.id)).rejects.toMatchObject({
      message: ADMIN_GUARD.selfBlock,
    });

    const blocked = await blockAdminUser(actor.user.id, victim.user.id);
    expect(blocked.status).toBe("blocked");
    expect(blocked.blocked_at).not.toBeNull();
    expect(await getSessionUser(victim.session.id)).toBeNull();
    await expect(login({ email: "victim@ex.com", password: PW })).rejects.toMatchObject({
      status: 401,
    });

    const again = await blockAdminUser(actor.user.id, victim.user.id);
    expect(again.status).toBe("blocked");

    const open = await unblockAdminUser(actor.user.id, victim.user.id);
    expect(open.status).toBe("active");
    const signedIn = await login({ email: "victim@ex.com", password: PW });
    expect(signedIn.user.id).toBe(victim.user.id);
  });

  it("promotes and demotes with self and last-admin guardrails", async () => {
    const actor = await makeUser("actor-role@ex.com");
    const other = await makeUser("other-role@ex.com");
    await setRole(actor.user.id, "admin");

    const promoted = await promoteAdminUser(actor.user.id, other.user.id);
    expect(promoted.role).toBe("admin");
    const again = await promoteAdminUser(actor.user.id, other.user.id);
    expect(again.role).toBe("admin");

    await expect(demoteAdminUser(actor.user.id, actor.user.id)).rejects.toMatchObject({
      message: ADMIN_GUARD.selfDemote,
    });

    await demoteAdminUser(actor.user.id, other.user.id);
    await expect(demoteAdminUser(actor.user.id, other.user.id)).rejects.toMatchObject({
      code: "VALIDATION",
    });

    await expect(demoteAdminUser(actor.user.id, actor.user.id)).rejects.toMatchObject({
      message: ADMIN_GUARD.lastAdminDemote,
    });
  });

  it("returns per-user stats and instance stats over a range", async () => {
    const actor = await insertUser("stats-admin@ex.com", "admin");
    const worker = await insertUser("worker@ex.com");
    await getDb()
      .update(users)
      .set({ createdAt: new Date("2020-01-01T00:00:00Z") })
      .where(eq(users.id, actor.id));
    const day = startOfDayInZone("2026-10-06", TZ);
    const start = new Date(day.getTime() + 2 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 90 * 60 * 1000);
    await getDb().update(users).set({ createdAt: start }).where(eq(users.id, worker.id));
    const [project] = await getDb()
      .insert(projects)
      .values({ userId: worker.id, name: "P", defaultRate: "50.00" })
      .returning();
    await getDb().insert(timeEntries).values({
      userId: worker.id,
      projectId: project.id,
      description: "billable",
      startAt: start,
      endAt: end,
      billable: true,
      rate: "100.00",
    });
    await getDb().insert(timeEntries).values({
      userId: worker.id,
      description: "running",
      startAt: new Date(start.getTime() + 60 * 1000),
      endAt: null,
      billable: false,
    });

    const detail = await getAdminUser(worker.id);
    expect(detail.user.entries_count).toBe(2);
    expect(detail.stats.entries).toBe(2);
    expect(detail.stats.hours).toBe(1.5);
    expect(detail.stats.billable_amount).toBe(150);
    expect(detail.stats.last_active_at).not.toBeNull();
    expect(detail.admins_count).toBe(1);

    const quiet = await getAdminUser(actor.id);
    expect(quiet.stats.entries).toBe(0);
    expect(quiet.stats.hours).toBe(0);
    expect(quiet.stats.billable_amount).toBeNull();
    expect(quiet.stats.last_active_at).toBeNull();

    const stats = await getAdminStats(TZ, "2026-10-06", "2026-10-06");
    expect(stats.users).toBe(2);
    expect(stats.active).toBe(2);
    expect(stats.admins).toBe(1);
    expect(stats.entries).toBe(2);
    expect(stats.hours).toBe(1.5);
    expect(stats.billable_amount).toBe(150);
    expect(stats.active_users_in_range).toBe(1);
    expect(stats.signups_by_day).toEqual([{ date: "2026-10-06", count: 1 }]);
    expect(stats.active_users_by_day).toEqual([{ date: "2026-10-06", count: 1 }]);
    expect(stats.hours_by_day).toEqual([{ date: "2026-10-06", hours: 1.5 }]);

    const empty = await getAdminStats(TZ, "2026-01-01", "2026-01-02");
    expect(empty.hours).toBe(0);
    expect(empty.signups_by_day.every((d) => d.count === 0)).toBe(true);
    expect(empty.hours_by_day).toHaveLength(2);

    await expect(getAdminStats("Not/AZone", "2026-10-01", "2026-10-02")).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(getAdminStats(TZ, "2026-10-08", "2026-10-01")).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(getAdminStats(TZ, "2020-01-01", "2026-01-01")).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(getAdminUser("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({
      status: 404,
    });
  });
});
