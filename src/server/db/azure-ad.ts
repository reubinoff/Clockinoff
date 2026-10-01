// Azure AD (Entra) token-based authentication for Azure Postgres Flexible
// Server. Phase 1 of #75: makes the app able to swap its static
// `DATABASE_URL` password for a managed-identity-sourced AAD access token
// *without* changing any Azure infra. See AGENTS.md §1 for scope.
//
// Modes
//   - Static password (default / rollback): `DATABASE_URL` has a password
//     component, or `PG_AZURE_AD_AUTH` is explicitly `0`/`false`. The pool
//     is built from the connection string as before.
//   - Token mode: `DATABASE_URL` is passwordless (e.g.
//     `postgresql://clockinoff-prod@host:5432/db?sslmode=require`), or
//     `PG_AZURE_AD_AUTH` is `1`/`true`. We mint a short-lived access token
//     for the `https://ossrdbms-aad.database.windows.net/.default` scope
//     via `DefaultAzureCredential` and feed it to `pg` as the password.
//
// `pg` 8.x supports `password` as `string | () => string | Promise<string>`
// at the Client/Pool config level and invokes the callback for every new
// connection the pool opens, so we can refresh the token transparently
// without recreating the pool. We cache the token until it is close to
// expiry so steady-state connection churn does not spam the IMDS endpoint.
//
// --- Clockinoff #75 production fix (do not relax) ---
// On the 2026-10-01 passwordless cutover the pool was built as
// `{ connectionString, password: tokenProvider }`. pg 8.x's
// ConnectionParameters does roughly
//
//   Object.assign({}, config, parse(config.connectionString))
//
// and `parse(passwordlessUrl)` returns `password: ''`, which silently
// *overwrites* the token-provider callback. The client sent an empty
// password, Azure Postgres AAD rejected with
// `28P01 Password returned by client is empty` (pgaadauth_auth.c /
// recv_access_token), the startup migration crash-looped, and the Web App
// 503'd until rollback.
//
// Guard rails baked in below:
//   1. `buildPgPoolConfig` is the single pool-config constructor. In AAD
//      mode it parses the URL once, drops the parsed (empty) password, and
//      returns a discrete-field PoolConfig with the provider attached — it
//      never passes `connectionString` and `password` together.
//   2. Shaul's gate: the token provider hard-aborts before pg opens a
//      socket when the credential returns no token or an empty-string
//      token (token.length === 0). We never ship an empty password.
//   3. The provider logs the token length + TTL only — never the token.

import {
  DefaultAzureCredential,
  type TokenCredential,
} from "@azure/identity";
import type { PoolConfig } from "pg";
import { parse as parseConnectionString } from "pg-connection-string";

export const AZURE_POSTGRES_SCOPE =
  "https://ossrdbms-aad.database.windows.net/.default";

const REFRESH_BUFFER_MS = 5 * 60_000;

export function isPasswordlessPostgresUrl(url: string | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!/^postgres(ql)?:$/i.test(parsed.protocol)) return false;
  if (parsed.username === "") return false;
  return parsed.password === "";
}

export type AzureAdAuthEnv = { readonly [key: string]: string | undefined };

export function shouldUseAzureAdAuth(
  url: string | undefined,
  env: AzureAdAuthEnv = process.env as AzureAdAuthEnv,
): boolean {
  const raw = env.PG_AZURE_AD_AUTH?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") {
    return false;
  }
  if (raw === "1" || raw === "true" || raw === "on" || raw === "yes") {
    return true;
  }
  return isPasswordlessPostgresUrl(url);
}

export type PasswordProvider = () => Promise<string>;

export interface TokenProviderOptions {
  scope?: string;
  now?: () => number;
  refreshBufferMs?: number;
  // Optional structured sink for the safe log; defaults to `console.log`.
  // Tests use this to assert the log never contains the token.
  log?: (fmt: string, ...args: unknown[]) => void;
}

export function createTokenPasswordProvider(
  credential: TokenCredential,
  options: TokenProviderOptions = {},
): PasswordProvider {
  const scope = options.scope ?? AZURE_POSTGRES_SCOPE;
  const now = options.now ?? Date.now;
  const buffer = options.refreshBufferMs ?? REFRESH_BUFFER_MS;
  const log = options.log ?? ((...args: unknown[]) => console.log(...args as [string, ...unknown[]]));

  let cached: { token: string; expiresOnTimestamp: number } | null = null;
  let inflight: Promise<string> | null = null;

  async function fetchToken(): Promise<string> {
    const result = await credential.getToken(scope);
    // Shaul's gate (Clockinoff #75): hard-abort before the pg client tries
    // to connect. If the credential handed us no token, a non-string
    // token, or an empty-string token (length === 0), sending it would
    // reproduce the exact `28P01 Password returned by client is empty`
    // crash loop the discrete-fields fix below is meant to prevent. Fail
    // loud instead so App Service surfaces the real cause (missing MI
    // binding, denied scope, stale KV ref, …).
    const rawToken: unknown = result?.token;
    const tokenLen = typeof rawToken === "string" ? rawToken.length : 0;
    if (!result || typeof rawToken !== "string" || tokenLen === 0) {
      throw new Error(
        "Azure AD token acquisition returned an empty or missing token;" +
          " refusing to connect to Postgres with an empty password",
      );
    }
    const expiresOnTimestamp = result.expiresOnTimestamp;
    cached = { token: rawToken, expiresOnTimestamp };
    // Safe log: length + TTL only, never any part of the token.
    log(
      "[db] azureAdToken acquired length=%d expiresInSec=%d",
      tokenLen,
      Math.max(0, Math.round((expiresOnTimestamp - now()) / 1000)),
    );
    return rawToken;
  }

  return async function getPassword(): Promise<string> {
    if (cached && cached.expiresOnTimestamp - now() > buffer) {
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

export function createDefaultAzurePasswordProvider(
  options: TokenProviderOptions = {},
): PasswordProvider {
  return createTokenPasswordProvider(new DefaultAzureCredential(), options);
}

export interface BuildPoolConfigOptions {
  // Base PoolConfig keys the caller wants layered on top (max,
  // idleTimeoutMillis, application_name, …). Deliberately typed as
  // PoolConfig so TS catches typos at call sites.
  overrides?: PoolConfig;
  // Explicit AAD toggle. When omitted, we auto-detect via
  // `shouldUseAzureAdAuth(url)`.
  azureAdAuth?: boolean;
  // AAD-mode password provider. Required when AAD mode is on.
  passwordProvider?: PasswordProvider;
}

// Single source of truth for turning a `DATABASE_URL` into a pg PoolConfig.
// In password mode we keep the current `{ connectionString }` shape so
// nothing changes for the rollback path. In AAD mode we parse the URL
// ourselves, drop the parsed (empty) password, and return discrete fields
// plus the provider — pg never sees `connectionString` and `password`
// together, so its Object.assign-based merge cannot clobber the callback.
export function buildPgPoolConfig(
  url: string,
  opts: BuildPoolConfigOptions = {},
): PoolConfig {
  const overrides = opts.overrides ?? {};
  const useAad =
    typeof opts.azureAdAuth === "boolean"
      ? opts.azureAdAuth
      : shouldUseAzureAdAuth(url);
  if (!useAad) {
    return { connectionString: url, ...overrides };
  }
  if (typeof opts.passwordProvider !== "function") {
    throw new Error(
      "buildPgPoolConfig: passwordProvider is required when azureAdAuth is enabled",
    );
  }
  const parsed = parseConnectionString(url);
  // Drop the parsed password: on a passwordless Azure Postgres URL it is
  // `''`, and surviving into the final config would overwrite
  // `password: provider` via pg's Object.assign-based merge.
  const { password: _parsedPassword, port: parsedPort, ...rest } = parsed;
  void _parsedPassword;
  const port =
    parsedPort != null && parsedPort !== ""
      ? Number.parseInt(String(parsedPort), 10)
      : undefined;
  const base: PoolConfig = {
    ...(rest as Record<string, unknown>),
    ...(port != null && !Number.isNaN(port) ? { port } : {}),
    password: opts.passwordProvider,
  } as PoolConfig;
  const final: PoolConfig = { ...base, ...overrides };
  // Belt + braces: callers must not sneak a connectionString through
  // overrides in AAD mode. If they do, strip it so pg cannot re-parse it
  // and clobber the password provider.
  if ("connectionString" in final) {
    delete (final as { connectionString?: string }).connectionString;
  }
  // Keep the provider authoritative even if an override tried to set a
  // literal password.
  (final as { password: PasswordProvider }).password = opts.passwordProvider;
  return final;
}
