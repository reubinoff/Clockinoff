import { describe, expect, it } from "vitest";
import {
  clientIpForRecord,
  clientIpFromHeaders,
  forwardedForRaw,
  socketAddressFromRequest,
} from "@/lib/client-ip";

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

  it("strips brackets and :port from a bracketed IPv6 hop", () => {
    const ip = clientIpFromHeaders(
      headers({ "x-forwarded-for": "10.0.0.1, [2001:db8::1]:443" }),
    );
    expect(ip).toBe("2001:db8::1");
    expect(
      clientIpFromHeaders(headers({ "x-forwarded-for": "[2001:db8::1]" })),
    ).toBe("2001:db8::1");
    expect(
      clientIpFromHeaders(headers({ "x-forwarded-for": "[2001:db8::1]:abc" })),
    ).toBe("[2001:db8::1]:abc");
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": "[" }))).toBe("[");
    expect(
      clientIpFromHeaders(headers({ "x-forwarded-for": "[2001:db8::1]extra" })),
    ).toBe("[2001:db8::1]extra");
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

describe("clientIpForRecord", () => {
  it("does not record X-Azure-ClientIP", () => {
    expect(
      clientIpForRecord(headers({ "x-azure-clientip": "5.6.7.8" })),
    ).not.toBe("5.6.7.8");
    expect(clientIpForRecord(headers({ "x-azure-clientip": "5.6.7.8" }))).toBeNull();
    expect(
      clientIpForRecord(
        headers({
          "x-azure-clientip": "5.6.7.8",
          "x-forwarded-for": "9.9.9.9, 198.51.100.8",
        }),
      ),
    ).toBe("198.51.100.8");
    expect(
      clientIpForRecord(
        headers({
          "x-azure-clientip": "5.6.7.8",
          "x-client-ip": "1.2.3.4",
        }),
      ),
    ).toBe("1.2.3.4");
  });

  it("records X-Client-IP (App Service front end overwrites a client-sent value)", () => {
    expect(clientIpForRecord(headers({ "x-client-ip": "1.2.3.4" }))).toBe("1.2.3.4");
    expect(
      clientIpForRecord(
        headers({
          "x-client-ip": "1.2.3.4",
          "x-azure-clientip": "5.6.7.8",
          "x-forwarded-for": "9.9.9.9, 198.51.100.8",
        }),
      ),
    ).toBe("1.2.3.4");
    expect(
      clientIpForRecord(
        headers({
          "x-azure-clientip": "   ",
          "x-client-ip": "203.0.113.66",
        }),
      ),
    ).toBe("203.0.113.66");
  });

  it("parses an X-Forwarded-For hop that includes a port", () => {
    expect(
      clientIpForRecord(
        headers({ "x-forwarded-for": "9.9.9.9, 203.0.113.7:54012" }),
      ),
    ).toBe("203.0.113.7");
  });

  it("parses a bracketed IPv6 X-Forwarded-For hop that includes a port", () => {
    expect(
      clientIpForRecord(
        headers({ "x-forwarded-for": "203.0.113.7, [2001:db8::1]:443" }),
      ),
    ).toBe("2001:db8::1");
  });

  it("keeps forged header values in forwarded_for without using them as the IP", () => {
    const forged = headers({
      "x-azure-clientip": "5.6.7.8",
      "x-client-ip": "1.2.3.4",
      "x-forwarded-for": "9.9.9.9, 203.0.113.7:54012",
    });
    expect(clientIpForRecord(forged)).toBe("1.2.3.4");
    const evidence = forwardedForRaw(forged);
    expect(evidence).toContain("5.6.7.8");
    expect(evidence).toContain("9.9.9.9");
    expect(evidence).toContain("203.0.113.7:54012");
    expect(evidence).toBe(
      "x-forwarded-for: 9.9.9.9, 203.0.113.7:54012 | x-client-ip: 1.2.3.4 | x-azure-clientip: 5.6.7.8",
    );
  });

  it("ignores a spoofed first X-Forwarded-For hop and uses the last hop", () => {
    expect(
      clientIpForRecord(headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.50" })),
    ).toBe("203.0.113.50");
    expect(
      clientIpForRecord(headers({ "x-forwarded-for": "198.51.100.8:44321, 203.0.113.50" })),
    ).toBe("203.0.113.50");
    expect(forwardedForRaw(headers({ "x-forwarded-for": "  1.2.3.4, 203.0.113.50  " }))).toBe(
      "x-forwarded-for: 1.2.3.4, 203.0.113.50",
    );
    expect(forwardedForRaw(headers({}))).toBeNull();
    expect(forwardedForRaw(headers({ "x-forwarded-for": "   " }))).toBeNull();
    expect(forwardedForRaw(headers({ "x-azure-clientip": "   " }))).toBeNull();
  });

  it("falls back to the socket address when no trusted header is present", () => {
    expect(clientIpForRecord(headers({}), "192.0.2.10")).toBe("192.0.2.10");
    expect(clientIpForRecord(headers({}), "192.0.2.10:4000")).toBe("192.0.2.10");
    expect(clientIpForRecord(headers({}))).toBeNull();
    expect(clientIpForRecord(headers({}), "   ")).toBeNull();
    expect(
      clientIpForRecord(headers({ "x-forwarded-for": " , 203.0.113.1" }), "192.0.2.1"),
    ).toBe("203.0.113.1");
    expect(clientIpForRecord(headers({ "x-forwarded-for": " , , " }), "192.0.2.1")).toBe(
      "192.0.2.1",
    );
  });

  it("parses X-Client-IP with the same right-most hop rules as X-Forwarded-For", () => {
    expect(
      clientIpForRecord(headers({ "x-client-ip": "1.2.3.4, 140.248.50.22" })),
    ).toBe("140.248.50.22");
    expect(clientIpForRecord(headers({ "x-client-ip": "140.248.50.22" }))).toBe(
      "140.248.50.22",
    );
    expect(
      clientIpForRecord(
        headers({
          "x-client-ip": "1.2.3.4, not-an-ip",
          "x-forwarded-for": "9.9.9.9, 140.248.50.22",
        }),
      ),
    ).toBe("140.248.50.22");
    expect(
      clientIpForRecord(
        headers({
          "x-client-ip": "1.2.3.4, not-an-ip",
          "x-forwarded-for": "140.248.50.22, junk",
        }),
        "192.0.2.10",
      ),
    ).toBe("192.0.2.10");
    expect(
      clientIpForRecord(headers({ "x-client-ip": "[2001:db8::1]:443" })),
    ).toBe("2001:db8::1");
  });

  it("parses X-Forwarded-For chains and falls through when the last hop is junk", () => {
    expect(
      clientIpForRecord(headers({ "x-forwarded-for": "1.2.3.4, 140.248.50.22" })),
    ).toBe("140.248.50.22");
    expect(
      clientIpForRecord(headers({ "x-forwarded-for": "140.248.50.22" })),
    ).toBe("140.248.50.22");
    expect(
      clientIpForRecord(
        headers({ "x-forwarded-for": "140.248.50.22, not-an-ip" }),
        "192.0.2.8",
      ),
    ).toBe("192.0.2.8");
    expect(
      clientIpForRecord(headers({ "x-forwarded-for": "140.248.50.22, not-an-ip" })),
    ).toBeNull();
    expect(
      clientIpForRecord(
        headers({ "x-azure-clientip": "140.248.50.22" }),
        "192.0.2.8",
      ),
    ).toBe("192.0.2.8");
  });

  it("stores null for a value that is not an IP and keeps the junk in forwarded_for", () => {
    const junk = headers({
      "x-client-ip": "not-an-ip",
      "x-forwarded-for": "203.0.113.7, evil.example",
      "x-azure-clientip": "also-junk",
    });
    expect(clientIpForRecord(junk)).toBeNull();
    expect(forwardedForRaw(junk)).toBe(
      "x-forwarded-for: 203.0.113.7, evil.example | x-client-ip: not-an-ip | x-azure-clientip: also-junk",
    );
    expect(clientIpForRecord(headers({ "x-forwarded-for": "9.9.9.9, 999.1.2.3" }))).toBeNull();
    expect(clientIpForRecord(headers({ "x-client-ip": "1.2.3" }))).toBeNull();
    expect(clientIpForRecord(headers({}), "nope")).toBeNull();
    expect(clientIpForRecord(headers({ "x-client-ip": "1.2.3.4:notaport" }))).toBeNull();
  });

  it("caps a recorded IP at 64 characters", () => {
    const sixtyFour = "a".repeat(64);
    const sixtyFive = "b".repeat(65);
    expect(clientIpForRecord(headers({ "x-client-ip": sixtyFour }))).toBeNull();
    expect(clientIpForRecord(headers({ "x-forwarded-for": sixtyFive }))).toBeNull();
    expect(
      clientIpForRecord(
        headers({ "x-client-ip": sixtyFive, "x-forwarded-for": "140.248.50.22" }),
      ),
    ).toBe("140.248.50.22");
    expect(clientIpForRecord(headers({}), `1.2.3.4${"x".repeat(60)}`)).toBeNull();
    expect(forwardedForRaw(headers({ "x-client-ip": sixtyFive }))).toContain(sixtyFive);
  });

  it("reads a socket address hung off the request", () => {
    const req = new Request("http://test/");
    expect(socketAddressFromRequest(req)).toBeNull();
    const withSocket = req as Request & { socket: { remoteAddress: string } };
    withSocket.socket = { remoteAddress: "192.0.2.15" };
    expect(socketAddressFromRequest(withSocket)).toBe("192.0.2.15");
    expect(clientIpForRecord(withSocket.headers, socketAddressFromRequest(withSocket))).toBe(
      "192.0.2.15",
    );
  });
});
