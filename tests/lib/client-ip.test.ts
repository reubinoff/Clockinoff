import { describe, expect, it } from "vitest";
import { clientIpFromHeaders } from "@/lib/client-ip";

function headers(map: Record<string, string | undefined>): {
  get(name: string): string | null;
} {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) {
    if (v !== undefined) lower[k.toLowerCase()] = v;
  }
  return {
    get(name: string): string | null {
      const v = lower[name.toLowerCase()];
      return v === undefined ? null : v;
    },
  };
}

describe("clientIpFromHeaders", () => {
  it("picks the right-most X-Forwarded-For hop (Azure App Service appends the real client there)", () => {
    // Azure appends `<client>:<port>` to whatever XFF the upstream sent.
    // The right-most entry is the address Azure itself observed — that is
    // the one we trust for rate-limit keying.
    const ip = clientIpFromHeaders(
      headers({ "x-forwarded-for": "10.0.0.1, 172.16.0.9, 203.0.113.7" }),
    );
    expect(ip).toBe("203.0.113.7");
  });

  it("ignores spoofed left-most XFF values", () => {
    // The client set a fake `X-Forwarded-For: 1.2.3.4` before the request
    // reached the platform; Azure appended the real hop on the right. We
    // must key off the real hop, otherwise attackers get free bucket
    // resets by rotating the header value.
    const spoofed = clientIpFromHeaders(
      headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 198.51.100.42" }),
    );
    const clean = clientIpFromHeaders(
      headers({ "x-forwarded-for": "9.9.9.9, 8.8.8.8, 198.51.100.42" }),
    );
    expect(spoofed).toBe("198.51.100.42");
    expect(clean).toBe("198.51.100.42");
    expect(spoofed).toBe(clean);
  });

  it("handles a single-entry XFF", () => {
    const ip = clientIpFromHeaders(
      headers({ "x-forwarded-for": "203.0.113.7" }),
    );
    expect(ip).toBe("203.0.113.7");
  });

  it("trims surrounding whitespace on the chosen hop", () => {
    const ip = clientIpFromHeaders(
      headers({ "x-forwarded-for": "10.0.0.1 ,   203.0.113.7   " }),
    );
    expect(ip).toBe("203.0.113.7");
  });

  it("skips trailing empty XFF hops (trailing comma / blank tail)", () => {
    const ip = clientIpFromHeaders(
      headers({ "x-forwarded-for": "10.0.0.1, 203.0.113.7, ," }),
    );
    expect(ip).toBe("203.0.113.7");
  });

  it("falls back to X-Real-IP when XFF is absent", () => {
    const ip = clientIpFromHeaders(headers({ "x-real-ip": "198.51.100.42" }));
    expect(ip).toBe("198.51.100.42");
  });

  it("prefers XFF over X-Real-IP when both are present", () => {
    const ip = clientIpFromHeaders(
      headers({
        "x-forwarded-for": "10.0.0.1, 203.0.113.7",
        "x-real-ip": "198.51.100.42",
      }),
    );
    expect(ip).toBe("203.0.113.7");
  });

  it("falls back to X-Real-IP when XFF is present but empty / only whitespace / only commas", () => {
    expect(
      clientIpFromHeaders(
        headers({ "x-forwarded-for": "", "x-real-ip": "198.51.100.42" }),
      ),
    ).toBe("198.51.100.42");
    expect(
      clientIpFromHeaders(
        headers({ "x-forwarded-for": "   ", "x-real-ip": "198.51.100.42" }),
      ),
    ).toBe("198.51.100.42");
    expect(
      clientIpFromHeaders(
        headers({ "x-forwarded-for": " , , ", "x-real-ip": "198.51.100.42" }),
      ),
    ).toBe("198.51.100.42");
  });

  it('returns "unknown" when no source header is set', () => {
    expect(clientIpFromHeaders(headers({}))).toBe("unknown");
  });

  it('returns "unknown" when X-Real-IP is only whitespace and XFF is missing', () => {
    expect(clientIpFromHeaders(headers({ "x-real-ip": "   " }))).toBe(
      "unknown",
    );
  });
});
