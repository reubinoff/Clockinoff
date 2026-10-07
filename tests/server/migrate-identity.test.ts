import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TokenCredential } from "@azure/identity";
import type { Pool, PoolConfig } from "pg";

import {
  buildPgPoolConfig,
  createDefaultAzurePasswordProvider,
  type PasswordProvider,
} from "@/server/db/azure-ad";
import { closeDb, getPool, setPasswordProvider } from "@/server/db/client";

// `scripts/migrate.mjs` is plain ESM so vitest can import its exports
// directly. We exercise the AAD / migrator-UAMI branch with an injected
// credential — the whole point of this test is to prove the migrate step
// is pinned to `PG_MIGRATOR_CLIENT_ID` while the runtime pool stays on
// `DefaultAzureCredential` (system MI). See Clockinoff #75.
interface MigrateScriptExports {
  readonly AZURE_POSTGRES_SCOPE: string;
  readonly DEFAULT_MIGRATOR_PG_USER: string;
  readonly PG_MIGRATOR_CLIENT_ID_ENV: string;
  readonly PG_MIGRATOR_PG_USER_ENV: string;
  resolveMigratorClientId(env?: Record<string, string | undefined>): string;
  resolveMigratorPgUser(env?: Record<string, string | undefined>): string;
  assertProductionDatabaseSslMode(
    url: string | undefined,
    env?: Record<string, string | undefined>,
  ): void;
  shouldUseAzureAdAuth(url: string): boolean;
  isPasswordlessPostgresUrl(url: string): boolean;
  parsePostgresUrl(url: string): PoolConfig;
  createAzurePasswordProvider(
    credential?: TokenCredential,
  ): Promise<PasswordProvider>;
  buildPoolConfig(
    url: string,
    options?: {
      credential?: TokenCredential;
      passwordProvider?: PasswordProvider;
      pgUser?: string;
    },
  ): Promise<PoolConfig>;
}
import * as migrateScriptRaw from "../../scripts/migrate.mjs";
const migrateScript = migrateScriptRaw as unknown as MigrateScriptExports;

const PASSWORDLESS_URL =
  "postgresql://app-role@pg.example.com:5432/appdb?sslmode=require";

const MIGRATOR_CLIENT_ID = "00000000-0000-4000-8000-000000000001";

describe("scripts/migrate.mjs — migrator UAMI binding (#75)", () => {
  const originalAad = process.env.PG_AZURE_AD_AUTH;
  const originalMig = process.env.PG_MIGRATOR_CLIENT_ID;
  const originalPgUser = process.env.PG_MIGRATOR_PG_USER;

  beforeEach(() => {
    process.env.PG_AZURE_AD_AUTH = "1";
  });

  afterEach(() => {
    if (originalAad === undefined) delete process.env.PG_AZURE_AD_AUTH;
    else process.env.PG_AZURE_AD_AUTH = originalAad;
    if (originalMig === undefined) delete process.env.PG_MIGRATOR_CLIENT_ID;
    else process.env.PG_MIGRATOR_CLIENT_ID = originalMig;
    if (originalPgUser === undefined) delete process.env.PG_MIGRATOR_PG_USER;
    else process.env.PG_MIGRATOR_PG_USER = originalPgUser;
    vi.restoreAllMocks();
  });

  it("fails fast when PG_MIGRATOR_CLIENT_ID is unset under AAD mode", async () => {
    delete process.env.PG_MIGRATOR_CLIENT_ID;
    // Also sanity-check the pure helper exported by the script.
    expect(() =>
      migrateScript.resolveMigratorClientId({} as Record<string, string | undefined>),
    ).toThrow(/PG_MIGRATOR_CLIENT_ID is required/i);
    await expect(migrateScript.buildPoolConfig(PASSWORDLESS_URL)).rejects.toThrow(
      /PG_MIGRATOR_CLIENT_ID is required/i,
    );
  });

  it("builds a pool config bound to the migrator UAMI's clientId", async () => {
    process.env.PG_MIGRATOR_CLIENT_ID = MIGRATOR_CLIENT_ID;
    delete process.env.PG_MIGRATOR_PG_USER;
    const getToken = vi.fn(async () => ({
      token: "migrator-tok",
      expiresOnTimestamp: Date.now() + 60 * 60_000,
    }));
    const credential: TokenCredential = { getToken };

    vi.spyOn(console, "log").mockImplementation(() => {});
    const cfg = (await migrateScript.buildPoolConfig(PASSWORDLESS_URL, {
      credential,
    })) as PoolConfig;

    expect(cfg.connectionString).toBeUndefined();
    // Non-production falls back to DEFAULT_MIGRATOR_PG_USER and must not
    // keep the role embedded in the passwordless URL.
    expect(cfg.user).toBe(migrateScript.DEFAULT_MIGRATOR_PG_USER);
    expect(cfg.user).not.toBe("app-role");
    expect(cfg.host).toBe("pg.example.com");
    expect(cfg.database).toBe("appdb");
    expect(cfg.max).toBe(1);
    expect(typeof cfg.password).toBe("function");

    const password = await (cfg.password as PasswordProvider)();
    expect(password).toBe("migrator-tok");
    expect(getToken).toHaveBeenCalledWith(
      "https://ossrdbms-aad.database.windows.net/.default",
    );
  });

  it("honours PG_MIGRATOR_PG_USER override for alternate role names", async () => {
    process.env.PG_MIGRATOR_CLIENT_ID = MIGRATOR_CLIENT_ID;
    process.env.PG_MIGRATOR_PG_USER = "stage-migrator-role";
    const credential: TokenCredential = {
      getToken: vi.fn(async () => ({
        token: "stage-tok",
        expiresOnTimestamp: Date.now() + 60 * 60_000,
      })),
    };
    vi.spyOn(console, "log").mockImplementation(() => {});
    const cfg = (await migrateScript.buildPoolConfig(PASSWORDLESS_URL, {
      credential,
    })) as PoolConfig;
    expect(cfg.user).toBe("stage-migrator-role");
  });

  it("trims whitespace off PG_MIGRATOR_PG_USER", () => {
    expect(
      migrateScript.resolveMigratorPgUser({
        PG_MIGRATOR_PG_USER: "  migrator-role  ",
      }),
    ).toBe("migrator-role");
  });

  it("non-production falls back to DEFAULT_MIGRATOR_PG_USER", () => {
    expect(migrateScript.resolveMigratorPgUser({})).toBe(
      migrateScript.DEFAULT_MIGRATOR_PG_USER,
    );
    expect(
      migrateScript.resolveMigratorPgUser({ PG_MIGRATOR_PG_USER: "" }),
    ).toBe(migrateScript.DEFAULT_MIGRATOR_PG_USER);
    expect(
      migrateScript.resolveMigratorPgUser({ PG_MIGRATOR_PG_USER: "   " }),
    ).toBe(migrateScript.DEFAULT_MIGRATOR_PG_USER);
  });

  it("production requires PG_MIGRATOR_PG_USER and ignores the hardcoded default", () => {
    expect(() =>
      migrateScript.resolveMigratorPgUser({ NODE_ENV: "production" }),
    ).toThrow(/PG_MIGRATOR_PG_USER is required in production/);
    expect(() =>
      migrateScript.resolveMigratorPgUser({
        NODE_ENV: "production",
        PG_MIGRATOR_PG_USER: "   ",
      }),
    ).toThrow(/required in production/);
    expect(
      migrateScript.resolveMigratorPgUser({
        NODE_ENV: "production",
        PG_MIGRATOR_PG_USER: "  migrator-role  ",
      }),
    ).toBe("migrator-role");
    expect(
      migrateScript.resolveMigratorPgUser({
        NODE_ENV: "production",
        PG_MIGRATOR_PG_USER: "migrator-role",
      }),
    ).not.toBe(migrateScript.DEFAULT_MIGRATOR_PG_USER);
  });

  it("accepts an explicit pgUser option (test / ops injection)", async () => {
    process.env.PG_MIGRATOR_CLIENT_ID = MIGRATOR_CLIENT_ID;
    delete process.env.PG_MIGRATOR_PG_USER;
    const credential: TokenCredential = {
      getToken: vi.fn(async () => ({
        token: "tok",
        expiresOnTimestamp: Date.now() + 60 * 60_000,
      })),
    };
    vi.spyOn(console, "log").mockImplementation(() => {});
    const cfg = (await migrateScript.buildPoolConfig(PASSWORDLESS_URL, {
      credential,
      pgUser: "explicit-role",
    })) as PoolConfig;
    expect(cfg.user).toBe("explicit-role");
  });

  it("rejects empty tokens the same way the runtime provider does", async () => {
    process.env.PG_MIGRATOR_CLIENT_ID = MIGRATOR_CLIENT_ID;
    const credential: TokenCredential = {
      getToken: vi.fn(async () => ({
        token: "",
        expiresOnTimestamp: Date.now() + 60_000,
      })),
    };
    const cfg = (await migrateScript.buildPoolConfig(PASSWORDLESS_URL, {
      credential,
    })) as PoolConfig;
    await expect((cfg.password as PasswordProvider)()).rejects.toThrow(
      /empty or missing token/i,
    );
  });

  it("password mode is unchanged when PG_AZURE_AD_AUTH is off", async () => {
    process.env.PG_AZURE_AD_AUTH = "0";
    delete process.env.PG_MIGRATOR_CLIENT_ID;
    const cfg = (await migrateScript.buildPoolConfig(
      "postgres://user:pw@localhost:5432/db",
    )) as PoolConfig;
    expect(cfg.connectionString).toBe("postgres://user:pw@localhost:5432/db");
    expect(cfg.password).toBeUndefined();
  });

  it("mirrors the TS helper's shouldUseAzureAdAuth / isPasswordlessPostgresUrl semantics", () => {
    expect(migrateScript.isPasswordlessPostgresUrl(PASSWORDLESS_URL)).toBe(true);
    expect(
      migrateScript.isPasswordlessPostgresUrl(
        "postgres://user:pw@localhost:5432/db",
      ),
    ).toBe(false);
    expect(migrateScript.shouldUseAzureAdAuth(PASSWORDLESS_URL)).toBe(true);
    process.env.PG_AZURE_AD_AUTH = "0";
    expect(migrateScript.shouldUseAzureAdAuth(PASSWORDLESS_URL)).toBe(false);
  });

  it("refuses production startup when sslmode is disable, no-verify, or missing", () => {
    const prod = { NODE_ENV: "production" };
    const remote = "postgresql://app-role@pg.example.com:5432/appdb";
    expect(() =>
      migrateScript.assertProductionDatabaseSslMode(remote, prod),
    ).toThrow(/sslmode/);
    expect(() =>
      migrateScript.assertProductionDatabaseSslMode(`${remote}?sslmode=disable`, prod),
    ).toThrow(/disable/);
    expect(() =>
      migrateScript.assertProductionDatabaseSslMode(`${remote}?sslmode=no-verify`, prod),
    ).toThrow(/no-verify/);
    expect(() =>
      migrateScript.assertProductionDatabaseSslMode(`${remote}?sslmode=verify-full`, prod),
    ).not.toThrow();
    expect(() =>
      migrateScript.assertProductionDatabaseSslMode(`${remote}?sslmode=require`, prod),
    ).not.toThrow();
    expect(() =>
      migrateScript.assertProductionDatabaseSslMode(
        "postgres://timely:timely@localhost:5432/timely",
        prod,
      ),
    ).not.toThrow();
    expect(() =>
      migrateScript.assertProductionDatabaseSslMode(remote, { NODE_ENV: "test" }),
    ).not.toThrow();
  });
});

describe("src/server/db/client — runtime stays on the system MI (#75)", () => {
  const originalAad = process.env.PG_AZURE_AD_AUTH;
  const originalMig = process.env.PG_MIGRATOR_CLIENT_ID;

  afterEach(async () => {
    if (originalAad === undefined) delete process.env.PG_AZURE_AD_AUTH;
    else process.env.PG_AZURE_AD_AUTH = originalAad;
    if (originalMig === undefined) delete process.env.PG_MIGRATOR_CLIENT_ID;
    else process.env.PG_MIGRATOR_CLIENT_ID = originalMig;
    setPasswordProvider(null);
    await closeDb();
  });

  it("the runtime default provider does NOT require PG_MIGRATOR_CLIENT_ID", () => {
    delete process.env.PG_MIGRATOR_CLIENT_ID;
    // Smoke: constructing the default provider must not throw even when
    // PG_MIGRATOR_CLIENT_ID is unset — that env var is only consulted by
    // the migrator path. We never call the returned function here so
    // IMDS is not hit.
    expect(() => createDefaultAzurePasswordProvider({ log: () => {} })).not.toThrow();
  });

  it("the runtime pool uses the injected (app) provider, independent of PG_MIGRATOR_CLIENT_ID", async () => {
    await closeDb();
    process.env.PG_AZURE_AD_AUTH = "1";
    delete process.env.PG_MIGRATOR_CLIENT_ID;
    const appProvider = vi.fn(async () => "app-mi-token");
    setPasswordProvider(appProvider);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const pool: Pool = getPool();
    const options = (pool as unknown as { options: { password?: unknown } })
      .options;
    expect(typeof options.password).toBe("function");
    // The injected app provider is wired through — the migrator UAMI
    // clientId env is irrelevant for the runtime path.
    expect(options.password).toBe(appProvider);
  });

  it("buildPgPoolConfig AAD path never embeds a clientId in the pool config", () => {
    const provider = async () => "tok";
    const cfg = buildPgPoolConfig(PASSWORDLESS_URL, {
      azureAdAuth: true,
      passwordProvider: provider,
    });
    expect(cfg).not.toHaveProperty("clientId");
    const bag = cfg as unknown as Record<string, unknown>;
    for (const key of Object.keys(bag)) {
      expect(key.toLowerCase()).not.toContain("clientid");
    }
  });

  it("runtime AAD pool keeps the URL user and not the migrator role", () => {
    const provider = async () => "tok";
    const cfg = buildPgPoolConfig(PASSWORDLESS_URL, {
      azureAdAuth: true,
      passwordProvider: provider,
    });
    expect(cfg.user).toBe("app-role");
    expect(cfg.user).not.toBe(migrateScript.DEFAULT_MIGRATOR_PG_USER);
  });
});
