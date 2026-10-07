import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// `scripts/migrate.mjs` is plain ESM. These tests cover the #187 ownership
// gate: AAD/migrator mode refuses to apply pending SQL when the connected
// role cannot alter an existing Clockinoff table, and never issues
// ALTER OWNER.
interface MigrateOwnershipExports {
  readonly CLOCKINOFF_APP_TABLES: readonly string[];
  readonly OWNERSHIP_CHECK_SQL: string;
  shouldAssertTableOwnership(useAzureAd: boolean, pendingCount: number): boolean;
  formatOwnershipFailure(
    blocked: Array<{ role?: string; table_name?: string; owner?: string }>,
  ): string;
  assertMigratorOwnsAppTables(
    client: { query(sql: string, params?: unknown): Promise<{ rows: unknown[] }> },
    tables?: readonly string[],
  ): Promise<void>;
  gatePendingMigrations(
    client: { query(sql: string, params?: unknown): Promise<{ rows: unknown[] }> },
    opts: { useAzureAd: boolean; pendingCount: number },
  ): Promise<void>;
}

import * as migrateScriptRaw from "../../scripts/migrate.mjs";

const migrate = migrateScriptRaw as unknown as MigrateOwnershipExports;

const MIGRATE_PATH = path.resolve(__dirname, "..", "..", "scripts", "migrate.mjs");

function fakeClient(rows: Array<Record<string, unknown>>) {
  const calls: Array<{ sql: string; params: unknown }> = [];
  return {
    calls,
    async query(sql: string, params?: unknown) {
      calls.push({ sql, params });
      return { rows };
    },
  };
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("scripts/migrate.mjs — table ownership gate (#187)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asserts ownership only in AAD mode when migrations are pending", () => {
    expect(migrate.shouldAssertTableOwnership(true, 1)).toBe(true);
    expect(migrate.shouldAssertTableOwnership(true, 2)).toBe(true);
    expect(migrate.shouldAssertTableOwnership(true, 0)).toBe(false);
    expect(migrate.shouldAssertTableOwnership(false, 3)).toBe(false);
  });

  it("lists every Clockinoff app table plus __migrations", () => {
    expect([...migrate.CLOCKINOFF_APP_TABLES].sort()).toEqual(
      [
        "__migrations",
        "clients",
        "projects",
        "sessions",
        "tags",
        "time_entries",
        "time_entry_tags",
        "users",
      ].sort(),
    );
  });

  it("checks ownership through pg_catalog and does not alter it", () => {
    expect(migrate.OWNERSHIP_CHECK_SQL).toMatch(/pg_catalog\.pg_class/);
    expect(migrate.OWNERSHIP_CHECK_SQL).toMatch(/pg_has_role/);
    expect(migrate.OWNERSHIP_CHECK_SQL).not.toMatch(/alter/i);
    expect(migrate.OWNERSHIP_CHECK_SQL).not.toMatch(/owner to/i);
  });

  it("does not run ALTER OWNER anywhere in executable migrate code", async () => {
    const source = await readFile(MIGRATE_PATH, "utf8");
    expect(stripComments(source)).not.toMatch(/alter\s+[\s\S]{0,80}owner/i);
  });

  it("skips the catalog query when password mode has pending SQL", async () => {
    const client = fakeClient([]);
    await migrate.gatePendingMigrations(client, { useAzureAd: false, pendingCount: 2 });
    expect(client.calls).toEqual([]);
  });

  it("skips the catalog query when AAD mode has nothing pending", async () => {
    const client = fakeClient([]);
    await migrate.gatePendingMigrations(client, { useAzureAd: true, pendingCount: 0 });
    expect(client.calls).toEqual([]);
  });

  it("passes when every existing table is alterable by the connected role", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const client = fakeClient([
      {
        role: "uami-clockinoff-migrator",
        table_name: "users",
        owner: "uami-clockinoff-migrator",
        can_alter: true,
      },
      {
        role: "uami-clockinoff-migrator",
        table_name: "sessions",
        owner: "uami-clockinoff-migrator",
        can_alter: true,
      },
    ]);
    await migrate.gatePendingMigrations(client, { useAzureAd: true, pendingCount: 1 });
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]?.sql).toBe(migrate.OWNERSHIP_CHECK_SQL);
    expect(client.calls[0]?.params).toEqual([migrate.CLOCKINOFF_APP_TABLES]);
  });

  it("passes a fresh database that has none of the app tables yet", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const client = fakeClient([]);
    await migrate.assertMigratorOwnsAppTables(client);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("no existing Clockinoff tables"),
    );
  });

  it("fails naming the connected role and the foreign owner", async () => {
    const client = fakeClient([
      {
        role: "uami-clockinoff-migrator",
        table_name: "sessions",
        owner: "uami-clockinoff-migrator",
        can_alter: true,
      },
      {
        role: "uami-clockinoff-migrator",
        table_name: "users",
        owner: "guideme",
        can_alter: false,
      },
    ]);
    await expect(
      migrate.gatePendingMigrations(client, { useAzureAd: true, pendingCount: 1 }),
    ).rejects.toThrow(/connected role "uami-clockinoff-migrator"/);
    await expect(
      migrate.assertMigratorOwnsAppTables(client),
    ).rejects.toThrow(/users \(owner guideme\)/);
    await expect(
      migrate.assertMigratorOwnsAppTables(client),
    ).rejects.toThrow(/does not run ALTER OWNER/);
    await expect(
      migrate.assertMigratorOwnsAppTables(client),
    ).rejects.toThrow(/guide-me/);
  });

  it("does not treat a non-boolean can_alter as success", async () => {
    const client = fakeClient([
      {
        role: "uami-clockinoff-migrator",
        table_name: "users",
        owner: "guideme",
        can_alter: "t",
      },
    ]);
    await expect(migrate.assertMigratorOwnsAppTables(client)).rejects.toThrow(
      /owner guideme/,
    );
  });

  it("names an unknown role when the catalog row has none", () => {
    expect(
      migrate.formatOwnershipFailure([{ table_name: "users", owner: "guideme" }]),
    ).toMatch(/connected role "\(unknown\)"/);
  });
});
