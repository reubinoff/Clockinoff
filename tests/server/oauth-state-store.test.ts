import { beforeEach, describe, expect, it } from "vitest";
import {
  STATE_NONCE_STORE,
  consumeStateNonce,
  issueStateNonce,
  resetStateNonceStore,
} from "@/server/auth/oauth-state-store";

describe("oauth-state-store", () => {
  beforeEach(() => {
    resetStateNonceStore();
  });

  it("consumes an issued state exactly once", () => {
    issueStateNonce("nonce-1");
    expect(consumeStateNonce("nonce-1")).toBe(true);
    expect(consumeStateNonce("nonce-1")).toBe(false);
  });

  it("rejects a state that was never issued", () => {
    expect(consumeStateNonce("unknown")).toBe(false);
  });

  it("rejects an expired state", () => {
    const start = 1_000_000;
    issueStateNonce("old", start);
    expect(consumeStateNonce("old", start + STATE_NONCE_STORE.ttlMs + 1)).toBe(false);
  });

  it("prunes expired entries once the map grows past the threshold", () => {
    const start = 2_000_000;
    for (let i = 0; i < 1024; i += 1) {
      issueStateNonce(`stale-${i}`, start);
    }
    const later = start + STATE_NONCE_STORE.ttlMs + 1;
    issueStateNonce("fresh", later);
    expect(consumeStateNonce("stale-0", later)).toBe(false);
    expect(consumeStateNonce("fresh", later)).toBe(true);
  });
});
