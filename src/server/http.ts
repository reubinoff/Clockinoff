import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { attachAdminActor } from "@/lib/admin-actor";
import { clientIpForRecord, forwardedForRaw, socketAddressFromRequest } from "@/lib/client-ip";
import { ApiError, toErrorBody, errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { requestIdFrom } from "@/lib/request-id";
import { capAuditUserAgent } from "@/lib/audit-user-agent";
import { readRequestCookie } from "@/lib/oauth-next-path";
import {
  SESSION_COOKIE,
  getSessionUser,
  hashSessionToken,
  type SessionUser,
} from "@/server/auth/session";

export function jsonError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    const res = NextResponse.json(toErrorBody(err), { status: err.status });
    // Lift any ApiError-attached headers (e.g. `Retry-After` on 429) onto
    // the response so callers see them without each route handler having
    // to remember to.
    if (err.headers) {
      for (const [name, value] of Object.entries(err.headers)) {
        res.headers.set(name, value);
      }
    }
    return res;
  }
  logger.exception("[api] Unhandled error", err);
  const internal = errors.internal();
  return NextResponse.json(toErrorBody(internal), { status: internal.status });
}

export async function requireUser(): Promise<SessionUser> {
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE)?.value;
  const user = await getSessionUser(cookie);
  if (!user) throw errors.unauthorized();
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw errors.forbidden();
  attachAdminActor(user.id);
  return user;
}

function sessionIdHashForAudit(req: Request): string | null {
  const token = readRequestCookie(req, SESSION_COOKIE);
  if (!token) return null;
  return hashSessionToken(token);
}

export function adminRequestMeta(req: Request): {
  requestId: string;
  clientIp: string | null;
  forwardedFor: string | null;
  userAgent: string | null;
  sessionIdHash: string | null;
} {
  return {
    requestId: requestIdFrom(req),
    clientIp: clientIpForRecord(req.headers, socketAddressFromRequest(req)),
    forwardedFor: forwardedForRaw(req.headers),
    userAgent: capAuditUserAgent(req.headers.get("user-agent")),
    sessionIdHash: sessionIdHashForAudit(req),
  };
}

// Clockinoff has no uploads. 64 KiB is well above any legitimate JSON
// payload (login, register, entry writes) and far below Next's 10 MB
// proxy buffer default (#151).
export const MAX_JSON_BODY_BYTES = 64 * 1024;

function declaredContentLength(req: Request): number | null {
  const raw = req.headers.get("content-length");
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

async function readBodyCapped(req: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = declaredContentLength(req);
  if (declared != null && declared > maxBytes) {
    void req.body?.cancel();
    throw errors.payloadTooLarge();
  }

  const stream = req.body;
  if (!stream) throw errors.validation("Invalid JSON body");

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw errors.payloadTooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function readJson<T = unknown>(req: Request): Promise<T> {
  const bytes = await readBodyCapped(req, MAX_JSON_BODY_BYTES);
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
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
