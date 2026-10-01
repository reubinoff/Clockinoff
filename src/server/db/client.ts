import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";
import {
  buildPgPoolConfig,
  createDefaultAzurePasswordProvider,
  shouldUseAzureAdAuth,
  type PasswordProvider,
} from "./azure-ad";

type Db = NodePgDatabase<typeof schema>;

let cachedPool: Pool | null = null;
let cachedDb: Db | null = null;
let cachedUrl: string | null = null;
let cachedAzureAd = false;
let injectedPasswordProvider: PasswordProvider | null = null;

function resolveUrl(): string {
  const url =
    process.env.NODE_ENV === "test"
      ? process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL
      : process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

// Hook used by tests and ops scripts that want to swap the Azure
// credential (e.g. a fake token provider) without hitting IMDS. Must be
// called before the first `getPool()` for the current `DATABASE_URL`.
export function setPasswordProvider(provider: PasswordProvider | null): void {
  injectedPasswordProvider = provider;
}

function buildPoolConfig(url: string): PoolConfig {
  const overrides: PoolConfig = {
    max: 10,
    idleTimeoutMillis: 30_000,
  };
  const useAad = shouldUseAzureAdAuth(url);
  if (!useAad) {
    cachedAzureAd = false;
    return buildPgPoolConfig(url, { azureAdAuth: false, overrides });
  }
  cachedAzureAd = true;
  // `pg` accepts a function for `password` and invokes it on every new
  // connection, so token refreshes happen transparently as the pool
  // opens fresh clients. The provider caches the token until shortly
  // before expiry.
  const passwordProvider =
    injectedPasswordProvider ?? createDefaultAzurePasswordProvider();
  const config = buildPgPoolConfig(url, {
    azureAdAuth: true,
    passwordProvider,
    overrides,
  });
  // Safe log: proves we are on the discrete-fields AAD path and that pg
  // will see a callable password instead of an empty parsed one
  // (Clockinoff #75). No secret material is logged.
  console.log(
    "[db] azureAdAuth=true passwordProvider=%s connectionString=%s",
    typeof (config as { password?: unknown }).password,
    "connectionString" in config ? "present" : "absent",
  );
  return config;
}

export function getPool(): Pool {
  const url = resolveUrl();
  if (cachedPool && cachedUrl === url) return cachedPool;
  if (cachedPool) {
    void cachedPool.end().catch(() => {});
  }
  cachedPool = new Pool(buildPoolConfig(url));
  cachedUrl = url;
  return cachedPool;
}

export function getDb(): Db {
  const url = resolveUrl();
  if (cachedDb && cachedUrl === url) return cachedDb;
  const pool = getPool();
  cachedDb = drizzle(pool, { schema });
  return cachedDb;
}

export function isAzureAdMode(): boolean {
  return cachedAzureAd;
}

export async function closeDb(): Promise<void> {
  if (cachedPool) {
    await cachedPool.end();
    cachedPool = null;
    cachedDb = null;
    cachedUrl = null;
    cachedAzureAd = false;
  }
}

export type { Db };
export { schema };
