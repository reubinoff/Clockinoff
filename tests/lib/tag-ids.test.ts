import { describe, expect, it } from "vitest";
import { MAX_TAG_IDS, parseTagIds } from "@/lib/tag-ids";

function fakeUuid(n: number): string {
  const hex = n.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
}

describe("parseTagIds", () => {
  it("treats an omitted field as an empty list", () => {
    expect(parseTagIds(undefined)).toEqual([]);
  });

  it("accepts an empty array", () => {
    expect(parseTagIds([])).toEqual([]);
  });

  it("deduplicates valid UUIDs", () => {
    const id = fakeUuid(1);
    expect(parseTagIds([id, id, fakeUuid(2)])).toEqual([id, fakeUuid(2)]);
  });

  it("rejects a non-array", () => {
    expect(() => parseTagIds({})).toThrowError();
    expect(() => parseTagIds(123)).toThrowError();
    expect(() => parseTagIds("nope")).toThrowError();
    try {
      parseTagIds({ length: 2 });
    } catch (err) {
      expect(err).toMatchObject({ code: "VALIDATION", status: 400 });
      expect((err as Error).message).toBe("Invalid tag_ids");
    }
  });

  it("rejects a non-UUID element", () => {
    expect(() => parseTagIds(["not-a-uuid"])).toThrowError();
    try {
      parseTagIds([fakeUuid(1), "nope"]);
    } catch (err) {
      expect(err).toMatchObject({ code: "VALIDATION", status: 400 });
    }
  });

  it("rejects more than MAX_TAG_IDS items", () => {
    const ids = Array.from({ length: MAX_TAG_IDS + 1 }, (_, i) => fakeUuid(i + 1));
    expect(() => parseTagIds(ids)).toThrowError();
    try {
      parseTagIds(ids);
    } catch (err) {
      expect(err).toMatchObject({ code: "VALIDATION", status: 400 });
      expect((err as Error).message).toMatch(/at most 50/i);
    }
  });

  it("accepts exactly MAX_TAG_IDS items", () => {
    const ids = Array.from({ length: MAX_TAG_IDS }, (_, i) => fakeUuid(i + 1));
    expect(parseTagIds(ids)).toEqual(ids);
  });
});
