#!/usr/bin/env node
// Runtime-safe migration runner used by the Azure App Service startup command.
// Deliberately plain ESM JavaScript so it can run under `node` directly on the
// deployed Next.js standalone bundle, without needing `tsx`, `ts-node`, or any
// TypeScript toolchain in production.
//
// IMPORT POLICY — DO NOT RELAX (Clockinoff #75 / 2026-10-01 incident):
// This file is copied verbatim into the Azure Web App deploy bundle by
// `.github/workflows/cd.yml` and runs *before* `node server.js`. The deploy
// bundle only contains `node_modules` traced by `next build` (standalone
// output), plus a short overlay allowlist (argon2, pdfkit/fontkit,
// @react-pdf/*). Any bare import added here must be one of:
//
//   * A `node:` builtin, OR
//   * A package tracing/overlay guarantees is on disk at startup. The
//     current guaranteed set is `pg` and `@azure/identity`.
//
// Adding anything else (even a transitive like `pg-connection-string`) will
// crash-loop App Service with `ERR_MODULE_NOT_FOUND` the moment the
// migrate step runs, and /login will 503 until it is reverted. The 2026-10-01
// 503 incident was caused by a static import of pg-connection-string here:
// it is a transitive of pg that `next build`'s tracer did not pull into the
// standalone output. A regression test in
// `tests/server/migrate-imports.test.ts` enforces this allowlist.
//
// Entra / Managed Identity support (#75): when `DATABASE_URL` has no
// password component, or `PG_AZURE_AD_AUTH` is explicitly on, the pool
// password becomes a function that returns an AAD access token for
// `https://ossrdbms-aad.database.windows.net/.default`. Falls back to
// the static password path if the URL still carries a password or the
// flag is `0`/`false`.
//
// MIGRATOR IDENTITY (#75): when AAD mode is on, migrations authenticate
// as the migrator user-assigned identity (`PG_MIGRATOR_CLIENT_ID` →
// `ManagedIdentityCredential`), not the app identity. The Postgres role
// name comes from `PG_MIGRATOR_PG_USER`, which is required in production
// so the token's principal matches that role. Non-production may omit it
// and fall back to `DEFAULT_MIGRATOR_PG_USER`. The runtime pool
// (`src/server/db/client.ts`) keeps the URL user and DefaultAzureCredential.
//
// Production also refuses `DATABASE_URL` sslmodes `disable`, `no-verify`,
// and missing (loopback exempt). Prod should use `sslmode=verify-full`.
// Mirror of `src/server/db/pg-ssl.ts`.
//
// This file mirrors `src/server/db/azure-ad.ts` on purpose: both the
// runtime and the migration runner must build the AAD pool config with
// discrete fields (never `connectionString` + `password` together), and
// both must hard-abort if the credential returns an empty/missing token.
// See the TS helper for the full rationale.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS "__migrations" (
  "name" text PRIMARY KEY,
  "applied_at" timestamptz NOT NULL DEFAULT now()
);
`;

const AZURE_POSTGRES_SCOPE =
  "https://ossrdbms-aad.database.windows.net/.default";
const REFRESH_BUFFER_MS = 5 * 60_000;
const PG_MIGRATOR_CLIENT_ID_ENV = "PG_MIGRATOR_CLIENT_ID";
const PG_MIGRATOR_PG_USER_ENV = "PG_MIGRATOR_PG_USER";
const DEFAULT_MIGRATOR_PG_USER = "uami-clockinoff-migrator";

function resolveMigrationsDir() {
  if (process.env.MIGRATIONS_DIR) {
    return path.resolve(process.env.MIGRATIONS_DIR);
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "drizzle");
}

function resolveDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

function isPasswordlessPostgresUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!/^postgres(ql)?:$/i.test(parsed.protocol)) return false;
  if (parsed.username === "") return false;
  return parsed.password === "";
}

function shouldUseAzureAdAuth(url) {
  const raw = (process.env.PG_AZURE_AD_AUTH ?? "").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") {
    return false;
  }
  if (raw === "1" || raw === "true" || raw === "on" || raw === "yes") {
    return true;
  }
  return isPasswordlessPostgresUrl(url);
}

// Minimal, dependency-free parser for the subset of PostgreSQL connection
// strings Clockinoff emits: `postgres[ql]://user[:pw]@host[:port]/db?sslmode=...`.
// Returns `pg`-compatible discrete fields. We intentionally do NOT import
// pg-connection-string here — see the import policy at the top of this file.
function parsePostgresUrl(url) {
  const parsed = new URL(url);
  const user = parsed.username ? decodeURIComponent(parsed.username) : undefined;
  const host = parsed.hostname ? decodeURIComponent(parsed.hostname) : undefined;
  const portRaw = parsed.port;
  const port =
    portRaw !== "" ? Number.parseInt(portRaw, 10) : undefined;
  const dbPath = parsed.pathname.startsWith("/")
    ? parsed.pathname.slice(1)
    : parsed.pathname;
  const database = dbPath ? decodeURIComponent(dbPath) : undefined;
  const sslmode = parsed.searchParams.get("sslmode");
  // Match pg-connection-string's SSL semantics for our deployed modes:
  // `disable` -> false; anything requiring TLS -> truthy object so pg
  // enables TLS. We never set sslcert/sslkey/sslrootcert from the URL.
  let ssl;
  if (sslmode === "disable") {
    ssl = false;
  } else if (sslmode === "no-verify") {
    ssl = { rejectUnauthorized: false };
  } else if (
    sslmode === "prefer" ||
    sslmode === "require" ||
    sslmode === "verify-ca" ||
    sslmode === "verify-full"
  ) {
    ssl = {};
  }
  const application_name =
    parsed.searchParams.get("application_name") ?? undefined;
  return {
    user,
    host,
    ...(port != null && !Number.isNaN(port) ? { port } : {}),
    ...(database != null ? { database } : {}),
    ...(ssl !== undefined ? { ssl } : {}),
    ...(application_name != null ? { application_name } : {}),
  };
}

function resolveMigratorClientId(env = process.env) {
  const raw = env[PG_MIGRATOR_CLIENT_ID_ENV];
  const clientId = typeof raw === "string" ? raw.trim() : "";
  if (!clientId) {
    throw new Error(
      PG_MIGRATOR_CLIENT_ID_ENV +
        " is required when PG_AZURE_AD_AUTH is enabled: startup migrations" +
        " must authenticate as the migrator user-assigned managed identity" +
        " (DDL-capable), not the App Service system-assigned MI (DML-only)." +
        " See Clockinoff #75.",
    );
  }
  return clientId;
}

// In AAD mode the Postgres `user` must be the migrator role, not the role
// embedded in the passwordless URL. Production requires
// `PG_MIGRATOR_PG_USER` (no hardcoded default). Other environments fall
// back to `DEFAULT_MIGRATOR_PG_USER`.
function isProductionEnv(env) {
  return String(env.NODE_ENV ?? "").trim() === "production";
}

function resolveMigratorPgUser(env = process.env) {
  const raw = env[PG_MIGRATOR_PG_USER_ENV];
  const explicit = typeof raw === "string" ? raw.trim() : "";
  if (isProductionEnv(env)) {
    if (!explicit) {
      throw new Error(
        PG_MIGRATOR_PG_USER_ENV +
          " is required in production when Azure AD auth is enabled." +
          " Set it to the migrator Postgres role. There is no hardcoded" +
          " default on the production path.",
      );
    }
    return explicit;
  }
  const user = explicit || DEFAULT_MIGRATOR_PG_USER;
  if (!user) {
    throw new Error(
      PG_MIGRATOR_PG_USER_ENV +
        " resolved to an empty value under PG_AZURE_AD_AUTH; the migrate" +
        " step must set the Postgres user to the migrator Entra role.",
    );
  }
  return user;
}

const REFUSED_SSLMODES = new Set(["disable", "no-verify"]);

function isLoopbackHost(hostname) {
  const host = String(hostname ?? "")
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

// Mirror of src/server/db/pg-ssl.ts. Keep the refused modes in sync.
function assertProductionDatabaseSslMode(url, env = process.env) {
  if (env.NEXT_PHASE === "phase-production-build") return;
  if (env.NODE_ENV !== "production") return;
  if (!url) {
    throw new Error(
      "DATABASE_URL is required in production and must set sslmode=verify-full",
    );
  }
  let parsed;
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

async function createAzurePasswordProvider(credentialOverride) {
  // In AAD mode the migrate step binds to the migrator UAMI's clientId via
  // ManagedIdentityCredential. Tests may inject a fake credential to avoid
  // hitting IMDS. See the migrator identity comment at the top.
  let credential;
  if (credentialOverride) {
    credential = credentialOverride;
  } else {
    const clientId = resolveMigratorClientId();
    const { ManagedIdentityCredential } = await import("@azure/identity");
    credential = new ManagedIdentityCredential({ clientId });
  }
  let cached = null;
  let inflight = null;

  async function fetchToken() {
    const result = await credential.getToken(AZURE_POSTGRES_SCOPE);
    // Shaul's gate (Clockinoff #75): hard-abort before pg attempts to
    // connect so we never resend the empty-password payload that caused
    // the 503 crash loop. See src/server/db/azure-ad.ts for the
    // server-side mirror of this guard.
    const rawToken = result ? result.token : undefined;
    const tokenLen = typeof rawToken === "string" ? rawToken.length : 0;
    if (!result || typeof rawToken !== "string" || tokenLen === 0) {
      throw new Error(
        "Azure AD token acquisition returned an empty or missing token;" +
          " refusing to connect to Postgres with an empty password",
      );
    }
    cached = {
      token: rawToken,
      expiresOnTimestamp: result.expiresOnTimestamp,
    };
    console.log(
      "[migrate] azureAdToken acquired length=%d expiresInSec=%d",
      tokenLen,
      Math.max(
        0,
        Math.round((result.expiresOnTimestamp - Date.now()) / 1000),
      ),
    );
    return rawToken;
  }

  return async function getPassword() {
    if (cached && cached.expiresOnTimestamp - Date.now() > REFRESH_BUFFER_MS) {
      return cached.token;
    }
    if (!inflight) {
      inflight = fetchToken().finally(() => {
        inflight = null;
      });
    }
    return inflight;
  };
}

async function buildPoolConfig(url, options = {}) {
  const overrides = { max: 1 };
  if (!shouldUseAzureAdAuth(url)) {
    return { connectionString: url, ...overrides };
  }
  const password =
    options.passwordProvider ??
    (await createAzurePasswordProvider(options.credential));
  // AAD mode: build discrete fields with our own URL parser (no
  // pg-connection-string import — see policy at top of file) and attach
  // the token provider. We never pass `connectionString` + `password`
  // together, so pg's ConnectionParameters Object.assign cannot clobber
  // the callback with an empty parsed password.
  const discrete = parsePostgresUrl(url);
  // Override the URL user with the migrator role (see header comment).
  const migratorUser =
    options.pgUser !== undefined ? options.pgUser : resolveMigratorPgUser();
  const config = {
    ...discrete,
    password,
    ...overrides,
  };
  if ("connectionString" in config) {
    delete config.connectionString;
  }
  config.password = password;
  config.user = migratorUser;
  console.log(
    "[migrate] azureAdAuth=true passwordProvider=%s connectionString=%s user=%s",
    typeof config.password,
    "connectionString" in config ? "present" : "absent",
    config.user,
  );
  return config;
}

async function runMigrations() {
  const dir = resolveMigrationsDir();
  const url = resolveDatabaseUrl();
  assertProductionDatabaseSslMode(url);
  const pool = new Pool(await buildPoolConfig(url));
  const applied = [];
  const client = await pool.connect();
  try {
    await client.query(MIGRATIONS_TABLE);
    const files = (await readdir(dir))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const file of files) {
      const { rows } = await client.query(
        'SELECT name FROM "__migrations" WHERE name = $1',
        [file],
      );
      if (rows.length > 0) continue;
      const sql = await readFile(path.join(dir, file), "utf8");
      await client.query("BEGIN");
      try {
        const statements = sql
          .split("--> statement-breakpoint")
          .map((s) => s.trim())
          .filter(Boolean);
        for (const statement of statements) {
          await client.query(statement);
        }
        await client.query(
          'INSERT INTO "__migrations" (name) VALUES ($1)',
          [file],
        );
        await client.query("COMMIT");
        applied.push(file);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
  return applied;
}

async function main() {
  const applied = await runMigrations();
  if (applied.length === 0) {
    console.log("No migrations to apply.");
  } else {
    console.log(`Applied migrations:\n  - ${applied.join("\n  - ")}`);
  }
}

// Export the pure helpers so vitest can exercise the migrator-vs-runtime
// credential split without spawning a child `node` process. The CD deploy
// still runs this file as `node scripts/migrate.mjs`, which hits the
// bottom-of-file entry point below.
export {
  AZURE_POSTGRES_SCOPE,
  DEFAULT_MIGRATOR_PG_USER,
  PG_MIGRATOR_CLIENT_ID_ENV,
  PG_MIGRATOR_PG_USER_ENV,
  assertProductionDatabaseSslMode,
  buildPoolConfig,
  createAzurePasswordProvider,
  isPasswordlessPostgresUrl,
  parsePostgresUrl,
  resolveMigratorClientId,
  resolveMigratorPgUser,
  shouldUseAzureAdAuth,
};

const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
