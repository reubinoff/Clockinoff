import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/server/http";
import { login } from "@/server/auth/service";
import { SESSION_COOKIE } from "@/server/auth/session";
import {
  isLoginRateLimited,
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
    const body = await readJson<{ email: string; password: string }>(req);
    email = typeof body?.email === "string" ? body.email : "";
    // Fail closed *before* the credential check so we never leak whether the
    // account exists once the (email + IP) bucket is exhausted.
    if (email.trim().length > 0 && isLoginRateLimited(email, ip)) {
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
