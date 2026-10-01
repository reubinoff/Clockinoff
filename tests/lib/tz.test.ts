import { describe, expect, it } from "vitest";
import {
  DEFAULT_TZ,
  endOfDayExclusiveInZone,
  formatDate,
  formatDateTime,
  formatDayLabel,
  formatDurationHms,
  formatDurationHours,
  formatTime,
  formatWeekRangeLabel,
  startOfDayInZone,
  startOfIsoWeekKey,
  zonedIsoToUtc,
} from "@/lib/tz";

describe("tz", () => {
  it("formats date/time in Asia/Jerusalem (summer DST)", () => {
    const d = new Date("2026-06-15T21:30:00Z");
    expect(formatDate(d)).toBe("2026-06-16");
    expect(formatTime(d)).toBe("00:30");
    expect(formatDateTime(d)).toBe("2026-06-16 00:30");
  });

  it("uses provided timezone", () => {
    const d = new Date("2026-06-15T21:30:00Z");
    expect(formatDate(d, "UTC")).toBe("2026-06-15");
    expect(formatTime(d, "UTC")).toBe("21:30");
  });

  it("formats durations", () => {
    expect(formatDurationHms(0)).toBe("00:00:00");
    expect(formatDurationHms(3661)).toBe("01:01:01");
    expect(formatDurationHms(-10)).toBe("00:00:00");
    expect(formatDurationHours(5400)).toBe("1.50");
    expect(formatDurationHours(-100)).toBe("0.00");
  });

  it("parses date-only inputs at zone midnight", () => {
    const utc = zonedIsoToUtc("2026-01-15");
    expect(utc.toISOString()).toBe("2026-01-14T22:00:00.000Z");
  });

  it("parses zoned local strings correctly", () => {
    const utc = zonedIsoToUtc("2026-01-15T09:30:00", "Asia/Jerusalem");
    expect(utc.toISOString()).toBe("2026-01-15T07:30:00.000Z");
  });

  it("passes through ISO strings that carry an offset or Z", () => {
    expect(zonedIsoToUtc("2026-01-15T09:30:00Z").toISOString()).toBe("2026-01-15T09:30:00.000Z");
    expect(zonedIsoToUtc("2026-01-15T09:30:00+02:00").toISOString()).toBe(
      "2026-01-15T07:30:00.000Z",
    );
  });

  it("handles boundaries at start/end of day for Jerusalem", () => {
    const startUtc = startOfDayInZone("2026-06-01");
    const endUtc = endOfDayExclusiveInZone("2026-06-01");
    expect(startUtc.toISOString()).toBe("2026-05-31T21:00:00.000Z");
    expect(endUtc.toISOString()).toBe("2026-06-01T21:00:00.000Z");
    expect(endUtc.getTime() - startUtc.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("exports default timezone constant", () => {
    expect(DEFAULT_TZ).toBe("Asia/Jerusalem");
  });

  it("throws on invalid date string", () => {
    expect(() => zonedIsoToUtc("garbage!")).toThrow();
  });

  describe("formatDayLabel (V2-7 entries day groups)", () => {
    it("returns Today for a date matching now in the zone", () => {
      const now = new Date("2026-09-29T10:00:00Z");
      const d = new Date("2026-09-29T18:00:00Z");
      expect(formatDayLabel(d, "Asia/Jerusalem", now)).toBe("Today");
    });

    it("returns Yesterday for the previous day in the zone", () => {
      const now = new Date("2026-09-29T10:00:00Z");
      const d = new Date("2026-09-28T18:00:00Z");
      expect(formatDayLabel(d, "Asia/Jerusalem", now)).toBe("Yesterday");
    });

    it("returns weekday + month + day for older dates", () => {
      const now = new Date("2026-09-30T10:00:00Z");
      const d = new Date("2026-09-28T18:00:00Z");
      expect(formatDayLabel(d, "UTC", now)).toBe("Mon, Sep 28");
      const older = new Date("2026-09-20T12:00:00Z");
      expect(formatDayLabel(older, "UTC", now)).toBe("Sun, Sep 20");
    });
  });

  // #81 Mobile Week → Day → Entry grouping: the Monday-first ISO week key +
  // the human "Mon dd – Sun dd" label feed the EntryList week band / totals.
  describe("startOfIsoWeekKey + formatWeekRangeLabel (#81)", () => {
    it("maps a Wednesday to that week's Monday", () => {
      // 2026-09-16 is a Wednesday; week starts 2026-09-14 (Monday).
      const d = new Date("2026-09-16T12:00:00Z");
      expect(startOfIsoWeekKey(d, "UTC")).toBe("2026-09-14");
    });

    it("maps a Sunday back to the previous Monday (ISO/Monday-first)", () => {
      // 2026-09-20 is a Sunday; its ISO week still starts 2026-09-14.
      const d = new Date("2026-09-20T12:00:00Z");
      expect(startOfIsoWeekKey(d, "UTC")).toBe("2026-09-14");
    });

    it("maps a Monday to itself", () => {
      const d = new Date("2026-09-14T12:00:00Z");
      expect(startOfIsoWeekKey(d, "UTC")).toBe("2026-09-14");
    });

    it("uses the zoned calendar date, not the UTC date", () => {
      // 2026-06-15T22:00:00Z is 2026-06-16 01:00 in Asia/Jerusalem (Tuesday),
      // whose ISO week starts 2026-06-15 (Monday). If we accidentally read
      // the UTC date (2026-06-15 Monday) we'd return the same answer by
      // coincidence; so pick a Sunday→Monday boundary that disambiguates.
      // 2026-09-20T22:00:00Z = 2026-09-21 01:00 Asia/Jerusalem (Monday),
      // which is the *start* of the next week (2026-09-21).
      const d = new Date("2026-09-20T22:00:00Z");
      expect(startOfIsoWeekKey(d, "Asia/Jerusalem")).toBe("2026-09-21");
      // Same instant read in UTC still falls on the earlier Sunday, whose
      // Monday-first week starts 2026-09-14.
      expect(startOfIsoWeekKey(d, "UTC")).toBe("2026-09-14");
    });

    it("is DST-safe across a spring-forward week", () => {
      // Asia/Jerusalem spring-forward on 2026-03-27 (fictional reference —
      // the arithmetic doesn't actually need the real transition date; we
      // just need a mid-week sample that would mis-bucket if we subtracted
      // 86 400 000 ms in UTC per day). 2026-03-28 is a Saturday; its ISO
      // week starts 2026-03-23 (Monday).
      const d = new Date("2026-03-28T10:00:00Z");
      expect(startOfIsoWeekKey(d, "Asia/Jerusalem")).toBe("2026-03-23");
    });

    it("formats a plain week-range label", () => {
      const now = new Date("2026-10-01T10:00:00Z"); // Thu, outside Sep 14–20
      expect(formatWeekRangeLabel("2026-09-14", now, "UTC")).toBe(
        "Sep 14 – Sep 20",
      );
    });

    it("prefixes the current week with 'This week · '", () => {
      // 2026-09-30 is a Wednesday; its week starts 2026-09-28.
      const now = new Date("2026-09-30T12:00:00Z");
      expect(formatWeekRangeLabel("2026-09-28", now, "UTC")).toBe(
        "This week · Sep 28 – Oct 4",
      );
    });

    it("prefixes the prior week with 'Last week · '", () => {
      const now = new Date("2026-09-30T12:00:00Z");
      expect(formatWeekRangeLabel("2026-09-21", now, "UTC")).toBe(
        "Last week · Sep 21 – Sep 27",
      );
    });
  });
});
