import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { jsonError } from "@/server/http";
import { deleteSession, SESSION_COOKIE } from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  try {
    const jar = await cookies();
    const sid = jar.get(SESSION_COOKIE)?.value;
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
