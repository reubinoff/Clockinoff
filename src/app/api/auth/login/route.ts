import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/server/http";
import { login } from "@/server/auth/service";
import { SESSION_COOKIE } from "@/server/auth/session";
import {
  isLoginIpRateLimited,
  isLoginRateLimited,
  loginIpRetryAfterSeconds,
  loginRetryAfterSeconds,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/server/auth/rate-limit";
import { clientIpFromHeaders } from "@/lib/client-ip";
import { ApiError, errors } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const ip = clientIpFromHeaders(req.headers);
  let email = "";
  try {
    // #151: the per-IP ceiling does not need the body. Check it first so a
    // huge payload cannot bypass or starve the throttle. The (email, IP)
    // bucket still runs after a size-capped parse.
    if (isLoginIpRateLimited(ip)) {
      throw errors.rateLimited(
        "Too many login attempts. Please try again later.",
        loginIpRetryAfterSeconds(ip),
      );
    }
    const body = await readJson<{ email: string; password: string }>(req);
    email = typeof body?.email === "string" ? body.email : "";
    if (email.trim().length === 0) {
      throw errors.validation("Invalid credentials");
    }
    // Fail closed *before* the credential check so we never leak whether the
    // account exists once the (email + IP) bucket is exhausted.
    if (isLoginRateLimited(email, ip)) {
      throw errors.rateLimited(
        "Too many login attempts. Please try again later.",
        loginRetryAfterSeconds(email, ip),
      );
    }
    const { user, session } = await login(body);
    recordLoginSuccess(email, ip);
    const res = NextResponse.json(user, { status: 200 });
    res.cookies.set(SESSION_COOKIE, session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: session.expiresAt,
    });
    return res;
  } catch (err) {
    if (
      err instanceof ApiError &&
      err.code === "UNAUTHORIZED" &&
      email.trim().length > 0
    ) {
      recordLoginFailure(email, ip);
    }
    return jsonError(err);
  }
}
