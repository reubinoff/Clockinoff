import { errors } from "@/lib/errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

// Guard for route-boundary path params. Reject malformed UUIDs before they
// reach the DB layer (which otherwise raises 22P02 and surfaces as a 500).
export function requireUuid(value: unknown, field = "id"): string {
  if (!isUuid(value)) {
    throw errors.validation(`Invalid UUID for ${field}`);
  }
  return value;
}

// Same guard, but for optional query-string filters. Missing / empty values
// are passed through as null so callers can keep their "no filter" branch.
export function optionalUuid(value: unknown, field = "id"): string | null {
  if (value === null || value === undefined || value === "") return null;
  return requireUuid(value, field);
}
