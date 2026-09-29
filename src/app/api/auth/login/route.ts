import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/server/http";
import { login } from "@/server/auth/service";
import { SESSION_COOKIE } from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await readJson<{ email: string; password: string }>(req);
    const { user, session } = await login(body);
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
    return jsonError(err);
  }
}
