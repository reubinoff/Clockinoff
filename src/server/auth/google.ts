// Google OAuth 2.0 "Continue with Google" — tiny server-side flow.
//
// Account rules (locked by Shaul via brief, 2026-10-01):
//
//   - verified email + no existing user      → create user, attach `sub`, sign in
//   - verified email + existing user, no sub → attach `sub` to that user; keep password
//   - verified email + existing user, same sub → sign in
//   - verified email + existing user, DIFFERENT sub → fail closed (anomaly)
//   - email NOT verified                     → fail closed
//
// We never create a second user for the same verified email, never show a
// conflict screen, and never clear an existing password_hash on attach.

import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { createSession, type CreatedSession, type SessionUser } from "./session";
import { tokenId } from "@/lib/id";
import { errors } from "@/lib/errors";
import { logger } from "@/lib/logger";

export const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_SCOPES = ["openid", "email", "profile"];
export const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleIdTokenPayload {
  sub: string;
  email: string;
  email_verified: boolean;
  iss: string;
  aud: string;
  exp: number;
  name?: string;
}

export interface GoogleTokenResponse {
  id_token: string;
  access_token?: string;
  expires_in?: number;
  token_type?: string;
}

// Thrown for any Google-side problem we want the callback route to translate
// into a user-visible `?error=` code. The route catches it, logs, and
// redirects — never bubbles the raw message to the browser.
export class GoogleAuthError extends Error {
  constructor(
    public reason: "cancelled" | "unverified" | "network",
    message: string,
  ) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

export function getGoogleConfig(req?: Request): GoogleConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const explicitRedirect = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret) {
    throw new GoogleAuthError("network", "Google OAuth not configured");
  }
  const redirectUri = explicitRedirect || deriveRedirectUri(req);
  return { clientId, clientSecret, redirectUri };
}

function deriveRedirectUri(req?: Request): string {
  const nextauth = process.env.NEXTAUTH_URL?.trim();
  if (nextauth) return `${nextauth.replace(/\/$/, "")}/api/auth/google/callback`;
  if (req) {
    const u = new URL(req.url);
    return `${u.origin}/api/auth/google/callback`;
  }
  throw new GoogleAuthError("network", "No redirect URI configured");
}

export function newStateToken(): string {
  return tokenId(32);
}

export function buildAuthorizeUrl(opts: {
  config: GoogleConfig;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.config.clientId,
    redirect_uri: opts.config.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "online",
    include_granted_scopes: "true",
    prompt: "select_account",
    state: opts.state,
  });
  return `${GOOGLE_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCode(code: string, config: GoogleConfig): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });
  let res: Response;
  try {
    res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (err) {
    logger.exception("[google] token exchange network error", err);
    throw new GoogleAuthError("network", "Google token exchange failed");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.warn("[google] token exchange non-2xx", { status: res.status, body: text });
    throw new GoogleAuthError("network", `Google token exchange returned ${res.status}`);
  }
  const json = (await res.json().catch(() => null)) as GoogleTokenResponse | null;
  if (!json || typeof json.id_token !== "string" || json.id_token.length === 0) {
    throw new GoogleAuthError("network", "Google token response missing id_token");
  }
  return json;
}

export function decodeIdToken(idToken: string): GoogleIdTokenPayload {
  // We only decode (not verify signature) because the id_token arrived
  // over TLS directly from Google's token endpoint, authenticated with our
  // client_secret. Google's own server-flow guidance says signature
  // verification is optional in that case; we still validate iss / aud /
  // exp / email_verified below. Ariel sign-off: that's the smoke scope.
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new GoogleAuthError("network", "Malformed id_token");
  }
  let payload: unknown;
  try {
    const pad = parts[1].length % 4 === 0 ? "" : "=".repeat(4 - (parts[1].length % 4));
    const raw = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString(
      "utf8",
    );
    payload = JSON.parse(raw);
  } catch {
    throw new GoogleAuthError("network", "Malformed id_token payload");
  }
  if (!payload || typeof payload !== "object") {
    throw new GoogleAuthError("network", "Malformed id_token payload");
  }
  const p = payload as Record<string, unknown>;
  const sub = typeof p.sub === "string" ? p.sub : "";
  const email = typeof p.email === "string" ? p.email : "";
  const iss = typeof p.iss === "string" ? p.iss : "";
  const aud = typeof p.aud === "string" ? p.aud : "";
  const exp = typeof p.exp === "number" ? p.exp : 0;
  const emailVerified = p.email_verified === true || p.email_verified === "true";
  if (!sub || !email || !iss || !aud) {
    throw new GoogleAuthError("network", "id_token missing required claims");
  }
  return { sub, email, email_verified: emailVerified, iss, aud, exp };
}

export function validateIdTokenClaims(
  payload: GoogleIdTokenPayload,
  config: GoogleConfig,
  now: Date = new Date(),
): void {
  if (!GOOGLE_ISSUERS.has(payload.iss)) {
    throw new GoogleAuthError("network", `Unexpected id_token iss: ${payload.iss}`);
  }
  if (payload.aud !== config.clientId) {
    throw new GoogleAuthError("network", "id_token audience mismatch");
  }
  if (payload.exp * 1000 < now.getTime()) {
    throw new GoogleAuthError("network", "id_token expired");
  }
  if (!payload.email_verified) {
    throw new GoogleAuthError("unverified", "Google email isn't verified");
  }
}

export interface GoogleSignInResult {
  user: SessionUser;
  session: CreatedSession;
  isNewUser: boolean;
}

export async function signInWithGoogle(
  input: { sub: string; email: string; timezone?: string },
  _retried = false,
): Promise<GoogleSignInResult> {
  const db = getDb();
  const normalisedEmail = input.email.trim();
  if (!normalisedEmail || !input.sub) {
    throw errors.validation("Invalid Google identity");
  }

  // 1) Already linked? Match on sub first — Google is the authority on
  //    identity, so a sub hit wins even if the user later changed their
  //    primary Google email.
  const bySub = await db
    .select({
      id: users.id,
      email: users.email,
      timezone: users.timezone,
    })
    .from(users)
    .where(eq(users.googleSub, input.sub))
    .limit(1);
  if (bySub[0]) {
    const session = await createSession(bySub[0].id);
    return { user: bySub[0], session, isNewUser: false };
  }

  // 2) Existing email/password user with the SAME verified email → attach.
  //    Case-insensitive lookup matches the `lower(email)` unique index.
  const byEmail = await db
    .select({
      id: users.id,
      email: users.email,
      timezone: users.timezone,
      googleSub: users.googleSub,
    })
    .from(users)
    .where(sql`lower(${users.email}) = lower(${normalisedEmail})`)
    .limit(1);
  const existing = byEmail[0];
  if (existing) {
    if (existing.googleSub && existing.googleSub !== input.sub) {
      // Pathological: existing user is already linked to a *different*
      // Google account for the same email. We never silently rebind, and
      // we never create a dupe user. Fail closed with the generic copy.
      logger.warn("[google] refusing to rebind existing user to new sub", {
        userId: existing.id,
      });
      throw new GoogleAuthError("network", "Account already linked to another Google user");
    }
    const [updated] = await db
      .update(users)
      .set({ googleSub: input.sub })
      .where(and(eq(users.id, existing.id), isNull(users.googleSub)))
      .returning({ id: users.id, email: users.email, timezone: users.timezone });
    const user = updated ?? {
      id: existing.id,
      email: existing.email,
      timezone: existing.timezone,
    };
    const session = await createSession(user.id);
    return { user, session, isNewUser: false };
  }

  // 3) No user at all → create a Google-only user. No password_hash yet;
  //    the user can set one later from Settings (out of this tip, deferred).
  try {
    const timezone = input.timezone?.trim() || "Asia/Jerusalem";
    const [row] = await db
      .insert(users)
      .values({ email: normalisedEmail, googleSub: input.sub, timezone })
      .returning({ id: users.id, email: users.email, timezone: users.timezone });
    const session = await createSession(row.id);
    return { user: row, session, isNewUser: true };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "23505" && !_retried) {
      // Race: another request created the row between our SELECTs and
      // INSERT. Retry the full lookup once — in the common case the
      // second attempt finds the row by sub.
      return signInWithGoogle(input, true);
    }
    throw err;
  }
}
