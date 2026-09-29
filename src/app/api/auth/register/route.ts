import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/server/http";
import { register } from "@/server/auth/service";
import { SESSION_COOKIE } from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await readJson<{ email: string; password: string; timezone?: string }>(req);
    const { user, session } = await register(body);
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
