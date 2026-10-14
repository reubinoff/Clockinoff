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
//   - Bracketed IPv6 (`[2001:db8::1]:443` or `[2001:db8::1]`) drops the
//     brackets and a trailing all-digit port. The result is a Postgres
//     `inet` literal. A non-numeric suffix is left untouched.
function allDigits(value: string): boolean {
  if (value.length === 0) return false;
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

function stripPort(host: string): string {
  if (host.startsWith("[")) {
    const close = host.indexOf("]");
    if (close <= 1) return host;
    const inner = host.slice(1, close);
    const rest = host.slice(close + 1);
    if (rest.length === 0) return inner;
    if (rest.startsWith(":") && allDigits(rest.slice(1))) return inner;
    return host;
  }
  const colon = host.indexOf(":");
  if (colon < 0) return host;
  if (host.indexOf(":", colon + 1) >= 0) return host;
  const port = host.slice(colon + 1);
  if (!allDigits(port)) return host;
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

// IP stored on a new session and on an audit row (#219).
// App Service's front end sets X-Client-IP to the address it observed,
// overwriting a client-supplied value. That header is the recorded IP.
// Otherwise use the right-most X-Forwarded-For hop (the proxy-appended
// address), then the socket. X-Azure-ClientIP is not a trusted source:
// it is kept only inside `forwardedForRaw` as unparsed evidence.
// Rate-limit keys stay on `clientIpFromHeaders` (#30) and do not read
// X-Client-IP.
function headerIp(headers: HeaderReader, name: string): string | null {
  const raw = headers.get(name)?.trim();
  if (!raw) return null;
  return stripPort(raw);
}

function lastForwardedHop(headers: HeaderReader): string | null {
  const xff = headers.get("x-forwarded-for");
  if (!xff) return null;
  const parts = xff.split(",");
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const candidate = parts[i]?.trim();
    if (candidate) return stripPort(candidate);
  }
  return null;
}

const FORWARDED_EVIDENCE_HEADERS = [
  "x-forwarded-for",
  "x-client-ip",
  "x-azure-clientip",
] as const;

// Unparsed header text for the audit row. Not used as the recorded IP.
// Includes X-Azure-ClientIP so a forged or platform value remains visible
// after it is dropped from `clientIpForRecord`.
export function forwardedForRaw(headers: HeaderReader): string | null {
  const parts: string[] = [];
  for (const name of FORWARDED_EVIDENCE_HEADERS) {
    const raw = headers.get(name);
    if (!raw) continue;
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    parts.push(`${name}: ${trimmed}`);
  }
  return parts.length > 0 ? parts.join(" | ") : null;
}

export function clientIpForRecord(
  headers: HeaderReader,
  socketAddress?: string | null,
): string | null {
  const trusted = headerIp(headers, "x-client-ip");
  if (trusted) return trusted;
  const hop = lastForwardedHop(headers);
  if (hop) return hop;
  const socket = socketAddress?.trim();
  if (socket) return stripPort(socket);
  return null;
}

export function socketAddressFromRequest(req: Request): string | null {
  const candidate = req as Request & {
    socket?: { remoteAddress?: string | null };
  };
  const addr = candidate.socket?.remoteAddress;
  if (typeof addr !== "string") return null;
  const trimmed = addr.trim();
  return trimmed.length > 0 ? trimmed : null;
}
