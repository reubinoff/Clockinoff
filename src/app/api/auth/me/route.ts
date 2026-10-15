import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { publicOrigin } from "@/lib/base-url";
import { clientIpForRecord, clientIpFromHeaders, socketAddressFromRequest } from "@/lib/client-ip";
import { ApiError, errors } from "@/lib/errors";
import { PASSWORD_MAX_LENGTH } from "@/lib/password";
import { jsonError, ok, requireUser, readJson, adminRequestMeta } from "@/server/http";
import { updateTimezone } from "@/server/auth/service";
import { getSignInMethods } from "@/server/auth/google";
import {
  isSelfDeleteRateLimited,
  recordSelfDeleteFailure,
  selfDeleteRetryAfterSeconds,
} from "@/server/auth/rate-limit";
import { CONFIRM_EMAIL_MAX, deleteOwnAccount } from "@/server/auth/self-delete";
import { getSessionUser, SESSION_COOKIE } from "@/server/auth/session";

// Reject over-length fields before deleteOwnAccount reaches argon2.
const DeleteBody = z.object({
  password: z.string().max(PASSWORD_MAX_LENGTH).optional(),
  confirmEmail: z.string().max(CONFIRM_EMAIL_MAX),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const user = await requireUser();
    const methods = await getSignInMethods(user.id);
    return ok({ ...user, ...methods });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(req: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const body = await readJson<{ timezone?: string }>(req);
    if (!body.timezone) return ok(user);
    const updated = await updateTimezone(user.id, body.timezone);
    return ok(updated);
  } catch (err) {
    return jsonError(err);
  }
}

function assertSelfDeleteOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (origin == null || origin.length === 0 || origin === "null") {
    throw errors.forbidden();
  }
  let expected: string;
  try {
    expected = publicOrigin(req);
  } catch {
    throw errors.forbidden();
  }
  if (origin !== expected) throw errors.forbidden();
}

function selfDeleteBucketIp(req: Request): string {
  return (
    clientIpForRecord(req.headers, socketAddressFromRequest(req)) ??
    clientIpFromHeaders(req.headers)
  );
}

export async function DELETE(req: Request): Promise<Response> {
  let userId = "";
  let bucketIp = "";
  try {
    const jar = await cookies();
    const sessionToken = jar.get(SESSION_COOKIE)?.value;
    const user = await getSessionUser(sessionToken);
    if (!user || !sessionToken) throw errors.unauthorized();
    assertSelfDeleteOrigin(req);
    userId = user.id;
    bucketIp = selfDeleteBucketIp(req);
    if (isSelfDeleteRateLimited(userId, bucketIp)) {
      throw errors.rateLimited(
        "Too many attempts. Please try again later.",
        selfDeleteRetryAfterSeconds(userId, bucketIp),
      );
    }
    const body = await readJson<unknown>(req);
    const parsed = DeleteBody.safeParse(body);
    if (!parsed.success) throw errors.validation("Invalid request body");
    await deleteOwnAccount({
      userId: user.id,
      accountEmail: user.email,
      sessionToken,
      password: parsed.data.password,
      confirmEmail: parsed.data.confirmEmail,
      ...adminRequestMeta(req),
    });
    const res = new NextResponse(null, { status: 204 });
    res.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(0),
    });
    return res;
  } catch (err) {
    if (
      userId &&
      err instanceof ApiError &&
      err.code === "UNAUTHORIZED" &&
      err.message !== "reauth_required"
    ) {
      recordSelfDeleteFailure(userId, bucketIp);
    }
    return jsonError(err);
  }
}
