// Single-use Google OAuth `state` (#148). HMAC on the cookie already
// proves we issued the payload; this map makes the nonce one-shot so a
// stolen cookie cannot drive unbounded token-endpoint fetches.
//
// Bounded in-memory Map of sha256(state) → expiry, 10-minute TTL to
// match `OAUTH_STATE_MAX_AGE_SECONDS`. Same prune-at-threshold pattern
// as `rate-limit.ts`.

import { createHash } from "node:crypto";
import { OAUTH_STATE_MAX_AGE_SECONDS } from "@/lib/oauth-next-path";

const TTL_MS = OAUTH_STATE_MAX_AGE_SECONDS * 1000;
const PRUNE_THRESHOLD = 1024;

const issued = new Map<string, number>();

function stateKey(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

function prune(now: number): void {
  if (issued.size < PRUNE_THRESHOLD) return;
  for (const [key, exp] of issued) {
    if (exp <= now) issued.delete(key);
  }
}

export function issueOAuthState(state: string, now: number = Date.now()): void {
  prune(now);
  issued.set(stateKey(state), now + TTL_MS);
}

export function consumeOAuthState(state: string, now: number = Date.now()): boolean {
  const key = stateKey(state);
  const exp = issued.get(key);
  if (exp === undefined || exp <= now) {
    issued.delete(key);
    return false;
  }
  issued.delete(key);
  return true;
}

export function resetOAuthStateStore(): void {
  issued.clear();
}

export const OAUTH_STATE_STORE = {
  ttlMs: TTL_MS,
} as const;
