import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool } from "@/server/db/client";
import { truncateAll } from "../setup";

import * as migrateScriptRaw from "../../scripts/migrate.mjs";

const { Client } = pg;

interface PurgeResult {
  deleted: number;
  failed: boolean;
  skipped: boolean;
}

interface QueryClient {
  query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: unknown[]; rowCount?: number | null }>;
}

interface MigratePurgeExports {
  readonly AUDIT_PURGE_BATCH: number;
  readonly AUDIT_PURGE_BUDGET_MS: number;
  readonly AUDIT_PURGE_DELETE_SQL: string;
  readonly AUDIT_PURGE_INSERT_SQL: string;
  readonly AUDIT_PURGE_STALE_SQL: string;
  executeAuditPurge(client: QueryClient): Promise<PurgeResult>;
  startupPurge(client: QueryClient): Promise<PurgeResult>;
  warnIfAuditPurgeStale(client: {
    query(sql: string, params?: unknown[]): Promise<{ rows: Array<{ stale?: boolean }> }>;
  }): Promise<void>;
  runStartupAuditPurge(): Promise<void>;
}

const migrate = migrateScriptRaw as unknown as MigratePurgeExports;

const MIGRATION = path.resolve(
  __dirname,
  "..",
  "..",
  "drizzle",
  "0011_audit_events_retention.sql",
);
const MIGRATE_SRC = path.resolve(__dirname, "..", "..", "scripts", "migrate.mjs");

const DELETE_SQL =
  "DELETE FROM audit_events WHERE id IN (" +
  "SELECT id FROM audit_events " +
  "WHERE created_at < now() - interval '1 year' " +
  "ORDER BY id LIMIT 10000)";

// Non-superuser stand-in for the production migrator. NOINHERIT so
// membership in audit_purge does not itself grant DELETE. A purge that
// skips SET LOCAL ROLE then fails the 366-day test.
const MIG_ROLE = "audit_migrator_test";
const MIG_PASSWORD = "audit-migrator-test";

const OLD_EMAIL = "old-366@example.com";
const YOUNG_EMAIL = "young-364@example.com";

function migrationRoleSql(): string {
  const sql = readFileSync(MIGRATION, "utf8");
  const block = sql
    .split("--> statement-breakpoint")
    .map((part) => part.trim())
    .find((part) => part.includes("CREATE ROLE audit_purge NOLOGIN"));
  if (!block) throw new Error("audit_purge block missing from 0011");
  return block;
}

function migratorUrl(): string {
  const raw =
    process.env.DATABASE_URL_TEST ??
    "postgres://timely:timely@localhost:5432/timely_test";
  const url = new URL(raw);
  url.username = MIG_ROLE;
  url.password = MIG_PASSWORD;
  return url.toString();
}

async function insertAged(email: string, days: number) {
  const client = await getPool().connect();
  try {
    await client.query(
      `INSERT INTO audit_events (
         actor_email, action, targets, request_id, status, method, created_at
       ) VALUES (
         $1, 'auth.login_failure', '[]'::jsonb, $2, 'completed', 'password',
         now() - ($3::int * interval '1 day')
       )`,
      [email, `req-${days}`, days],
    );
  } finally {
    client.release();
  }
}

async function withTestMigrator(
  fn: (client: QueryClient & { query: pg.Client["query"] }) => Promise<void>,
): Promise<void> {
  const admin = await getPool().connect();
  const migrator = new Client({ connectionString: migratorUrl() });
  try {
    await admin.query(`GRANT SELECT, INSERT ON TABLE audit_events TO ${MIG_ROLE}`);
    await admin.query(`GRANT audit_purge TO ${MIG_ROLE}`);
    await migrator.connect();
    const who = await migrator.query<{ name: string; rolsuper: boolean }>(
      `SELECT current_user AS name, rolsuper
         FROM pg_roles WHERE rolname = current_user`,
    );
    expect(who.rows[0]?.name).toBe(MIG_ROLE);
    expect(who.rows[0]?.rolsuper).toBe(false);
    await fn(migrator);
  } finally {
    await migrator.end().catch(() => {});
    await admin.query(`REVOKE audit_purge FROM ${MIG_ROLE}`);
    await admin.query(`REVOKE SELECT, INSERT ON TABLE audit_events FROM ${MIG_ROLE}`);
    admin.release();
  }
}

describe("audit_events retention (#237, #242)", () => {
  beforeAll(async () => {
    const client = await getPool().connect();
    try {
      await client.query(
        `DO $$ BEGIN
           IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${MIG_ROLE}') THEN
             CREATE ROLE ${MIG_ROLE} LOGIN PASSWORD '${MIG_PASSWORD}'
               NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
           END IF;
         END $$`,
      );
      await client.query(
        `ALTER ROLE ${MIG_ROLE} WITH LOGIN PASSWORD '${MIG_PASSWORD}'
           NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`,
      );
    } finally {
      client.release();
    }
  });

  beforeEach(async () => {
    await truncateAll();
    const client = await getPool().connect();
    try {
      await client.query(`REVOKE audit_purge FROM ${MIG_ROLE}`);
    } catch {
      // Membership may already be absent.
    } finally {
      client.release();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deletes with the hardcoded interval '1 year'", () => {
    expect(migrate.AUDIT_PURGE_BATCH).toBe(10000);
    expect(migrate.AUDIT_PURGE_BUDGET_MS).toBe(10_000);
    expect(migrate.AUDIT_PURGE_DELETE_SQL).toBe(DELETE_SQL);
    expect(migrate.AUDIT_PURGE_DELETE_SQL).toContain("interval '1 year'");
    expect(migrate.AUDIT_PURGE_DELETE_SQL).not.toMatch(
      /current_setting|process\.env|\$\{|AUDIT_/,
    );

    const migration = readFileSync(MIGRATION, "utf8");
    const executable = migration
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(executable).not.toMatch(/CONCURRENTLY/i);
    expect(executable).toContain("audit_purge does not exist");
    expect(executable).toContain("Pre-create it out of band");
    expect(executable).toContain("must be NOLOGIN");
    expect(executable).toContain("exactly one member");
    expect(executable.replace(/'[^']*'/g, "''")).not.toMatch(/CREATE\s+ROLE/i);
    expect(executable).not.toMatch(/GRANT\s+INSERT/i);
    expect(executable).toContain("GRANT SELECT, DELETE ON TABLE audit_events TO audit_purge");

    const runner = readFileSync(MIGRATE_SRC, "utf8");
    const mainAt = runner.indexOf("async function main()");
    const migrateAt = runner.indexOf("await runMigrations()", mainAt);
    const purgeAt = runner.indexOf("await runStartupAuditPurge()", mainAt);
    expect(purgeAt).toBeGreaterThan(migrateAt);
    const resetAt = runner.indexOf('await client.query("RESET ROLE")');
    const insertAt = runner.indexOf("await client.query(AUDIT_PURGE_INSERT_SQL");
    expect(resetAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(resetAt);
  });

  it("audit_purge is NOLOGIN, SELECT and DELETE only, and granted only to the migrator", async () => {
    const client = await getPool().connect();
    try {
      const purge = await client.query<{
        login: boolean;
        sel: boolean;
        ins: boolean;
        upd: boolean;
        del: boolean;
        trunc: boolean;
      }>(
        `SELECT
           rolcanlogin AS login,
           has_table_privilege('audit_purge', 'audit_events', 'SELECT') AS sel,
           has_table_privilege('audit_purge', 'audit_events', 'INSERT') AS ins,
           has_table_privilege('audit_purge', 'audit_events', 'UPDATE') AS upd,
           has_table_privilege('audit_purge', 'audit_events', 'DELETE') AS del,
           has_table_privilege('audit_purge', 'audit_events', 'TRUNCATE') AS trunc
         FROM pg_roles WHERE rolname = 'audit_purge'`,
      );
      expect(purge.rows[0]).toEqual({
        login: false,
        sel: true,
        ins: false,
        upd: false,
        del: true,
        trunc: false,
      });

      const runtime = await client.query<{ del: boolean }>(
        `SELECT has_table_privilege('clockinoff-prod', 'audit_events', 'DELETE') AS del`,
      );
      expect(runtime.rows[0]?.del).toBe(false);

      const members = await client.query<{ rolname: string }>(
        `SELECT member.rolname
           FROM pg_auth_members m
           JOIN pg_roles granted ON granted.oid = m.roleid
           JOIN pg_roles member ON member.oid = m.member
          WHERE granted.rolname = 'audit_purge'
          ORDER BY member.rolname`,
      );
      const me = await client.query<{ name: string }>("SELECT current_user AS name");
      expect(members.rows.map((row) => row.rolname)).toEqual([me.rows[0]?.name]);
      expect(members.rows.map((row) => row.rolname)).not.toContain("clockinoff-prod");
    } finally {
      client.release();
    }

    await withTestMigrator(async (migrator) => {
      await migrator.query("BEGIN");
      await migrator.query("SET LOCAL ROLE audit_purge");
      await expect(
        migrator.query(
          `INSERT INTO audit_events (actor_email, action, targets, request_id)
           VALUES ('', 'audit.purge', '[]'::jsonb, 'denied')`,
        ),
      ).rejects.toThrow(/permission denied/);
      await migrator.query("ROLLBACK");
    });
  });

  it("deletes a 366-day-old row, keeps a 364-day-old row, and records count 1", async () => {
    await insertAged(OLD_EMAIL, 366);
    await insertAged(YOUNG_EMAIL, 364);
    await withTestMigrator(async (migrator) => {
      const seen: string[] = [];
      const wrapped: QueryClient = {
        query(sql: string, params?: unknown[]) {
          seen.push(sql);
          return migrator.query(sql, params);
        },
      };
      vi.spyOn(console, "log").mockImplementation(() => {});
      const result = await migrate.executeAuditPurge(wrapped);
      expect(result).toEqual({ deleted: 1, failed: false, skipped: false });

      const setAt = seen.indexOf("SET LOCAL ROLE audit_purge");
      const deleteAt = seen.findIndex((sql) => sql === DELETE_SQL);
      const resetAt = seen.indexOf("RESET ROLE");
      const insertAt = seen.findIndex((sql) => sql.startsWith("INSERT INTO audit_events"));
      expect(setAt).toBeGreaterThan(-1);
      expect(deleteAt).toBeGreaterThan(setAt);
      expect(resetAt).toBeGreaterThan(deleteAt);
      expect(insertAt).toBeGreaterThan(resetAt);

      const remaining = await migrator.query<{ actor_email: string }>(
        "SELECT actor_email FROM audit_events WHERE action = 'auth.login_failure' ORDER BY actor_email",
      );
      expect(remaining.rows.map((row) => row.actor_email)).toEqual([YOUNG_EMAIL]);

      const purge = await migrator.query<{
        actor_email: string;
        targets: unknown;
        method: string | null;
        result: { cutoff: string; count: number; role: string };
      }>(
        `SELECT actor_email, targets, method, result
           FROM audit_events WHERE action = 'audit.purge'`,
      );
      expect(purge.rows).toHaveLength(1);
      expect(purge.rows[0]?.actor_email).toBe("");
      expect(purge.rows[0]?.targets).toEqual([]);
      expect(purge.rows[0]?.method).toBeNull();
      expect(purge.rows[0]?.result.role).toBe("audit_purge");
      expect(purge.rows[0]?.result.count).toBe(1);
      expect(JSON.stringify(purge.rows[0])).not.toMatch(/@/);
      expect(Object.keys(purge.rows[0]?.result ?? {}).sort()).toEqual([
        "count",
        "cutoff",
        "role",
      ]);
    });
  });

  it("a purge failure does not block startup and deletes nothing", async () => {
    await insertAged(OLD_EMAIL, 366);
    const admin = await getPool().connect();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await admin.query("REVOKE DELETE ON TABLE audit_events FROM audit_purge");
      await withTestMigrator(async (migrator) => {
        const result = await migrate.startupPurge(migrator);
        expect(result).toEqual({ deleted: 0, failed: true, skipped: false });
      });
      const still = await admin.query(
        "SELECT actor_email FROM audit_events WHERE actor_email = $1",
        [OLD_EMAIL],
      );
      expect(still.rows).toHaveLength(1);
    } finally {
      await admin.query("GRANT SELECT, DELETE ON TABLE audit_events TO audit_purge");
      admin.release();
    }

    const leaking = {
      async query(): Promise<{ rows: [] }> {
        throw new Error("connection failed for secret-user@example.com");
      },
    };
    const failed = await migrate.startupPurge(leaking);
    expect(failed.failed).toBe(true);

    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      await expect(migrate.runStartupAuditPurge()).resolves.toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }

    const logged = errorSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).toContain("audit_purge_failed");
    expect(logged).not.toContain("secret-user@example.com");
    expect(logged).not.toContain(OLD_EMAIL);
    expect(logged).not.toMatch(/@/);
  });

  it("reapplies grants when audit_purge is already the migrator's only role", async () => {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `CREATE ROLE owner_nocreate NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE`,
      );
      await client.query("ALTER TABLE audit_events OWNER TO owner_nocreate");
      await client.query(`
        DO $$ DECLARE r text;
        BEGIN
          FOR r IN
            SELECT member.rolname
              FROM pg_auth_members m
              JOIN pg_roles granted ON granted.oid = m.roleid
              JOIN pg_roles member ON member.oid = m.member
             WHERE granted.rolname = 'audit_purge'
          LOOP
            EXECUTE format('REVOKE audit_purge FROM %I', r);
          END LOOP;
        END $$
      `);
      await client.query("GRANT audit_purge TO owner_nocreate");
      await client.query("SET LOCAL ROLE owner_nocreate");
      await client.query(migrationRoleSql());
      const who = await client.query<{ name: string; createrole: boolean }>(
        `SELECT current_user AS name, rolcreaterole AS createrole
           FROM pg_roles WHERE rolname = current_user`,
      );
      expect(who.rows[0]).toEqual({ name: "owner_nocreate", createrole: false });
      await client.query("ROLLBACK");
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  });

  it("missing audit_purge raises out-of-band instructions and does not create the role", async () => {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        DO $$ DECLARE r text;
        BEGIN
          FOR r IN
            SELECT member.rolname
              FROM pg_auth_members m
              JOIN pg_roles granted ON granted.oid = m.roleid
              JOIN pg_roles member ON member.oid = m.member
             WHERE granted.rolname = 'audit_purge'
          LOOP
            EXECUTE format('REVOKE audit_purge FROM %I', r);
          END LOOP;
        END $$
      `);
      await client.query("REVOKE ALL ON TABLE audit_events FROM audit_purge");
      await client.query("DROP ROLE audit_purge");
      await client.query("SAVEPOINT before_missing_role");
      await expect(client.query(migrationRoleSql())).rejects.toThrow(
        /Pre-create it out of band/,
      );
      await client.query("ROLLBACK TO SAVEPOINT before_missing_role");
      const still = await client.query(
        "SELECT 1 FROM pg_roles WHERE rolname = 'audit_purge'",
      );
      expect(still.rows).toHaveLength(0);
      await client.query("ROLLBACK");
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      const { rows } = await client.query(
        "SELECT 1 FROM pg_roles WHERE rolname = 'audit_purge'",
      );
      expect(rows).toHaveLength(1);
      client.release();
    }
  });

  it("a missing audit_purge role skips the purge and does not block startup", async () => {
    await insertAged(OLD_EMAIL, 366);
    const client = await getPool().connect();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await client.query("BEGIN");
      await client.query(`
        DO $$ DECLARE r text;
        BEGIN
          FOR r IN
            SELECT member.rolname
              FROM pg_auth_members m
              JOIN pg_roles granted ON granted.oid = m.roleid
              JOIN pg_roles member ON member.oid = m.member
             WHERE granted.rolname = 'audit_purge'
          LOOP
            EXECUTE format('REVOKE audit_purge FROM %I', r);
          END LOOP;
        END $$
      `);
      await client.query("REVOKE ALL ON TABLE audit_events FROM audit_purge");
      await client.query("DROP ROLE audit_purge");
      const result = await migrate.startupPurge(client);
      expect(result).toEqual({ deleted: 0, failed: false, skipped: true });
      const still = await client.query(
        "SELECT actor_email FROM audit_events WHERE actor_email = $1",
        [OLD_EMAIL],
      );
      expect(still.rows).toHaveLength(1);
      await client.query("ROLLBACK");
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
    const logged = warn.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).toContain("audit_purge_skipped");
    expect(logged).toContain("missing_role");
    expect(logged).not.toContain(OLD_EMAIL);
    expect(logged).not.toMatch(/@/);
  });

  it("warns when the last audit.purge row is older than 30 days", async () => {
    const client = await getPool().connect();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await client.query(
        `INSERT INTO audit_events (
           actor_email, action, targets, request_id, status, created_at
         ) VALUES (
           '', 'audit.purge', '[]'::jsonb, 'startup', 'completed',
           now() - interval '31 days'
         )`,
      );
      await migrate.warnIfAuditPurgeStale(client);
      expect(warn).toHaveBeenCalled();
      const line = String(warn.mock.calls[0]?.[0]);
      expect(line).toContain("audit_purge_stale");
      expect(line).not.toMatch(/@/);
    } finally {
      client.release();
    }
  });

  it("rejects method values other than password, google, or null", async () => {
    const client = await getPool().connect();
    try {
      await expect(
        client.query(
          `INSERT INTO audit_events (actor_email, action, targets, request_id, method)
           VALUES ('', 'auth.login_failure', '[]'::jsonb, 'bad', 'sms')`,
        ),
      ).rejects.toThrow(/audit_events_method_check/);

      await client.query(
        `INSERT INTO audit_events (actor_email, action, targets, request_id, method)
         VALUES ('', 'auth.login_success', '[]'::jsonb, 'ok-null', NULL)`,
      );
      await client.query(
        `INSERT INTO audit_events (actor_email, action, targets, request_id, method)
         VALUES ('', 'auth.login_success', '[]'::jsonb, 'ok-pw', 'password')`,
      );
      await client.query(
        `INSERT INTO audit_events (actor_email, action, targets, request_id, method)
         VALUES ('', 'auth.login_success', '[]'::jsonb, 'ok-g', 'google')`,
      );
      const { rows } = await client.query<{ method: string | null }>(
        "SELECT method FROM audit_events ORDER BY request_id",
      );
      expect(rows.map((row) => row.method)).toEqual(["google", null, "password"]);
    } finally {
      client.release();
    }
  });
});
