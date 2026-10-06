import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertOAuthStateSecretInProduction,
  parseOAuthIntent,
  parseOAuthState,
  readRequestCookie,
  sanitiseNext,
  serialiseOAuthState,
} from "@/lib/oauth-next";

const PUBLIC_ORIGIN = "https://clockinoff.reubinoff.com";

describe("oauth-next helpers", () => {
  it("parses intent=connect and defaults everything else to signin", () => {
    expect(parseOAuthIntent("connect")).toBe("connect");
    expect(parseOAuthIntent("signin")).toBe("signin");
    expect(parseOAuthIntent(null)).toBe("signin");
    expect(parseOAuthIntent("other")).toBe("signin");
  });

  it("round-trips HMAC-signed state with and without connect uid", () => {
    const signin = { s: "abc", n: "/app" };
    const signedIn = serialiseOAuthState(signin);
    expect(signedIn.startsWith("{")).toBe(false);
    expect(signedIn.includes(".")).toBe(true);
    expect(parseOAuthState(signedIn)).toEqual(signin);

    const connect = { s: "xyz", n: "/app/account", i: "connect" as const, uid: "user-a" };
    expect(parseOAuthState(serialiseOAuthState(connect))).toEqual(connect);
  });

  it("rejects unsigned JSON and tampered signatures", () => {
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
  });

  it("rejects connect state that is missing uid even when the mac is valid", () => {
    const body = Buffer.from(JSON.stringify({ s: "ok", n: "/app/account", i: "connect" }), "utf8").toString(
      "base64url",
    );
    const sig = createHmac("sha256", process.env.OAUTH_STATE_SECRET!).update(body).digest("base64url");
    expect(parseOAuthState(`${body}.${sig}`)).toBeNull();
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
      expect(() => serialiseOAuthState({ s: "ok", n: "/app" })).toThrow(/OAUTH_STATE_SECRET/);
      expect(parseOAuthState("anything.sig")).toBeNull();
    } finally {
      if (prevOauth) process.env.OAUTH_STATE_SECRET = prevOauth;
      if (prevNext) process.env.NEXTAUTH_SECRET = prevNext;
      else delete process.env.NEXTAUTH_SECRET;
    }
  });

  it("production boot fails closed when OAUTH_STATE_SECRET is missing", () => {
    const prevOauth = process.env.OAUTH_STATE_SECRET;
    const prevNode = process.env.NODE_ENV;
    const prevPhase = process.env.NEXT_PHASE;
    delete process.env.OAUTH_STATE_SECRET;
    delete process.env.NEXT_PHASE;
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    try {
      expect(() => assertOAuthStateSecretInProduction()).toThrow(/OAUTH_STATE_SECRET/);
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

  it("reads a named cookie from the request header", () => {
    const req = new Request("http://test/", {
      headers: { cookie: "timely_session=abc; timely_oauth_state=%7B%22s%22%3A%221%22%7D" },
    });
    expect(readRequestCookie(req, "timely_session")).toBe("abc");
    expect(readRequestCookie(req, "timely_oauth_state")).toBe('{"s":"1"}');
    expect(readRequestCookie(req, "missing")).toBeUndefined();
    expect(readRequestCookie(new Request("http://test/"), "timely_session")).toBeUndefined();
  });
});

describe("sanitiseNext", () => {
  it("allows safe relative paths and keeps query + hash", () => {
    expect(sanitiseNext("/app", PUBLIC_ORIGIN)).toBe("/app");
    expect(sanitiseNext("/app/entries", PUBLIC_ORIGIN)).toBe("/app/entries");
    expect(sanitiseNext("/app?x=1#y", PUBLIC_ORIGIN)).toBe("/app?x=1#y");
    expect(sanitiseNext(`${PUBLIC_ORIGIN}/app/entries`, PUBLIC_ORIGIN)).toBe("/app/entries");
  });

  it("defaults empty / oversized / non-path input to /app", () => {
    expect(sanitiseNext(null, PUBLIC_ORIGIN)).toBe("/app");
    expect(sanitiseNext("", PUBLIC_ORIGIN)).toBe("/app");
    expect(sanitiseNext("not-a-path", PUBLIC_ORIGIN)).toBe("/app");
    expect(sanitiseNext("x".repeat(2000), PUBLIC_ORIGIN)).toBe("/app");
  });

  it("rejects control-char payloads that WHATWG parse would turn into //evil", () => {
    // Node: new URL("/\t/evil", PUBLIC_ORIGIN).href === "https://evil/"
    expect(sanitiseNext("/\t/evil", PUBLIC_ORIGIN)).toBe("/app");
    expect(sanitiseNext("/\n/evil", PUBLIC_ORIGIN)).toBe("/app");
    expect(sanitiseNext("/\r/evil", PUBLIC_ORIGIN)).toBe("/app");
    expect(sanitiseNext("/\t//evil", PUBLIC_ORIGIN)).toBe("/app");
    expect(sanitiseNext("/\\evil", PUBLIC_ORIGIN)).toBe("/app");
    expect(sanitiseNext("//evil", PUBLIC_ORIGIN)).toBe("/app");
    expect(sanitiseNext("https://evil", PUBLIC_ORIGIN)).toBe("/app");
    expect(sanitiseNext("javascript:alert(1)", PUBLIC_ORIGIN)).toBe("/app");
  });

  it("rejects percent-encoded control chars and backslash", () => {
    expect(sanitiseNext("/%09/evil.example", PUBLIC_ORIGIN)).toBe("/app");
    expect(sanitiseNext("/%0A/evil", PUBLIC_ORIGIN)).toBe("/app");
    expect(sanitiseNext("/%0D/evil", PUBLIC_ORIGIN)).toBe("/app");
    expect(sanitiseNext("/%0a/evil", PUBLIC_ORIGIN)).toBe("/app");
    expect(sanitiseNext("/%5Cevil", PUBLIC_ORIGIN)).toBe("/app");
    expect(sanitiseNext("/%7F/evil", PUBLIC_ORIGIN)).toBe("/app");
  });

  it("rejects credentialed URLs and a malformed origin base", () => {
    expect(sanitiseNext("https://user:pass@clockinoff.reubinoff.com/app", PUBLIC_ORIGIN)).toBe("/app");
    expect(sanitiseNext("/app", "not a url")).toBe("/app");
  });
});
