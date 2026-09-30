import { beforeEach, describe, expect, it } from "vitest";
import { truncateAll } from "../setup";
import { makeClient, makeProject, makeTag, makeUser } from "../helpers";
import {
  createEntry,
  startTimer,
} from "@/server/services/entries";
import {
  EXPORT_HEADERS,
  getExportRows,
  rowsToCsv,
  toExportRow,
  validateExportRange,
} from "@/server/services/export";
import { renderReportPdf } from "@/server/services/pdf";

describe("export", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("validateExportRange enforces presence and order", () => {
    expect(() => validateExportRange({ from: undefined, to: new Date() })).toThrow(/from/);
    expect(() => validateExportRange({ from: new Date(), to: undefined })).toThrow(/to/);
    expect(() =>
      validateExportRange({
        from: new Date("2026-02-01T00:00:00Z"),
        to: new Date("2026-01-01T00:00:00Z"),
      }),
    ).toThrow(/from must be <= to/);
    const ok = validateExportRange({
      from: new Date("2026-01-01T00:00:00Z"),
      to: new Date("2026-01-02T00:00:00Z"),
    });
    expect(ok.from.getTime()).toBeLessThan(ok.to.getTime());
  });

  it("empty range returns CSV with header only", async () => {
    const { user } = await makeUser();
    const { rows } = await getExportRows(
      user.id,
      {
        from: new Date("2026-01-01T00:00:00Z"),
        to: new Date("2026-01-08T00:00:00Z"),
      },
      "UTC",
    );
    const csv = rowsToCsv(rows);
    expect(csv).toBe(`${EXPORT_HEADERS.join(",")}\r\n`);
  });

  it("includes billable math and computes totals", async () => {
    const { user } = await makeUser();
    const client = await makeClient(user.id, "Acme");
    const project = await makeProject(user.id, { name: "site", clientId: client.id, defaultRate: "50" });
    const tag = await makeTag(user.id, "focus");
    await createEntry(user.id, {
      description: "work",
      start_at: "2026-04-01T09:00:00Z",
      end_at: "2026-04-01T11:00:00Z",
      project_id: project.id,
      billable: true,
      rate: null,
      tag_ids: [tag.id],
    });
    await createEntry(user.id, {
      description: "override",
      start_at: "2026-04-02T09:00:00Z",
      end_at: "2026-04-02T10:30:00Z",
      project_id: project.id,
      billable: true,
      rate: 80,
    });
    await createEntry(user.id, {
      description: "free",
      start_at: "2026-04-03T09:00:00Z",
      end_at: "2026-04-03T10:00:00Z",
      billable: false,
    });
    const { rows, totalSeconds, totalAmount } = await getExportRows(
      user.id,
      {
        from: new Date("2026-04-01T00:00:00Z"),
        to: new Date("2026-04-04T00:00:00Z"),
      },
      "UTC",
    );
    expect(rows).toHaveLength(3);
    expect(totalSeconds).toBe(3600 * 4.5);
    expect(totalAmount).toBeCloseTo(100 + 120, 2);
    const csv = rowsToCsv(rows);
    expect(csv.split("\r\n").length).toBe(5);
    expect(csv).toContain("work");
    expect(csv).toContain("focus");
  });

  it("filters by billable-only", async () => {
    const { user } = await makeUser();
    await createEntry(user.id, {
      start_at: "2026-05-01T09:00:00Z",
      end_at: "2026-05-01T10:00:00Z",
      billable: true,
      rate: 20,
    });
    await createEntry(user.id, {
      start_at: "2026-05-01T11:00:00Z",
      end_at: "2026-05-01T12:00:00Z",
      billable: false,
    });
    const { rows } = await getExportRows(user.id, {
      from: new Date("2026-05-01T00:00:00Z"),
      to: new Date("2026-05-02T00:00:00Z"),
      billable: true,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].billable).toBe("yes");
  });

  it("excludes running entries", async () => {
    const { user } = await makeUser();
    await startTimer(user.id);
    const { rows } = await getExportRows(user.id, {
      from: new Date(Date.now() - 24 * 60 * 60 * 1000),
      to: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    expect(rows).toHaveLength(0);
  });

  it("TZ boundary: midnight-crossing entry displays in user TZ (IDT summer)", async () => {
    const { user } = await makeUser();
    // 21:30 UTC on 2026-06-15 → 00:30 IDT on 2026-06-16
    await createEntry(user.id, {
      start_at: "2026-06-15T21:30:00Z",
      end_at: "2026-06-15T22:30:00Z",
    });
    const { rows } = await getExportRows(
      user.id,
      {
        from: new Date("2026-06-15T21:00:00Z"),
        to: new Date("2026-06-16T21:00:00Z"),
      },
      "Asia/Jerusalem",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe("2026-06-16");
    expect(rows[0].start).toBe("00:30");
    expect(rows[0].end).toBe("01:30");
  });

  it("toExportRow formats fields for a closed entry", () => {
    const row = toExportRow(
      {
        id: "id",
        description: "hi",
        project_id: null,
        project_name: "P",
        client_id: null,
        client_name: "C",
        start_at: "2026-01-01T09:00:00Z",
        end_at: "2026-01-01T10:30:00Z",
        duration_seconds: 5400,
        billable: true,
        billed: false,
        rate: 40,
        effective_rate: 40,
        amount: 60,
        tag_ids: [],
        tag_names: ["a", "b"],
        running: false,
      },
      "UTC",
    );
    expect(row.duration).toBe("1.50");
    expect(row.billable).toBe("yes");
    expect(row.rate).toBe("40.00");
    expect(row.amount).toBe("60.00");
    expect(row.tags).toBe("a, b");
  });

  it("renders a PDF (non-empty + empty)", async () => {
    const withRows = await renderReportPdf({
      rows: [
        {
          date: "2026-04-01",
          start: "09:00",
          end: "10:00",
          duration: "1.00",
          description: "work",
          project: "p",
          client: "c",
          tags: "focus",
          billable: "yes",
          rate: "50.00",
          amount: "50.00",
        },
      ],
      from: "2026-04-01",
      to: "2026-04-30",
      timezone: "UTC",
      totalSeconds: 3600,
      totalAmount: 50,
    });
    expect(withRows.length).toBeGreaterThan(500);
    expect(withRows.subarray(0, 4).toString()).toBe("%PDF");

    const empty = await renderReportPdf({
      rows: [],
      from: "2026-04-01",
      to: "2026-04-30",
      timezone: "UTC",
      totalSeconds: 0,
      totalAmount: 0,
    });
    expect(empty.length).toBeGreaterThan(200);
    expect(empty.subarray(0, 4).toString()).toBe("%PDF");
  });
});
