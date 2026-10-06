import { NextResponse } from "next/server";
import { buildAuthorizeUrl, getGoogleConfig, GoogleAuthError, newStateToken } from "@/server/auth/google";
import { getSessionUser, SESSION_COOKIE } from "@/server/auth/session";
import { logger } from "@/lib/logger";
import { publicOrigin } from "@/lib/base-url";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE_SECONDS,
  parseOAuthIntent,
  readRequestCookie,
  sanitiseNext,
} from "@/lib/oauth-next-path";
import { oauthStateSecretConfigured, serialiseOAuthState } from "@/lib/oauth-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const origin = publicOrigin(req);
  const intent = parseOAuthIntent(url.searchParams.get("intent"));
  const next = sanitiseNext(
    url.searchParams.get("next") ?? (intent === "connect" ? "/app/account" : "/app"),
    origin,
  );

  if (!oauthStateSecretConfigured()) {
    logger.warn("[google] start aborted", { reason: "unavailable" });
    const bounce =
      intent === "connect" ? "/app/account?error=network" : "/login?error=unavailable";
    return NextResponse.redirect(new URL(bounce, origin), 302);
  }

  let connectUid: string | undefined;
  if (intent === "connect") {
    const sid = readRequestCookie(req, SESSION_COOKIE);
    const user = await getSessionUser(sid);
    if (!user) {
      const login = new URL("/login", origin);
      login.searchParams.set("next", "/app/account");
      return NextResponse.redirect(login, 302);
    }
    connectUid = user.id;
  }

  let authorizeUrl: string;
  let state: string;
  let cookieValue: string;
  try {
    const config = getGoogleConfig(req);
    state = newStateToken();
    authorizeUrl = buildAuthorizeUrl({ config, state });
    cookieValue = serialiseOAuthState(
      connectUid
        ? { s: state, n: next, i: "connect", uid: connectUid }
        : { s: state, n: next },
    );
  } catch (err) {
    // Resolve the user-visible origin from NEXTAUTH_URL so the error
    // bounce doesn't leak the internal container hostname either.
    if (err instanceof GoogleAuthError) {
      logger.warn("[google] start aborted", { reason: err.reason });
    } else {
      logger.exception("[google] start unexpected failure", err);
    }
    const bounce =
      intent === "connect" ? "/app/account?error=network" : "/login?error=network";
    return NextResponse.redirect(new URL(bounce, origin), 302);
  }

  const res = NextResponse.redirect(authorizeUrl, 302);
  res.cookies.set(OAUTH_STATE_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
  });
  return res;
}
