import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntryView, ListEntriesResult } from "@/server/services/entries";

const listEntries = vi.fn();

vi.mock("@/server/services/entries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/entries")>();
  return {
    ...actual,
    listEntries: (...args: unknown[]) => listEntries(...args),
  };
});

import { EXPORT_MAX_ROWS, getExportRows } from "@/server/services/export";

function fakeEntry(i: number): EntryView {
  return {
    id: `e${i}`,
    description: `row ${i}`,
    project_id: null,
    project_name: null,
    client_id: null,
    client_name: null,
    start_at: "2026-01-01T09:00:00Z",
    end_at: "2026-01-01T10:00:00Z",
    duration_seconds: 3600,
    billable: false,
    billed: false,
    rate: null,
    effective_rate: null,
    amount: null,
    tag_ids: [],
    tag_names: [],
    running: false,
  };
}

function page(entries: EntryView[], next: string | null): ListEntriesResult {
  return { entries, next_cursor: next };
}

describe("export row cap", () => {
  beforeEach(() => {
    listEntries.mockReset();
  });

  it("rejects when closed entries exceed the 10k cap", async () => {
    const pageSize = 200;
    const over = EXPORT_MAX_ROWS + 1;
    const pages = Math.ceil(over / pageSize);
    listEntries.mockImplementation(async (_userId: string, filters: { cursor?: string | null }) => {
      const idx = filters.cursor ? Number(filters.cursor) : 0;
      const start = idx * pageSize;
      const remaining = over - start;
      const take = Math.min(pageSize, remaining);
      const next = start + take < over ? String(idx + 1) : null;
      return page(
        Array.from({ length: take }, (_, i) => fakeEntry(start + i)),
        next,
      );
    });

    await expect(
      getExportRows("user-1", {
        from: new Date("2026-01-01T00:00:00Z"),
        to: new Date("2026-01-08T00:00:00Z"),
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION",
      message: expect.stringMatching(/10000 entries/),
    });
    expect(listEntries).toHaveBeenCalled();
    expect(pages).toBeGreaterThan(1);
  });
});
