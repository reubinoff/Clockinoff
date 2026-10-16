import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool } from "@/server/db/client";
import { truncateAll } from "../setup";

import * as migrateScriptRaw from "../../scripts/migrate.mjs";

interface PurgeResult {
  deleted: number;
  blocked: boolean;
  failed: boolean;
}

interface MigratePurgeExports {
  readonly AUDIT_PURGE_BATCH: number;
  readonly AUDIT_PURGE_BUDGET_MS: number;
  readonly AUDIT_PURGE_DELETE_SQL: string;
  readonly AUDIT_PURGE_INSERT_SQL: string;
  readonly AUDIT_PURGE_SETTING_KEYS: readonly string[];
  readonly AUDIT_PURGE_STALE_SQL: string;
  purgeSettingBlocksDelete(
    env: Record<string, string | undefined>,
    options: unknown,
  ): boolean;
  executeAuditPurge(
    client: { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount?: number | null }> },
    options?: unknown,
  ): Promise<PurgeResult>;
  startupPurge(
    client: { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount?: number | null }> },
  ): Promise<PurgeResult>;
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

const OLD_EMAIL = "old-366@example.com";
const YOUNG_EMAIL = "young-364@example.com";

async function insertAged(email: string, days: number, method: string | null = "password") {
  const client = await getPool().connect();
  try {
    await client.query(
      `INSERT INTO audit_events (
         actor_email, action, targets, request_id, status, method, created_at
       ) VALUES (
         $1, 'auth.login_failure', '[]'::jsonb, $2, 'completed', $3,
         now() - ($4::int * interval '1 day')
       )`,
      [email, `req-${days}`, method, days],
    );
  } finally {
    client.release();
  }
}

describe("audit_events retention (#237, #242)", () => {
  const envSnapshot = new Map<string, string | undefined>();

  beforeEach(async () => {
    await truncateAll();
    for (const key of migrate.AUDIT_PURGE_SETTING_KEYS) {
      envSnapshot.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of envSnapshot) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    envSnapshot.clear();
    vi.restoreAllMocks();
  });

  it("keeps the interval, table, and batch size as literals", () => {
    expect(migrate.AUDIT_PURGE_BATCH).toBe(10000);
    expect(migrate.AUDIT_PURGE_BUDGET_MS).toBe(10_000);
    expect(migrate.AUDIT_PURGE_DELETE_SQL).toBe(
      "DELETE FROM audit_events WHERE id IN (" +
        "SELECT id FROM audit_events " +
        "WHERE created_at < now() - interval '1 year' " +
        "ORDER BY id LIMIT 10000)",
    );
    expect(migrate.AUDIT_PURGE_DELETE_SQL).not.toMatch(
      /current_setting|process\.env|AUDIT_|\$\{/,
    );
    expect(migrate.AUDIT_PURGE_INSERT_SQL).toContain("interval '1 year'");
    expect(migrate.AUDIT_PURGE_INSERT_SQL).toContain("'audit.purge'");
    expect(migrate.AUDIT_PURGE_INSERT_SQL).toContain("'audit_purge'");
    expect(migrate.AUDIT_PURGE_INSERT_SQL).toContain("''");
    expect(migrate.AUDIT_PURGE_INSERT_SQL).not.toMatch(/\$\{|@/);
    expect(migrate.AUDIT_PURGE_STALE_SQL).toContain("interval '30 days'");

    const migration = readFileSync(MIGRATION, "utf8");
    const executable = migration
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(executable).not.toMatch(/CONCURRENTLY/i);
    expect(executable).not.toMatch(/clockinoff-prod/);
    expect(migration).toContain("CREATE ROLE audit_purge NOLOGIN");
    expect(migration).toContain("GRANT SELECT, DELETE ON TABLE audit_events TO audit_purge");
    expect(migration).toContain("NOT VALID");
    expect(migration).toContain("VALIDATE CONSTRAINT audit_events_method_check");
    expect(migration).toContain("method NOT IN ('password', 'google')");

    const runner = readFileSync(MIGRATE_SRC, "utf8");
    expect(runner).toContain('await client.query("BEGIN")');
    const mainAt = runner.indexOf("async function main()");
    const migrateAt = runner.indexOf("await runMigrations()", mainAt);
    const purgeAt = runner.indexOf("await runStartupAuditPurge()", mainAt);
    expect(migrateAt).toBeGreaterThan(mainAt);
    expect(purgeAt).toBeGreaterThan(migrateAt);
  });

  it("does not grant DELETE on audit_events to the runtime role", async () => {
    const client = await getPool().connect();
    try {
      const priv = await client.query<{
        sel: boolean;
        ins: boolean;
        upd: boolean;
        del: boolean;
        trunc: boolean;
      }>(
        `SELECT
           has_table_privilege('clockinoff-prod', 'audit_events', 'SELECT') AS sel,
           has_table_privilege('clockinoff-prod', 'audit_events', 'INSERT') AS ins,
           has_table_privilege('clockinoff-prod', 'audit_events', 'UPDATE') AS upd,
           has_table_privilege('clockinoff-prod', 'audit_events', 'DELETE') AS del,
           has_table_privilege('clockinoff-prod', 'audit_events', 'TRUNCATE') AS trunc`,
      );
      expect(priv.rows[0]).toEqual({
        sel: true,
        ins: true,
        upd: false,
        del: false,
        trunc: false,
      });

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

      const members = await client.query<{ rolname: string }>(
        `SELECT member.rolname
           FROM pg_auth_members m
           JOIN pg_roles granted ON granted.oid = m.roleid
           JOIN pg_roles member ON member.oid = m.member
          WHERE granted.rolname = 'audit_purge'`,
      );
      const names = members.rows.map((row) => row.rolname);
      const me = await client.query<{ name: string }>("SELECT current_user AS name");
      expect(names).toContain(me.rows[0]?.name);
      expect(names).not.toContain("clockinoff-prod");

      const index = await client.query(
        `SELECT 1 FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname = 'audit_events_created_at_idx'`,
      );
      expect(index.rows).toHaveLength(1);
    } finally {
      client.release();
    }
  });

  it("deletes a 366-day-old row, keeps a 364-day-old row, and records count 1", async () => {
    await insertAged(OLD_EMAIL, 366);
    await insertAged(YOUNG_EMAIL, 364);
    const client = await getPool().connect();
    const seen: string[] = [];
    const wrapped = {
      query(sql: string, params?: unknown[]) {
        seen.push(sql);
        return client.query(sql, params);
      },
    };
    try {
      vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = await migrate.executeAuditPurge(wrapped);
      expect(result).toEqual({ deleted: 1, blocked: false, failed: false });

      const setAt = seen.indexOf("SET LOCAL ROLE audit_purge");
      const deleteAt = seen.findIndex((sql) => sql.startsWith("DELETE FROM audit_events"));
      const resetAt = seen.indexOf("RESET ROLE");
      const insertAt = seen.findIndex((sql) => sql.startsWith("INSERT INTO audit_events"));
      expect(setAt).toBeGreaterThan(-1);
      expect(deleteAt).toBeGreaterThan(setAt);
      expect(resetAt).toBeGreaterThan(deleteAt);
      expect(insertAt).toBeGreaterThan(resetAt);

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
      expect(purge.rows[0]?.result.role).toBe("audit_purge");
      expect(purge.rows[0]?.result.count).toBe(1);
      expect(JSON.stringify(purge.rows[0])).not.toMatch(/@/);
      expect(Object.keys(purge.rows[0]?.result ?? {}).sort()).toEqual([
        "count",
        "cutoff",
        "role",
      ]);

      const skew = await client.query<{ skew: string }>(
        `SELECT abs(extract(epoch FROM (
            (result->>'cutoff')::timestamptz - (now() - interval '1 year')
          )))::text AS skew
           FROM audit_events WHERE action = 'audit.purge'`,
      );
      expect(Number(skew.rows[0]?.skew)).toBeLessThan(30);
    } finally {
      client.release();
    }
  });

  it("a malformed or missing retention setting deletes nothing", async () => {
    await insertAged(OLD_EMAIL, 366);
    await insertAged(YOUNG_EMAIL, 364);
    const client = await getPool().connect();
    try {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const explicit = [
        { setting: undefined },
        { setting: "" },
        { setting: "   " },
        { setting: "0" },
        { setting: "1 day" },
        { setting: "1 year" },
        { setting: "'; DROP TABLE audit_events; --" },
      ];
      for (const options of explicit) {
        const result = await migrate.executeAuditPurge(client, options);
        expect(result).toEqual({ deleted: 0, blocked: true, failed: false });
      }

      for (const key of migrate.AUDIT_PURGE_SETTING_KEYS) {
        process.env[key] = key === "AUDIT_RETENTION" ? "" : "1 second";
        const result = await migrate.executeAuditPurge(client);
        expect(result.deleted).toBe(0);
        expect(result.blocked).toBe(true);
        delete process.env[key];
      }

      for (const value of ["   ", "1 day", "1 year", "not-an-interval"]) {
        await client.query("SELECT set_config('clockinoff.audit_retention', $1, false)", [value]);
        const result = await migrate.executeAuditPurge(client);
        expect(result.deleted).toBe(0);
        expect(result.blocked).toBe(true);
      }

      const emails = await client.query<{ actor_email: string }>(
        "SELECT actor_email FROM audit_events ORDER BY actor_email",
      );
      expect(emails.rows.map((row) => row.actor_email).sort()).toEqual(
        [OLD_EMAIL, YOUNG_EMAIL].sort(),
      );
      const purge = await client.query(
        "SELECT 1 FROM audit_events WHERE action = 'audit.purge'",
      );
      expect(purge.rows).toHaveLength(0);
    } finally {
      // The custom GUC sticks to the session. Drop the client so a later
      // test does not inherit a retention setting.
      client.release(new Error("drop audit retention session"));
    }
  });

  it("a purge failure does not block startup and deletes nothing", async () => {
    await insertAged(OLD_EMAIL, 366);
    const client = await getPool().connect();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await client.query("REVOKE DELETE ON TABLE audit_events FROM audit_purge");
      const result = await migrate.startupPurge(client);
      expect(result).toEqual({ deleted: 0, blocked: false, failed: true });
      const still = await client.query(
        "SELECT actor_email FROM audit_events WHERE actor_email = $1",
        [OLD_EMAIL],
      );
      expect(still.rows).toHaveLength(1);
    } finally {
      await client.query("GRANT SELECT, DELETE ON TABLE audit_events TO audit_purge");
      client.release();
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
