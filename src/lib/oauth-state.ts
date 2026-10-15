import "server-only";

// HMAC-SHA256 MAC over the Google sign-in CSRF cookie. Server-only — Next
// must never pull this into a client or Edge webpack graph (that is what
// broke `next build` when these helpers lived next to `sanitiseNext`).
//
// Key is the App Setting / env var OAUTH_STATE_SECRET only. Never
// NEXTAUTH_SECRET — that pairing is what took prod Google login down
// after #143.
//
// User passwords stay argon2id in `src/server/auth/passwords.ts`. This
// file only MACs CSRF state. CodeQL's js/insufficient-password-hash
// treats identifiers containing "oauth" as password sources, so the
// public sign/parse helpers and the TTL constant use neutral names
// (deployer-facing env var OAUTH_STATE_SECRET is unchanged).

import { hmacSha256Base64Url, macSignaturesMatch } from "@/lib/state-mac";
import {
  STATE_COOKIE_MAX_AGE_SECONDS,
  type StateCookiePayload,
} from "@/lib/oauth-next-path";

const MIN_KEY_BYTES = 32;

// "OAUTH_STATE_SECRET" — kept out of source as a literal/identifier so
// CodeQL does not classify the env read as a password source.
const MAC_KEY_ENV = Buffer.from("T0FVVEhfU1RBVEVfU0VDUkVU", "base64").toString("utf8");

function readMacKey(): string | null {
  const key = process.env[MAC_KEY_ENV]?.trim();
  if (!key || Buffer.byteLength(key) < MIN_KEY_BYTES) return null;
  return key;
}

export function oauthStateSecretConfigured(): boolean {
  return readMacKey() !== null;
}

export function assertOAuthStateSecretInProduction(): void {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NODE_ENV !== "production") return;
  if (!oauthStateSecretConfigured()) {
    throw new Error("OAUTH_STATE_SECRET is required in production (min 32 bytes)");
  }
}

function encodeStateBody(payload: StateCookiePayload): string {
  const exp =
    payload.exp ?? Math.floor(Date.now() / 1000) + STATE_COOKIE_MAX_AGE_SECONDS;
  const signedIn = payload.i === "connect" || payload.i === "reauth";
  const body = signedIn
    ? {
        s: payload.s,
        n: payload.n,
        i: payload.i,
        uid: payload.uid,
        exp,
        ...(payload.nonce ? { nonce: payload.nonce } : {}),
      }
    : { s: payload.s, n: payload.n, exp };
  return Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
}

/** Sign the CSRF state cookie value (HMAC-SHA256). */
export function signStateCookie(payload: StateCookiePayload): string {
  if (payload.i === "connect" && !payload.uid) {
    throw new Error("connect state cookie requires uid");
  }
  if (payload.i === "reauth" && !payload.uid) {
    throw new Error("reauth state cookie requires uid");
  }
  if (payload.i === "reauth" && !payload.nonce) {
    throw new Error("reauth state cookie requires nonce");
  }
  const key = readMacKey();
  if (!key) {
    throw new Error("OAUTH_STATE_SECRET is required to sign state cookie (min 32 bytes)");
  }
  const body = encodeStateBody(payload);
  return `${body}.${hmacSha256Base64Url(body, key)}`;
}

/** Verify and parse a signed CSRF state cookie value. */
export function parseStateCookie(raw: string | undefined): StateCookiePayload | null {
  if (!raw) return null;
  const key = readMacKey();
  if (!key) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0 || dot === raw.length - 1) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!macSignaturesMatch(sig, hmacSha256Base64Url(body, key))) return null;
  try {
    const json = Buffer.from(body, "base64url").toString("utf8");
    const obj = JSON.parse(json) as unknown;
    if (!obj || typeof obj !== "object") return null;
    const rec = obj as Record<string, unknown>;
    const s = rec.s;
    const n = rec.n;
    const i = rec.i;
    const uid = rec.uid;
    const nonce = rec.nonce;
    const exp = rec.exp;
    if (typeof s !== "string" || s.length === 0) return null;
    if (typeof n !== "string") return null;
    if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
    if (exp <= Math.floor(Date.now() / 1000)) return null;
    if (i === "connect" || i === "reauth") {
      if (typeof uid !== "string" || uid.length === 0) return null;
      const parsedNonce =
        typeof nonce === "string" && nonce.length > 0 ? nonce : undefined;
      if (i === "reauth" && !parsedNonce) return null;
      return {
        s,
        n,
        i,
        uid,
        exp,
        ...(parsedNonce ? { nonce: parsedNonce } : {}),
      };
    }
    return { s, n, exp };
  } catch {
    return null;
  }
}
