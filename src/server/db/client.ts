import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

let cachedPool: Pool | null = null;
let cachedDb: Db | null = null;
let cachedUrl: string | null = null;

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

export function getPool(): Pool {
  const url = resolveUrl();
  if (cachedPool && cachedUrl === url) return cachedPool;
  if (cachedPool) {
    void cachedPool.end().catch(() => {});
  }
  const config: PoolConfig = {
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30_000,
  };
  cachedPool = new Pool(config);
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

export async function closeDb(): Promise<void> {
  if (cachedPool) {
    await cachedPool.end();
    cachedPool = null;
    cachedDb = null;
    cachedUrl = null;
  }
}

export type { Db };
export { schema };
