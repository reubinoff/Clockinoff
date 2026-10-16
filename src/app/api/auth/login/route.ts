import { NextResponse } from "next/server";
import { adminRequestMeta, jsonError, readJson } from "@/server/http";
import { login } from "@/server/auth/service";
import { hashSessionToken, SESSION_COOKIE } from "@/server/auth/session";
import {
  isLoginIpRateLimited,
  isLoginRateLimited,
  loginIpRetryAfterSeconds,
  loginRetryAfterSeconds,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/server/auth/rate-limit";
import { clientIpForRecord, clientIpFromHeaders, socketAddressFromRequest } from "@/lib/client-ip";
import { ApiError, errors } from "@/lib/errors";
import {
  AUTH_AUDIT,
  LOGIN_METHOD,
  loginFailureActorEmail,
  recordAuthEvent,
} from "@/server/auth/auth-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const ip = clientIpFromHeaders(req.headers);
  const meta = adminRequestMeta(req);
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
    const { user, session } = await login({
      ...body,
      clientIp: clientIpForRecord(req.headers, socketAddressFromRequest(req)),
    });
    await recordAuthEvent({
      action: AUTH_AUDIT.loginSuccess,
      actorUserId: user.id,
      actorEmail: user.email,
      targets: [{ id: user.id, email: user.email }],
      requestId: meta.requestId,
      clientIp: meta.clientIp,
      forwardedFor: meta.forwardedFor,
      userAgent: meta.userAgent,
      sessionIdHash: hashSessionToken(session.id),
      method: LOGIN_METHOD.password,
    });
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
      // login() already returned the same 401 for a missing account and a
      // wrong password. This insert does not look the user up, and
      // recordAuthEvent forces a null actor id, so the row (and the time
      // to write it) does not depend on whether the account exists.
      await recordAuthEvent({
        action: AUTH_AUDIT.loginFailure,
        actorUserId: null,
        actorEmail: loginFailureActorEmail(email),
        targets: [],
        requestId: meta.requestId,
        clientIp: meta.clientIp,
        forwardedFor: meta.forwardedFor,
        userAgent: meta.userAgent,
        sessionIdHash: null,
        method: LOGIN_METHOD.password,
      });
    }
    return jsonError(err);
  }
}
