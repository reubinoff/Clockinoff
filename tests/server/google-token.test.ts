import { describe, expect, it } from "vitest";
import {
  buildAuthorizeUrl,
  decodeIdToken,
  getGoogleConfig,
  GoogleAuthError,
  type GoogleConfig,
  type GoogleIdTokenPayload,
  newStateToken,
  validateIdTokenClaims,
} from "@/server/auth/google";

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function makeIdToken(payload: object): string {
  return `${b64url({ alg: "RS256" })}.${b64url(payload)}.sig`;
}

const CFG: GoogleConfig = {
  clientId: "client-id",
  clientSecret: "secret",
  redirectUri: "https://x.test/api/auth/google/callback",
};

function fullPayload(overrides: Partial<GoogleIdTokenPayload> = {}): GoogleIdTokenPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: "g-1",
    email: "a@example.com",
    email_verified: true,
    iss: "https://accounts.google.com",
    aud: "client-id",
    exp: now + 60,
    ...overrides,
  };
}

describe("google token helpers", () => {
  it("buildAuthorizeUrl includes required params + state", () => {
    const url = new URL(buildAuthorizeUrl({ config: CFG, state: "abc" }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(CFG.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toContain("openid");
    expect(url.searchParams.get("scope")).toContain("email");
    expect(url.searchParams.get("state")).toBe("abc");
  });

  it("newStateToken returns a long url-safe token", () => {
    const t = newStateToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBeGreaterThan(30);
    expect(t).not.toBe(newStateToken());
  });

  it("decodeIdToken parses the payload (no signature verification)", () => {
    const token = makeIdToken(fullPayload());
    const decoded = decodeIdToken(token);
    expect(decoded.sub).toBe("g-1");
    expect(decoded.email).toBe("a@example.com");
    expect(decoded.email_verified).toBe(true);
  });

  it("decodeIdToken accepts the string form of email_verified", () => {
    const token = makeIdToken({ ...fullPayload(), email_verified: "true" });
    const decoded = decodeIdToken(token);
    expect(decoded.email_verified).toBe(true);
  });

  it("decodeIdToken rejects malformed tokens", () => {
    expect(() => decodeIdToken("not.a.jwt-at-all")).toThrow(GoogleAuthError);
    expect(() => decodeIdToken("only-one-segment")).toThrow(GoogleAuthError);
    const missingSub = makeIdToken({ ...fullPayload(), sub: undefined });
    expect(() => decodeIdToken(missingSub)).toThrow(GoogleAuthError);
  });

  it("validateIdTokenClaims rejects wrong issuer", () => {
    const payload = fullPayload({ iss: "https://evil.example" });
    expect(() => validateIdTokenClaims(payload, CFG)).toThrow(GoogleAuthError);
  });

  it("validateIdTokenClaims rejects wrong audience", () => {
    const payload = fullPayload({ aud: "someone-else" });
    expect(() => validateIdTokenClaims(payload, CFG)).toThrow(GoogleAuthError);
  });

  it("validateIdTokenClaims rejects expired tokens", () => {
    const payload = fullPayload({ exp: Math.floor(Date.now() / 1000) - 10 });
    expect(() => validateIdTokenClaims(payload, CFG)).toThrow(GoogleAuthError);
  });

  it("validateIdTokenClaims fails closed on unverified email with reason=unverified", () => {
    const payload = fullPayload({ email_verified: false });
    try {
      validateIdTokenClaims(payload, CFG);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(GoogleAuthError);
      expect((err as GoogleAuthError).reason).toBe("unverified");
    }
  });

  describe("getGoogleConfig", () => {
    it("throws GoogleAuthError when env is missing", () => {
      const prev = { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET };
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      try {
        expect(() => getGoogleConfig()).toThrow(GoogleAuthError);
      } finally {
        if (prev.id) process.env.GOOGLE_CLIENT_ID = prev.id;
        if (prev.secret) process.env.GOOGLE_CLIENT_SECRET = prev.secret;
      }
    });

    it("derives redirect URI from NEXTAUTH_URL when GOOGLE_REDIRECT_URI unset", () => {
      const prev = {
        id: process.env.GOOGLE_CLIENT_ID,
        secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect: process.env.GOOGLE_REDIRECT_URI,
        nextauth: process.env.NEXTAUTH_URL,
      };
      process.env.GOOGLE_CLIENT_ID = "cid";
      process.env.GOOGLE_CLIENT_SECRET = "csec";
      delete process.env.GOOGLE_REDIRECT_URI;
      process.env.NEXTAUTH_URL = "https://example.test/";
      try {
        const cfg = getGoogleConfig();
        expect(cfg.redirectUri).toBe("https://example.test/api/auth/google/callback");
      } finally {
        if (prev.id) process.env.GOOGLE_CLIENT_ID = prev.id;
        else delete process.env.GOOGLE_CLIENT_ID;
        if (prev.secret) process.env.GOOGLE_CLIENT_SECRET = prev.secret;
        else delete process.env.GOOGLE_CLIENT_SECRET;
        if (prev.redirect) process.env.GOOGLE_REDIRECT_URI = prev.redirect;
        else delete process.env.GOOGLE_REDIRECT_URI;
        if (prev.nextauth) process.env.NEXTAUTH_URL = prev.nextauth;
        else delete process.env.NEXTAUTH_URL;
      }
    });

    it("prefers GOOGLE_REDIRECT_URI when set", () => {
      const prev = {
        id: process.env.GOOGLE_CLIENT_ID,
        secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect: process.env.GOOGLE_REDIRECT_URI,
      };
      process.env.GOOGLE_CLIENT_ID = "cid";
      process.env.GOOGLE_CLIENT_SECRET = "csec";
      process.env.GOOGLE_REDIRECT_URI = "https://pinned.example/api/auth/google/callback";
      try {
        expect(getGoogleConfig().redirectUri).toBe(
          "https://pinned.example/api/auth/google/callback",
        );
      } finally {
        if (prev.id) process.env.GOOGLE_CLIENT_ID = prev.id;
        else delete process.env.GOOGLE_CLIENT_ID;
        if (prev.secret) process.env.GOOGLE_CLIENT_SECRET = prev.secret;
        else delete process.env.GOOGLE_CLIENT_SECRET;
        if (prev.redirect) process.env.GOOGLE_REDIRECT_URI = prev.redirect;
        else delete process.env.GOOGLE_REDIRECT_URI;
      }
    });
  });
});
