import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { publicOrigin } from "@/lib/base-url";

const SNAPSHOT = { nextauth: process.env.NEXTAUTH_URL };

function restore(): void {
  if (SNAPSHOT.nextauth === undefined) delete process.env.NEXTAUTH_URL;
  else process.env.NEXTAUTH_URL = SNAPSHOT.nextauth;
}

describe("publicOrigin", () => {
  beforeEach(() => {
    delete process.env.NEXTAUTH_URL;
  });
  afterEach(() => {
    restore();
  });

  it("prefers NEXTAUTH_URL over the request origin (the Azure bug)", () => {
    process.env.NEXTAUTH_URL = "https://clockinoff.reubinoff.com";
    const req = new Request("http://e0a475862be8:3000/api/auth/google/callback");
    expect(publicOrigin(req)).toBe("https://clockinoff.reubinoff.com");
  });

  it("strips any trailing path or slash on NEXTAUTH_URL and returns just the origin", () => {
    process.env.NEXTAUTH_URL = "https://clockinoff.reubinoff.com/";
    expect(publicOrigin()).toBe("https://clockinoff.reubinoff.com");

    process.env.NEXTAUTH_URL = "https://clockinoff.reubinoff.com/some/path";
    expect(publicOrigin()).toBe("https://clockinoff.reubinoff.com");
  });

  it("falls back to the request origin when NEXTAUTH_URL is unset (local dev)", () => {
    const req = new Request("http://localhost:3000/api/anything");
    expect(publicOrigin(req)).toBe("http://localhost:3000");
  });

  it("falls back to the request origin when NEXTAUTH_URL is malformed", () => {
    process.env.NEXTAUTH_URL = "not a url";
    const req = new Request("http://localhost:3000/api/anything");
    expect(publicOrigin(req)).toBe("http://localhost:3000");
  });

  it("throws when there is no NEXTAUTH_URL and no request to fall back to", () => {
    expect(() => publicOrigin()).toThrow(/NEXTAUTH_URL/);
  });

  it("throws when NEXTAUTH_URL is malformed and no request is available", () => {
    process.env.NEXTAUTH_URL = "::::not a url";
    expect(() => publicOrigin()).toThrow(/NEXTAUTH_URL/);
  });
});
