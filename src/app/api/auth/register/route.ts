import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminRequestMeta, jsonError, readJson } from "@/server/http";
import { register } from "@/server/auth/service";
import { hashSessionToken, SESSION_COOKIE } from "@/server/auth/session";
import {
  isRegisterRateLimited,
  recordRegisterAttempt,
  registerRetryAfterSeconds,
} from "@/server/auth/rate-limit";
import { clientIpForRecord, clientIpFromHeaders, socketAddressFromRequest } from "@/lib/client-ip";
import { errors } from "@/lib/errors";
import { AUTH_AUDIT, recordAuthEvent } from "@/server/auth/auth-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const ip = clientIpFromHeaders(req.headers);
  try {
    // Fail closed before any DB work so a scripted sign-up flood can't burn
    // argon2 CPU on this replica. Register has no established identifier, so
    // the limiter keys on the client IP alone (see `rate-limit.ts`).
    if (isRegisterRateLimited(ip)) {
      throw errors.rateLimited(
        "Too many sign-up attempts. Please try again later.",
        registerRetryAfterSeconds(ip),
      );
    }
    // Count the attempt *before* the handler runs so even a failing request
    // (bad password, duplicate email, dropped socket) consumes budget. The
    // generic register error already prevents enumeration — counting all
    // outcomes just stops attackers from using cheap 400s as a free probe.
    recordRegisterAttempt(ip);
    const body = await readJson<{ email: string; password: string; timezone?: string }>(req);
    const meta = adminRequestMeta(req);
    const { user, session } = await register({
      ...body,
      clientIp: clientIpForRecord(req.headers, socketAddressFromRequest(req)),
    });
    await recordAuthEvent({
      action: AUTH_AUDIT.register,
      actorUserId: user.id,
      actorEmail: user.email,
      targets: [{ id: user.id, email: user.email }],
      requestId: meta.requestId,
      clientIp: meta.clientIp,
      forwardedFor: meta.forwardedFor,
      userAgent: meta.userAgent,
      sessionIdHash: hashSessionToken(session.id),
    });
    const res = NextResponse.json(user, { status: 201 });
    res.cookies.set(SESSION_COOKIE, session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: session.expiresAt,
    });
    void cookies;
    return res;
  } catch (err) {
    return jsonError(err);
  }
}
