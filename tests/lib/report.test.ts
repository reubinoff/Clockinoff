import { describe, expect, it } from "vitest";
import {
  _internal,
  donutArcs,
  enumerateDayKeys,
  hoursFromSeconds,
  niceAxisTopCount,
  niceAxisTopHours,
  summarize,
  type ProjectGroup,
  type ReportEntry,
} from "@/lib/report";

const TZ = "Asia/Jerusalem";

function entry(partial: Partial<ReportEntry> & Pick<ReportEntry, "id" | "start_at" | "duration_seconds">): ReportEntry {
  return {
    project_id: null,
    project_name: null,
    ...partial,
  };
}

describe("enumerateDayKeys", () => {
  it("returns inclusive day keys between from and to", () => {
    const keys = enumerateDayKeys("2026-09-01", "2026-09-04");
    expect(keys).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
    ]);
  });

  it("returns a single-day array when from equals to", () => {
    expect(enumerateDayKeys("2026-09-15", "2026-09-15")).toEqual(["2026-09-15"]);
  });

  it("handles a month boundary and leap-year end of February", () => {
    const feb = enumerateDayKeys("2024-02-27", "2024-03-01");
    expect(feb).toEqual([
      "2024-02-27",
      "2024-02-28",
      "2024-02-29",
      "2024-03-01",
    ]);
  });

  it("returns an empty array when inputs are malformed or inverted", () => {
    expect(enumerateDayKeys("not-a-date", "2026-01-01")).toEqual([]);
    expect(enumerateDayKeys("2026-01-01", "nope")).toEqual([]);
    expect(enumerateDayKeys("2026-02-10", "2026-02-01")).toEqual([]);
  });

  it("ignores anything after the YYYY-MM-DD prefix (ISO datetime input)", () => {
    expect(enumerateDayKeys("2026-01-01T15:30:00Z", "2026-01-02T00:00:00Z")).toEqual([
      "2026-01-01",
      "2026-01-02",
    ]);
  });
});

describe("hoursFromSeconds", () => {
  it("converts seconds to decimal hours", () => {
    expect(hoursFromSeconds(3600)).toBe(1);
    expect(hoursFromSeconds(5400)).toBe(1.5);
  });

  it("clamps non-positive and non-finite inputs to 0", () => {
    expect(hoursFromSeconds(0)).toBe(0);
    expect(hoursFromSeconds(-30)).toBe(0);
    expect(hoursFromSeconds(Number.NaN)).toBe(0);
    expect(hoursFromSeconds(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("niceAxisTopCount", () => {
  it("keeps an empty series readable and rounds up", () => {
    expect(niceAxisTopCount(0)).toBe(1);
    expect(niceAxisTopCount(1)).toBe(1);
    expect(niceAxisTopCount(3)).toBe(4);
    expect(niceAxisTopCount(12)).toBe(20);
    expect(niceAxisTopCount(5000)).toBe(5000);
  });
});

describe("niceAxisTopHours", () => {
  it("returns at least 1h even for a flat zero range", () => {
    expect(niceAxisTopHours(0)).toBe(1);
    expect(niceAxisTopHours(60)).toBe(1);
  });

  it("rounds peak hours up to a readable step", () => {
    expect(niceAxisTopHours(1.1 * 3600)).toBe(1.5);
    expect(niceAxisTopHours(1.6 * 3600)).toBe(2);
    expect(niceAxisTopHours(2.1 * 3600)).toBe(3);
    expect(niceAxisTopHours(3.5 * 3600)).toBe(4);
    expect(niceAxisTopHours(5 * 3600)).toBe(6);
    expect(niceAxisTopHours(9 * 3600)).toBe(10);
    expect(niceAxisTopHours(20 * 3600)).toBe(20);
  });

  it("stays monotonic above 24h/day (defensive)", () => {
    expect(niceAxisTopHours(26 * 3600)).toBeGreaterThanOrEqual(28);
    expect(niceAxisTopHours(50 * 3600)).toBeGreaterThanOrEqual(52);
  });
});

describe("summarize", () => {
  it("fills every day in range even when there are no entries", () => {
    const s = summarize([], { from: "2026-09-01", to: "2026-09-07" }, TZ);
    expect(s.totalSeconds).toBe(0);
    expect(s.days).toHaveLength(7);
    expect(s.days.every((d) => d.seconds === 0)).toBe(true);
    expect(s.projects).toEqual([]);
  });

  it("sums entries into their zoned day bucket", () => {
    const s = summarize(
      [
        entry({
          id: "a",
          start_at: "2026-09-14T06:00:00Z", // 09:00 in Jerusalem
          duration_seconds: 3600,
        }),
        entry({
          id: "b",
          start_at: "2026-09-14T08:00:00Z", // same day
          duration_seconds: 1800,
        }),
        entry({
          id: "c",
          start_at: "2026-09-15T06:00:00Z",
          duration_seconds: 7200,
        }),
      ],
      { from: "2026-09-14", to: "2026-09-15" },
      TZ,
    );
    expect(s.totalSeconds).toBe(3600 + 1800 + 7200);
    expect(s.days.map((d) => d.seconds)).toEqual([5400, 7200]);
  });

  it("drops entries that fall outside the enumerated range", () => {
    const s = summarize(
      [
        entry({
          id: "in",
          start_at: "2026-09-10T06:00:00Z",
          duration_seconds: 3600,
        }),
        entry({
          id: "before",
          start_at: "2026-08-30T06:00:00Z",
          duration_seconds: 3600,
        }),
        entry({
          id: "after",
          start_at: "2026-09-20T06:00:00Z",
          duration_seconds: 3600,
        }),
      ],
      { from: "2026-09-01", to: "2026-09-15" },
      TZ,
    );
    expect(s.totalSeconds).toBe(3600);
    const total = s.days.reduce((sum, d) => sum + d.seconds, 0);
    expect(total).toBe(3600);
  });

  it("skips zero / negative duration entries and ignores invalid dates", () => {
    const s = summarize(
      [
        entry({ id: "a", start_at: "2026-09-14T06:00:00Z", duration_seconds: 0 }),
        entry({ id: "b", start_at: "2026-09-14T06:00:00Z", duration_seconds: -60 }),
        entry({ id: "bad", start_at: "not-a-date", duration_seconds: 3600 }),
        entry({ id: "c", start_at: "2026-09-14T06:00:00Z", duration_seconds: 60 }),
      ],
      { from: "2026-09-14", to: "2026-09-14" },
      TZ,
    );
    expect(s.totalSeconds).toBe(60);
  });

  it("groups by project with stable color + share, sorts by seconds desc", () => {
    const s = summarize(
      [
        entry({
          id: "p1-1",
          project_id: "11111111-1111-1111-1111-111111111111",
          project_name: "Alpha",
          start_at: "2026-09-14T06:00:00Z",
          duration_seconds: 7200,
        }),
        entry({
          id: "p1-2",
          project_id: "11111111-1111-1111-1111-111111111111",
          project_name: "Alpha",
          start_at: "2026-09-15T06:00:00Z",
          duration_seconds: 1800,
        }),
        entry({
          id: "p2-1",
          project_id: "22222222-2222-2222-2222-222222222222",
          project_name: "Beta",
          start_at: "2026-09-15T06:00:00Z",
          duration_seconds: 3600,
        }),
      ],
      { from: "2026-09-14", to: "2026-09-15" },
      TZ,
    );
    expect(s.projects.map((p) => p.name)).toEqual(["Alpha", "Beta"]);
    const alpha = s.projects.find((p) => p.name === "Alpha")!;
    expect(alpha.seconds).toBe(9000);
    expect(alpha.entries).toBe(2);
    expect(alpha.share).toBeCloseTo(9000 / 12600, 5);
    expect(alpha.color).toMatch(/^#/);
  });

  it("buckets entries without a project under a stable 'No project' group", () => {
    const s = summarize(
      [
        entry({ id: "a", start_at: "2026-09-14T06:00:00Z", duration_seconds: 60 }),
        entry({ id: "b", start_at: "2026-09-14T07:00:00Z", duration_seconds: 60 }),
      ],
      { from: "2026-09-14", to: "2026-09-14" },
      TZ,
    );
    expect(s.projects).toHaveLength(1);
    expect(s.projects[0].name).toBe(_internal.NO_PROJECT_LABEL);
    expect(s.projects[0].key).toBe(_internal.NO_PROJECT_KEY);
    expect(s.projects[0].color).toBe(_internal.NO_PROJECT_COLOR);
    expect(s.projects[0].entries).toBe(2);
    expect(s.projects[0].share).toBe(1);
  });

  it("ties break on project name alphabetically", () => {
    const s = summarize(
      [
        entry({
          id: "z1",
          project_id: "aaaa",
          project_name: "Zed",
          start_at: "2026-09-14T06:00:00Z",
          duration_seconds: 3600,
        }),
        entry({
          id: "a1",
          project_id: "bbbb",
          project_name: "Apple",
          start_at: "2026-09-14T07:00:00Z",
          duration_seconds: 3600,
        }),
      ],
      { from: "2026-09-14", to: "2026-09-14" },
      TZ,
    );
    expect(s.projects.map((p) => p.name)).toEqual(["Apple", "Zed"]);
  });
});

describe("donutArcs", () => {
  function g(key: string, color: string, seconds: number): ProjectGroup {
    return { key, color, name: key, seconds, share: 0, entries: 1 };
  }

  it("returns no arcs for empty or all-zero projects", () => {
    expect(donutArcs([])).toEqual([]);
    expect(donutArcs([g("a", "#000", 0), g("b", "#000", 0)])).toEqual([]);
  });

  it("spans the full ring (2π) across all non-zero segments", () => {
    const arcs = donutArcs([g("a", "#000", 60), g("b", "#111", 180), g("c", "#222", 60)]);
    expect(arcs).toHaveLength(3);
    const total = arcs[arcs.length - 1].endRad - arcs[0].startRad;
    expect(total).toBeCloseTo(Math.PI * 2, 5);
    expect(arcs[0].startRad).toBeCloseTo(-Math.PI / 2, 5);
  });

  it("starts at 12 o'clock and goes clockwise with no gaps", () => {
    const arcs = donutArcs([g("a", "#000", 100), g("b", "#111", 100)]);
    expect(arcs[0].startRad).toBeCloseTo(-Math.PI / 2, 5);
    expect(arcs[1].startRad).toBeCloseTo(arcs[0].endRad, 5);
  });

  it("drops zero-second projects from the ring", () => {
    const arcs = donutArcs([g("a", "#000", 100), g("b", "#111", 0), g("c", "#222", 100)]);
    expect(arcs.map((a) => a.key)).toEqual(["a", "c"]);
  });

  it("produces a single-segment ring that still spans 2π without degeneracy", () => {
    const arcs = donutArcs([g("sole", "#000", 3600)]);
    expect(arcs).toHaveLength(1);
    expect(arcs[0].endRad - arcs[0].startRad).toBeCloseTo(Math.PI * 2, 5);
  });
});
