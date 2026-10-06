import "server-only";

// HMAC-SHA256 MAC over the Google OAuth CSRF cookie. Server-only — Next
// must never pull this into a client or Edge webpack graph (that is what
// broke `next build` when these helpers lived next to `sanitiseNext`).
//
// Key is OAUTH_STATE_SECRET only. Never NEXTAUTH_SECRET — that pairing
// is what took prod Google login down after #143.
//
// CodeQL js/insufficient-password-hash (alert 7) is a false positive:
// HMAC authenticates OAuth state; not a password hash. User passwords
// stay argon2id in `src/server/auth/passwords.ts`.

import { createHmac, timingSafeEqual } from "node:crypto";
import {
  OAUTH_STATE_MAX_AGE_SECONDS,
  type OAuthStatePayload,
} from "@/lib/oauth-next-path";

const MIN_SECRET_BYTES = 32;

export function oauthStateSecretConfigured(): boolean {
  const secret = process.env.OAUTH_STATE_SECRET?.trim();
  return Boolean(secret && Buffer.byteLength(secret) >= MIN_SECRET_BYTES);
}

function oauthStateSecret(): string | null {
  const secret = process.env.OAUTH_STATE_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret) < MIN_SECRET_BYTES) return null;
  return secret;
}

export function assertOAuthStateSecretInProduction(): void {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NODE_ENV !== "production") return;
  if (!oauthStateSecretConfigured()) {
    throw new Error("OAUTH_STATE_SECRET is required in production (min 32 bytes)");
  }
}

function hmacState(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function signaturesMatch(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function encodeStateBody(state: OAuthStatePayload): string {
  const exp = state.exp ?? Math.floor(Date.now() / 1000) + OAUTH_STATE_MAX_AGE_SECONDS;
  const payload =
    state.i === "connect"
      ? { s: state.s, n: state.n, i: "connect" as const, uid: state.uid, exp }
      : { s: state.s, n: state.n, exp };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function serialiseOAuthState(state: OAuthStatePayload): string {
  if (state.i === "connect" && !state.uid) {
    throw new Error("connect OAuth state requires uid");
  }
  const secret = oauthStateSecret();
  if (!secret) {
    throw new Error("OAUTH_STATE_SECRET is required to sign OAuth state (min 32 bytes)");
  }
  const body = encodeStateBody(state);
  return `${body}.${hmacState(body, secret)}`;
}

export function parseOAuthState(raw: string | undefined): OAuthStatePayload | null {
  if (!raw) return null;
  const secret = oauthStateSecret();
  if (!secret) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0 || dot === raw.length - 1) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!signaturesMatch(sig, hmacState(body, secret))) return null;
  try {
    const json = Buffer.from(body, "base64url").toString("utf8");
    const obj = JSON.parse(json) as unknown;
    if (!obj || typeof obj !== "object") return null;
    const rec = obj as Record<string, unknown>;
    const s = rec.s;
    const n = rec.n;
    const i = rec.i;
    const uid = rec.uid;
    const exp = rec.exp;
    if (typeof s !== "string" || s.length === 0) return null;
    if (typeof n !== "string") return null;
    if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
    if (exp <= Math.floor(Date.now() / 1000)) return null;
    if (i === "connect") {
      if (typeof uid !== "string" || uid.length === 0) return null;
      return { s, n, i: "connect", uid, exp };
    }
    return { s, n, exp };
  } catch {
    return null;
  }
}
