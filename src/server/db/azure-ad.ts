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

import { DefaultAzureCredential, type TokenCredential } from "@azure/identity";

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
}

export function createTokenPasswordProvider(
  credential: TokenCredential,
  options: TokenProviderOptions = {},
): PasswordProvider {
  const scope = options.scope ?? AZURE_POSTGRES_SCOPE;
  const now = options.now ?? Date.now;
  const buffer = options.refreshBufferMs ?? REFRESH_BUFFER_MS;

  let cached: { token: string; expiresOnTimestamp: number } | null = null;
  let inflight: Promise<string> | null = null;

  async function fetchToken(): Promise<string> {
    const result = await credential.getToken(scope);
    if (!result || !result.token) {
      throw new Error("Azure AD token acquisition returned no token");
    }
    cached = {
      token: result.token,
      expiresOnTimestamp: result.expiresOnTimestamp,
    };
    return result.token;
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
