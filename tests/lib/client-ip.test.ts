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

  it("strips the ephemeral :port Azure appends to the right-most IPv4 hop", () => {
    // Azure App Service emits the observed client as `ip:port`. Each TCP
    // connection gets a new ephemeral port, so keying the rate-limit
    // bucket on the raw hop would give every burst request a fresh
    // bucket — exactly the prod miss Shaul flagged.
    const ip = clientIpFromHeaders(
      headers({
        "x-forwarded-for": "10.0.0.1, 172.16.0.9, 203.0.113.7:54321",
      }),
    );
    expect(ip).toBe("203.0.113.7");
  });

  it("produces the same key for the same client on different ephemeral ports", () => {
    // Two follow-up connections from one attacker, only the ephemeral
    // source port differs. They must land in the same bucket.
    const a = clientIpFromHeaders(
      headers({ "x-forwarded-for": "10.0.0.1, 203.0.113.7:12345" }),
    );
    const b = clientIpFromHeaders(
      headers({ "x-forwarded-for": "10.0.0.1, 203.0.113.7:65535" }),
    );
    const c = clientIpFromHeaders(
      headers({ "x-forwarded-for": "10.0.0.1, 203.0.113.7" }),
    );
    expect(a).toBe("203.0.113.7");
    expect(b).toBe("203.0.113.7");
    expect(c).toBe("203.0.113.7");
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it("strips :port on the X-Real-IP fallback too", () => {
    const ip = clientIpFromHeaders(
      headers({ "x-real-ip": "198.51.100.42:44321" }),
    );
    expect(ip).toBe("198.51.100.42");
  });

  it("does not touch unbracketed IPv6 (leaves it as-is, TODO to normalize)", () => {
    // IPv6 without brackets has multiple colons, so the port-stripping
    // rule must not fire. We deliberately leave normalization of IPv6
    // (bare or bracketed) for a follow-up.
    const ip = clientIpFromHeaders(
      headers({ "x-forwarded-for": "10.0.0.1, 2001:db8::1" }),
    );
    expect(ip).toBe("2001:db8::1");
  });

  it("does not touch bracketed IPv6 with :port (deferred; see TODO in client-ip.ts)", () => {
    const ip = clientIpFromHeaders(
      headers({ "x-forwarded-for": "10.0.0.1, [2001:db8::1]:443" }),
    );
    expect(ip).toBe("[2001:db8::1]:443");
  });

  it("does not strip a non-numeric suffix after ':' (defensive: not a port)", () => {
    const ip = clientIpFromHeaders(
      headers({ "x-forwarded-for": "203.0.113.7:abc" }),
    );
    expect(ip).toBe("203.0.113.7:abc");
  });

  it("does not strip a trailing ':' with no port digits", () => {
    const ip = clientIpFromHeaders(
      headers({ "x-forwarded-for": "203.0.113.7:" }),
    );
    expect(ip).toBe("203.0.113.7:");
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
