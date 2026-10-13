import { describe, expect, it } from "vitest";
import {
  adminUserAriaSort,
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

  it("allowlists visible columns and asc|desc independently", () => {
    expect(parseAdminUserSort("email", "asc")).toEqual({ sort: "email", dir: "asc" });
    expect(parseAdminUserSort("role", "desc")).toEqual({ sort: "role", dir: "desc" });
    expect(parseAdminUserSort("status", "asc")).toEqual({ sort: "status", dir: "asc" });
    expect(parseAdminUserSort("activity", "desc")).toEqual({
      sort: "activity",
      dir: "desc",
    });
    expect(parseAdminUserSort("email", "nope")).toEqual({ sort: "email", dir: "desc" });
    expect(parseAdminUserSort("nope", "asc")).toEqual({ sort: "created", dir: "asc" });
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
