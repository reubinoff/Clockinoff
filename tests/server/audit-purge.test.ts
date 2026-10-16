import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPool } from "@/server/db/client";
import { truncateAll } from "../setup";

import * as migrateScriptRaw from "../../scripts/migrate.mjs";

interface PurgeResult {
  deleted: number;
  failed: boolean;
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
    query(sql: string, params?: unknown[]): Promise<{
      rows: Array<{ stale?: boolean; role?: string }>;
    }>;
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

const OLD_EMAIL = "old-366@example.com";
const YOUNG_EMAIL = "young-364@example.com";

function executableMigration(): string {
  return readFileSync(MIGRATION, "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
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

describe("audit_events retention (#237, #242)", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await truncateAll();
  });

  it("deletes with the hardcoded interval '1 year' and does not create a purge role", () => {
    expect(migrate.AUDIT_PURGE_BATCH).toBe(10000);
    expect(migrate.AUDIT_PURGE_BUDGET_MS).toBe(10_000);
    expect(migrate.AUDIT_PURGE_DELETE_SQL).toBe(DELETE_SQL);
    expect(migrate.AUDIT_PURGE_DELETE_SQL).toContain("interval '1 year'");
    expect(migrate.AUDIT_PURGE_DELETE_SQL).not.toMatch(
      /current_setting|process\.env|\$\{|AUDIT_/,
    );
    expect(migrate.AUDIT_PURGE_INSERT_SQL).toContain("current_user");
    expect(migrate.AUDIT_PURGE_INSERT_SQL).toContain("interval '1 year'");
    expect(migrate.AUDIT_PURGE_INSERT_SQL).not.toMatch(/\$\{|@/);

    const executable = executableMigration();
    expect(executable).not.toMatch(/CONCURRENTLY/i);
    expect(executable).not.toMatch(/CREATE\s+ROLE/i);
    expect(executable).not.toMatch(/GRANT/i);
    expect(executable).not.toMatch(/audit_purge/);
    expect(executable).toContain("audit_events_created_at_idx");
    expect(executable).toContain("audit_events_method_check");
    expect(executable).toContain("NOT VALID");
    expect(executable).toContain("VALIDATE CONSTRAINT audit_events_method_check");

    const runner = readFileSync(MIGRATE_SRC, "utf8");
    expect(runner).not.toMatch(/SET\s+LOCAL\s+ROLE/i);
    expect(runner).not.toMatch(/RESET\s+ROLE/i);
    expect(runner).not.toMatch(/\baudit_purge\b/);
    const mainAt = runner.indexOf("async function main()");
    const migrateAt = runner.indexOf("await runMigrations()", mainAt);
    const purgeAt = runner.indexOf("await runStartupAuditPurge()", mainAt);
    expect(purgeAt).toBeGreaterThan(migrateAt);
  });

  it("does not grant DELETE on audit_events to the runtime role", async () => {
    const client = await getPool().connect();
    try {
      const runtime = await client.query<{ del: boolean; trunc: boolean }>(
        `SELECT
           has_table_privilege('clockinoff-prod', 'audit_events', 'DELETE') AS del,
           has_table_privilege('clockinoff-prod', 'audit_events', 'TRUNCATE') AS trunc`,
      );
      expect(runtime.rows[0]).toEqual({ del: false, trunc: false });
    } finally {
      client.release();
    }
  });

  it("deletes a 366-day-old row, keeps a 364-day-old row, and records count 1", async () => {
    await insertAged(OLD_EMAIL, 366);
    await insertAged(YOUNG_EMAIL, 364);
    const client = await getPool().connect();
    try {
      const who = await client.query<{ name: string }>("SELECT current_user AS name");
      const owner = who.rows[0]?.name ?? "";
      const seen: string[] = [];
      const wrapped: QueryClient = {
        query(sql: string, params?: unknown[]) {
          seen.push(sql);
          return client.query(sql, params);
        },
      };
      vi.spyOn(console, "log").mockImplementation(() => {});
      const result = await migrate.executeAuditPurge(wrapped);
      expect(result).toEqual({ deleted: 1, failed: false });

      const deleteAt = seen.findIndex((sql) => sql === DELETE_SQL);
      const insertAt = seen.findIndex((sql) => sql.startsWith("INSERT INTO audit_events"));
      expect(seen.some((sql) => /SET\s+LOCAL\s+ROLE/i.test(sql))).toBe(false);
      expect(seen.some((sql) => /RESET\s+ROLE/i.test(sql))).toBe(false);
      expect(deleteAt).toBeGreaterThan(-1);
      expect(insertAt).toBeGreaterThan(deleteAt);

      const remaining = await client.query<{ actor_email: string }>(
        "SELECT actor_email FROM audit_events WHERE action = 'auth.login_failure' ORDER BY actor_email",
      );
      expect(remaining.rows.map((row) => row.actor_email)).toEqual([YOUNG_EMAIL]);

      const purge = await client.query<{
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
      expect(purge.rows[0]?.result.role).toBe(owner);
      expect(purge.rows[0]?.result.count).toBe(1);
      expect(JSON.stringify(purge.rows[0])).not.toMatch(/@/);
      expect(Object.keys(purge.rows[0]?.result ?? {}).sort()).toEqual([
        "count",
        "cutoff",
        "role",
      ]);
      const cutoff = new Date(purge.rows[0]?.result.cutoff ?? "").getTime();
      const yearAgo = Date.now() - 365.25 * 24 * 60 * 60 * 1000;
      expect(Math.abs(cutoff - yearAgo)).toBeLessThan(3 * 24 * 60 * 60 * 1000);
    } finally {
      client.release();
    }
  });

  it("a purge failure does not block startup and deletes nothing", async () => {
    await insertAged(OLD_EMAIL, 366);
    const client = await getPool().connect();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await client.query("BEGIN");
      await client.query("SET TRANSACTION READ ONLY");
      const result = await migrate.startupPurge(client);
      expect(result).toEqual({ deleted: 0, failed: true });
      await client.query("ROLLBACK").catch(() => {});
      const still = await client.query(
        "SELECT actor_email FROM audit_events WHERE actor_email = $1",
        [OLD_EMAIL],
      );
      expect(still.rows).toHaveLength(1);
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }

    const leaking = {
      async query(): Promise<{ rows: [] }> {
        throw new Error("connection failed for secret-user@example.com");
      },
    };
    const failed = await migrate.startupPurge(leaking);
    expect(failed).toEqual({ deleted: 0, failed: true });

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

  it("warns when the last audit.purge row is older than 30 days", async () => {
    const client = await getPool().connect();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const who = await client.query<{ name: string }>("SELECT current_user AS name");
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
      expect(line).toContain(who.rows[0]?.name);
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
