import { beforeEach, describe, expect, it } from "vitest";
import { truncateAll } from "../setup";
import { makeProject, makeTag, makeUser } from "../helpers";
import {
  createEntry,
  deleteEntry,
  discardRunning,
  getEntryById,
  getRunningEntry,
  listEntries,
  patchRunning,
  startTimer,
  stopTimer,
  updateEntry,
} from "@/server/services/entries";

describe("timer + entries service", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("start creates a running entry; getRunningEntry returns it", async () => {
    const { user } = await makeUser();
    const entry = await startTimer(user.id, { description: "test" });
    expect(entry.running).toBe(true);
    expect(entry.description).toBe("test");
    const running = await getRunningEntry(user.id);
    expect(running?.id).toBe(entry.id);
  });

  it("start defaults billable from project when omitted", async () => {
    const { user } = await makeUser();
    const project = await makeProject(user.id, {
      defaultBillable: true,
      defaultRate: "50.00",
    });
    const entry = await startTimer(user.id, { project_id: project.id });
    expect(entry.billable).toBe(true);
    expect(entry.effective_rate).toBe(50);
  });

  it("second start returns TIMER_ALREADY_RUNNING with entry_id", async () => {
    const { user } = await makeUser();
    const first = await startTimer(user.id);
    await expect(startTimer(user.id)).rejects.toMatchObject({
      code: "TIMER_ALREADY_RUNNING",
      status: 409,
      extra: { entry_id: first.id },
    });
  });

  it("parallel starts: exactly one wins (race)", async () => {
    const { user } = await makeUser();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => startTimer(user.id)),
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(4);
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason.code).toBe("TIMER_ALREADY_RUNNING");
    }
  });

  it("stop closes the running entry", async () => {
    const { user } = await makeUser();
    const running = await startTimer(user.id, { description: "hi" });
    const stopped = await stopTimer(user.id);
    expect(stopped.id).toBe(running.id);
    expect(stopped.end_at).not.toBeNull();
    expect(stopped.running).toBe(false);
    expect(stopped.duration_seconds).toBeGreaterThanOrEqual(0);
    expect(await getRunningEntry(user.id)).toBeNull();
  });

  it("stop without running throws TIMER_NOT_RUNNING", async () => {
    const { user } = await makeUser();
    await expect(stopTimer(user.id)).rejects.toMatchObject({
      code: "TIMER_NOT_RUNNING",
      status: 404,
    });
  });

  it("patch running: metadata + tags", async () => {
    const { user } = await makeUser();
    const project = await makeProject(user.id);
    const tagA = await makeTag(user.id, "a");
    const tagB = await makeTag(user.id, "b");
    await startTimer(user.id);
    const upd = await patchRunning(user.id, {
      description: "later",
      project_id: project.id,
      billable: true,
      rate: 25,
      tag_ids: [tagA.id, tagB.id],
      start_at: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(upd.description).toBe("later");
    expect(upd.project_id).toBe(project.id);
    expect(upd.billable).toBe(true);
    expect(upd.rate).toBe(25);
    expect(new Set(upd.tag_names)).toEqual(new Set(["a", "b"]));
  });

  it("patch running without running throws", async () => {
    const { user } = await makeUser();
    await expect(patchRunning(user.id, { description: "x" })).rejects.toMatchObject({
      code: "TIMER_NOT_RUNNING",
    });
  });

  it("discardRunning removes running entry", async () => {
    const { user } = await makeUser();
    await startTimer(user.id);
    const removed = await discardRunning(user.id);
    expect(removed).toBe(true);
    expect(await getRunningEntry(user.id)).toBeNull();
    expect(await discardRunning(user.id)).toBe(false);
  });

  it("rejects invalid start_at parse and validates description", async () => {
    const { user } = await makeUser();
    await expect(
      startTimer(user.id, { start_at: "not-a-date" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      startTimer(user.id, { description: "x".repeat(2001) }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects unknown project or tag", async () => {
    const { user } = await makeUser();
    await expect(
      startTimer(user.id, { project_id: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      startTimer(user.id, { tag_ids: ["00000000-0000-0000-0000-000000000000"] }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("creates manual closed entries; overlaps allowed", async () => {
    const { user } = await makeUser();
    const start1 = new Date("2026-02-01T09:00:00Z");
    const end1 = new Date("2026-02-01T10:00:00Z");
    const start2 = new Date("2026-02-01T09:30:00Z");
    const end2 = new Date("2026-02-01T10:30:00Z");
    const e1 = await createEntry(user.id, {
      description: "first",
      start_at: start1.toISOString(),
      end_at: end1.toISOString(),
    });
    const e2 = await createEntry(user.id, {
      description: "overlap",
      start_at: start2.toISOString(),
      end_at: end2.toISOString(),
    });
    expect(e1.running).toBe(false);
    expect(e2.running).toBe(false);
    expect(e1.duration_seconds).toBe(3600);
  });

  it("rejects manual entries with start >= end", async () => {
    const { user } = await makeUser();
    await expect(
      createEntry(user.id, {
        start_at: "2026-01-01T10:00:00Z",
        end_at: "2026-01-01T10:00:00Z",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      createEntry(user.id, {
        start_at: "2026-01-01T11:00:00Z",
        end_at: "2026-01-01T10:00:00Z",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects invalid dates and description", async () => {
    const { user } = await makeUser();
    await expect(
      createEntry(user.id, { start_at: "nope", end_at: "2026-01-01T10:00:00Z" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      createEntry(user.id, {
        description: "x".repeat(2001),
        start_at: "2026-01-01T09:00:00Z",
        end_at: "2026-01-01T10:00:00Z",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("update closed entry; cannot patch running via updateEntry", async () => {
    const { user } = await makeUser();
    const tag = await makeTag(user.id, "later");
    const closed = await createEntry(user.id, {
      description: "orig",
      start_at: "2026-01-01T09:00:00Z",
      end_at: "2026-01-01T10:00:00Z",
    });
    const upd = await updateEntry(user.id, closed.id, {
      description: "edited",
      billable: true,
      rate: 20,
      tag_ids: [tag.id],
    });
    expect(upd.description).toBe("edited");
    expect(upd.tag_names).toEqual(["later"]);
    expect(upd.amount).toBe(20);

    await startTimer(user.id);
    const running = await getRunningEntry(user.id);
    expect(running).not.toBeNull();
    await expect(
      updateEntry(user.id, running!.id, { description: "no" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("update rejects start >= end and invalid rate", async () => {
    const { user } = await makeUser();
    const closed = await createEntry(user.id, {
      start_at: "2026-01-01T09:00:00Z",
      end_at: "2026-01-01T10:00:00Z",
    });
    await expect(
      updateEntry(user.id, closed.id, {
        start_at: "2026-01-01T11:00:00Z",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      updateEntry(user.id, closed.id, { rate: -1 }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("delete entry; scoped to user", async () => {
    const a = await makeUser("a@ex.com");
    const b = await makeUser("b@ex.com");
    const e = await createEntry(a.user.id, {
      start_at: "2026-01-01T09:00:00Z",
      end_at: "2026-01-01T10:00:00Z",
    });
    await expect(deleteEntry(b.user.id, e.id)).rejects.toMatchObject({ status: 404 });
    await deleteEntry(a.user.id, e.id);
    await expect(getEntryById(a.user.id, e.id)).rejects.toMatchObject({ status: 404 });
  });

  it("lists entries with filters (project, billable, tag, client)", async () => {
    const { user } = await makeUser();
    const client = await (await import("../helpers")).makeClient(user.id, "acme");
    const p1 = await makeProject(user.id, { name: "p1", clientId: client.id });
    const p2 = await makeProject(user.id, { name: "p2" });
    const tag = await makeTag(user.id, "focus");
    await createEntry(user.id, {
      start_at: "2026-01-01T09:00:00Z",
      end_at: "2026-01-01T10:00:00Z",
      project_id: p1.id,
      billable: true,
      rate: 10,
      tag_ids: [tag.id],
    });
    await createEntry(user.id, {
      start_at: "2026-01-02T09:00:00Z",
      end_at: "2026-01-02T10:00:00Z",
      project_id: p2.id,
      billable: false,
    });
    const allRes = await listEntries(user.id);
    expect(allRes.entries).toHaveLength(2);
    const bill = await listEntries(user.id, { billable: true });
    expect(bill.entries).toHaveLength(1);
    const byP = await listEntries(user.id, { project_id: p1.id });
    expect(byP.entries[0].project_id).toBe(p1.id);
    const byC = await listEntries(user.id, { client_id: client.id });
    expect(byC.entries).toHaveLength(1);
    const byTag = await listEntries(user.id, { tag_id: tag.id });
    expect(byTag.entries).toHaveLength(1);
    const empty = await listEntries(user.id, {
      tag_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(empty.entries).toHaveLength(0);
  });

  it("lists entries with date range and pagination", async () => {
    const { user } = await makeUser();
    for (let i = 0; i < 5; i++) {
      const day = String(i + 1).padStart(2, "0");
      await createEntry(user.id, {
        start_at: `2026-03-${day}T09:00:00Z`,
        end_at: `2026-03-${day}T10:00:00Z`,
      });
    }
    const inRange = await listEntries(user.id, {
      from: new Date("2026-03-02T00:00:00Z"),
      to: new Date("2026-03-04T00:00:00Z"),
    });
    expect(inRange.entries).toHaveLength(2);

    const page1 = await listEntries(user.id, { limit: 2 });
    expect(page1.entries).toHaveLength(2);
    expect(page1.next_cursor).not.toBeNull();
    const page2 = await listEntries(user.id, { limit: 2, cursor: page1.next_cursor });
    expect(page2.entries).toHaveLength(2);
    const bad = await listEntries(user.id, { cursor: "!!!not-base64" });
    expect(bad.entries.length).toBeGreaterThan(0);
  });

  it("excludes running entries when include_running is false", async () => {
    const { user } = await makeUser();
    await createEntry(user.id, {
      start_at: "2026-01-01T09:00:00Z",
      end_at: "2026-01-01T10:00:00Z",
    });
    await startTimer(user.id);
    const withRunning = await listEntries(user.id);
    const closedOnly = await listEntries(user.id, { include_running: false });
    expect(withRunning.entries.length).toBe(2);
    expect(closedOnly.entries.length).toBe(1);
  });

  it("stopTimer safeguard: end_at defaults >= start_at + 1s", async () => {
    const { user } = await makeUser();
    const start = new Date("2000-01-01T00:00:00Z");
    const started = await startTimer(user.id, { start_at: start.toISOString() });
    const stopped = await stopTimer(user.id, new Date("2000-01-01T00:00:00Z"));
    expect(stopped.id).toBe(started.id);
    expect(stopped.end_at).not.toBeNull();
    expect(new Date(stopped.end_at!).getTime()).toBeGreaterThan(start.getTime());
  });
});
