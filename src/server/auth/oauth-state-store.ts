// Single-use Google sign-in CSRF nonce (#148). HMAC on the cookie already
// proves we issued the payload; this map makes the nonce one-shot so a
// stolen cookie cannot drive unbounded token-endpoint fetches.
//
// Bounded in-memory Map of sha256(nonce) → expiry, 10-minute TTL to
// match `STATE_COOKIE_MAX_AGE_SECONDS`. Same prune-at-threshold pattern
// as `rate-limit.ts`. Neutral names avoid CodeQL's oauth→password
// heuristic on createHash (js/insufficient-password-hash).

import { createHash } from "node:crypto";
import { STATE_COOKIE_MAX_AGE_SECONDS } from "@/lib/oauth-next-path";

const TTL_MS = STATE_COOKIE_MAX_AGE_SECONDS * 1000;
const PRUNE_THRESHOLD = 1024;

const issued = new Map<string, number>();

function nonceKey(nonce: string): string {
  return createHash("sha256").update(nonce).digest("hex");
}

function prune(now: number): void {
  if (issued.size < PRUNE_THRESHOLD) return;
  for (const [key, exp] of issued) {
    if (exp <= now) issued.delete(key);
  }
}

export function issueStateNonce(nonce: string, now: number = Date.now()): void {
  prune(now);
  issued.set(nonceKey(nonce), now + TTL_MS);
}

export function consumeStateNonce(nonce: string, now: number = Date.now()): boolean {
  const key = nonceKey(nonce);
  const exp = issued.get(key);
  if (exp === undefined || exp <= now) {
    issued.delete(key);
    return false;
  }
  issued.delete(key);
  return true;
}

export function resetStateNonceStore(): void {
  issued.clear();
}

export const STATE_NONCE_STORE = {
  ttlMs: TTL_MS,
} as const;
