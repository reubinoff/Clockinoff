#!/usr/bin/env node
// Runtime-safe migration runner used by the Azure App Service startup command.
// Deliberately plain ESM JavaScript so it can run under `node` directly on the
// deployed Next.js standalone bundle, without needing `tsx`, `ts-node`, or any
// TypeScript toolchain in production. It depends on `pg` and (when AAD
// mode is on) `@azure/identity`, both of which are production dependencies
// and therefore always present in the standalone `node_modules`.
//
// Entra / Managed Identity support (#75 phase 1): when `DATABASE_URL`
// has no password component, or `PG_AZURE_AD_AUTH` is explicitly on, the
// pool password becomes a function that returns an AAD access token for
// `https://ossrdbms-aad.database.windows.net/.default`. Falls back to
// the static password path if the URL still carries a password or the
// flag is `0`/`false`.
//
// --- Clockinoff #75 production fix (do not relax) ---
// This file mirrors `src/server/db/azure-ad.ts` on purpose: the CD
// workflow only copies `scripts/migrate.mjs` into the standalone deploy
// bundle, so the migration runner must stay self-contained. The guard
// rails below are the same ones baked into the TS helper:
//
//   1. In AAD mode we never pass `connectionString` and `password`
//      together — pg's ConnectionParameters does
//      `Object.assign({}, config, parse(connectionString))`, and a
//      passwordless URL parses as `password: ''`, which silently
//      overwrites the token-provider callback. The 2026-10-01 cutover
//      crash-looped migrate with `28P01 Password returned by client is
//      empty` because of this. Discrete fields keep the provider.
//   2. Shaul's gate: the token provider hard-aborts before pg opens a
//      socket when the credential returns no token, a non-string token,
//      or an empty-string token (length === 0). We never send an empty
//      password.
//   3. Safe log reports token length + TTL only — never the token.
//
// --- Clockinoff hotfix (tip 0eb44e6 → production 503) ---
// This script may ONLY import `pg`, `@azure/identity`, and `node:*`
// builtins. The CD workflow copies the file verbatim into the Next.js
// standalone deploy bundle (see .github/workflows/cd.yml) and that bundle
// only contains dependencies traced from `src/`, plus the belt-and-braces
// re-copies listed in cd.yml. Importing anything else — most recently
// `pg-connection-string` — produces `ERR_MODULE_NOT_FOUND` at startup,
// which crash-loops migrate and blocks every HTTP request with a 503.
// `tests/scripts/migrate-imports.test.ts` enforces this allowlist.

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

async function createAzurePasswordProvider() {
  const { DefaultAzureCredential } = await import("@azure/identity");
  const credential = new DefaultAzureCredential();
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

// Parse a Postgres URL into pg's discrete `PoolConfig` fields using
// WHATWG `URL`. Deliberately avoids `pg-connection-string` so this
// script can run against the standalone deploy `node_modules`, which
// only contains dependencies traced from `src/`. See the header comment.
function parsePostgresUrlFields(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
  if (!/^postgres(ql)?:$/i.test(parsed.protocol)) {
    throw new Error(
      "DATABASE_URL protocol must be postgres: or postgresql:, got " +
        parsed.protocol,
    );
  }
  const fields = {};
  if (parsed.username !== "") {
    fields.user = decodeURIComponent(parsed.username);
  }
  if (parsed.hostname !== "") {
    fields.host = decodeURIComponent(parsed.hostname);
  }
  if (parsed.port !== "") {
    const port = Number.parseInt(parsed.port, 10);
    if (!Number.isNaN(port)) fields.port = port;
  }
  if (parsed.pathname && parsed.pathname !== "/") {
    const db = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    if (db) fields.database = db;
  }
  const sslmode = (parsed.searchParams.get("sslmode") ?? "").toLowerCase();
  switch (sslmode) {
    case "require":
    case "verify-ca":
    case "verify-full":
      fields.ssl = {};
      break;
    case "prefer":
    case "allow":
      fields.ssl = { rejectUnauthorized: false };
      break;
    case "disable":
      fields.ssl = false;
      break;
    default:
      break;
  }
  return fields;
}

async function buildPoolConfig(url) {
  const overrides = { max: 1 };
  if (!shouldUseAzureAdAuth(url)) {
    return { connectionString: url, ...overrides };
  }
  const password = await createAzurePasswordProvider();
  // Discrete fields: never pass `connectionString` + `password` together
  // (see file header). We parse the URL ourselves with `node:url` so this
  // script has no runtime dependency on `pg-connection-string`.
  const config = {
    ...parsePostgresUrlFields(url),
    password,
    ...overrides,
  };
  if ("connectionString" in config) {
    delete config.connectionString;
  }
  config.password = password;
  console.log(
    "[migrate] azureAdAuth=true passwordProvider=%s connectionString=%s",
    typeof config.password,
    "connectionString" in config ? "present" : "absent",
  );
  return config;
}

async function runMigrations() {
  const dir = resolveMigrationsDir();
  const url = resolveDatabaseUrl();
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
