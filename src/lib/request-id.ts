import { randomUUID } from "node:crypto";

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export function requestIdFrom(req: Request): string {
  const raw = req.headers.get("x-request-id")?.trim() ?? "";
  if (SAFE_REQUEST_ID.test(raw)) return raw;
  return randomUUID();
}
