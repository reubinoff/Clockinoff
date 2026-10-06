import { beforeEach, describe, expect, it } from "vitest";
import {
  EXPORT_RATE_LIMIT,
  beginExport,
  endExport,
  resetExportLimit,
} from "@/server/services/export-limit";

describe("export-limit", () => {
  beforeEach(() => {
    resetExportLimit();
  });

  it("allows the first export and rejects a second in-flight for the same user", () => {
    expect(beginExport("user-a")).toEqual({ ok: true });
    expect(beginExport("user-a")).toEqual({ ok: false, retryAfterSeconds: 1 });
    expect(beginExport("user-b")).toEqual({ ok: true });
  });

  it("frees the in-flight slot on endExport", () => {
    expect(beginExport("user-a")).toEqual({ ok: true });
    endExport("user-a");
    expect(beginExport("user-a")).toEqual({ ok: true });
  });

  it("limits after the per-window maximum", () => {
    const start = 5_000_000;
    for (let i = 0; i < EXPORT_RATE_LIMIT.maxPerWindow; i += 1) {
      expect(beginExport("user-a", start)).toEqual({ ok: true });
      endExport("user-a");
    }
    const blocked = beginExport("user-a", start);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
      expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(
        Math.ceil(EXPORT_RATE_LIMIT.windowMs / 1000),
      );
    }
  });

  it("prunes expired buckets once the map grows past the threshold", () => {
    const start = 7_000_000;
    for (let i = 0; i < 1024; i += 1) {
      beginExport(`u-${i}`, start);
      endExport(`u-${i}`);
    }
    const after = start + EXPORT_RATE_LIMIT.windowMs + 1;
    expect(beginExport("fresh", after)).toEqual({ ok: true });
  });

  it("starts a fresh window after expiry", () => {
    const start = 6_000_000;
    for (let i = 0; i < EXPORT_RATE_LIMIT.maxPerWindow; i += 1) {
      beginExport("user-a", start);
      endExport("user-a");
    }
    expect(beginExport("user-a", start).ok).toBe(false);
    const after = start + EXPORT_RATE_LIMIT.windowMs + 1;
    expect(beginExport("user-a", after)).toEqual({ ok: true });
  });
});
