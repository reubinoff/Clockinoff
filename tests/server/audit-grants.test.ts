import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { getPool } from "@/server/db/client";

const ROLE = "clockinoff-prod";
const SQL_PATH = path.resolve(__dirname, "..", "..", "drizzle", "0008_audit_events_grants.sql");

describe("audit_events grants", () => {
  afterAll(async () => {
    const client = await getPool().connect();
    try {
      await client.query(`REVOKE ALL ON TABLE audit_events FROM "${ROLE}"`);
      await client.query(`DROP ROLE IF EXISTS "${ROLE}"`);
    } catch {
      await client.query(`DROP ROLE IF EXISTS "${ROLE}"`);
    } finally {
      client.release();
    }
  });

  it("grants select, insert, and column update only when clockinoff-prod exists", async () => {
    const sql = readFileSync(SQL_PATH, "utf8");
    expect(sql).toContain('GRANT SELECT, INSERT ON audit_events TO "clockinoff-prod"');
    expect(sql).toContain(
      'GRANT UPDATE (status, result, completed_at) ON audit_events TO "clockinoff-prod"',
    );
    expect(sql).not.toMatch(/GRANT\s+(DELETE|TRUNCATE|USAGE)/i);
    const block = sql
      .split("--> statement-breakpoint")
      .map((part) => part.trim())
      .find((part) => part.startsWith("DO $$"));
    expect(block).toBeTruthy();

    const client = await getPool().connect();
    try {
      await client.query(`DROP ROLE IF EXISTS "${ROLE}"`);
      await client.query(`CREATE ROLE "${ROLE}"`);
      await client.query(block ?? "");
      const priv = await client.query<{
        sel: boolean;
        ins: boolean;
        del: boolean;
        trunc: boolean;
        upd_table: boolean;
        upd_status: boolean;
        upd_result: boolean;
        upd_completed: boolean;
        upd_actor: boolean;
        upd_targets: boolean;
      }>(
        `SELECT
          has_table_privilege($1, 'audit_events', 'SELECT') AS sel,
          has_table_privilege($1, 'audit_events', 'INSERT') AS ins,
          has_table_privilege($1, 'audit_events', 'DELETE') AS del,
          has_table_privilege($1, 'audit_events', 'TRUNCATE') AS trunc,
          has_table_privilege($1, 'audit_events', 'UPDATE') AS upd_table,
          has_column_privilege($1, 'audit_events', 'status', 'UPDATE') AS upd_status,
          has_column_privilege($1, 'audit_events', 'result', 'UPDATE') AS upd_result,
          has_column_privilege($1, 'audit_events', 'completed_at', 'UPDATE') AS upd_completed,
          has_column_privilege($1, 'audit_events', 'actor_email', 'UPDATE') AS upd_actor,
          has_column_privilege($1, 'audit_events', 'targets', 'UPDATE') AS upd_targets`,
        [ROLE],
      );
      expect(priv.rows[0]).toEqual({
        sel: true,
        ins: true,
        del: false,
        trunc: false,
        upd_table: false,
        upd_status: true,
        upd_result: true,
        upd_completed: true,
        upd_actor: false,
        upd_targets: false,
      });
    } finally {
      await client.query(`REVOKE ALL ON TABLE audit_events FROM "${ROLE}"`);
      await client.query(`DROP ROLE IF EXISTS "${ROLE}"`);
      client.release();
    }
  });
});
