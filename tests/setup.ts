import { afterAll, beforeAll } from "vitest";
import { runMigrations } from "@/server/db/migrate";
import { closeDb, getPool } from "@/server/db/client";

(process.env as { NODE_ENV?: string }).NODE_ENV = "test";
if (!process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL_TEST = "postgres://timely:timely@localhost:5432/timely_test";
}
if (!process.env.NEXTAUTH_SECRET) {
  process.env.NEXTAUTH_SECRET = "test-secret-test-secret-test-secret-x";
}

beforeAll(async () => {
  await runMigrations();
});

afterAll(async () => {
  await closeDb();
});

export async function truncateAll(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(
      'TRUNCATE "time_entry_tags", "time_entries", "tags", "projects", "clients", "sessions", "users" RESTART IDENTITY CASCADE',
    );
  } finally {
    client.release();
  }
}
