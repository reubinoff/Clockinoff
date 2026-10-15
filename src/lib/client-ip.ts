import net from "node:net";

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
// Trust order is X-Client-IP, then the right-most X-Forwarded-For hop,
// then the socket. Both headers share one parser: split on commas, take
// the right-most non-empty entry, strip a port (including bracketed
// IPv6), require net.isIP, and cap at 64 characters. An invalid entry
// does not walk left inside that header; the next source is tried.
// X-Azure-ClientIP is not in this order. It stays in `forwardedForRaw`.
// Rate-limit keys stay on `clientIpFromHeaders` (#30) and do not read
// X-Client-IP.

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

// `client_ip` is text. A value that is not an IP must not be stored there.
// Junk stays in `forwarded_for` (the raw header text). 64 is above any
// address `net.isIP` accepts (IPv6 textual form is at most 45 characters)
// and below a column we would otherwise fill with an arbitrary string.
const RECORDED_IP_MAX = 64;

// Right-most hop of one source. Blank segments are skipped so a trailing
// comma still yields the last address. The first non-blank entry from the
// right is the only candidate: junk, or a value over 64 characters, makes
// this source unusable and the caller tries the next one.
function rightMostRecordedIp(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const parts = raw.split(",");
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const candidate = parts[i]?.trim();
    if (!candidate) continue;
    const stripped = stripPort(candidate);
    if (stripped.length > RECORDED_IP_MAX) return null;
    if (net.isIP(stripped) === 0) return null;
    return stripped;
  }
  return null;
}

export function clientIpForRecord(
  headers: HeaderReader,
  socketAddress?: string | null,
): string | null {
  const fromClient = rightMostRecordedIp(headers.get("x-client-ip"));
  if (fromClient) return fromClient;
  const fromForwarded = rightMostRecordedIp(headers.get("x-forwarded-for"));
  if (fromForwarded) return fromForwarded;
  return rightMostRecordedIp(socketAddress);
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
