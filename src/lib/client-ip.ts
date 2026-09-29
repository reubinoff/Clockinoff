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

// Strip a trailing `:port` from an IPv4-style `ip:port` string.
//
// Azure App Service appends the observed client as `ip:ephemeral-port`, and
// every new TCP connection gets a new ephemeral port. If we keyed the login
// rate-limit bucket on the raw hop, natural bursts (each on its own
// connection) would land in a fresh bucket and never trip 429 — exactly the
// prod symptom Shaul flagged on `35b55bf`.
//
// Rules:
//   - Bare IPv4 (no colon) is returned untouched.
//   - Exactly one colon *and* an all-digit suffix → treat as `ip:port` and
//     drop the suffix. This deliberately won't misfire on unbracketed IPv6
//     (which always has multiple colons).
//   - Bracketed IPv6 (`[::1]:443`) is left as-is for now; see the TODO
//     below. We don't have a confirmed Azure App Service repro that emits
//     bracketed IPv6 in XFF, and a wrong split there would corrupt the
//     address. Deferred until we do — or until an IPv6 client actually
//     hits the rate limiter in prod.
function stripPort(host: string): string {
  // TODO(#30 follow-up): handle bracketed IPv6 hosts of the form
  // `[<ipv6>]:<port>` — strip the brackets and the trailing `:port` — and
  // decide whether to normalize the bare IPv6 case too. Left unimplemented
  // rather than half-implemented to avoid keying on a mangled address.
  if (host.startsWith("[")) return host;
  const colon = host.indexOf(":");
  if (colon < 0) return host;
  if (host.indexOf(":", colon + 1) >= 0) return host;
  const port = host.slice(colon + 1);
  if (port.length === 0) return host;
  for (let i = 0; i < port.length; i += 1) {
    const c = port.charCodeAt(i);
    if (c < 48 || c > 57) return host;
  }
  return host.slice(0, colon);
}

export function clientIpFromHeaders(headers: HeaderReader): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",");
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const candidate = parts[i]?.trim();
      if (candidate) return stripPort(candidate);
    }
  }
  const real = headers.get("x-real-ip")?.trim();
  if (real) return stripPort(real);
  return "unknown";
}
