import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config.mjs";

// Guards the headers emitted by `next.config.mjs` so a stray edit (removing a
// directive, loosening frame-ancestors, dropping HSTS) is caught by `npm test`
// instead of only by a production response-header audit. Issues #43 / #44.

interface HeaderPair {
  key: string;
  value: string;
}

interface HeaderRule {
  source: string;
  headers: HeaderPair[];
}

async function loadBaselineHeaders(): Promise<HeaderPair[]> {
  const config = nextConfig as { headers?: () => Promise<HeaderRule[]> };
  if (typeof config.headers !== "function") {
    throw new Error("next.config.mjs is missing a headers() function");
  }
  const rules = await config.headers();
  const match = rules.find((rule) => rule.source === "/:path*");
  if (!match) throw new Error("No /:path* rule found in headers()");
  return match.headers;
}

describe("security headers (next.config.mjs)", () => {
  it("suppresses the X-Powered-By framework banner", () => {
    const config = nextConfig as { poweredByHeader?: boolean };
    expect(config.poweredByHeader).toBe(false);
  });

  it("emits HSTS with includeSubDomains on every response", async () => {
    const headers = await loadBaselineHeaders();
    const hsts = headers.find((h) => h.key === "Strict-Transport-Security");
    expect(hsts, "missing HSTS").toBeDefined();
    expect(hsts!.value).toMatch(/max-age=\d+/);
    expect(hsts!.value).toContain("includeSubDomains");
  });

  it("sets X-Content-Type-Options: nosniff", async () => {
    const headers = await loadBaselineHeaders();
    const nosniff = headers.find((h) => h.key === "X-Content-Type-Options");
    expect(nosniff?.value).toBe("nosniff");
  });

  it("sets X-Frame-Options: DENY and CSP frame-ancestors 'none'", async () => {
    const headers = await loadBaselineHeaders();
    const xfo = headers.find((h) => h.key === "X-Frame-Options");
    expect(xfo?.value).toBe("DENY");
    const csp = headers.find((h) => h.key === "Content-Security-Policy");
    expect(csp?.value).toContain("frame-ancestors 'none'");
  });

  it("ships an enforce CSP with default-src, script-src, style-src, object-src", async () => {
    const headers = await loadBaselineHeaders();
    const csp = headers.find((h) => h.key === "Content-Security-Policy");
    expect(csp, "missing CSP").toBeDefined();
    const value = csp!.value;
    expect(value).toContain("default-src 'self'");
    expect(value).toContain("script-src");
    expect(value).toContain("style-src");
    expect(value).toContain("img-src");
    expect(value).toContain("font-src");
    expect(value).toContain("connect-src");
    expect(value).toContain("object-src 'none'");
    expect(value).toContain("base-uri 'self'");
    expect(value).toContain("form-action 'self'");
  });

  it("sets a conservative Referrer-Policy", async () => {
    const headers = await loadBaselineHeaders();
    const rp = headers.find((h) => h.key === "Referrer-Policy");
    expect(rp?.value).toBe("strict-origin-when-cross-origin");
  });
});
