import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb, getPool } from "@/server/db/client";

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
