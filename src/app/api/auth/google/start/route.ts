import { NextResponse } from "next/server";
import { buildAuthorizeUrl, getGoogleConfig, GoogleAuthError, newStateToken } from "@/server/auth/google";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OAUTH_STATE_COOKIE = "timely_oauth_state";
export const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

// Only allow relative `next` paths back into the app. Blocks protocol / host
// escape (`//evil`, `https://evil`, `http:evil`) so this flow can never be
// used as an open-redirect vector. Ariel smoke scope.
export function sanitiseNext(input: string | null | undefined): string {
  if (!input) return "/app";
  if (typeof input !== "string") return "/app";
  if (input.length > 1024) return "/app";
  if (!input.startsWith("/")) return "/app";
  if (input.startsWith("//")) return "/app";
  if (input.startsWith("/\\")) return "/app";
  return input;
}

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
    if (err instanceof GoogleAuthError) {
      logger.warn("[google] start aborted", { reason: err.reason });
      return NextResponse.redirect(new URL("/login?error=network", url.origin), 302);
    }
    logger.exception("[google] start unexpected failure", err);
    return NextResponse.redirect(new URL("/login?error=network", url.origin), 302);
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
