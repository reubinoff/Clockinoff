import { describe, expect, it } from "vitest";
import { REDACTED } from "@/lib/scrub";
import {
  isPgTelemetrySensitiveKey,
  pgInstrumentationOptions,
  redactPgSpanAttribute,
  scrubSqlLiterals,
} from "@/lib/pg-telemetry";

describe("pg telemetry", () => {
  it("keeps dependency spans and leaves bound parameters off the span", () => {
    expect(pgInstrumentationOptions.enabled).toBe(true);
    expect(pgInstrumentationOptions.enhancedDatabaseReporting).toBe(false);
    const calls: Array<[string, string]> = [];
    pgInstrumentationOptions.requestHook(
      {
        setAttribute(key, value) {
          calls.push([key, value]);
        },
      },
      { query: { text: "select * from users where email = 'ada@ex.com' and id = $1" } },
    );
    expect(calls).toEqual([
      ["db.query.text", `select * from users where email = '${REDACTED}' and id = $1`],
    ]);
  });

  it("scrubs quoted literals and redacts parameter attributes", () => {
    expect(scrubSqlLiterals("select 'it''s'")).toBe(`select '${REDACTED}'`);
    expect(scrubSqlLiterals("delete from users where id = $1")).toBe(
      "delete from users where id = $1",
    );
    expect(isPgTelemetrySensitiveKey("db.postgresql.values")).toBe(true);
    expect(isPgTelemetrySensitiveKey("db.query.parameter.0")).toBe(true);
    expect(isPgTelemetrySensitiveKey("db.namespace")).toBe(false);
    expect(redactPgSpanAttribute("db.postgresql.values", ["secret"])).toBe(REDACTED);
    expect(redactPgSpanAttribute("db.query.text", "select 'tok'")).toBe(`select '${REDACTED}'`);
    expect(redactPgSpanAttribute("db.statement", "postgres://u:p@h/db")).toBe(
      "[REDACTED_DATABASE_URL]",
    );
    expect(redactPgSpanAttribute("http.url", "/app")).toBeUndefined();
  });
});
