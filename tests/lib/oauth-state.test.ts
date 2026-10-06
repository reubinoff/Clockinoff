import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { OAUTH_STATE_MAX_AGE_SECONDS } from "@/lib/oauth-next-path";
import {
  assertOAuthStateSecretInProduction,
  oauthStateSecretConfigured,
  parseOAuthState,
  serialiseOAuthState,
} from "@/lib/oauth-state";

function signBody(body: string, secret = process.env.OAUTH_STATE_SECRET!): string {
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

describe("oauth-state HMAC", () => {
  it("round-trips HMAC-signed state with exp and optional connect uid", () => {
    const before = Math.floor(Date.now() / 1000);
    const signin = { s: "abc", n: "/app" };
    const signedIn = serialiseOAuthState(signin);
    expect(signedIn.startsWith("{")).toBe(false);
    expect(signedIn.includes(".")).toBe(true);
    const parsedIn = parseOAuthState(signedIn);
    expect(parsedIn).toMatchObject(signin);
    expect(parsedIn?.exp).toBeGreaterThan(before);
    expect(parsedIn?.exp).toBeLessThanOrEqual(before + OAUTH_STATE_MAX_AGE_SECONDS + 1);

    const connect = { s: "xyz", n: "/app/account", i: "connect" as const, uid: "user-a" };
    const parsedConnect = parseOAuthState(serialiseOAuthState(connect));
    expect(parsedConnect).toMatchObject(connect);
    expect(parsedConnect?.exp).toBeGreaterThan(before);
  });

  it("rejects unsigned JSON, tampered signatures, and missing exp", () => {
    const unsigned = JSON.stringify({ s: "ok", n: "/app", i: "connect", uid: "user-a" });
    expect(parseOAuthState(unsigned)).toBeNull();
    expect(parseOAuthState(undefined)).toBeNull();
    expect(parseOAuthState("")).toBeNull();
    expect(parseOAuthState("not-json")).toBeNull();
    expect(parseOAuthState("abc.")).toBeNull();
    expect(parseOAuthState(".sig")).toBeNull();

    const signed = serialiseOAuthState({ s: "ok", n: "/app" });
    const [body, sig] = signed.split(".");
    expect(parseOAuthState(`${body}.${sig.slice(0, -1)}x`)).toBeNull();
    expect(parseOAuthState(`${body}x.${sig}`)).toBeNull();

    const noExp = Buffer.from(JSON.stringify({ s: "ok", n: "/app" }), "utf8").toString("base64url");
    expect(parseOAuthState(signBody(noExp))).toBeNull();
  });

  it("rejects stale exp on the server even when the mac is valid", () => {
    const body = Buffer.from(
      JSON.stringify({ s: "ok", n: "/app", exp: Math.floor(Date.now() / 1000) - 1 }),
      "utf8",
    ).toString("base64url");
    expect(parseOAuthState(signBody(body))).toBeNull();
  });

  it("rejects connect state that is missing uid even when the mac is valid", () => {
    const body = Buffer.from(
      JSON.stringify({
        s: "ok",
        n: "/app/account",
        i: "connect",
        exp: Math.floor(Date.now() / 1000) + 60,
      }),
      "utf8",
    ).toString("base64url");
    expect(parseOAuthState(signBody(body))).toBeNull();
  });

  it("throws when serialising connect state without uid", () => {
    expect(() =>
      serialiseOAuthState({ s: "ok", n: "/app/account", i: "connect", uid: "" }),
    ).toThrow(/uid/);
  });

  it("fails closed when OAUTH_STATE_SECRET is missing and never uses NEXTAUTH_SECRET", () => {
    const prevOauth = process.env.OAUTH_STATE_SECRET;
    const prevNext = process.env.NEXTAUTH_SECRET;
    process.env.NEXTAUTH_SECRET = "must-not-be-used-for-oauth-state";
    delete process.env.OAUTH_STATE_SECRET;
    try {
      expect(oauthStateSecretConfigured()).toBe(false);
      expect(() => serialiseOAuthState({ s: "ok", n: "/app" })).toThrow(/OAUTH_STATE_SECRET/);
      expect(parseOAuthState("anything.sig")).toBeNull();
    } finally {
      if (prevOauth) process.env.OAUTH_STATE_SECRET = prevOauth;
      if (prevNext) process.env.NEXTAUTH_SECRET = prevNext;
      else delete process.env.NEXTAUTH_SECRET;
    }
  });

  it("rejects the 11-byte .env.example placeholder as too short", () => {
    const prevOauth = process.env.OAUTH_STATE_SECRET;
    process.env.OAUTH_STATE_SECRET = "placeholder";
    try {
      expect(Buffer.byteLength("placeholder")).toBe(11);
      expect(oauthStateSecretConfigured()).toBe(false);
      expect(() => serialiseOAuthState({ s: "ok", n: "/app" })).toThrow(/32 bytes/);
    } finally {
      if (prevOauth) process.env.OAUTH_STATE_SECRET = prevOauth;
    }
  });

  it("production boot fails closed when OAUTH_STATE_SECRET is missing or short", () => {
    const prevOauth = process.env.OAUTH_STATE_SECRET;
    const prevNode = process.env.NODE_ENV;
    const prevPhase = process.env.NEXT_PHASE;
    delete process.env.NEXT_PHASE;
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    try {
      delete process.env.OAUTH_STATE_SECRET;
      expect(() => assertOAuthStateSecretInProduction()).toThrow(/OAUTH_STATE_SECRET/);
      process.env.OAUTH_STATE_SECRET = "placeholder";
      expect(() => assertOAuthStateSecretInProduction()).toThrow(/32 bytes/);
    } finally {
      if (prevOauth) process.env.OAUTH_STATE_SECRET = prevOauth;
      (process.env as { NODE_ENV?: string }).NODE_ENV = prevNode;
      if (prevPhase) process.env.NEXT_PHASE = prevPhase;
    }
  });

  it("skips the production boot check during next build", () => {
    const prevOauth = process.env.OAUTH_STATE_SECRET;
    const prevNode = process.env.NODE_ENV;
    delete process.env.OAUTH_STATE_SECRET;
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    process.env.NEXT_PHASE = "phase-production-build";
    try {
      expect(() => assertOAuthStateSecretInProduction()).not.toThrow();
    } finally {
      if (prevOauth) process.env.OAUTH_STATE_SECRET = prevOauth;
      (process.env as { NODE_ENV?: string }).NODE_ENV = prevNode;
      delete process.env.NEXT_PHASE;
    }
  });
});
