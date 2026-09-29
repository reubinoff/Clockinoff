import { describe, expect, it } from "vitest";
import { computeAmount, durationHours, durationSeconds, effectiveRate } from "@/lib/money";

describe("money", () => {
  it("computes duration hours (positive)", () => {
    const start = new Date("2026-01-01T10:00:00Z");
    const end = new Date("2026-01-01T11:30:00Z");
    expect(durationHours(start, end)).toBeCloseTo(1.5);
    expect(durationSeconds(start, end)).toBe(90 * 60);
  });

  it("returns 0 for non-positive intervals", () => {
    const t = new Date("2026-01-01T10:00:00Z");
    expect(durationHours(t, t)).toBe(0);
    expect(durationHours(new Date("2026-01-01T12:00:00Z"), t)).toBe(0);
    expect(durationSeconds(t, t)).toBe(0);
    expect(durationSeconds(new Date("2026-01-01T12:00:00Z"), t)).toBe(0);
  });

  it("resolves effective rate (entry overrides project)", () => {
    expect(effectiveRate("50", "100")).toBe(50);
    expect(effectiveRate(null, "100")).toBe(100);
    expect(effectiveRate(null, null)).toBeNull();
    expect(effectiveRate("bad", null)).toBeNull();
    expect(effectiveRate(75, null)).toBe(75);
  });

  it("returns null amount when not billable, no end, or no rate", () => {
    const start = new Date("2026-01-01T10:00:00Z");
    const end = new Date("2026-01-01T12:00:00Z");
    expect(
      computeAmount({ billable: false, startAt: start, endAt: end, entryRate: "100", projectRate: null }),
    ).toBeNull();
    expect(
      computeAmount({ billable: true, startAt: start, endAt: null, entryRate: "100", projectRate: null }),
    ).toBeNull();
    expect(
      computeAmount({ billable: true, startAt: start, endAt: end, entryRate: null, projectRate: null }),
    ).toBeNull();
  });

  it("computes billable amount using effective rate", () => {
    const start = new Date("2026-01-01T10:00:00Z");
    const end = new Date("2026-01-01T11:30:00Z");
    expect(
      computeAmount({ billable: true, startAt: start, endAt: end, entryRate: "80", projectRate: "50" }),
    ).toBe(120);
    expect(
      computeAmount({ billable: true, startAt: start, endAt: end, entryRate: null, projectRate: "50" }),
    ).toBe(75);
  });
});
