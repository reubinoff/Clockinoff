import { randomBytes, randomUUID } from "node:crypto";

export function uuid(): string {
  return randomUUID();
}

export function tokenId(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
