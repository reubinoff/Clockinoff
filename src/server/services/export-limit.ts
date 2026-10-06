// Per-user export limiter (#147). In-process Maps, same bounded-prune
// pattern as `src/server/auth/rate-limit.ts` (Lows A). One replica is
// enough for v1; multi-instance would need a shared store (#126).
//
//   - 1 export in flight per user
//   - 10 completed begins per 10 minutes
//
// Callers must `endExport` in a `finally` so a thrown render cannot
// pin the in-flight slot.

const EXPORT_MAX_PER_WINDOW = 10;
const EXPORT_WINDOW_MS = 10 * 60 * 1000;
const PRUNE_THRESHOLD = 1024;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const inFlight = new Set<string>();

function prune(now: number): void {
  if (buckets.size < PRUNE_THRESHOLD) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function retryAfter(bucket: Bucket | undefined, now: number): number {
  if (!bucket || bucket.resetAt <= now) return 0;
  return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
}

export function beginExport(
  userId: string,
  now: number = Date.now(),
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  if (inFlight.has(userId)) {
    return { ok: false, retryAfterSeconds: 1 };
  }
  const existing = buckets.get(userId);
  if (existing && existing.resetAt > now && existing.count >= EXPORT_MAX_PER_WINDOW) {
    return { ok: false, retryAfterSeconds: retryAfter(existing, now) };
  }
  prune(now);
  if (!existing || existing.resetAt <= now) {
    buckets.set(userId, { count: 1, resetAt: now + EXPORT_WINDOW_MS });
  } else {
    existing.count += 1;
  }
  inFlight.add(userId);
  return { ok: true };
}

export function endExport(userId: string): void {
  inFlight.delete(userId);
}

export function resetExportLimit(): void {
  buckets.clear();
  inFlight.clear();
}

export const EXPORT_RATE_LIMIT = {
  maxPerWindow: EXPORT_MAX_PER_WINDOW,
  windowMs: EXPORT_WINDOW_MS,
} as const;
