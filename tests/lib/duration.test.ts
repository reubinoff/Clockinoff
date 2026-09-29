import { describe, expect, it } from "vitest";
import {
  clampHours,
  clampMinutes,
  combineHm,
  formatHm,
  splitHm,
  stepHours,
  stepMinutes,
} from "@/lib/duration";

describe("duration helpers", () => {
  it("splitHm splits seconds into hours and minutes", () => {
    expect(splitHm(0)).toEqual({ hours: 0, minutes: 0 });
    expect(splitHm(59)).toEqual({ hours: 0, minutes: 0 });
    expect(splitHm(60)).toEqual({ hours: 0, minutes: 1 });
    expect(splitHm(3600)).toEqual({ hours: 1, minutes: 0 });
    expect(splitHm(3660)).toEqual({ hours: 1, minutes: 1 });
    expect(splitHm(3600 * 26 + 60 * 45)).toEqual({ hours: 26, minutes: 45 });
  });

  it("splitHm floors negatives to zero", () => {
    expect(splitHm(-100)).toEqual({ hours: 0, minutes: 0 });
  });

  it("combineHm returns total seconds; ignores NaN and negatives", () => {
    expect(combineHm(0, 0)).toBe(0);
    expect(combineHm(1, 30)).toBe(3600 + 1800);
    expect(combineHm(-1, 30)).toBe(1800);
    expect(combineHm(2, Number.NaN)).toBe(2 * 3600);
    expect(combineHm(Number.NaN, 45)).toBe(45 * 60);
  });

  it("clampHours enforces 0..999", () => {
    expect(clampHours(-1)).toBe(0);
    expect(clampHours(0)).toBe(0);
    expect(clampHours(999)).toBe(999);
    expect(clampHours(1000)).toBe(999);
    expect(clampHours(Number.NaN)).toBe(0);
    expect(clampHours(3.7)).toBe(3);
  });

  it("clampMinutes enforces 0..59", () => {
    expect(clampMinutes(-1)).toBe(0);
    expect(clampMinutes(0)).toBe(0);
    expect(clampMinutes(59)).toBe(59);
    expect(clampMinutes(60)).toBe(59);
    expect(clampMinutes(Number.NaN)).toBe(0);
    expect(clampMinutes(12.9)).toBe(12);
  });

  it("stepMinutes clamps to 0..59", () => {
    expect(stepMinutes(0, -5)).toBe(0);
    expect(stepMinutes(10, -5)).toBe(5);
    expect(stepMinutes(55, 5)).toBe(59);
    expect(stepMinutes(30, 5)).toBe(35);
  });

  it("stepHours clamps to 0..999", () => {
    expect(stepHours(0, -1)).toBe(0);
    expect(stepHours(998, 5)).toBe(999);
    expect(stepHours(5, 1)).toBe(6);
  });

  it("formatHm zero-pads hours and minutes", () => {
    expect(formatHm({ hours: 0, minutes: 0 })).toBe("00:00");
    expect(formatHm({ hours: 1, minutes: 5 })).toBe("01:05");
    expect(formatHm({ hours: 25, minutes: 45 })).toBe("25:45");
  });
});
