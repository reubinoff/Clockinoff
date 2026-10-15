import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_AUDIT, recordAuthEvent } from "@/server/auth/auth-audit";
import {
  deleteSession,
  findSessionOwner,
  hashSessionToken,
  SESSION_COOKIE,
} from "@/server/auth/session";
import { adminRequestMeta, jsonError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const jar = await cookies();
    const sid = jar.get(SESSION_COOKIE)?.value;
    const owner = await findSessionOwner(sid);
    if (owner && sid) {
      const meta = adminRequestMeta(req);
      await recordAuthEvent({
        action: AUTH_AUDIT.logout,
        actorUserId: owner.id,
        actorEmail: owner.email,
        targets: [{ id: owner.id, email: owner.email }],
        requestId: meta.requestId,
        clientIp: meta.clientIp,
        forwardedFor: meta.forwardedFor,
        userAgent: meta.userAgent,
        sessionIdHash: hashSessionToken(sid),
      });
    }
    // Session delete only. audit_events is insert-only from this path.
    await deleteSession(sid);
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
    return jsonError(err);
  }
}
