// Fail-closed rate limiters for the auth endpoints. Covers:
//
//   - `POST /api/auth/login`    — `(email, IP)` buckets, counts credential
//     failures, resets on success. (Issues #30, #39.)
//   - `POST /api/auth/register` — per-IP bucket counting *all* register
//     attempts. Register has no stable identifier before the account exists,
//     so an attacker trying new emails from one host must still be throttled.
//
// Both limiters:
//
//   - Live in-process. On a multi-instance deployment each replica keeps its
//     own counters — intentional: no shared secret, no extra dependency, and
//     per-replica throttling is still a large step up from "no limit at all".
//     Multi-instance correctness would need Redis or a gateway, called out in
//     the issue thread (#39) and in the `/docs` FAQ.
//   - Expose a `retryAfterSeconds(...)` helper so the route handlers can
//     return a correct `Retry-After` on 429 instead of a magic constant.
//
// Login buckets are keyed on `(normalized-email, client-ip)` together, per
// issue #30: an attacker who tries the same email from many IPs is only
// slowed on each individual IP, and a shared NAT full of legit users is
// only throttled per account.

const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

const REGISTER_MAX_ATTEMPTS = 10;
const REGISTER_WINDOW_MS = 15 * 60 * 1000;

// Prune only when a map grows past this, to keep the common path O(1).
const PRUNE_THRESHOLD = 1024;

interface Bucket {
  count: number;
  resetAt: number;
}

const loginBuckets = new Map<string, Bucket>();
const registerBuckets = new Map<string, Bucket>();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function loginKey(email: string, ip: string): string {
  return `${normalizeEmail(email)}|${ip}`;
}

function prune(buckets: Map<string, Bucket>, now: number): void {
  if (buckets.size < PRUNE_THRESHOLD) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
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
  const bucket = loginBuckets.get(loginKey(email, ip));
  if (!bucket) return false;
  if (bucket.resetAt <= now) return false;
  return bucket.count >= LOGIN_MAX_FAILURES;
}

export function recordLoginFailure(
  email: string,
  ip: string,
  now: number = Date.now(),
): void {
  prune(loginBuckets, now);
  const key = loginKey(email, ip);
  const existing = loginBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    loginBuckets.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  existing.count += 1;
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

// ---------- register -------------------------------------------------------

// Register has no pre-existing identifier (the whole point is that the
// account does not exist yet), so we key the limiter on the client IP alone.
// An attacker iterating fresh emails from one host will accumulate the same
// counter regardless of which email they try next.
//
// We count *all* submissions, not just failures — a successful register still
// burns the budget to prevent script-driven mass sign-up from one source.

export function isRegisterRateLimited(ip: string, now: number = Date.now()): boolean {
  const bucket = registerBuckets.get(ip);
  if (!bucket) return false;
  if (bucket.resetAt <= now) return false;
  return bucket.count >= REGISTER_MAX_ATTEMPTS;
}

export function recordRegisterAttempt(ip: string, now: number = Date.now()): void {
  prune(registerBuckets, now);
  const existing = registerBuckets.get(ip);
  if (!existing || existing.resetAt <= now) {
    registerBuckets.set(ip, { count: 1, resetAt: now + REGISTER_WINDOW_MS });
    return;
  }
  existing.count += 1;
}

export function registerRetryAfterSeconds(ip: string, now: number = Date.now()): number {
  return retryAfter(registerBuckets.get(ip), now);
}

// ---------- test helpers ---------------------------------------------------

export function resetLoginRateLimit(): void {
  loginBuckets.clear();
}

export function resetRegisterRateLimit(): void {
  registerBuckets.clear();
}

export function resetAuthRateLimits(): void {
  resetLoginRateLimit();
  resetRegisterRateLimit();
}

export const LOGIN_RATE_LIMIT = {
  maxFailures: LOGIN_MAX_FAILURES,
  windowMs: LOGIN_WINDOW_MS,
} as const;

export const REGISTER_RATE_LIMIT = {
  maxAttempts: REGISTER_MAX_ATTEMPTS,
  windowMs: REGISTER_WINDOW_MS,
} as const;
