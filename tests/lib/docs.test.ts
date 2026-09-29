import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("DOCS_URL", () => {
  const orig = process.env.NEXT_PUBLIC_DOCS_URL;
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.NEXT_PUBLIC_DOCS_URL;
    else process.env.NEXT_PUBLIC_DOCS_URL = orig;
  });

  it("defaults to the GitHub Pages URL when env is unset", async () => {
    delete process.env.NEXT_PUBLIC_DOCS_URL;
    const mod = await import("@/lib/docs");
    expect(mod.DOCS_URL).toBe("https://reubinoff.github.io/Clockinoff/");
  });

  it("honours a NEXT_PUBLIC_DOCS_URL override, trimming whitespace", async () => {
    process.env.NEXT_PUBLIC_DOCS_URL = "  https://example.com/docs/  ";
    const mod = await import("@/lib/docs");
    expect(mod.DOCS_URL).toBe("https://example.com/docs/");
  });
});
