import { NextResponse } from "next/server";
import { buildAuthorizeUrl, getGoogleConfig, GoogleAuthError, newStateToken } from "@/server/auth/google";
import { logger } from "@/lib/logger";
import { publicOrigin } from "@/lib/base-url";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE_SECONDS,
  sanitiseNext,
} from "@/lib/oauth-next";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const next = sanitiseNext(url.searchParams.get("next"));

  let authorizeUrl: string;
  let state: string;
  try {
    const config = getGoogleConfig(req);
    state = newStateToken();
    authorizeUrl = buildAuthorizeUrl({ config, state });
  } catch (err) {
    // Resolve the user-visible origin from NEXTAUTH_URL so the error
    // bounce doesn't leak the internal container hostname either.
    const origin = publicOrigin(req);
    if (err instanceof GoogleAuthError) {
      logger.warn("[google] start aborted", { reason: err.reason });
      return NextResponse.redirect(new URL("/login?error=network", origin), 302);
    }
    logger.exception("[google] start unexpected failure", err);
    return NextResponse.redirect(new URL("/login?error=network", origin), 302);
  }

  const res = NextResponse.redirect(authorizeUrl, 302);
  const cookieValue = JSON.stringify({ s: state, n: next });
  res.cookies.set(OAUTH_STATE_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
  });
  return res;
}
