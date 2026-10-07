import { describe, expect, it } from "vitest";
import {
  asUserRole,
  initialRoleForEmail,
  isBootstrapAdminEmail,
  parseAdminEmails,
} from "@/lib/admin-role";

describe("admin emails", () => {
  it("parses, trims, lowercases, and dedupes", () => {
    expect(parseAdminEmails(undefined)).toEqual([]);
    expect(parseAdminEmails("  A@X.com, a@x.com ,, B@y.com ")).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
  });

  it("matches bootstrap emails case-insensitively", () => {
    expect(isBootstrapAdminEmail("A@x.com", "a@x.com")).toBe(true);
    expect(isBootstrapAdminEmail("nope@x.com", "a@x.com")).toBe(false);
    expect(initialRoleForEmail("A@x.com")).toBe("user");
  });

  it("coerces unknown role strings to user", () => {
    expect(asUserRole("admin")).toBe("admin");
    expect(asUserRole("root")).toBe("user");
  });
});
