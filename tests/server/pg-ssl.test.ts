import { describe, expect, it } from "vitest";
import { assertProductionDatabaseSslMode } from "@/server/db/pg-ssl";

const REMOTE = "postgresql://app-role@pg.example.com:5432/appdb";
const PROD = { NODE_ENV: "production" as const };

describe("assertProductionDatabaseSslMode", () => {
  it("does nothing outside production and during next build", () => {
    expect(() => assertProductionDatabaseSslMode(REMOTE, { NODE_ENV: "test" })).not.toThrow();
    expect(() =>
      assertProductionDatabaseSslMode(REMOTE, {
        NODE_ENV: "production",
        NEXT_PHASE: "phase-production-build",
      }),
    ).not.toThrow();
    expect(() => assertProductionDatabaseSslMode(undefined, { NODE_ENV: "development" })).not.toThrow();
  });

  it("refuses disable, no-verify, missing, and a non-postgres URL in production", () => {
    expect(() => assertProductionDatabaseSslMode(undefined, PROD)).toThrow(/DATABASE_URL is required/);
    expect(() => assertProductionDatabaseSslMode("not a url", PROD)).toThrow(/not a valid postgres URL/);
    expect(() => assertProductionDatabaseSslMode("mysql://app-role@pg.example.com/appdb", PROD)).toThrow(
      /postgres URL/,
    );
    expect(() => assertProductionDatabaseSslMode(REMOTE, PROD)).toThrow(/missing/);
    expect(() => assertProductionDatabaseSslMode(`${REMOTE}?sslmode=`, PROD)).toThrow(/sslmode/);
    expect(() => assertProductionDatabaseSslMode(`${REMOTE}?sslmode=disable`, PROD)).toThrow(/disable/);
    expect(() => assertProductionDatabaseSslMode(`${REMOTE}?sslmode=DISABLE`, PROD)).toThrow(/disable/);
    expect(() => assertProductionDatabaseSslMode(`${REMOTE}?sslmode=no-verify`, PROD)).toThrow(
      /no-verify/,
    );
  });

  it("allows verify-full and still accepts require until the KV flip", () => {
    expect(() =>
      assertProductionDatabaseSslMode(`${REMOTE}?sslmode=verify-full`, PROD),
    ).not.toThrow();
    expect(() =>
      assertProductionDatabaseSslMode(`${REMOTE}?sslmode=VERIFY-FULL`, PROD),
    ).not.toThrow();
    expect(() => assertProductionDatabaseSslMode(`${REMOTE}?sslmode=require`, PROD)).not.toThrow();
    expect(() => assertProductionDatabaseSslMode(`${REMOTE}?sslmode=verify-ca`, PROD)).not.toThrow();
  });

  it("exempts loopback so CI next start can use Postgres without TLS", () => {
    expect(() =>
      assertProductionDatabaseSslMode("postgres://timely:timely@localhost:5432/timely", PROD),
    ).not.toThrow();
    expect(() =>
      assertProductionDatabaseSslMode("postgres://timely:timely@127.0.0.1:5432/timely?sslmode=disable", PROD),
    ).not.toThrow();
    expect(() =>
      assertProductionDatabaseSslMode("postgres://timely:timely@[::1]:5432/timely", PROD),
    ).not.toThrow();
  });
});
