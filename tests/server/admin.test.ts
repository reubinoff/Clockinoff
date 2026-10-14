import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ADMIN_GUARD } from "@/lib/admin-copy";
import { login, register } from "@/server/auth/service";
import { getSessionUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import {
  auditEvents,
  clients,
  projects,
  sessions,
  tags,
  timeEntries,
  timeEntryTags,
  users,
} from "@/server/db/schema";
import {
  ADMIN_PAGE_SIZE,
  blockAdminUser,
  bulkAdminUsers,
  demoteAdminUser,
  getAdminStats,
  getAdminUser,
  listAdminUsers,
  promoteAdminUser,
  removeAdminUser,
  setBeforeBulkTarget,
  setPendingAuditInsert,
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
    setPendingAuditInsert(null);
    setBeforeBulkTarget(null);
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
      status: 400,
      message: ADMIN_GUARD.selfRemove,
    });
    await expect(removeAdminUser(actor.user.id, other.user.id)).rejects.toMatchObject({
      status: 400,
      message: ADMIN_GUARD.adminRemove,
    });
    expect((await getAdminUser(other.user.id)).user.role).toBe("admin");

    const member = await insertUser("member@ex.com");
    await removeAdminUser(actor.user.id, member.id);
    await expect(getAdminUser(member.id)).rejects.toMatchObject({ status: 404 });
    const audit = await getDb().select().from(auditEvents);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.action).toBe("remove");
    expect(audit[0]?.actorUserId).toBe(actor.user.id);
    expect(audit[0]?.actorEmail).toBe("actor@ex.com");
    expect(audit[0]?.status).toBe("completed");
    expect(audit[0]?.targets).toEqual([{ id: member.id, email: "member@ex.com" }]);
    expect(audit[0]?.result).toEqual({
      removed: [{ id: member.id, deleted: 1 }],
      skipped: [],
      failed: [],
    });
  });

  it("blocks and unblocks, denies self-block, and kills sessions plus login", async () => {
    const actor = await makeUser("actor-block@ex.com");
    const victim = await register({ email: "victim@ex.com", password: PW });
    await setRole(actor.user.id, "admin");

    await expect(blockAdminUser(actor.user.id, actor.user.id)).rejects.toMatchObject({
      message: ADMIN_GUARD.selfBlock,
    });
    await setRole(victim.user.id, "admin");
    await expect(blockAdminUser(actor.user.id, victim.user.id)).rejects.toMatchObject({
      status: 400,
      message: ADMIN_GUARD.adminBlock,
    });
    await setRole(victim.user.id, "user");

    const blocked = await blockAdminUser(actor.user.id, victim.user.id);
    expect(blocked.status).toBe("blocked");
    expect(blocked.blocked_at).not.toBeNull();
    expect(await getSessionUser(victim.session.id)).toBeNull();
    await expect(login({ email: "victim@ex.com", password: PW })).rejects.toMatchObject({
      status: 401,
    });

    const again = await blockAdminUser(actor.user.id, victim.user.id);
    expect(again.status).toBe("blocked");
    const singleBlock = await getDb().select().from(auditEvents);
    expect(singleBlock).toHaveLength(2);
    expect(singleBlock.every((row) => row.actorEmail === "actor-block@ex.com")).toBe(true);
    expect(singleBlock.every((row) => row.targets?.[0]?.email === "victim@ex.com")).toBe(true);
    expect(
      singleBlock
        .map((row) => row.result?.removed[0]?.deleted)
        .slice()
        .sort(),
    ).toEqual([0, 1]);

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

  it("bulk-removes through the single-user delete so owned rows cascade", async () => {
    const actor = await makeUser("actor-bulk@ex.com");
    await setRole(actor.user.id, "admin");
    const victim = await insertUser("gone@ex.com");
    const keep = await insertUser("keep@ex.com");
    const db = getDb();
    const [client] = await db
      .insert(clients)
      .values({ userId: victim.id, name: "C" })
      .returning();
    const [project] = await db
      .insert(projects)
      .values({ userId: victim.id, clientId: client.id, name: "P" })
      .returning();
    const [tag] = await db.insert(tags).values({ userId: victim.id, name: "T" }).returning();
    const [entry] = await db
      .insert(timeEntries)
      .values({
        userId: victim.id,
        projectId: project.id,
        description: "x",
        startAt: new Date("2026-10-06T10:00:00Z"),
        endAt: new Date("2026-10-06T11:00:00Z"),
      })
      .returning();
    await db.insert(timeEntryTags).values({ entryId: entry.id, tagId: tag.id });
    await db.insert(sessions).values({
      id: "sess-victim-bulk",
      userId: victim.id,
      expiresAt: new Date("2027-01-01T00:00:00Z"),
    });

    const result = await bulkAdminUsers(
      actor.user.id,
      "remove",
      [victim.id, actor.user.id, keep.id, victim.id],
      {
        confirmCount: 2,
        requestId: "bulk-cascade",
        clientIp: "203.0.113.9",
        userAgent: "ClockinoffTest/1",
        sessionIdHash: "abc123sessionhash",
      },
    );
    expect(result).toEqual({ applied: 2, skipped: 1 });
    const audit = await db.select().from(auditEvents);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorUserId: actor.user.id,
      actorEmail: "actor-bulk@ex.com",
      action: "remove",
      requestId: "bulk-cascade",
      clientIp: "203.0.113.9",
      userAgent: "ClockinoffTest/1",
      sessionIdHash: "abc123sessionhash",
      status: "completed",
    });
    expect(audit[0]?.targets?.slice().sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [
        { id: keep.id, email: "keep@ex.com" },
        { id: victim.id, email: "gone@ex.com" },
      ].sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(audit[0]?.result?.removed.slice().sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [
        { id: keep.id, deleted: 1 },
        { id: victim.id, deleted: 1 },
      ].sort((a, b) => a.id.localeCompare(b.id)),
    );

    const remaining = await db.select({ id: users.id }).from(users);
    expect(remaining.map((row) => row.id)).toEqual([actor.user.id]);
    expect(await db.select().from(clients)).toEqual([]);
    expect(await db.select().from(projects)).toEqual([]);
    expect(await db.select().from(tags)).toEqual([]);
    expect(await db.select().from(timeEntries)).toEqual([]);
    expect(await db.select().from(timeEntryTags)).toEqual([]);
    expect(await db.select().from(sessions).where(eq(sessions.userId, victim.id))).toEqual([]);
  });

  it("bulk-applies eligible ids and skips guardrails, missing users, and bad batches", async () => {
    const actor = await makeUser("actor-mix@ex.com");
    const other = await makeUser("other-mix@ex.com");
    const member = await insertUser("member-mix@ex.com");
    await setRole(actor.user.id, "admin");
    await setRole(other.user.id, "admin");

    await expect(
      bulkAdminUsers(actor.user.id, "block", [
        actor.user.id,
        member.id,
        "00000000-0000-4000-8000-000000000099",
      ]),
    ).rejects.toMatchObject({ status: 400, message: ADMIN_GUARD.selfBlock });
    expect((await getAdminUser(member.id)).user.status).toBe("active");
    await expect(bulkAdminUsers(actor.user.id, "block", [other.user.id])).rejects.toMatchObject({
      status: 400,
      message: ADMIN_GUARD.adminBlock,
    });

    const blocked = await bulkAdminUsers(actor.user.id, "block", [
      member.id,
      "00000000-0000-4000-8000-000000000099",
    ]);
    expect(blocked).toEqual({ applied: 1, skipped: 1 });
    expect((await getAdminUser(member.id)).user.status).toBe("blocked");
    const blockAudit = await getDb()
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, "block"));
    expect(blockAudit).toHaveLength(1);
    expect(blockAudit[0]?.actorEmail).toBe("actor-mix@ex.com");
    expect(blockAudit[0]?.targets).toEqual([
      { id: member.id, email: "member-mix@ex.com" },
      { id: "00000000-0000-4000-8000-000000000099", email: null },
    ]);
    expect(blockAudit[0]?.result).toEqual({
      removed: [{ id: member.id, deleted: 0 }],
      skipped: ["00000000-0000-4000-8000-000000000099"],
      failed: [],
    });
    expect(blockAudit[0]?.actorUserId).toBe(actor.user.id);

    const opened = await bulkAdminUsers(actor.user.id, "unblock", [member.id]);
    expect(opened).toEqual({ applied: 1, skipped: 0 });
    expect((await getAdminUser(member.id)).user.status).toBe("active");

    const promoted = await bulkAdminUsers(actor.user.id, "promote", [member.id, other.user.id]);
    expect(promoted).toEqual({ applied: 2, skipped: 0 });
    expect((await getAdminUser(member.id)).user.role).toBe("admin");

    const demoted = await bulkAdminUsers(actor.user.id, "demote", [
      member.id,
      other.user.id,
      actor.user.id,
    ]);
    expect(demoted).toEqual({ applied: 2, skipped: 1 });
    expect((await getAdminUser(actor.user.id)).user.role).toBe("admin");
    expect((await getAdminUser(member.id)).user.role).toBe("user");
    expect((await getAdminUser(other.user.id)).user.role).toBe("user");

    await expect(bulkAdminUsers(actor.user.id, "remove", [])).rejects.toMatchObject({
      code: "VALIDATION",
    });
    const tooMany = Array.from({ length: ADMIN_PAGE_SIZE + 1 }, () => actor.user.id);
    await expect(bulkAdminUsers(actor.user.id, "block", tooMany)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("rejects a bulk remove whose confirmCount or length does not match, and does not truncate", async () => {
    const actor = await makeUser("actor-count@ex.com");
    const member = await insertUser("member-count@ex.com");
    const admin = await insertUser("admin-count@ex.com", "admin");
    await setRole(actor.user.id, "admin");

    await expect(
      bulkAdminUsers(actor.user.id, "remove", [member.id, admin.id], { confirmCount: 2 }),
    ).rejects.toMatchObject({ status: 400, message: "The number didn't match. Nothing was removed." });
    await expect(
      bulkAdminUsers(actor.user.id, "remove", [member.id]),
    ).rejects.toMatchObject({ status: 400, message: "The number didn't match. Nothing was removed." });
    await expect(
      bulkAdminUsers(actor.user.id, "remove", [member.id], { confirmCount: 1.5 }),
    ).rejects.toMatchObject({ status: 400, message: "The number didn't match. Nothing was removed." });

    const over = Array.from({ length: 26 }, () => member.id);
    await expect(
      bulkAdminUsers(actor.user.id, "remove", over, { confirmCount: 1 }),
    ).rejects.toMatchObject({
      status: 400,
      message: "You can remove up to 25 users at a time. Nothing was removed.",
    });
    expect((await getAdminUser(member.id)).user.email).toBe("member-count@ex.com");
    expect(await getDb().select().from(auditEvents)).toHaveLength(0);

    const ok = await bulkAdminUsers(actor.user.id, "remove", [member.id, admin.id, actor.user.id], {
      confirmCount: 1,
    });
    expect(ok).toEqual({ applied: 1, skipped: 2 });
    await expect(getAdminUser(member.id)).rejects.toMatchObject({ status: 404 });
    expect((await getAdminUser(admin.id)).user.role).toBe("admin");
  });

  it("deletes nothing when the pending audit insert fails", async () => {
    const actor = await makeUser("actor-audit-fail@ex.com");
    const member = await insertUser("member-audit-fail@ex.com");
    await setRole(actor.user.id, "admin");
    setPendingAuditInsert(async () => {
      throw new Error("audit insert failed");
    });
    await expect(
      bulkAdminUsers(actor.user.id, "remove", [member.id], { confirmCount: 1 }),
    ).rejects.toThrow("audit insert failed");
    expect((await getAdminUser(member.id)).user.email).toBe("member-audit-fail@ex.com");
    expect(await getDb().select().from(auditEvents)).toHaveLength(0);
  });

  it("keeps the pending audit row when a delete fails mid-loop", async () => {
    const actor = await makeUser("actor-mid@ex.com");
    const first = await insertUser("first-mid@ex.com");
    const second = await insertUser("second-mid@ex.com");
    await setRole(actor.user.id, "admin");
    setBeforeBulkTarget(async (index) => {
      if (index === 1) throw new Error("delete failed mid-loop");
    });
    await expect(
      bulkAdminUsers(actor.user.id, "remove", [first.id, second.id], {
        confirmCount: 2,
        requestId: "mid-loop",
      }),
    ).rejects.toThrow("delete failed mid-loop");
    await expect(getAdminUser(first.id)).rejects.toMatchObject({ status: 404 });
    expect((await getAdminUser(second.id)).user.email).toBe("second-mid@ex.com");
    const audit = await getDb().select().from(auditEvents);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.status).toBe("failed");
    expect(audit[0]?.actorEmail).toBe("actor-mid@ex.com");
    expect(audit[0]?.requestId).toBe("mid-loop");
    expect(audit[0]?.targets).toEqual([
      { id: first.id, email: "first-mid@ex.com" },
      { id: second.id, email: "second-mid@ex.com" },
    ]);
    expect(audit[0]?.result).toEqual({
      removed: [{ id: first.id, deleted: 1 }],
      skipped: [],
      failed: [second.id],
    });
    expect(audit[0]?.completedAt).toBeInstanceOf(Date);
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

  it("omits is_test users from instance stats and still lists them", async () => {
    const worker = await insertUser("worker-real@ex.com");
    const qa = await insertUser("gabi.qa.stats@primesec.ai");
    const day = startOfDayInZone("2026-10-06", TZ);
    const start = new Date(day.getTime() + 3 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    await getDb().update(users).set({ createdAt: start }).where(eq(users.id, worker.id));
    await getDb()
      .update(users)
      .set({ isTest: true, createdAt: start, role: "admin" })
      .where(eq(users.id, qa.id));
    await getDb().insert(timeEntries).values({
      userId: worker.id,
      description: "real",
      startAt: start,
      endAt: end,
      billable: true,
      rate: "10.00",
    });
    await getDb().insert(timeEntries).values({
      userId: qa.id,
      description: "qa",
      startAt: start,
      endAt: end,
      billable: true,
      rate: "99.00",
    });

    const stats = await getAdminStats(TZ, "2026-10-06", "2026-10-06");
    expect(stats.users).toBe(1);
    expect(stats.active).toBe(1);
    expect(stats.admins).toBe(0);
    expect(stats.entries).toBe(1);
    expect(stats.hours).toBe(1);
    expect(stats.billable_amount).toBe(10);
    expect(stats.active_users_in_range).toBe(1);
    expect(stats.signups_by_day).toEqual([{ date: "2026-10-06", count: 1 }]);
    expect(stats.active_users_by_day).toEqual([{ date: "2026-10-06", count: 1 }]);
    expect(stats.hours_by_day).toEqual([{ date: "2026-10-06", hours: 1 }]);

    const listed = await listAdminUsers({ q: "gabi.qa.stats" });
    expect(listed.total).toBe(1);
    expect(listed.users[0]?.email).toBe("gabi.qa.stats@primesec.ai");
    expect(listed.admins_count).toBe(1);

    const detail = await getAdminUser(qa.id);
    expect(detail.stats.entries).toBe(1);
    expect(detail.stats.hours).toBe(1);
  });

  it("sorts allowlisted columns, defaults to created desc, and breaks ties on id", async () => {
    const same = new Date("2026-06-01T00:00:00.000Z");
    const older = new Date("2026-01-01T00:00:00.000Z");
    const idA = "00000000-0000-4000-8000-00000000000a";
    const idB = "00000000-0000-4000-8000-00000000000b";
    const idC = "00000000-0000-4000-8000-00000000000c";
    await getDb().insert(users).values([
      {
        id: idA,
        email: "zed-sort@ex.com",
        passwordHash: "x",
        role: "user",
        timezone: TZ,
        isTest: true,
        createdAt: same,
      },
      {
        id: idB,
        email: "amy-sort@ex.com",
        passwordHash: "x",
        role: "admin",
        timezone: TZ,
        blockedAt: new Date("2026-06-02T00:00:00.000Z"),
        createdAt: same,
      },
      {
        id: idC,
        email: "mid-sort@ex.com",
        passwordHash: "x",
        role: "user",
        timezone: TZ,
        createdAt: older,
      },
    ]);
    const start = new Date("2026-06-01T10:00:00.000Z");
    const end = new Date("2026-06-01T11:00:00.000Z");
    await getDb().insert(timeEntries).values([
      { userId: idB, description: "b1", startAt: start, endAt: end },
      { userId: idB, description: "b2", startAt: start, endAt: end },
      { userId: idC, description: "c1", startAt: start, endAt: end },
      { userId: idC, description: "c2", startAt: start, endAt: end },
    ]);

    const emails = async (sort?: "email" | "role" | "status" | "created" | "activity", dir?: "asc" | "desc") => {
      const listed = await listAdminUsers({ sort, dir, q: "sort@" });
      return listed.users.map((user) => user.email);
    };

    expect(await emails()).toEqual([
      "amy-sort@ex.com",
      "zed-sort@ex.com",
      "mid-sort@ex.com",
    ]);
    expect(await emails("created", "desc")).toEqual([
      "amy-sort@ex.com",
      "zed-sort@ex.com",
      "mid-sort@ex.com",
    ]);
    expect(await emails("created", "asc")).toEqual([
      "mid-sort@ex.com",
      "zed-sort@ex.com",
      "amy-sort@ex.com",
    ]);
    expect(await emails("email", "asc")).toEqual([
      "amy-sort@ex.com",
      "mid-sort@ex.com",
      "zed-sort@ex.com",
    ]);
    expect(await emails("email", "desc")).toEqual([
      "zed-sort@ex.com",
      "mid-sort@ex.com",
      "amy-sort@ex.com",
    ]);
    expect(await emails("role", "asc")).toEqual([
      "amy-sort@ex.com",
      "zed-sort@ex.com",
      "mid-sort@ex.com",
    ]);
    expect(await emails("role", "desc")).toEqual([
      "mid-sort@ex.com",
      "zed-sort@ex.com",
      "amy-sort@ex.com",
    ]);
    expect(await emails("status", "asc")).toEqual([
      "zed-sort@ex.com",
      "mid-sort@ex.com",
      "amy-sort@ex.com",
    ]);
    expect(await emails("status", "desc")).toEqual([
      "amy-sort@ex.com",
      "mid-sort@ex.com",
      "zed-sort@ex.com",
    ]);
    expect(await emails("activity", "asc")).toEqual([
      "zed-sort@ex.com",
      "amy-sort@ex.com",
      "mid-sort@ex.com",
    ]);
    expect(await emails("activity", "desc")).toEqual([
      "mid-sort@ex.com",
      "amy-sort@ex.com",
      "zed-sort@ex.com",
    ]);

    const qa = await listAdminUsers({ q: "zed-sort" });
    expect(qa.total).toBe(1);
    expect(qa.users[0]?.email).toBe("zed-sort@ex.com");

    const baseline = await emails();
    const unsafe: Array<[string, string]> = [
      ["Email", "ASC"],
      ["CREATED", "Desc"],
      ["created); drop table users; --", "asc"],
      ["email", "asc; delete from users"],
      ["' OR 1=1 --", "desc, (select pg_sleep(1))"],
    ];
    for (const [sort, dir] of unsafe) {
      const listed = await listAdminUsers({ q: "sort@", sort, dir });
      expect(listed.users.map((user) => user.email)).toEqual(baseline);
    }
    const survived = await listAdminUsers({ q: "sort@" });
    expect(survived.total).toBe(3);

    for (let i = 0; i < ADMIN_PAGE_SIZE + 1; i += 1) {
      await insertUser(`page-sort-${String(i).padStart(2, "0")}@ex.com`);
    }
    const tail = await listAdminUsers({ sort: "email", dir: "asc", q: "page-sort-", page: 2 });
    expect(tail.users.map((user) => user.email)).toEqual(["page-sort-25@ex.com"]);
    const head = await listAdminUsers({ sort: "email", dir: "desc", q: "page-sort-", page: 2 });
    expect(head.users.map((user) => user.email)).toEqual(["page-sort-00@ex.com"]);
  });
});
