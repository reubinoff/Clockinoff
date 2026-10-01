import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  closeDb,
  getDb,
  getPool,
  isAzureAdMode,
  setPasswordProvider,
} from "@/server/db/client";

describe("db/client", () => {
  afterAll(async () => {
    delete process.env.DATABASE_URL;
    await closeDb();
  });

  it("returns cached pool + db", () => {
    const a = getPool();
    const b = getPool();
    expect(a).toBe(b);
    const dbA = getDb();
    const dbB = getDb();
    expect(dbA).toBe(dbB);
  });

  it("closeDb resets caches", async () => {
    getPool();
    await closeDb();
    const a = getPool();
    const b = getPool();
    expect(a).toBe(b);
  });

  it("throws when DATABASE_URL not set", async () => {
    await closeDb();
    const url = process.env.DATABASE_URL;
    const urlTest = process.env.DATABASE_URL_TEST;
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_URL_TEST;
    expect(() => getPool()).toThrow(/DATABASE_URL/);
    if (url) process.env.DATABASE_URL = url;
    if (urlTest) process.env.DATABASE_URL_TEST = urlTest;
  });

  it("recreates pool when url changes", async () => {
    await closeDb();
    const first = getPool();
    const orig = process.env.DATABASE_URL_TEST;
    process.env.DATABASE_URL_TEST = orig + "?application_name=timely_alt";
    const second = getPool();
    expect(second).not.toBe(first);
    process.env.DATABASE_URL_TEST = orig;
    await closeDb();
  });
});

describe("db/client — Azure AD mode", () => {
  afterEach(async () => {
    delete process.env.PG_AZURE_AD_AUTH;
    setPasswordProvider(null);
    await closeDb();
  });

  afterAll(async () => {
    setPasswordProvider(null);
    await closeDb();
  });

  it("uses the injected password provider when PG_AZURE_AD_AUTH=1", async () => {
    await closeDb();
    const provider = vi.fn(async () => "fake-token");
    setPasswordProvider(provider);
    process.env.PG_AZURE_AD_AUTH = "1";
    const pool = getPool();
    expect(isAzureAdMode()).toBe(true);
    // `pg` wires the password function straight through to Client config;
    // we assert on the pool's internal option bag instead of actually
    // opening a socket to a non-AAD server.
    const options = (
      pool as unknown as { options: { password?: unknown } }
    ).options;
    expect(typeof options.password).toBe("function");
  });

  it("stays in password mode when PG_AZURE_AD_AUTH=0 even if URL is passwordless", async () => {
    await closeDb();
    const provider = vi.fn(async () => "unused");
    setPasswordProvider(provider);
    const orig = process.env.DATABASE_URL_TEST;
    process.env.DATABASE_URL_TEST = "postgres://user@localhost:5432/db";
    process.env.PG_AZURE_AD_AUTH = "0";
    const pool = getPool();
    expect(isAzureAdMode()).toBe(false);
    const options = (
      pool as unknown as { options: { password?: unknown } }
    ).options;
    expect(options.password).toBeUndefined();
    expect(provider).not.toHaveBeenCalled();
    process.env.DATABASE_URL_TEST = orig;
  });

  it("getDb reuses the AAD-enabled pool", async () => {
    await closeDb();
    setPasswordProvider(async () => "fake-token");
    process.env.PG_AZURE_AD_AUTH = "1";
    const db1 = getDb();
    const db2 = getDb();
    expect(db1).toBe(db2);
    expect(isAzureAdMode()).toBe(true);
  });
});
