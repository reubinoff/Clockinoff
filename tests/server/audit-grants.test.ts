import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getPool } from "@/server/db/client";

const ROLE = "clockinoff-prod";
const UPDATABLE = ["completed_at", "result", "status"];
const SQL_PATH = path.resolve(__dirname, "..", "..", "drizzle", "0008_audit_events_grants.sql");

function grantBlock(): string {
  const sql = readFileSync(SQL_PATH, "utf8");
  const block = sql
    .split("--> statement-breakpoint")
    .map((part) => part.trim())
    .find((part) => part.includes("RAISE EXCEPTION"));
  if (!block) throw new Error("grant block missing from 0008");
  return block;
}

describe("audit_events grants", () => {
  it("after migration, clockinoff-prod has select, insert, and column update only", async () => {
    const sql = readFileSync(SQL_PATH, "utf8");
    expect(sql).toContain("RAISE EXCEPTION");
    expect(sql).toContain("clockinoff.allow_missing_app_role");
    expect(sql).toContain('GRANT SELECT, INSERT ON audit_events TO "clockinoff-prod"');
    expect(sql).toContain(
      'GRANT UPDATE (status, result, completed_at) ON audit_events TO "clockinoff-prod"',
    );
    expect(sql).not.toMatch(/GRANT\s+(DELETE|TRUNCATE|USAGE)/i);

    const client = await getPool().connect();
    try {
      const login = await client.query<{ rolcanlogin: boolean }>(
        "SELECT rolcanlogin FROM pg_roles WHERE rolname = $1",
        [ROLE],
      );
      expect(login.rows[0]?.rolcanlogin).toBe(false);

      const table = await client.query<{
        sel: boolean;
        ins: boolean;
        del: boolean;
        trunc: boolean;
        upd_table: boolean;
      }>(
        `SELECT
          has_table_privilege($1, 'audit_events', 'SELECT') AS sel,
          has_table_privilege($1, 'audit_events', 'INSERT') AS ins,
          has_table_privilege($1, 'audit_events', 'DELETE') AS del,
          has_table_privilege($1, 'audit_events', 'TRUNCATE') AS trunc,
          has_table_privilege($1, 'audit_events', 'UPDATE') AS upd_table`,
        [ROLE],
      );
      expect(table.rows[0]).toEqual({
        sel: true,
        ins: true,
        del: false,
        trunc: false,
        upd_table: false,
      });

      const columns = await client.query<{ column_name: string; can_update: boolean }>(
        `SELECT column_name,
                has_column_privilege($1, 'audit_events', column_name, 'UPDATE') AS can_update
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'audit_events'
          ORDER BY column_name`,
        [ROLE],
      );
      const updatable = columns.rows.filter((row) => row.can_update).map((row) => row.column_name);
      expect(updatable).toEqual(UPDATABLE);
      expect(columns.rows.length).toBeGreaterThan(UPDATABLE.length);
    } finally {
      client.release();
    }
  });

  it("raises when the role is missing unless clockinoff.allow_missing_app_role is on", async () => {
    const block = grantBlock();
    const client = await getPool().connect();
    try {
      await client.query(`REVOKE ALL ON TABLE audit_events FROM "${ROLE}"`);
      await client.query(`DROP ROLE "${ROLE}"`);

      await expect(client.query(block)).rejects.toThrow(/clockinoff-prod/);

      await client.query("BEGIN");
      await client.query("SET LOCAL clockinoff.allow_missing_app_role = 'on'");
      await client.query(block);
      await client.query("COMMIT");
    } finally {
      const { rows } = await client.query(
        "SELECT 1 FROM pg_roles WHERE rolname = 'clockinoff-prod'",
      );
      if (rows.length === 0) {
        await client.query(`CREATE ROLE "${ROLE}" NOLOGIN`);
      }
      await client.query(block);
      client.release();
    }
  });
});
