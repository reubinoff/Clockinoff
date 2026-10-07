import { describe, expect, it } from "vitest";
import { rangeForPreset } from "@/lib/range-presets";

describe("rangeForPreset", () => {
  const now = new Date(2026, 9, 7); // Wed Oct 7, 2026 (local)

  it("builds the locked quick ranges", () => {
    expect(rangeForPreset("today", now)).toEqual({ from: "2026-10-07", to: "2026-10-07" });
    expect(rangeForPreset("this-week", now)).toEqual({ from: "2026-10-05", to: "2026-10-07" });
    expect(rangeForPreset("last-week", now)).toEqual({ from: "2026-09-28", to: "2026-10-04" });
    expect(rangeForPreset("this-month", now).from).toBe("2026-10-01");
    expect(rangeForPreset("last-month", now)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });
});
