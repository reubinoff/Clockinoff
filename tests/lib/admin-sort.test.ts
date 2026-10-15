import { describe, expect, it } from "vitest";
import {
  adminUserAriaSort,
  adminUserSortFromSearchParams,
  nextAdminUserSort,
  parseAdminUserSort,
} from "@/lib/admin-sort";

describe("parseAdminUserSort", () => {
  it("defaults to created desc when params are missing or invalid", () => {
    expect(parseAdminUserSort(undefined, undefined)).toEqual({
      sort: "created",
      dir: "desc",
    });
    expect(parseAdminUserSort(null, null)).toEqual({ sort: "created", dir: "desc" });
    expect(parseAdminUserSort("", "")).toEqual({ sort: "created", dir: "desc" });
    expect(parseAdminUserSort("password", "sideways")).toEqual({
      sort: "created",
      dir: "desc",
    });
    expect(parseAdminUserSort("email;drop", "ASC")).toEqual({
      sort: "created",
      dir: "desc",
    });
  });

  it("allowlists exact column keys and asc|desc", () => {
    expect(parseAdminUserSort("email", "asc")).toEqual({ sort: "email", dir: "asc" });
    expect(parseAdminUserSort("role", "desc")).toEqual({ sort: "role", dir: "desc" });
    expect(parseAdminUserSort("status", "asc")).toEqual({ sort: "status", dir: "asc" });
    expect(parseAdminUserSort("activity", "desc")).toEqual({
      sort: "activity",
      dir: "desc",
    });
    expect(parseAdminUserSort("email", undefined)).toEqual({ sort: "email", dir: "desc" });
    expect(parseAdminUserSort(undefined, "asc")).toEqual({ sort: "created", dir: "asc" });
  });

  it("falls back to created desc for wrong case and injection payloads", () => {
    const fallback = { sort: "created" as const, dir: "desc" as const };
    expect(parseAdminUserSort("Email", "asc")).toEqual(fallback);
    expect(parseAdminUserSort("CREATED", "Desc")).toEqual(fallback);
    expect(parseAdminUserSort("email", "ASC")).toEqual(fallback);
    expect(parseAdminUserSort("email", "nope")).toEqual(fallback);
    expect(parseAdminUserSort("nope", "asc")).toEqual(fallback);
    expect(parseAdminUserSort("created); drop table users; --", "asc")).toEqual(fallback);
    expect(parseAdminUserSort("email", "asc; delete from users")).toEqual(fallback);
    expect(parseAdminUserSort("' OR 1=1 --", "desc, (select 1)")).toEqual(fallback);
  });

  it("falls back to created desc for prototype keys and very long values", () => {
    const fallback = { sort: "created" as const, dir: "desc" as const };
    const longSort = "s".repeat(10_000);
    const longDir = "d".repeat(10_000);
    expect(() => parseAdminUserSort("__proto__", "desc")).not.toThrow();
    expect(() => parseAdminUserSort("constructor", "asc")).not.toThrow();
    expect(() => parseAdminUserSort(longSort, longDir)).not.toThrow();
    expect(parseAdminUserSort("__proto__", "desc")).toEqual(fallback);
    expect(parseAdminUserSort("constructor", "asc")).toEqual(fallback);
    expect(parseAdminUserSort("__proto__", "__proto__")).toEqual(fallback);
    expect(parseAdminUserSort("constructor", "constructor")).toEqual(fallback);
    expect(parseAdminUserSort(longSort, "desc")).toEqual(fallback);
    expect(parseAdminUserSort("email", longDir)).toEqual(fallback);

    const repeated = new URLSearchParams("sort=email&sort=__proto__&dir=asc");
    expect(adminUserSortFromSearchParams(repeated)).toEqual(fallback);
    expect(
      adminUserSortFromSearchParams(new URLSearchParams("sort=email&sort=email&dir=asc")),
    ).toEqual(fallback);
    expect(
      adminUserSortFromSearchParams(new URLSearchParams("sort=constructor&dir=desc")),
    ).toEqual(fallback);
    expect(
      adminUserSortFromSearchParams(
        new URLSearchParams(`sort=${encodeURIComponent(longSort)}&dir=asc`),
      ),
    ).toEqual(fallback);
    expect(adminUserSortFromSearchParams(new URLSearchParams("sort=email&dir=asc"))).toEqual({
      sort: "email",
      dir: "asc",
    });
  });
});

describe("nextAdminUserSort", () => {
  it("uses each column's natural direction, then toggles", () => {
    const created = { sort: "created" as const, dir: "desc" as const };
    expect(nextAdminUserSort(created, "email")).toEqual({ sort: "email", dir: "asc" });
    expect(nextAdminUserSort(created, "activity")).toEqual({
      sort: "activity",
      dir: "desc",
    });
    expect(nextAdminUserSort({ sort: "email", dir: "asc" }, "email")).toEqual({
      sort: "email",
      dir: "desc",
    });
    expect(nextAdminUserSort({ sort: "created", dir: "desc" }, "created")).toEqual({
      sort: "created",
      dir: "asc",
    });
  });
});

describe("adminUserAriaSort", () => {
  it("marks only the active column", () => {
    const active = { sort: "created" as const, dir: "desc" as const };
    expect(adminUserAriaSort("created", active)).toBe("descending");
    expect(adminUserAriaSort("email", active)).toBe("none");
    expect(adminUserAriaSort("email", { sort: "email", dir: "asc" })).toBe("ascending");
  });
});
