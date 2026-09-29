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
  startOfDayInZone,
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
});
