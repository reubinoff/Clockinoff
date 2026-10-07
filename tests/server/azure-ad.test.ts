import { afterEach, describe, expect, it, vi } from "vitest";
import type { TokenCredential } from "@azure/identity";
import { Pool } from "pg";
import {
  AZURE_POSTGRES_SCOPE,
  PG_MIGRATOR_CLIENT_ID_ENV,
  buildPgPoolConfig,
  createMigratorAzurePasswordProvider,
  createTokenPasswordProvider,
  isPasswordlessPostgresUrl,
  shouldUseAzureAdAuth,
} from "@/server/db/azure-ad";

// Reach into pg's internal ConnectionParameters to prove the clobbering
// behaviour the Clockinoff #75 fix is working around. The constructor is a
// stable pg 8.x internal; the test documents the bug and locks in the fix.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ConnectionParameters = require("pg/lib/connection-parameters");

const PASSWORDLESS_URL =
  "postgresql://app-role@pg.example.com:5432/appdb?sslmode=require";

function fakeCredential(
  tokens: Array<{ token: string; expiresOnTimestamp: number }>,
): { credential: TokenCredential; getToken: ReturnType<typeof vi.fn> } {
  const getToken = vi.fn(async () => {
    if (tokens.length === 0) {
      throw new Error("no more tokens");
    }
    return tokens.shift()!;
  });
  return { credential: { getToken }, getToken };
}

describe("isPasswordlessPostgresUrl", () => {
  it("accepts a passwordless postgres URL with user component", () => {
    expect(
      isPasswordlessPostgresUrl(
        "postgresql://app-role@pg.example.com:5432/db?sslmode=require",
      ),
    ).toBe(true);
    expect(
      isPasswordlessPostgresUrl("postgres://user@host:5432/db"),
    ).toBe(true);
  });

  it("rejects URLs that carry a password", () => {
    expect(
      isPasswordlessPostgresUrl("postgres://timely:timely@localhost:5432/timely"),
    ).toBe(false);
  });

  it("rejects URLs with no user component", () => {
    expect(isPasswordlessPostgresUrl("postgres://host:5432/db")).toBe(false);
  });

  it("rejects non-postgres URLs and junk input", () => {
    expect(isPasswordlessPostgresUrl("mysql://user@host/db")).toBe(false);
    expect(isPasswordlessPostgresUrl("not a url")).toBe(false);
    expect(isPasswordlessPostgresUrl(undefined)).toBe(false);
    expect(isPasswordlessPostgresUrl("")).toBe(false);
  });
});

describe("shouldUseAzureAdAuth", () => {
  const passworded = "postgres://timely:timely@localhost:5432/timely";
  const passwordless =
    "postgresql://app-role@pg.example.com:5432/db?sslmode=require";

  it("honours an explicit on flag over the URL shape", () => {
    expect(shouldUseAzureAdAuth(passworded, { PG_AZURE_AD_AUTH: "1" })).toBe(true);
    expect(shouldUseAzureAdAuth(passworded, { PG_AZURE_AD_AUTH: "true" })).toBe(true);
    expect(shouldUseAzureAdAuth(passworded, { PG_AZURE_AD_AUTH: "YES" })).toBe(true);
  });

  it("honours an explicit off flag over the URL shape", () => {
    expect(shouldUseAzureAdAuth(passwordless, { PG_AZURE_AD_AUTH: "0" })).toBe(false);
    expect(shouldUseAzureAdAuth(passwordless, { PG_AZURE_AD_AUTH: "false" })).toBe(false);
    expect(shouldUseAzureAdAuth(passwordless, { PG_AZURE_AD_AUTH: "no" })).toBe(false);
  });

  it("falls back to URL detection when the flag is empty / unknown", () => {
    expect(shouldUseAzureAdAuth(passwordless, {})).toBe(true);
    expect(shouldUseAzureAdAuth(passworded, {})).toBe(false);
    expect(shouldUseAzureAdAuth(passwordless, { PG_AZURE_AD_AUTH: "" })).toBe(true);
    expect(shouldUseAzureAdAuth(passwordless, { PG_AZURE_AD_AUTH: "maybe" })).toBe(true);
  });

  it("ignores URL casing on the flag value", () => {
    expect(shouldUseAzureAdAuth(passworded, { PG_AZURE_AD_AUTH: "  TRUE  " })).toBe(true);
  });
});

describe("createTokenPasswordProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches a token with the Azure Postgres scope by default", async () => {
    const { credential, getToken } = fakeCredential([
      { token: "tok-1", expiresOnTimestamp: Date.now() + 60 * 60_000 },
    ]);
    const getPassword = createTokenPasswordProvider(credential, {
      log: () => {},
    });
    await expect(getPassword()).resolves.toBe("tok-1");
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(getToken).toHaveBeenCalledWith(AZURE_POSTGRES_SCOPE);
  });

  it("caches the token until it is close to expiry", async () => {
    const now = { value: 1_000_000 };
    const expiresOnTimestamp = now.value + 60 * 60_000;
    const { credential, getToken } = fakeCredential([
      { token: "tok-A", expiresOnTimestamp },
      { token: "tok-B", expiresOnTimestamp: expiresOnTimestamp + 60 * 60_000 },
    ]);
    const getPassword = createTokenPasswordProvider(credential, {
      now: () => now.value,
      refreshBufferMs: 5 * 60_000,
      log: () => {},
    });
    await expect(getPassword()).resolves.toBe("tok-A");
    now.value += 10 * 60_000;
    await expect(getPassword()).resolves.toBe("tok-A");
    expect(getToken).toHaveBeenCalledTimes(1);

    now.value = expiresOnTimestamp - 60_000;
    await expect(getPassword()).resolves.toBe("tok-B");
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent token fetches", async () => {
    let resolve!: (v: { token: string; expiresOnTimestamp: number }) => void;
    const getToken = vi.fn(
      async () =>
        new Promise<{ token: string; expiresOnTimestamp: number }>((r) => {
          resolve = r;
        }),
    );
    const credential: TokenCredential = { getToken };
    const getPassword = createTokenPasswordProvider(credential, {
      log: () => {},
    });
    const a = getPassword();
    const b = getPassword();
    resolve({ token: "shared", expiresOnTimestamp: Date.now() + 60 * 60_000 });
    await expect(a).resolves.toBe("shared");
    await expect(b).resolves.toBe("shared");
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it("throws when the credential returns no token", async () => {
    const credential: TokenCredential = {
      getToken: vi.fn(async () => null),
    };
    const getPassword = createTokenPasswordProvider(credential, {
      log: () => {},
    });
    await expect(getPassword()).rejects.toThrow(
      /empty or missing token/i,
    );
  });

  it("rejects when the credential returns an empty-string token (Shaul's gate)", async () => {
    // Clockinoff #75: `token: ""` was the pre-fix failure mode. If we let
    // it through, pg would send an empty password and Azure AAD would
    // return `28P01 Password returned by client is empty`. Abort before
    // the socket is opened.
    const credential: TokenCredential = {
      getToken: vi.fn(async () => ({
        token: "",
        expiresOnTimestamp: Date.now() + 60_000,
      })),
    };
    const getPassword = createTokenPasswordProvider(credential, {
      log: () => {},
    });
    await expect(getPassword()).rejects.toThrow(
      /empty or missing token/i,
    );
  });

  it("rejects when the credential returns a non-string token", async () => {
    const credential: TokenCredential = {
      getToken: vi.fn(async () =>
        ({
          token: undefined,
          expiresOnTimestamp: Date.now() + 60_000,
        }) as unknown as { token: string; expiresOnTimestamp: number }),
    };
    const getPassword = createTokenPasswordProvider(credential, {
      log: () => {},
    });
    await expect(getPassword()).rejects.toThrow(
      /empty or missing token/i,
    );
  });

  it("logs only the token length and TTL, never the token itself", async () => {
    const secret = "x".repeat(1234);
    const credential: TokenCredential = {
      getToken: vi.fn(async () => ({
        token: secret,
        expiresOnTimestamp: Date.now() + 60 * 60_000,
      })),
    };
    const log = vi.fn();
    const getPassword = createTokenPasswordProvider(credential, { log });
    await getPassword();
    expect(log).toHaveBeenCalled();
    for (const call of log.mock.calls) {
      for (const arg of call) {
        expect(String(arg)).not.toContain(secret);
        expect(String(arg)).not.toContain(secret.slice(0, 32));
      }
    }
    const [fmt, length] = log.mock.calls[0];
    expect(String(fmt)).toContain("length=%d");
    expect(length).toBe(secret.length);
  });

  it("retries after a failed fetch instead of caching the rejection", async () => {
    let call = 0;
    const credential: TokenCredential = {
      getToken: vi.fn(async () => {
        call += 1;
        if (call === 1) throw new Error("boom");
        return {
          token: "recovered",
          expiresOnTimestamp: Date.now() + 60 * 60_000,
        };
      }),
    };
    const getPassword = createTokenPasswordProvider(credential, {
      log: () => {},
    });
    await expect(getPassword()).rejects.toThrow(/boom/);
    await expect(getPassword()).resolves.toBe("recovered");
    expect(credential.getToken).toHaveBeenCalledTimes(2);
  });
});

describe("buildPgPoolConfig", () => {
  it("password mode keeps the connectionString intact", () => {
    const cfg = buildPgPoolConfig(
      "postgres://user:pw@host:5432/db?sslmode=require",
    );
    expect(cfg).toMatchObject({
      connectionString: "postgres://user:pw@host:5432/db?sslmode=require",
    });
    expect(cfg).not.toHaveProperty("user");
    expect(cfg).not.toHaveProperty("password");
  });

  it("password mode merges overrides over the base config", () => {
    const cfg = buildPgPoolConfig("postgres://u:p@h/d", {
      overrides: { max: 7, idleTimeoutMillis: 1234 },
    });
    expect(cfg.max).toBe(7);
    expect(cfg.idleTimeoutMillis).toBe(1234);
    expect(cfg.connectionString).toBe("postgres://u:p@h/d");
  });

  it("AAD mode emits discrete fields, drops connectionString, and preserves the provider", () => {
    const provider = async () => "FAKE_TOKEN";
    const cfg = buildPgPoolConfig(PASSWORDLESS_URL, {
      azureAdAuth: true,
      passwordProvider: provider,
    });
    expect(cfg.connectionString).toBeUndefined();
    expect(cfg.user).toBe("app-role");
    expect(cfg.host).toBe("pg.example.com");
    expect(cfg.port).toBe(5432);
    expect(cfg.database).toBe("appdb");
    expect(cfg.ssl).toBeTruthy();
    expect(typeof cfg.password).toBe("function");
    expect(cfg.password).toBe(provider);
  });

  it("AAD mode auto-detects from a passwordless URL when the flag is omitted", () => {
    const provider = async () => "FAKE_TOKEN";
    const cfg = buildPgPoolConfig(PASSWORDLESS_URL, {
      passwordProvider: provider,
    });
    expect(cfg.connectionString).toBeUndefined();
    expect(cfg.password).toBe(provider);
  });

  it("AAD mode strips any connectionString sneaked in via overrides", () => {
    const provider = async () => "FAKE_TOKEN";
    const cfg = buildPgPoolConfig(PASSWORDLESS_URL, {
      azureAdAuth: true,
      passwordProvider: provider,
      overrides: {
        connectionString: "postgres://other@host/db",
        max: 1,
      } as unknown as import("pg").PoolConfig,
    });
    expect(cfg.connectionString).toBeUndefined();
    expect(cfg.password).toBe(provider);
    expect(cfg.max).toBe(1);
  });

  it("AAD mode wins over a literal password sneaked in via overrides", () => {
    const provider = async () => "FAKE_TOKEN";
    const cfg = buildPgPoolConfig(PASSWORDLESS_URL, {
      azureAdAuth: true,
      passwordProvider: provider,
      overrides: {
        password: "literal-should-be-ignored",
      } as unknown as import("pg").PoolConfig,
    });
    expect(cfg.password).toBe(provider);
  });

  it("AAD mode throws when no provider is supplied", () => {
    expect(() =>
      buildPgPoolConfig(PASSWORDLESS_URL, { azureAdAuth: true }),
    ).toThrow(/passwordProvider/);
  });

  it("AAD mode handles URLs without an explicit port", () => {
    const provider = async () => "FAKE_TOKEN";
    const cfg = buildPgPoolConfig(
      "postgresql://app-role@db.example.com/appdb?sslmode=require",
      { azureAdAuth: true, passwordProvider: provider },
    );
    expect(cfg.port).toBeUndefined();
    expect(cfg.user).toBe("app-role");
    expect(cfg.password).toBe(provider);
  });
});

describe("createMigratorAzurePasswordProvider (migrator UAMI contract — #75)", () => {
  it("binds the credential to PG_MIGRATOR_CLIENT_ID and uses the AAD Postgres scope", async () => {
    const fakeToken = { token: "migrator-tok", expiresOnTimestamp: Date.now() + 60 * 60_000 };
    const getToken = vi.fn(async () => fakeToken);
    const seenClientIds: string[] = [];
    const credentialFactory = (clientId: string) => {
      seenClientIds.push(clientId);
      return { getToken } as TokenCredential;
    };
    const getPassword = createMigratorAzurePasswordProvider({
      env: { [PG_MIGRATOR_CLIENT_ID_ENV]: "00000000-0000-4000-8000-000000000001" },
      credentialFactory,
      log: () => {},
    });
    await expect(getPassword()).resolves.toBe("migrator-tok");
    expect(seenClientIds).toEqual(["00000000-0000-4000-8000-000000000001"]);
    expect(getToken).toHaveBeenCalledWith(AZURE_POSTGRES_SCOPE);
  });

  it("trims surrounding whitespace off the clientId env", () => {
    const credentialFactory = vi.fn(
      (clientId: string): TokenCredential => {
        expect(clientId).toBe("00000000-0000-4000-8000-000000000001");
        return { getToken: vi.fn(async () => null) };
      },
    );
    createMigratorAzurePasswordProvider({
      env: { [PG_MIGRATOR_CLIENT_ID_ENV]: "  00000000-0000-4000-8000-000000000001  " },
      credentialFactory,
      log: () => {},
    });
    expect(credentialFactory).toHaveBeenCalledTimes(1);
  });

  it("fails fast with a clear error when PG_MIGRATOR_CLIENT_ID is missing", () => {
    expect(() => createMigratorAzurePasswordProvider({ env: {} })).toThrow(
      /PG_MIGRATOR_CLIENT_ID is required/i,
    );
    expect(() =>
      createMigratorAzurePasswordProvider({ env: { PG_MIGRATOR_CLIENT_ID: "" } }),
    ).toThrow(/PG_MIGRATOR_CLIENT_ID is required/i);
    expect(() =>
      createMigratorAzurePasswordProvider({ env: { PG_MIGRATOR_CLIENT_ID: "   " } }),
    ).toThrow(/PG_MIGRATOR_CLIENT_ID is required/i);
  });

  it("mentions the DDL-vs-DML contract so the operator sees the real cause", () => {
    try {
      createMigratorAzurePasswordProvider({ env: {} });
      throw new Error("expected throw");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toMatch(/migrator user-assigned managed identity/i);
      expect(message).toMatch(/system-assigned MI/i);
      expect(message).toMatch(/#75/);
    }
  });

  it("inherits Shaul's empty-token gate from the shared provider helper", async () => {
    const credentialFactory = (): TokenCredential => ({
      getToken: vi.fn(async () => ({
        token: "",
        expiresOnTimestamp: Date.now() + 60_000,
      })),
    });
    const getPassword = createMigratorAzurePasswordProvider({
      env: { [PG_MIGRATOR_CLIENT_ID_ENV]: "00000000-0000-4000-8000-000000000001" },
      credentialFactory,
      log: () => {},
    });
    await expect(getPassword()).rejects.toThrow(/empty or missing token/i);
  });
});

describe("pg does not clobber the token provider (regression for #75)", () => {
  it("reproduces the bug when connectionString + password are passed together", () => {
    // Lock in the negative so a future refactor cannot silently
    // reintroduce the `{ connectionString, password: fn }` shape that
    // caused the production 503. See src/server/db/azure-ad.ts header.
    const provider = async () => "TOKEN";
    const bad = new ConnectionParameters({
      connectionString: PASSWORDLESS_URL,
      password: provider,
    });
    expect(typeof bad.password).not.toBe("function");
  });

  it("buildPgPoolConfig(AAD) survives ConnectionParameters without losing the provider", () => {
    const provider = async () => "TOKEN";
    const cfg = buildPgPoolConfig(PASSWORDLESS_URL, {
      azureAdAuth: true,
      passwordProvider: provider,
    });
    const params = new ConnectionParameters(cfg);
    expect(typeof params.password).toBe("function");
    expect(params.password).toBe(provider);
    expect(params.user).toBe("app-role");
    expect(params.host).toBe("pg.example.com");
    expect(params.port).toBe(5432);
    expect(params.database).toBe("appdb");
  });

  it("new Pool(cfg) carries the provider through to the pool options", async () => {
    const provider = async () => "TOKEN";
    const cfg = buildPgPoolConfig(PASSWORDLESS_URL, {
      azureAdAuth: true,
      passwordProvider: provider,
    });
    const pool = new Pool(cfg);
    try {
      expect(typeof (pool.options as { password?: unknown }).password).toBe(
        "function",
      );
      expect(
        "connectionString" in (pool.options as unknown as Record<string, unknown>),
      ).toBe(false);
    } finally {
      await pool.end().catch(() => {});
    }
  });
});
