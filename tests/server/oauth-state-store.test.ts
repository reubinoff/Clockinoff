import { beforeEach, describe, expect, it } from "vitest";
import {
  OAUTH_STATE_STORE,
  consumeOAuthState,
  issueOAuthState,
  resetOAuthStateStore,
} from "@/server/auth/oauth-state-store";

describe("oauth-state-store", () => {
  beforeEach(() => {
    resetOAuthStateStore();
  });

  it("consumes an issued state exactly once", () => {
    issueOAuthState("nonce-1");
    expect(consumeOAuthState("nonce-1")).toBe(true);
    expect(consumeOAuthState("nonce-1")).toBe(false);
  });

  it("rejects a state that was never issued", () => {
    expect(consumeOAuthState("unknown")).toBe(false);
  });

  it("rejects an expired state", () => {
    const start = 1_000_000;
    issueOAuthState("old", start);
    expect(consumeOAuthState("old", start + OAUTH_STATE_STORE.ttlMs + 1)).toBe(false);
  });

  it("prunes expired entries once the map grows past the threshold", () => {
    const start = 2_000_000;
    for (let i = 0; i < 1024; i += 1) {
      issueOAuthState(`stale-${i}`, start);
    }
    const later = start + OAUTH_STATE_STORE.ttlMs + 1;
    issueOAuthState("fresh", later);
    expect(consumeOAuthState("stale-0", later)).toBe(false);
    expect(consumeOAuthState("fresh", later)).toBe(true);
  });
});
