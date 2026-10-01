import { NextResponse } from "next/server";
import {
  decodeIdToken,
  exchangeCode,
  getGoogleConfig,
  GoogleAuthError,
  signInWithGoogle,
  validateIdTokenClaims,
} from "@/server/auth/google";
import { SESSION_COOKIE } from "@/server/auth/session";
import { logger } from "@/lib/logger";
import { publicOrigin } from "@/lib/base-url";
import { OAUTH_STATE_COOKIE, sanitiseNext } from "../start/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ErrorCode = "cancelled" | "unverified" | "network";

interface ParsedState {
  s: string;
  n: string;
}

function parseStateCookie(raw: string | undefined): ParsedState | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== "object") return null;
    const s = (obj as Record<string, unknown>).s;
    const n = (obj as Record<string, unknown>).n;
    if (typeof s !== "string" || s.length === 0) return null;
    if (typeof n !== "string") return null;
    return { s, n };
  } catch {
    return null;
  }
}

function redirectToLoginWithError(origin: string, error: ErrorCode): NextResponse {
  const res = NextResponse.redirect(new URL(`/login?error=${error}`, origin), 302);
  res.cookies.set(OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
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

  if (queryError) {
    // Google ships `error=access_denied` (and friends) in the query when the
    // user cancels or we're denied scopes. Treat anything error-shaped as a
    // consent cancel from the UX side.
    return redirectToLoginWithError(origin, "cancelled");
  }

  const cookieRaw = req.headers
    .get("cookie")
    ?.split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${OAUTH_STATE_COOKIE}=`))
    ?.slice(OAUTH_STATE_COOKIE.length + 1);
  const state = parseStateCookie(cookieRaw ? decodeURIComponent(cookieRaw) : undefined);

  if (!state || !stateParam || state.s !== stateParam) {
    logger.warn("[google] state mismatch on callback");
    return redirectToLoginWithError(origin, "network");
  }

  if (!code) {
    return redirectToLoginWithError(origin, "network");
  }

  let next = sanitiseNext(state.n);

  try {
    const config = getGoogleConfig(req);
    const tokenRes = await exchangeCode(code, config);
    const payload = decodeIdToken(tokenRes.id_token);
    validateIdTokenClaims(payload, config);
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
    res.cookies.set(OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return res;
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      logger.warn("[google] callback aborted", { reason: err.reason });
      return redirectToLoginWithError(origin, err.reason);
    }
    logger.exception("[google] callback unexpected failure", err);
    return redirectToLoginWithError(origin, "network");
  }
}
