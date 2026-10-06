import { describe, expect, it } from "vitest";
import { REGISTER_FAILURE_COPY } from "@/lib/register-copy";

describe("register failure copy (#159)", () => {
  it("nudges Sign in without naming an account type or confirming the email is taken", () => {
    expect(REGISTER_FAILURE_COPY.toLowerCase()).toContain("sign in");
    for (const leak of ["already", "taken", "exists", "google", "password", "email"]) {
      expect(REGISTER_FAILURE_COPY.toLowerCase()).not.toContain(leak);
    }
  });
});
