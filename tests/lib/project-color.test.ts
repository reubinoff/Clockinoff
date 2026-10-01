import { describe, expect, it } from "vitest";
import {
  PROJECT_COLOR_PALETTE,
  projectColor,
} from "@/lib/project-color";

describe("projectColor", () => {
  it("returns null for null, undefined, or empty keys", () => {
    expect(projectColor(null)).toBeNull();
    expect(projectColor(undefined)).toBeNull();
    expect(projectColor("")).toBeNull();
    expect(projectColor("   ")).toBeNull();
  });

  it("returns a value from the palette for any non-empty key", () => {
    const samples = [
      "practiproject",
      "general",
      "IBI",
      "00000000-0000-0000-0000-000000000000",
      "7c3aed-7c3aed-7c3aed",
    ];
    for (const key of samples) {
      const color = projectColor(key);
      expect(color).not.toBeNull();
      expect(PROJECT_COLOR_PALETTE).toContain(color);
    }
  });

  it("is stable: same input always maps to the same color", () => {
    const key = "practiproject";
    const first = projectColor(key);
    for (let i = 0; i < 10; i += 1) {
      expect(projectColor(key)).toBe(first);
    }
  });

  it("treats surrounding whitespace as insignificant", () => {
    expect(projectColor("  practiproject  ")).toBe(
      projectColor("practiproject"),
    );
  });

  it("distributes different keys across more than one palette slot", () => {
    // Not a strict uniformity requirement — just a sanity check that the
    // hash does not collapse everything to a single swatch, which would
    // defeat the point of a per-project chip.
    const keys = [
      "alpha",
      "beta",
      "gamma",
      "delta",
      "epsilon",
      "zeta",
      "eta",
      "theta",
      "iota",
      "kappa",
      "lambda",
      "mu",
      "nu",
      "xi",
    ];
    const seen = new Set<string>();
    for (const k of keys) {
      const c = projectColor(k);
      if (c) seen.add(c);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("exposes a non-empty palette that includes the Quiet Pulse purple", () => {
    expect(PROJECT_COLOR_PALETTE.length).toBeGreaterThan(0);
    expect(PROJECT_COLOR_PALETTE).toContain("#7c3aed");
  });
});
