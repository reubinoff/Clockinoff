import { afterAll, beforeAll, beforeEach } from "vitest";
import { runMigrations } from "@/server/db/migrate";
import { closeDb, getPool } from "@/server/db/client";

(process.env as { NODE_ENV?: string }).NODE_ENV = "test";
if (!process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL_TEST = "postgres://timely:timely@localhost:5432/timely_test";
}
if (!process.env.NEXTAUTH_SECRET) {
  process.env.NEXTAUTH_SECRET = "test-secret-test-secret-test-secret-x";
}
if (!process.env.OAUTH_STATE_SECRET) {
  process.env.OAUTH_STATE_SECRET = "test-oauth-state-secret-test-oauth-x";
}

async function ensureAppRole(): Promise<void> {
  const client = await getPool().connect();
  try {
    const { rows } = await client.query(
      "SELECT 1 FROM pg_roles WHERE rolname = 'clockinoff-prod'",
    );
    if (rows.length === 0) {
      await client.query('CREATE ROLE "clockinoff-prod" NOLOGIN');
    }
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  await ensureAppRole();
  await runMigrations();
});

beforeEach(() => {
  delete process.env.ADMIN_EMAILS;
});

afterAll(async () => {
  try {
    const { sweepRememberedQaUsers } = await import("./qa-passwords");
    await sweepRememberedQaUsers();
  } finally {
    await closeDb();
  }
});

export async function truncateAll(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(
      'TRUNCATE "audit_events", "time_entry_tags", "time_entries", "tags", "projects", "clients", "sessions", "users" RESTART IDENTITY CASCADE',
    );
  } finally {
    client.release();
  }
}
