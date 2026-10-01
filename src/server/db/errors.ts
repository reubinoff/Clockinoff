// Drizzle 0.45+ wraps driver errors in `DrizzleQueryError` with the
// `Failed query: …` message and keeps the original error (e.g. the
// `pg` error that carries the Postgres SQLSTATE as `code`) on `.cause`.
// Earlier Drizzle versions threw the driver error directly, so services
// could read `err.code` to branch on SQLSTATEs like `23505`
// (unique_violation) or `23514` (check_violation). We walk `.cause` here
// so service-layer error mapping keeps working across the upgrade.

export function pgErrorCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}
