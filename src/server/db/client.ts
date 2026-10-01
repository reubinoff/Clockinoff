import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";
import {
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
  const base: PoolConfig = {
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30_000,
  };
  if (!shouldUseAzureAdAuth(url)) {
    cachedAzureAd = false;
    return base;
  }
  cachedAzureAd = true;
  // `pg` accepts a function for `password` and invokes it on every new
  // connection, so token refreshes happen transparently as the pool
  // opens fresh clients. The provider caches the token until shortly
  // before expiry.
  const provider =
    injectedPasswordProvider ?? createDefaultAzurePasswordProvider();
  return { ...base, password: provider };
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
