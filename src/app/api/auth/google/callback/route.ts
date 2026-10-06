import { NextResponse } from "next/server";
import {
  connectGoogleToUser,
  decodeIdToken,
  exchangeCode,
  getGoogleConfig,
  GoogleAuthError,
  signInWithGoogle,
  validateIdTokenClaims,
} from "@/server/auth/google";
import { getSessionUser, SESSION_COOKIE } from "@/server/auth/session";
import { logger } from "@/lib/logger";
import { publicOrigin } from "@/lib/base-url";
import { googlePasswordAccountLoginPath } from "@/lib/google-auth-errors";
import {
  OAUTH_STATE_COOKIE,
  parseOAuthState,
  readRequestCookie,
  sanitiseNext,
} from "@/lib/oauth-next";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LoginErrorCode = "cancelled" | "unverified" | "network";

function clearOAuthCookie(res: NextResponse): void {
  res.cookies.set(OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

function redirectToLoginWithError(origin: string, error: LoginErrorCode): NextResponse {
  const res = NextResponse.redirect(new URL(`/login?error=${error}`, origin), 302);
  clearOAuthCookie(res);
  return res;
}

function redirectToLoginPasswordAccount(origin: string): NextResponse {
  const res = NextResponse.redirect(new URL(googlePasswordAccountLoginPath(), origin), 302);
  clearOAuthCookie(res);
  return res;
}

function redirectToAccount(origin: string, query: string): NextResponse {
  const res = NextResponse.redirect(new URL(`/app/account?${query}`, origin), 302);
  clearOAuthCookie(res);
  return res;
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  // Never trust req.url for building the Location — behind Azure App
  // Service that resolves to the internal container hostname and the
  // browser lands on NXDOMAIN after Google consent. See `publicOrigin`.
  const origin = publicOrigin(req);
  const queryError = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");

  const state = parseOAuthState(readRequestCookie(req, OAUTH_STATE_COOKIE));

  if (queryError) {
    // Google ships `error=access_denied` (and friends) in the query when the
    // user cancels or we're denied scopes. Treat anything error-shaped as a
    // consent cancel from the UX side. Settings connect stays on Account.
    if (state?.i === "connect") {
      return redirectToAccount(origin, "error=network");
    }
    return redirectToLoginWithError(origin, "cancelled");
  }

  if (!state || !stateParam || state.s !== stateParam) {
    logger.warn("[google] state mismatch on callback");
    return redirectToLoginWithError(origin, "network");
  }

  if (!code) {
    return redirectToLoginWithError(origin, "network");
  }

  const isConnect = state.i === "connect";
  let next = sanitiseNext(state.n, origin);

  try {
    const config = getGoogleConfig(req);
    const tokenRes = await exchangeCode(code, config);
    const payload = decodeIdToken(tokenRes.id_token);
    validateIdTokenClaims(payload, config);

    if (isConnect) {
      const sessionUser = await getSessionUser(readRequestCookie(req, SESSION_COOKIE));
      if (!sessionUser) {
        const login = NextResponse.redirect(new URL("/login?next=%2Fapp%2Faccount", origin), 302);
        clearOAuthCookie(login);
        return login;
      }
      if (!state.uid || sessionUser.id !== state.uid) {
        logger.warn("[google] connect uid mismatch");
        return redirectToAccount(origin, "error=network");
      }
      await connectGoogleToUser(sessionUser.id, { sub: payload.sub, email: payload.email });
      return redirectToAccount(origin, "google=connected");
    }

    const result = await signInWithGoogle({ sub: payload.sub, email: payload.email });

    // Match the password-register landing: a brand-new account gets the
    // welcome=1 one-time hero on /app. Returning users land exactly where
    // they tried to go.
    if (result.isNewUser && next === "/app") {
      next = "/app?welcome=1";
    }

    const res = NextResponse.redirect(new URL(next, origin), 302);
    res.cookies.set(SESSION_COOKIE, result.session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: result.session.expiresAt,
    });
    clearOAuthCookie(res);
    return res;
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      logger.warn("[google] callback aborted", { reason: err.reason });
      if (isConnect) {
        if (err.reason === "email_mismatch") {
          return redirectToAccount(origin, "error=google_email_mismatch");
        }
        return redirectToAccount(origin, "error=network");
      }
      if (err.reason === "password_account") {
        return redirectToLoginPasswordAccount(origin);
      }
      if (err.reason === "cancelled" || err.reason === "unverified") {
        return redirectToLoginWithError(origin, err.reason);
      }
      return redirectToLoginWithError(origin, "network");
    }
    logger.exception("[google] callback unexpected failure", err);
    if (isConnect) return redirectToAccount(origin, "error=network");
    return redirectToLoginWithError(origin, "network");
  }
}
