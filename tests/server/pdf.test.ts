import { describe, expect, it } from "vitest";
import { _internal } from "@/server/services/pdf";
import type { EntryView } from "@/server/services/entries";

const { billablePill, formatRange, formatDayHeader, formatRateAmount, groupEntriesByDay } =
  _internal;

function makeEntry(overrides: Partial<EntryView> = {}): EntryView {
  return {
    id: "id",
    description: "d",
    project_id: null,
    project_name: null,
    client_id: null,
    client_name: null,
    start_at: "2026-04-01T09:00:00Z",
    end_at: "2026-04-01T10:00:00Z",
    duration_seconds: 3600,
    billable: true,
    billed: false,
    rate: null,
    effective_rate: null,
    amount: null,
    tag_ids: [],
    tag_names: [],
    running: false,
    ...overrides,
  };
}

describe("pdf helpers", () => {
  it("billablePill maps the three product states", () => {
    expect(billablePill({ billable: true, billed: true })).toEqual({
      label: "Billed",
      variant: "billed",
    });
    expect(billablePill({ billable: true, billed: false })).toEqual({
      label: "Billable",
      variant: "billable",
    });
    expect(billablePill({ billable: false, billed: false })).toEqual({
      label: "Not billable",
      variant: "off",
    });
  });

  it("formatRange collapses to a single date when from and to land on the same day", () => {
    const from = new Date("2026-09-30T00:00:00Z");
    const to = new Date("2026-10-01T00:00:00Z");
    expect(formatRange(from, to, "UTC")).toBe("30 Sep 2026");
  });

  it("formatRange spans multi-day windows with an en dash", () => {
    const from = new Date("2026-09-01T00:00:00Z");
    const to = new Date("2026-10-01T00:00:00Z");
    expect(formatRange(from, to, "UTC")).toBe("1 Sep 2026 – 30 Sep 2026");
  });

  it("formatDayHeader produces `Wed 30 Sep 2026`", () => {
    expect(formatDayHeader("2026-09-30", "UTC")).toBe("Wed 30 Sep 2026");
  });

  it("formatRateAmount omits missing rate/amount and never invents a currency", () => {
    expect(formatRateAmount(makeEntry())).toBeNull();
    expect(formatRateAmount(makeEntry({ effective_rate: 200 }))).toBe("200.00/h");
    expect(formatRateAmount(makeEntry({ amount: 50 }))).toBe("50.00");
    expect(formatRateAmount(makeEntry({ effective_rate: 200, amount: 50 }))).toBe(
      "200.00/h · 50.00",
    );
  });

  it("groupEntriesByDay groups by TZ-local date and sorts newest first", () => {
    const entries: EntryView[] = [
      makeEntry({ id: "a", start_at: "2026-04-01T09:00:00Z" }),
      makeEntry({ id: "b", start_at: "2026-04-02T09:00:00Z" }),
      makeEntry({ id: "c", start_at: "2026-04-01T10:00:00Z" }),
    ];
    const groups = groupEntriesByDay(entries, "UTC");
    expect(groups.map((g) => g.dateIso)).toEqual(["2026-04-02", "2026-04-01"]);
    expect(groups[1].entries.map((e) => e.id)).toEqual(["c", "a"]);
  });

  it("groupEntriesByDay respects the user's TZ when picking day boundaries", () => {
    // 2026-06-15 22:30 UTC → 2026-06-16 01:30 IDT (Asia/Jerusalem)
    const entries: EntryView[] = [
      makeEntry({ id: "utc", start_at: "2026-06-15T22:30:00Z" }),
    ];
    const groups = groupEntriesByDay(entries, "Asia/Jerusalem");
    expect(groups[0].dateIso).toBe("2026-06-16");
  });
});
