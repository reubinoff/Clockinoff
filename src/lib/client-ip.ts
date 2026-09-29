// Client IP resolution for request-scoped keys (rate-limit buckets, audit
// logs, ...). We use the *right-most* `X-Forwarded-For` hop by design:
//
// Azure App Service — and most L7 proxies that observe the TCP client
// themselves — *append* the socket's remote address to the incoming XFF
// header. Anything the client (or an upstream) put on the left is
// attacker-controlled and must not be trusted for keying. See issue #30:
// keying off the left-most XFF meant login bursts from a single attacker
// looked like traffic from many different clients, so the per-(email, IP)
// bucket never accumulated and 429 was never emitted.
//
// If XFF is missing we fall back to `X-Real-IP` (nginx-style single-value
// header, no comma list to reason about), then finally `"unknown"` so
// callers always have a stable string to key on.

export interface HeaderReader {
  get(name: string): string | null;
}

export function clientIpFromHeaders(headers: HeaderReader): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",");
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const candidate = parts[i]?.trim();
      if (candidate) return candidate;
    }
  }
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}
