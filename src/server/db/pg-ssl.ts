// Production Postgres TLS gate (#139).
//
// `sslmode=require` encrypts but does not verify the server certificate,
// and node-postgres / libpq may later change what `require` means. Prod
// `DATABASE_URL` (Key Vault / App Setting) should use `sslmode=verify-full`.
// Boot refuses `disable`, `no-verify`, and a missing sslmode so those
// cannot reach Azure Postgres. `require` and `verify-ca` still boot so
// the KV flip to `verify-full` is not a crash window.
//
// Loopback hosts are exempt: Nightly runs `next start` with
// NODE_ENV=production against the CI Postgres container, which has no TLS.

const REFUSED_SSLMODES = new Set(["disable", "no-verify"]);

export interface PgSslEnv {
  readonly NODE_ENV?: string;
  readonly NEXT_PHASE?: string;
  readonly DATABASE_URL?: string;
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export function assertProductionDatabaseSslMode(
  url: string | undefined,
  env: PgSslEnv = process.env,
): void {
  if (env.NEXT_PHASE === "phase-production-build") return;
  if (env.NODE_ENV !== "production") return;
  if (!url) {
    throw new Error(
      "DATABASE_URL is required in production and must set sslmode=verify-full",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      "DATABASE_URL is not a valid postgres URL; refusing to start in production",
    );
  }
  if (!/^postgres(ql)?:$/i.test(parsed.protocol)) {
    throw new Error(
      "DATABASE_URL must be a postgres URL in production (sslmode=verify-full)",
    );
  }
  if (isLoopbackHost(parsed.hostname)) return;
  const sslmode = (parsed.searchParams.get("sslmode") ?? "").trim().toLowerCase();
  if (!sslmode || REFUSED_SSLMODES.has(sslmode)) {
    throw new Error(
      "Refusing to start in production: DATABASE_URL sslmode must not be" +
        " disable, no-verify, or missing. Use sslmode=verify-full.",
    );
  }
}
