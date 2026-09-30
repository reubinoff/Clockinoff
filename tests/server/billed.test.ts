import { beforeEach, describe, expect, it } from "vitest";
import { truncateAll } from "../setup";
import { makeUser } from "../helpers";
import {
  createEntry,
  getEntryById,
  listEntries,
  patchRunning,
  startTimer,
  stopTimer,
  updateEntry,
} from "@/server/services/entries";
import { getPool } from "@/server/db/client";

describe("billable + billed product model", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  // Locked defaults (Moshe): billable ON by default, billed OFF by default,
  // for both the timer path and manual entry creation.
  it("startTimer defaults to billable=true, billed=false", async () => {
    const { user } = await makeUser();
    const entry = await startTimer(user.id);
    expect(entry.billable).toBe(true);
    expect(entry.billed).toBe(false);
  });

  it("createEntry defaults to billable=true, billed=false", async () => {
    const { user } = await makeUser();
    const entry = await createEntry(user.id, {
      start_at: "2026-01-01T09:00:00Z",
      end_at: "2026-01-01T10:00:00Z",
    });
    expect(entry.billable).toBe(true);
    expect(entry.billed).toBe(false);
  });

  // Server-enforced invariant: billed=true requires billable=true. Both the
  // create and update paths must reject the illegal combination.
  it("createEntry rejects billed=true when billable=false", async () => {
    const { user } = await makeUser();
    await expect(
      createEntry(user.id, {
        start_at: "2026-01-01T09:00:00Z",
        end_at: "2026-01-01T10:00:00Z",
        billable: false,
        billed: true,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("createEntry ignores billed when billable=false (coerces to false)", async () => {
    const { user } = await makeUser();
    const entry = await createEntry(user.id, {
      start_at: "2026-01-01T09:00:00Z",
      end_at: "2026-01-01T10:00:00Z",
      billable: false,
    });
    expect(entry.billable).toBe(false);
    expect(entry.billed).toBe(false);
  });

  it("updateEntry rejects billed=true on a non-billable entry", async () => {
    const { user } = await makeUser();
    const entry = await createEntry(user.id, {
      start_at: "2026-01-01T09:00:00Z",
      end_at: "2026-01-01T10:00:00Z",
      billable: false,
    });
    await expect(
      updateEntry(user.id, entry.id, { billed: true }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("updateEntry can flip billed on when billable is true", async () => {
    const { user } = await makeUser();
    const entry = await createEntry(user.id, {
      start_at: "2026-01-01T09:00:00Z",
      end_at: "2026-01-01T10:00:00Z",
    });
    const upd = await updateEntry(user.id, entry.id, { billed: true });
    expect(upd.billable).toBe(true);
    expect(upd.billed).toBe(true);
  });

  // Turning billable off in the same PATCH must clear billed — this is the
  // rule the UI leans on to make "Already billed" disappear when a user
  // toggles a billed entry back to non-billable.
  it("updateEntry: billable=false in same patch clears billed", async () => {
    const { user } = await makeUser();
    const entry = await createEntry(user.id, {
      start_at: "2026-01-01T09:00:00Z",
      end_at: "2026-01-01T10:00:00Z",
    });
    const billed = await updateEntry(user.id, entry.id, { billed: true });
    expect(billed.billed).toBe(true);
    const unbilled = await updateEntry(user.id, entry.id, { billable: false });
    expect(unbilled.billable).toBe(false);
    expect(unbilled.billed).toBe(false);
  });

  // The single-PATCH combo `{ billable: true, billed: true }` is fine — it's
  // exactly the shape of the row-⋯ "Mark as billed" action on a billable row.
  it("updateEntry accepts billable+billed together", async () => {
    const { user } = await makeUser();
    const entry = await createEntry(user.id, {
      start_at: "2026-01-01T09:00:00Z",
      end_at: "2026-01-01T10:00:00Z",
      billable: false,
    });
    const upd = await updateEntry(user.id, entry.id, {
      billable: true,
      billed: true,
    });
    expect(upd.billable).toBe(true);
    expect(upd.billed).toBe(true);
  });

  // Dock persistence + Stop copy: PATCH /api/timer keeps billable on the
  // running entry, and stopTimer preserves whatever the row currently holds
  // (billed stays false because the running entry is never marked billed).
  it("dock billable is persisted server-side and copied on Stop", async () => {
    const { user } = await makeUser();
    await startTimer(user.id);
    const patched = await patchRunning(user.id, { billable: false });
    expect(patched.billable).toBe(false);
    expect(patched.billed).toBe(false);
    const stopped = await stopTimer(user.id);
    expect(stopped.billable).toBe(false);
    expect(stopped.billed).toBe(false);
  });

  it("patchRunning cannot mark a running entry as billed via the invariant", async () => {
    const { user } = await makeUser();
    await startTimer(user.id);
    // patchRunning has no `billed` in its input type, but flipping billable
    // off must always snap billed to false on the running row.
    const patched = await patchRunning(user.id, { billable: false });
    expect(patched.billed).toBe(false);
  });

  // The Dana-locked Unbilled filter chip: on = billable && !billed.
  it("listEntries with unbilled=true returns only billable && !billed", async () => {
    const { user } = await makeUser();
    const nonBillable = await createEntry(user.id, {
      start_at: "2026-01-02T09:00:00Z",
      end_at: "2026-01-02T10:00:00Z",
      billable: false,
    });
    const unbilled = await createEntry(user.id, {
      start_at: "2026-01-03T09:00:00Z",
      end_at: "2026-01-03T10:00:00Z",
    });
    const alreadyBilled = await createEntry(user.id, {
      start_at: "2026-01-04T09:00:00Z",
      end_at: "2026-01-04T10:00:00Z",
    });
    await updateEntry(user.id, alreadyBilled.id, { billed: true });

    const all = await listEntries(user.id);
    expect(all.entries.map((e) => e.id).sort()).toEqual(
      [nonBillable.id, unbilled.id, alreadyBilled.id].sort(),
    );

    const only = await listEntries(user.id, { unbilled: true });
    expect(only.entries.map((e) => e.id)).toEqual([unbilled.id]);
  });

  // Migration/backfill: the 0002_billed.sql migration must have raised the
  // column default to true so a raw insert that omits `billable` still lands
  // as billable=true. This is the guarantee the "existing entries →
  // billable=true, billed=false" backfill relies on going forward.
  it("column defaults after migration: billable=true, billed=false", async () => {
    const { user } = await makeUser();
    const pool = getPool();
    const client = await pool.connect();
    try {
      const { rows } = await client.query<{ id: string; billable: boolean; billed: boolean }>(
        `INSERT INTO time_entries (user_id, start_at, end_at)
         VALUES ($1, '2026-01-05T09:00:00Z', '2026-01-05T10:00:00Z')
         RETURNING id, billable, billed`,
        [user.id],
      );
      expect(rows[0].billable).toBe(true);
      expect(rows[0].billed).toBe(false);
    } finally {
      client.release();
    }
  });

  // Second belt: even if code ever bypasses coerceBilledForPatch, the DB
  // CHECK must refuse `billed=true, billable=false`.
  it("DB CHECK refuses raw insert with billed=true, billable=false", async () => {
    const { user } = await makeUser();
    const pool = getPool();
    const client = await pool.connect();
    try {
      await expect(
        client.query(
          `INSERT INTO time_entries (user_id, start_at, end_at, billable, billed)
           VALUES ($1, '2026-01-06T09:00:00Z', '2026-01-06T10:00:00Z', false, true)`,
          [user.id],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      client.release();
    }
  });

  // Mark-as-billed row action path: single PATCH with { billed: true } on an
  // already-billable entry, entry stays present, becomes billed.
  it("Mark as billed path: PATCH { billed: true } toggles billed", async () => {
    const { user } = await makeUser();
    const entry = await createEntry(user.id, {
      start_at: "2026-01-07T09:00:00Z",
      end_at: "2026-01-07T10:00:00Z",
    });
    const marked = await updateEntry(user.id, entry.id, { billed: true });
    expect(marked.billed).toBe(true);
    const reread = await getEntryById(user.id, entry.id);
    expect(reread.billable).toBe(true);
    expect(reread.billed).toBe(true);
  });
});
