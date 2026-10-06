// Shared bits of the Google OAuth "Continue with Google" flow that are
// not themselves HTTP handlers. Lives in `src/lib/` because Next 16's
// route typegen rejects any non-handler, non-segment-config export from
// a `route.ts` module — moving them out of the route file keeps
// `next build` green without diluting the handler surface.
//
// `sanitiseNext` is isomorphic (no Node APIs) so #123 can reuse it from
// the login client later. HMAC sign/verify uses `node:crypto` and is
// only called from the Google start/callback route handlers.

import { createHmac, timingSafeEqual } from "node:crypto";

export const OAUTH_STATE_COOKIE = "timely_oauth_state";
export const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

// Dummy base used when the caller has no public origin handy. Only used
// to detect protocol-relative / absolute escapes; the return value is
// always a same-origin relative path. Google start/callback pass
// `publicOrigin(req)` so a same-site absolute URL canonicalises.
export const SANITISE_NEXT_ORIGIN = "https://clockinoff.invalid";
const DEFAULT_NEXT = "/app";
const UNSAFE_CHAR = /[\u0000-\u001F\u007F\\]/;
const UNSAFE_PERCENT = /%(?:0[0-9A-Fa-f]|1[0-9A-Fa-f]|7[Ff]|5[Cc])/;

export type OAuthIntent = "signin" | "connect";

export type OAuthStatePayload =
  | { s: string; n: string }
  | { s: string; n: string; i: "connect"; uid: string };

export function readRequestCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie");
  if (!raw) return undefined;
  const part = raw
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${name}=`));
  if (!part) return undefined;
  return decodeURIComponent(part.slice(name.length + 1));
}

export function parseOAuthIntent(raw: string | null | undefined): OAuthIntent {
  return raw === "connect" ? "connect" : "signin";
}

function oauthStateSecret(): string | null {
  const secret = process.env.NEXTAUTH_SECRET?.trim();
  return secret ? secret : null;
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
  const payload =
    state.i === "connect"
      ? { s: state.s, n: state.n, i: "connect" as const, uid: state.uid }
      : { s: state.s, n: state.n };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function serialiseOAuthState(state: OAuthStatePayload): string {
  if (state.i === "connect" && !state.uid) {
    throw new Error("connect OAuth state requires uid");
  }
  const secret = oauthStateSecret();
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required to sign OAuth state");
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
    if (typeof s !== "string" || s.length === 0) return null;
    if (typeof n !== "string") return null;
    if (i === "connect") {
      if (typeof uid !== "string" || uid.length === 0) return null;
      return { s, n, i: "connect", uid };
    }
    return { s, n };
  } catch {
    return null;
  }
}

// Parse-and-compare, not prefix checks. WHATWG URL parsing strips TAB /
// CR / LF, so `"/\t/evil"` becomes the protocol-relative `//evil` and
// `new URL(..., origin)` walks off-site. Reject control chars and `\`
// first, then require the parsed origin to match.
export function sanitiseNext(input: string | null | undefined, origin = SANITISE_NEXT_ORIGIN): string {
  if (!input || typeof input !== "string") return DEFAULT_NEXT;
  if (input.length > 1024) return DEFAULT_NEXT;
  if (UNSAFE_CHAR.test(input) || UNSAFE_PERCENT.test(input)) return DEFAULT_NEXT;
  let base: string;
  try {
    base = new URL(origin).origin;
  } catch {
    return DEFAULT_NEXT;
  }
  try {
    const url = new URL(input, base);
    if (url.origin !== base) return DEFAULT_NEXT;
    if (url.username || url.password) return DEFAULT_NEXT;
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (!next.startsWith("/") || next.startsWith("//")) return DEFAULT_NEXT;
    if (UNSAFE_CHAR.test(next) || UNSAFE_PERCENT.test(next)) return DEFAULT_NEXT;
    const again = new URL(next, base);
    if (again.origin !== base) return DEFAULT_NEXT;
    return next;
  } catch {
    return DEFAULT_NEXT;
  }
}
