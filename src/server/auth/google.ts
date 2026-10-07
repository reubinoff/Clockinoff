// Google OAuth 2.0 "Continue with Google" — tiny server-side flow.
//
// Account rules (Shaul lock 2026-10-01, #122 password-account refuse 2026-10-06):
//
//   - verified email + no existing user      → create user, attach `sub`, sign in
//   - verified email + existing user, no password_hash, no sub
//       → attach `sub` (Google-only accounts keep today's linking)
//   - verified email + existing user with password_hash, no matching sub
//       → NEVER auto-attach. Refuse; user signs in with password, then
//         connects Google from Settings.
//   - verified email + existing user, same sub → sign in
//   - verified email + existing user, DIFFERENT sub → fail closed (anomaly)
//   - email NOT verified                     → fail closed
//
// We never create a second user for the same verified email, never show a
// conflict screen, and never clear an existing password_hash on attach.

import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { pgErrorCode } from "@/server/db/errors";
import { users } from "@/server/db/schema";
import { applyBootstrapRole, initialRoleForEmail } from "./admin-bootstrap";
import { createSession, sessionUserFromRow, type CreatedSession, type SessionUser } from "./session";
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
export type GoogleAuthReason =
  | "cancelled"
  | "unverified"
  | "network"
  | "password_account"
  | "email_mismatch";

export class GoogleAuthError extends Error {
  constructor(
    public reason: GoogleAuthReason,
    message: string,
    public details?: { email?: string },
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

// Google auth codes are opaque, but we refuse anything that cannot be a
// real code before spending an outbound POST + client_secret (#148).
const GOOGLE_AUTH_CODE_RE = /^[A-Za-z0-9/_.-]{1,512}$/;

export function isGoogleAuthCode(code: string): boolean {
  return GOOGLE_AUTH_CODE_RE.test(code);
}

export function summarizeGoogleTokenError(body: string): {
  error?: string;
  error_description?: string;
} {
  const out: { error?: string; error_description?: string } = {};
  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object") return out;
    const rec = parsed as Record<string, unknown>;
    if (typeof rec.error === "string") out.error = rec.error.slice(0, 200);
    if (typeof rec.error_description === "string") {
      out.error_description = rec.error_description.slice(0, 200);
    }
  } catch {
    // Never log the raw non-JSON body.
  }
  return out;
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
  if (!isGoogleAuthCode(code)) {
    throw new GoogleAuthError("network", "Invalid authorization code");
  }
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
    logger.warn("[google] token exchange non-2xx", {
      status: res.status,
      ...summarizeGoogleTokenError(text),
    });
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

async function startGoogleSession(row: {
  id: string;
  email: string;
  timezone: string;
  role: string;
  blockedAt: Date | null;
}): Promise<{ user: SessionUser; session: CreatedSession }> {
  if (row.blockedAt) {
    logger.warn("[google] refusing sign-in for blocked user", { userId: row.id });
    throw new GoogleAuthError("network", "Blocked user");
  }
  const role = await applyBootstrapRole(row.id, row.email, row.role);
  const session = await createSession(row.id);
  return {
    user: sessionUserFromRow({ ...row, role, blockedAt: null }),
    session,
  };
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
      role: users.role,
      blockedAt: users.blockedAt,
    })
    .from(users)
    .where(eq(users.googleSub, input.sub))
    .limit(1);
  if (bySub[0]) {
    const started = await startGoogleSession(bySub[0]);
    return { ...started, isNewUser: false };
  }

  // 2) Existing user with the SAME verified email. Case-insensitive
  //    lookup matches the `lower(email)` unique index.
  const byEmail = await db
    .select({
      id: users.id,
      email: users.email,
      timezone: users.timezone,
      role: users.role,
      blockedAt: users.blockedAt,
      googleSub: users.googleSub,
      passwordHash: users.passwordHash,
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
    if (existing.passwordHash) {
      // #122: a password credential is already on this account. Auto-
      // attaching Google here is the pre-hijack path (attacker registered
      // the victim's email first). Refuse; Settings is the only attach.
      logger.warn("[google] refusing to auto-attach Google onto password account", {
        userId: existing.id,
      });
      throw new GoogleAuthError("password_account", "Password account must sign in first", {
        email: existing.email,
      });
    }
    const [updated] = await db
      .update(users)
      .set({ googleSub: input.sub })
      .where(and(eq(users.id, existing.id), isNull(users.googleSub)))
      .returning({
        id: users.id,
        email: users.email,
        timezone: users.timezone,
        role: users.role,
        blockedAt: users.blockedAt,
      });
    const user = updated ?? existing;
    const started = await startGoogleSession(user);
    return { ...started, isNewUser: false };
  }

  // 3) No user at all → create a Google-only user. No password_hash yet;
  //    the user can set one later from Settings (out of this tip, deferred).
  try {
    const timezone = input.timezone?.trim() || "Asia/Jerusalem";
    const [row] = await db
      .insert(users)
      .values({
        email: normalisedEmail,
        googleSub: input.sub,
        timezone,
        role: initialRoleForEmail(normalisedEmail),
      })
      .returning({
        id: users.id,
        email: users.email,
        timezone: users.timezone,
        role: users.role,
        blockedAt: users.blockedAt,
      });
    const started = await startGoogleSession(row);
    return { ...started, isNewUser: true };
  } catch (err) {
    const code = pgErrorCode(err);
    if (code === "23505" && !_retried) {
      // Race: another request created the row between our SELECTs and
      // INSERT. Retry the full lookup once — in the common case the
      // second attempt finds the row by sub.
      return signInWithGoogle(input, true);
    }
    throw err;
  }
}

export interface SignInMethods {
  hasPassword: boolean;
  googleConnected: boolean;
  googleEmail: string | null;
}

export async function getSignInMethods(userId: string): Promise<SignInMethods> {
  const db = getDb();
  const rows = await db
    .select({
      email: users.email,
      passwordHash: users.passwordHash,
      googleSub: users.googleSub,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const row = rows[0];
  if (!row) throw errors.notFound("User not found");
  const googleConnected = Boolean(row.googleSub);
  return {
    hasPassword: Boolean(row.passwordHash),
    googleConnected,
    googleEmail: googleConnected ? row.email : null,
  };
}

// Settings → Account "Connect Google". Session user is the authority;
// Google email must match that account. Never attaches to a different
// user, never rebinds an existing sub, never disconnects.
export async function connectGoogleToUser(
  userId: string,
  input: { sub: string; email: string },
): Promise<{ email: string }> {
  const db = getDb();
  const normalisedEmail = input.email.trim();
  if (!normalisedEmail || !input.sub) {
    throw errors.validation("Invalid Google identity");
  }

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      googleSub: users.googleSub,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const user = rows[0];
  if (!user) throw errors.notFound("User not found");

  if (user.email.toLowerCase() !== normalisedEmail.toLowerCase()) {
    throw new GoogleAuthError("email_mismatch", "Google email does not match account", {
      email: user.email,
    });
  }

  if (user.googleSub && user.googleSub !== input.sub) {
    logger.warn("[google] refusing to rebind existing user to new sub on connect", {
      userId: user.id,
    });
    throw new GoogleAuthError("network", "Account already linked to another Google user");
  }

  if (user.googleSub === input.sub) {
    return { email: user.email };
  }

  try {
    await db
      .update(users)
      .set({ googleSub: input.sub })
      .where(and(eq(users.id, user.id), isNull(users.googleSub)));
  } catch (err) {
    if (pgErrorCode(err) === "23505") {
      logger.warn("[google] connect blocked: sub already linked to another user", {
        userId: user.id,
      });
      throw new GoogleAuthError("network", "Google account already linked to another user");
    }
    throw err;
  }
  return { email: user.email };
}
