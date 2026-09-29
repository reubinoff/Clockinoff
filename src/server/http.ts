import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiError, toErrorBody, errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { SESSION_COOKIE, getSessionUser, type SessionUser } from "@/server/auth/session";

export function jsonError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(toErrorBody(err), { status: err.status });
  }
  logger.exception("[api] Unhandled error", err);
  const internal = errors.internal();
  return NextResponse.json(toErrorBody(internal), { status: internal.status });
}

export async function requireUser(): Promise<SessionUser> {
  const cookie = cookies().get(SESSION_COOKIE)?.value;
  const user = await getSessionUser(cookie);
  if (!user) throw errors.unauthorized();
  return user;
}

export async function readJson<T = unknown>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw errors.validation("Invalid JSON body");
  }
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data as unknown as Record<string, unknown>, { status });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}
