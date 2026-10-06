import { describe, expect, it } from "vitest";
import {
  ensureTodayGroup,
  groupEntriesByWeek,
  isClosedEntry,
  type GroupableEntry,
} from "@/lib/entry-groups";
import {
  hoursFromSeconds,
  summarize,
  type ReportEntry,
} from "@/lib/report";
import {
  formatDate,
  formatDurationHours,
  startOfIsoWeekKey,
  zonedIsoToUtc,
} from "@/lib/tz";

// #99a PRODUCT LOCK (Shaul): main-table day/week totals stay closed-only
// and must match #81 + #56 report aggregation exactly. This file is the
// drift tripwire — if the list starts adding live elapsed, or if either
// side changes how a second is bucketed by zoned day / ISO week, these
// assertions fail without a database.

const TZ = "Asia/Jerusalem";
const NOW = new Date("2026-09-16T10:00:00Z"); // Wed in Jerusalem (IDT)

interface Fixture extends GroupableEntry {
  id: string;
  project_id: string | null;
  project_name: string | null;
}

function closed(
  id: string,
  startAt: string,
  durationSeconds: number,
  extra: Partial<Fixture> = {},
): Fixture {
  return {
    id,
    start_at: startAt,
    end_at: new Date(new Date(startAt).getTime() + durationSeconds * 1000).toISOString(),
    duration_seconds: durationSeconds,
    running: false,
    project_id: extra.project_id ?? null,
    project_name: extra.project_name ?? null,
    ...extra,
  };
}

function running(id: string, startAt: string, liveElapsedSeconds: number): Fixture {
  return {
    id,
    start_at: startAt,
    end_at: null,
    duration_seconds: liveElapsedSeconds,
    running: true,
    project_id: null,
    project_name: null,
  };
}

function toReport(e: Fixture): ReportEntry {
  return {
    id: e.id,
    project_id: e.project_id,
    project_name: e.project_name,
    start_at: e.start_at,
    duration_seconds: e.duration_seconds,
  };
}

function closedOf(entries: readonly Fixture[]): Fixture[] {
  return entries.filter(isClosedEntry);
}

function rangeFor(entries: readonly Fixture[]): { from: string; to: string } {
  const keys = closedOf(entries)
    .map((e) => formatDate(new Date(e.start_at), TZ))
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
    .sort();
  if (keys.length === 0) {
    const today = formatDate(NOW, TZ);
    return { from: today, to: today };
  }
  return { from: keys[0], to: keys[keys.length - 1] };
}

function reportWeekSeconds(
  days: readonly { key: string; seconds: number }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of days) {
    const noon = zonedIsoToUtc(`${d.key}T12:00:00`, TZ);
    const weekKey = startOfIsoWeekKey(noon, TZ);
    m.set(weekKey, (m.get(weekKey) ?? 0) + d.seconds);
  }
  return m;
}

function totalsSnapshot(
  weeks: ReturnType<typeof groupEntriesByWeek<Fixture>>,
): { weekKey: string; weekSeconds: number; days: { key: string; seconds: number }[] }[] {
  return weeks.map((w) => ({
    weekKey: w.key,
    weekSeconds: w.totalSeconds,
    days: w.days.map((d) => ({ key: d.key, seconds: d.totalSeconds })),
  }));
}

function assertClosedOnlyParity(entries: readonly Fixture[]): void {
  const weeks = groupEntriesByWeek(entries, TZ, NOW);
  const closedEntries = closedOf(entries);
  const report = summarize(closedEntries.map(toReport), rangeFor(entries), TZ);
  const reportByDay = new Map(report.days.map((d) => [d.key, d.seconds]));
  const reportByWeek = reportWeekSeconds(report.days);

  let tableClosedSeconds = 0;
  for (const w of weeks) {
    const daySum = w.days.reduce((s, d) => s + d.totalSeconds, 0);
    expect(w.totalSeconds).toBe(daySum);
    expect(w.totalSeconds).toBe(reportByWeek.get(w.key) ?? 0);
    tableClosedSeconds += w.totalSeconds;
    for (const d of w.days) {
      expect(d.totalSeconds).toBe(reportByDay.get(d.key) ?? 0);
      expect(formatDurationHours(d.totalSeconds)).toBe(
        hoursFromSeconds(reportByDay.get(d.key) ?? 0).toFixed(2),
      );
      expect(d.entries.every(isClosedEntry)).toBe(true);
    }
  }

  const reportDaysInTableWeeks = report.days
    .filter((d) => weeks.some((w) => w.key === startOfIsoWeekKey(zonedIsoToUtc(`${d.key}T12:00:00`, TZ), TZ)))
    .reduce((s, d) => s + d.seconds, 0);
  expect(tableClosedSeconds).toBe(reportDaysInTableWeeks);
  expect(tableClosedSeconds).toBe(report.totalSeconds);
}

const SAME_DAY = [
  closed("a", "2026-09-14T06:00:00Z", 3600), // Mon 09:00 IDT
  closed("b", "2026-09-14T08:00:00Z", 1800),
];

const TWO_DAYS_ONE_WEEK = [
  ...SAME_DAY,
  closed("c", "2026-09-15T06:00:00Z", 7200), // Tue
];

const TWO_WEEKS = [
  ...TWO_DAYS_ONE_WEEK,
  closed("d", "2026-09-21T06:00:00Z", 5400), // next Monday
];

describe("isClosedEntry", () => {
  it("treats a stopped row as closed and a running row as not", () => {
    expect(isClosedEntry(closed("x", "2026-09-14T06:00:00Z", 60))).toBe(true);
    expect(isClosedEntry(running("y", "2026-09-16T08:00:00Z", 400))).toBe(false);
    expect(isClosedEntry({ start_at: "2026-09-16T08:00:00Z", duration_seconds: 400, end_at: null })).toBe(
      false,
    );
  });
});

describe("closed-only totals parity (#81 table vs #56 report)", () => {
  it("matches day and week seconds for closed entries in one ISO week", () => {
    assertClosedOnlyParity(TWO_DAYS_ONE_WEEK);
    const weeks = groupEntriesByWeek(TWO_DAYS_ONE_WEEK, TZ, NOW);
    expect(weeks).toHaveLength(1);
    expect(weeks[0].key).toBe("2026-09-14");
    expect(weeks[0].days.map((d) => [d.key, d.totalSeconds])).toEqual([
      ["2026-09-14", 5400],
      ["2026-09-15", 7200],
    ]);
    expect(weeks[0].totalSeconds).toBe(12600);
  });

  it("matches across an ISO week boundary", () => {
    assertClosedOnlyParity(TWO_WEEKS);
    const weeks = groupEntriesByWeek(TWO_WEEKS, TZ, NOW);
    expect(weeks.map((w) => [w.key, w.totalSeconds])).toEqual([
      ["2026-09-14", 12600],
      ["2026-09-21", 5400],
    ]);
  });

  it("buckets by start_at day, not end_at (overnight closed entry stays on start day)", () => {
    const overnight = closed("over", "2026-09-14T20:30:00Z", 3 * 3600, {
      end_at: "2026-09-14T23:30:00Z", // 23:30Z = 02:30 next calendar day in Jerusalem
    });
    // start 20:30Z = 23:30 Mon IDT; end 02:30 Tue IDT. Both aggregators must
    // charge Monday — matching #56 start-day bucketing.
    expect(formatDate(new Date(overnight.start_at), TZ)).toBe("2026-09-14");
    expect(formatDate(new Date(overnight.end_at!), TZ)).toBe("2026-09-15");
    assertClosedOnlyParity([overnight, ...SAME_DAY]);
    const weeks = groupEntriesByWeek([overnight, ...SAME_DAY], TZ, NOW);
    expect(weeks[0].days).toHaveLength(1);
    expect(weeks[0].days[0].key).toBe("2026-09-14");
    expect(weeks[0].days[0].totalSeconds).toBe(5400 + 3 * 3600);
  });

  it("uses the zoned calendar day, not UTC, so a Jerusalem midnight crossing stays aligned", () => {
    // 21:30Z on Mon 14 = 00:30 Tue 15 in Asia/Jerusalem (IDT, UTC+3).
    const afterMidnight = closed("zoned", "2026-09-14T21:30:00Z", 1800);
    expect(formatDate(new Date(afterMidnight.start_at), TZ)).toBe("2026-09-15");
    expect(formatDate(new Date(afterMidnight.start_at), "UTC")).toBe("2026-09-14");
    assertClosedOnlyParity([afterMidnight, ...SAME_DAY]);
    const weeks = groupEntriesByWeek([afterMidnight, ...SAME_DAY], TZ, NOW);
    expect(weeks[0].days.map((d) => d.key).sort()).toEqual(["2026-09-14", "2026-09-15"]);
    expect(weeks[0].days.find((d) => d.key === "2026-09-15")?.totalSeconds).toBe(1800);
  });

  it("does not let running / live elapsed inflate day or week totals", () => {
    // Same closed day as `a`/`b` so a naive summarize(mixed) would add the
    // 12h live elapsed into Monday — the drift this lock forbids.
    const live = running("live", "2026-09-14T10:00:00Z", 12 * 3600);
    const mixed = [...TWO_DAYS_ONE_WEEK, live];
    const closedWeeks = groupEntriesByWeek(TWO_DAYS_ONE_WEEK, TZ, NOW);
    const mixedWeeks = groupEntriesByWeek(mixed, TZ, NOW);
    expect(totalsSnapshot(mixedWeeks)).toEqual(totalsSnapshot(closedWeeks));
    expect(mixedWeeks[0].totalSeconds).toBe(12600);
    expect(mixedWeeks.some((w) => w.days.some((d) => d.entries.some((e) => e.id === "live")))).toBe(
      false,
    );
    assertClosedOnlyParity(mixed);

    const inflated = summarize(mixed.map(toReport), rangeFor(mixed), TZ);
    expect(inflated.totalSeconds).toBe(12600 + 12 * 3600);
    expect(mixedWeeks[0].totalSeconds).not.toBe(inflated.totalSeconds);
  });

  it("keeps a synthetic Today group at 0h so a running-only week does not invent closed time", () => {
    const live = running("live", "2026-09-16T07:00:00Z", 5400);
    const closedWeeks = groupEntriesByWeek([live], TZ, NOW);
    expect(closedWeeks).toEqual([]);
    const weeks = ensureTodayGroup(closedWeeks, TZ, NOW);
    expect(weeks).toHaveLength(1);
    expect(weeks[0].totalSeconds).toBe(0);
    expect(weeks[0].days).toHaveLength(1);
    expect(weeks[0].days[0].isToday).toBe(true);
    expect(weeks[0].days[0].totalSeconds).toBe(0);
    expect(weeks[0].days[0].entries).toEqual([]);
    assertClosedOnlyParity([live]);
  });

  it("does not change existing week totals when Today is injected next to earlier closed days", () => {
    const weeks = ensureTodayGroup(groupEntriesByWeek(SAME_DAY, TZ, NOW), TZ, NOW);
    const todayKey = formatDate(NOW, TZ);
    expect(weeks[0].totalSeconds).toBe(5400);
    const today = weeks[0].days.find((d) => d.key === todayKey);
    expect(today?.totalSeconds).toBe(0);
    expect(today?.isToday).toBe(true);
    expect(weeks[0].days.find((d) => d.key === "2026-09-14")?.totalSeconds).toBe(5400);
  });

  it("is a no-op when Today already has closed entries", () => {
    const todayClosed = closed("today", "2026-09-16T06:00:00Z", 900);
    const grouped = groupEntriesByWeek([todayClosed, ...SAME_DAY], TZ, NOW);
    expect(ensureTodayGroup(grouped, TZ, NOW)).toBe(grouped);
    assertClosedOnlyParity([todayClosed, ...SAME_DAY]);
  });

  it("does not let a zero-duration closed row or an invalid start inflate totals", () => {
    const fixtures = [
      closed("zero", "2026-09-14T06:00:00Z", 0),
      {
        id: "bad",
        start_at: "not-a-date",
        end_at: "2026-09-14T07:00:00Z",
        duration_seconds: 3600,
        running: false,
        project_id: null,
        project_name: null,
      },
      closed("ok", "2026-09-14T06:00:00Z", 60),
    ];
    const weeks = groupEntriesByWeek(fixtures, TZ, NOW);
    expect(weeks[0].totalSeconds).toBe(60);
    const report = summarize(
      closedOf(fixtures).map(toReport),
      { from: "2026-09-14", to: "2026-09-14" },
      TZ,
    );
    expect(report.totalSeconds).toBe(60);
    expect(weeks[0].totalSeconds).toBe(report.totalSeconds);
  });
});
