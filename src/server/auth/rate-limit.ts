// Fail-closed login rate limiter for `POST /api/auth/login`.
//
// Keyed on `(normalized-email, client-ip)` together, per issue #30: an
// attacker who tries the same email from many IPs is only slowed on each
// individual IP, and a shared NAT full of legit users is only throttled per
// account. We count *failed credential checks* (401 UNAUTHORIZED); a
// successful login resets the bucket so a user is never locked out by their
// own earlier typos.
//
// The store is in-process. On a multi-instance deployment each replica keeps
// its own counters — that is intentional: no shared secret, no extra
// dependency, and per-replica throttling is still a large step up from the
// current "no limit" state.

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
// Prune only when the map grows past this, to keep the common path O(1).
const PRUNE_THRESHOLD = 1024;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function bucketKey(email: string, ip: string): string {
  return `${normalizeEmail(email)}|${ip}`;
}

function prune(now: number): void {
  if (buckets.size < PRUNE_THRESHOLD) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function isLoginRateLimited(
  email: string,
  ip: string,
  now: number = Date.now(),
): boolean {
  const bucket = buckets.get(bucketKey(email, ip));
  if (!bucket) return false;
  if (bucket.resetAt <= now) return false;
  return bucket.count >= MAX_FAILURES;
}

export function recordLoginFailure(
  email: string,
  ip: string,
  now: number = Date.now(),
): void {
  prune(now);
  const key = bucketKey(email, ip);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  existing.count += 1;
}

export function recordLoginSuccess(email: string, ip: string): void {
  buckets.delete(bucketKey(email, ip));
}

export function resetLoginRateLimit(): void {
  buckets.clear();
}

export const LOGIN_RATE_LIMIT = {
  maxFailures: MAX_FAILURES,
  windowMs: WINDOW_MS,
} as const;
