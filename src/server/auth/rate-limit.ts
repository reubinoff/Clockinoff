// Fail-closed rate limiters for the auth endpoints. Covers:
//
//   - `POST /api/auth/login`    — `(email, IP)` buckets, counts credential
//     failures, resets on success. (Issues #30, #39.) A second per-IP
//     ceiling (#145) stops one source from filling the (email, IP) map
//     with distinct non-existent emails.
//   - `POST /api/auth/register` — per-IP bucket counting *all* register
//     attempts. Register has no stable identifier before the account exists,
//     so an attacker trying new emails from one host must still be throttled.
//
// Both limiters:
//
//   - Live in-process. On a multi-instance deployment each replica keeps its
//     own counters — intentional: no shared secret, no extra dependency, and
//     per-replica throttling is still a large step up from "no limit at all".
//     Multi-instance correctness would need Redis or a gateway (#126).
//   - Expose a `retryAfterSeconds(...)` helper so the route handlers can
//     return a correct `Retry-After` on 429 instead of a magic constant.
//   - Are hard-capped (#145). Insertion-ordered Maps give FIFO eviction
//     once a map hits `MAX_BUCKETS`. TTL cleanup is incremental (at most
//     `PRUNE_SCAN` entries per write) so a full map never costs O(n) on
//     the request path.
//
// Login buckets are keyed on `(normalized-email, client-ip)` together, per
// issue #30: an attacker who tries the same email from many IPs is only
// slowed on each individual IP, and a shared NAT full of legit users is
// only throttled per account.

const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

// Cross-email ceiling for a single IP. Checked *before* the login body is
// read (#151) so a huge payload cannot starve the (email, IP) limiter.
const LOGIN_IP_MAX_FAILURES = 50;
const LOGIN_IP_WINDOW_MS = LOGIN_WINDOW_MS;

const REGISTER_MAX_ATTEMPTS = 10;
const REGISTER_WINDOW_MS = 15 * 60 * 1000;

// Hard cap on every in-process map. 50k live buckets is well above any
// legitimate single-replica load and cheap enough that FIFO eviction of
// the oldest key is the right overflow valve (#145).
const MAX_BUCKETS = 50_000;

// Never walk the whole map on a request. Insertion-ordered iteration
// starts at the oldest key, so a short prefix scan also prefers expired
// entries that have been sitting around the longest.
const PRUNE_SCAN = 32;

interface Bucket {
  count: number;
  resetAt: number;
}

const loginBuckets = new Map<string, Bucket>();
const loginIpBuckets = new Map<string, Bucket>();
const registerBuckets = new Map<string, Bucket>();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function loginKey(email: string, ip: string): string {
  return `${normalizeEmail(email)}|${ip}`;
}

function incrementalPrune(buckets: Map<string, Bucket>, now: number): void {
  let scanned = 0;
  for (const [key, bucket] of buckets) {
    if (scanned >= PRUNE_SCAN) break;
    scanned += 1;
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function evictOldest(buckets: Map<string, Bucket>): void {
  const oldest = buckets.keys().next().value;
  if (oldest !== undefined) buckets.delete(oldest);
}

function remember(
  buckets: Map<string, Bucket>,
  key: string,
  now: number,
  windowMs: number,
): void {
  incrementalPrune(buckets, now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    if (!existing && buckets.size >= MAX_BUCKETS) evictOldest(buckets);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  existing.count += 1;
}

function isLimited(
  buckets: Map<string, Bucket>,
  key: string,
  now: number,
  max: number,
): boolean {
  const bucket = buckets.get(key);
  if (!bucket) return false;
  if (bucket.resetAt <= now) return false;
  return bucket.count >= max;
}

function retryAfter(bucket: Bucket | undefined, now: number): number {
  if (!bucket || bucket.resetAt <= now) return 0;
  // Round up so the client never retries one tick early.
  return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
}

// ---------- login ----------------------------------------------------------

export function isLoginRateLimited(
  email: string,
  ip: string,
  now: number = Date.now(),
): boolean {
  return isLimited(loginBuckets, loginKey(email, ip), now, LOGIN_MAX_FAILURES);
}

export function isLoginIpRateLimited(ip: string, now: number = Date.now()): boolean {
  return isLimited(loginIpBuckets, ip, now, LOGIN_IP_MAX_FAILURES);
}

export function recordLoginFailure(
  email: string,
  ip: string,
  now: number = Date.now(),
): void {
  remember(loginBuckets, loginKey(email, ip), now, LOGIN_WINDOW_MS);
  remember(loginIpBuckets, ip, now, LOGIN_IP_WINDOW_MS);
}

export function recordLoginSuccess(email: string, ip: string): void {
  loginBuckets.delete(loginKey(email, ip));
}

export function loginRetryAfterSeconds(
  email: string,
  ip: string,
  now: number = Date.now(),
): number {
  return retryAfter(loginBuckets.get(loginKey(email, ip)), now);
}

export function loginIpRetryAfterSeconds(ip: string, now: number = Date.now()): number {
  return retryAfter(loginIpBuckets.get(ip), now);
}

// ---------- register -------------------------------------------------------

// Register has no pre-existing identifier (the whole point is that the
// account does not exist yet), so we key the limiter on the client IP alone.
// An attacker iterating fresh emails from one host will accumulate the same
// counter regardless of which email they try next.
//
// We count *all* submissions, not just failures — a successful register still
// burns the budget to prevent script-driven mass sign-up from one source.

export function isRegisterRateLimited(ip: string, now: number = Date.now()): boolean {
  return isLimited(registerBuckets, ip, now, REGISTER_MAX_ATTEMPTS);
}

export function recordRegisterAttempt(ip: string, now: number = Date.now()): void {
  remember(registerBuckets, ip, now, REGISTER_WINDOW_MS);
}

export function registerRetryAfterSeconds(ip: string, now: number = Date.now()): number {
  return retryAfter(registerBuckets.get(ip), now);
}

// ---------- test helpers ---------------------------------------------------

export function resetLoginRateLimit(): void {
  loginBuckets.clear();
  loginIpBuckets.clear();
}

export function resetRegisterRateLimit(): void {
  registerBuckets.clear();
}

export function resetAuthRateLimits(): void {
  resetLoginRateLimit();
  resetRegisterRateLimit();
}

export function loginMapSize(): number {
  return loginBuckets.size;
}

export function loginIpMapSize(): number {
  return loginIpBuckets.size;
}

export function registerMapSize(): number {
  return registerBuckets.size;
}

export const LOGIN_RATE_LIMIT = {
  maxFailures: LOGIN_MAX_FAILURES,
  windowMs: LOGIN_WINDOW_MS,
  maxBuckets: MAX_BUCKETS,
  pruneScan: PRUNE_SCAN,
} as const;

export const LOGIN_IP_RATE_LIMIT = {
  maxFailures: LOGIN_IP_MAX_FAILURES,
  windowMs: LOGIN_IP_WINDOW_MS,
  maxBuckets: MAX_BUCKETS,
  pruneScan: PRUNE_SCAN,
} as const;

export const REGISTER_RATE_LIMIT = {
  maxAttempts: REGISTER_MAX_ATTEMPTS,
  windowMs: REGISTER_WINDOW_MS,
  maxBuckets: MAX_BUCKETS,
  pruneScan: PRUNE_SCAN,
} as const;
