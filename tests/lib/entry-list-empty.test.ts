import { describe, expect, it } from "vitest";
import {
  FILTERED_EMPTY_COPY,
  TRUE_EMPTY_COPY,
  UNBILLED_EMPTY_COPY,
  entryEmptyCopy,
  resolveEntryEmptyKind,
  showDesktopWeekTable,
  showEmptyPulse,
} from "@/lib/entry-list-empty";

describe("resolveEntryEmptyKind", () => {
  it("is null when any closed row matches", () => {
    expect(
      resolveEntryEmptyKind({ closedCount: 2, hasActiveFilter: false }),
    ).toBeNull();
    expect(
      resolveEntryEmptyKind({ closedCount: 1, hasActiveFilter: true }),
    ).toBeNull();
  });

  it("is true-empty when the list is empty and no filter is live", () => {
    expect(
      resolveEntryEmptyKind({ closedCount: 0, hasActiveFilter: false }),
    ).toBe("true-empty");
  });

  it("is filtered-empty when the list is empty because of a filter", () => {
    expect(
      resolveEntryEmptyKind({ closedCount: 0, hasActiveFilter: true }),
    ).toBe("filtered-empty");
  });
});

describe("showDesktopWeekTable", () => {
  it("shows the table when closed rows match", () => {
    expect(
      showDesktopWeekTable({
        closedCount: 3,
        hasActiveFilter: false,
        hasRunning: false,
      }),
    ).toBe(true);
    expect(
      showDesktopWeekTable({
        closedCount: 1,
        hasActiveFilter: true,
        hasRunning: true,
      }),
    ).toBe(true);
  });

  it("shows the table for a live timer on a true-empty list", () => {
    expect(
      showDesktopWeekTable({
        closedCount: 0,
        hasActiveFilter: false,
        hasRunning: true,
      }),
    ).toBe(true);
  });

  it("hides week band, day header, and running row on filtered-empty", () => {
    expect(
      showDesktopWeekTable({
        closedCount: 0,
        hasActiveFilter: true,
        hasRunning: true,
      }),
    ).toBe(false);
    expect(
      showDesktopWeekTable({
        closedCount: 0,
        hasActiveFilter: true,
        hasRunning: false,
      }),
    ).toBe(false);
  });

  it("hides the table on true-empty with no running timer", () => {
    expect(
      showDesktopWeekTable({
        closedCount: 0,
        hasActiveFilter: false,
        hasRunning: false,
      }),
    ).toBe(false);
  });
});

describe("empty copy + Pulse", () => {
  it("reserves Pulse and the dude copy for true-empty", () => {
    expect(showEmptyPulse("true-empty")).toBe(true);
    expect(showEmptyPulse("filtered-empty")).toBe(false);
    expect(showEmptyPulse(null)).toBe(false);
    expect(entryEmptyCopy("true-empty", false)).toBe(TRUE_EMPTY_COPY);
    expect(entryEmptyCopy("true-empty", true)).toBe(TRUE_EMPTY_COPY);
  });

  it("uses the Dana filtered-empty line when any non-Unbilled filter misses", () => {
    expect(entryEmptyCopy("filtered-empty", false)).toBe(FILTERED_EMPTY_COPY);
  });

  it("keeps the Unbilled chip's own miss copy", () => {
    expect(entryEmptyCopy("filtered-empty", true)).toBe(UNBILLED_EMPTY_COPY);
  });
});
