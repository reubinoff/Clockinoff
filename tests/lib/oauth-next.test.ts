import { describe, expect, it } from "vitest";
import {
  parseOAuthIntent,
  parseOAuthState,
  readRequestCookie,
  serialiseOAuthState,
} from "@/lib/oauth-next";

describe("oauth-next helpers", () => {
  it("parses intent=connect and defaults everything else to signin", () => {
    expect(parseOAuthIntent("connect")).toBe("connect");
    expect(parseOAuthIntent("signin")).toBe("signin");
    expect(parseOAuthIntent(null)).toBe("signin");
    expect(parseOAuthIntent("other")).toBe("signin");
  });

  it("round-trips state with and without connect intent", () => {
    const signin = { s: "abc", n: "/app" };
    expect(parseOAuthState(serialiseOAuthState(signin))).toEqual(signin);

    const connect = { s: "xyz", n: "/app/account", i: "connect" as const };
    expect(parseOAuthState(serialiseOAuthState(connect))).toEqual(connect);
  });

  it("rejects malformed state payloads", () => {
    expect(parseOAuthState(undefined)).toBeNull();
    expect(parseOAuthState("")).toBeNull();
    expect(parseOAuthState("not-json")).toBeNull();
    expect(parseOAuthState("[]")).toBeNull();
    expect(parseOAuthState(JSON.stringify({ s: "", n: "/app" }))).toBeNull();
    expect(parseOAuthState(JSON.stringify({ s: "ok" }))).toBeNull();
    expect(parseOAuthState(JSON.stringify({ s: "ok", n: "/app", i: "signin" }))).toEqual({
      s: "ok",
      n: "/app",
    });
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
