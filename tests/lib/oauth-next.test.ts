import { describe, expect, it } from "vitest";
import { parseOAuthIntent, readRequestCookie, sanitiseNext } from "@/lib/oauth-next-path";

const PUBLIC_ORIGIN = "https://clockinoff.reubinoff.com";

describe("oauth-next-path helpers", () => {
  it("parses intent=connect and defaults everything else to signin", () => {
    expect(parseOAuthIntent("connect")).toBe("connect");
    expect(parseOAuthIntent("signin")).toBe("signin");
    expect(parseOAuthIntent(null)).toBe("signin");
    expect(parseOAuthIntent("other")).toBe("signin");
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

  it("#123 password login: external next cannot leave origin", () => {
    // Same shape as /login: `const next = params.get("next") || "/app"` then
    // `router.push(sanitiseNext(next))`. Typed as string | null so the
    // fallback is a real branch (a string literal || "/app" is always truthy).
    const raw: string | null = "https://evil.example";
    const next = raw || "/app";
    expect(sanitiseNext(next)).toBe("/app");
    expect(sanitiseNext("https://evil.example/phish")).toBe("/app");
    expect(sanitiseNext("//evil.example")).toBe("/app");
    expect(sanitiseNext("/app/entries")).toBe("/app/entries");
  });
});
