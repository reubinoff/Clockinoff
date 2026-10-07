import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isQaTestEmail, QA_TEST_EMAIL_PATTERN } from "@/lib/qa-allowlist";

describe("QA seed allowlist", () => {
  it("matches the #193 prefixes and rejects neighbours", () => {
    expect(isQaTestEmail("gabi.qa.nightly@primesec.ai")).toBe(true);
    expect(isQaTestEmail("Dana.QA.Smoke_1@PrimeSec.ai")).toBe(true);
    expect(isQaTestEmail("ariel.qa.a+b@primesec.ai")).toBe(true);
    expect(isQaTestEmail("  gabi.qa.x@primesec.ai  ")).toBe(true);

    expect(isQaTestEmail("gabi.qa@primesec.ai")).toBe(false);
    expect(isQaTestEmail("gabi.qa.@primesec.ai")).toBe(false);
    expect(isQaTestEmail("bob.qa.1@primesec.ai")).toBe(false);
    expect(isQaTestEmail("gabi.qa.1@example.com")).toBe(false);
    expect(isQaTestEmail("person@example.com")).toBe(false);
  });

  it("uses the same pattern as the is_test backfill", () => {
    const sql = readFileSync("drizzle/0006_users_is_test.sql", "utf8");
    expect(sql).toContain(QA_TEST_EMAIL_PATTERN);
  });
});
