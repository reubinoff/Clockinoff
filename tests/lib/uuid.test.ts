import { describe, expect, it } from "vitest";
import { isUuid, optionalUuid, requireUuid } from "@/lib/uuid";

describe("uuid", () => {
  it("accepts a canonical v4 UUID", () => {
    expect(isUuid("f47ac10b-58cc-4372-a567-0e02b2c3d479")).toBe(true);
  });

  it("accepts uppercase and mixed case", () => {
    expect(isUuid("F47AC10B-58CC-4372-A567-0E02B2C3D479")).toBe(true);
  });

  it("rejects obvious junk", () => {
    for (const bad of [
      "",
      "not-a-uuid",
      "12345",
      "f47ac10b-58cc-4372-a567-0e02b2c3d47", // too short
      "f47ac10b-58cc-4372-a567-0e02b2c3d4799", // too long
      "f47ac10b58cc4372a5670e02b2c3d479", // no hyphens
      "zzzzzzzz-58cc-4372-a567-0e02b2c3d479", // non-hex
      "'; DROP TABLE users;--",
      null,
      undefined,
      42,
    ]) {
      expect(isUuid(bad)).toBe(false);
    }
  });

  it("requireUuid returns the value when valid", () => {
    const v = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
    expect(requireUuid(v)).toBe(v);
  });

  it("requireUuid throws VALIDATION for malformed values", () => {
    expect(() => requireUuid("not-a-uuid")).toThrowError();
    try {
      requireUuid("not-a-uuid", "project_id");
    } catch (err) {
      expect(err).toMatchObject({ code: "VALIDATION", status: 400 });
      expect((err as Error).message).toContain("project_id");
    }
  });

  describe("optionalUuid", () => {
    it("passes through null/undefined/empty as null", () => {
      expect(optionalUuid(null)).toBeNull();
      expect(optionalUuid(undefined)).toBeNull();
      expect(optionalUuid("")).toBeNull();
    });

    it("returns the value when a valid UUID", () => {
      const v = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
      expect(optionalUuid(v)).toBe(v);
    });

    it("throws VALIDATION for malformed values, quoting the field name", () => {
      try {
        optionalUuid("not-a-uuid", "tag_id");
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toMatchObject({ code: "VALIDATION", status: 400 });
        expect((err as Error).message).toContain("tag_id");
      }
    });
  });
});
