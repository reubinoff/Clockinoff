import { describe, expect, it } from "vitest";
import { tokenId, uuid } from "@/lib/id";

describe("id", () => {
  it("generates UUIDs", () => {
    const a = uuid();
    const b = uuid();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("generates url-safe token ids", () => {
    const t = tokenId(16);
    expect(t.length).toBeGreaterThan(0);
    expect(t).not.toContain("+");
    expect(t).not.toContain("/");
  });
});
