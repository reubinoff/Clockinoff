import { describe, expect, it } from "vitest";
import { isConfigRoute } from "@/lib/shell-routes";

describe("isConfigRoute", () => {
  it("treats library and account pages as configuration", () => {
    expect(isConfigRoute("/app/projects")).toBe(true);
    expect(isConfigRoute("/app/projects/anything")).toBe(true);
    expect(isConfigRoute("/app/clients")).toBe(true);
    expect(isConfigRoute("/app/tags")).toBe(true);
    expect(isConfigRoute("/app/account")).toBe(true);
    expect(isConfigRoute("/admin")).toBe(true);
    expect(isConfigRoute("/admin/users")).toBe(true);
  });

  it("keeps the timer dock on timer, reports, and export", () => {
    expect(isConfigRoute("/app")).toBe(false);
    expect(isConfigRoute("/app/reports")).toBe(false);
    expect(isConfigRoute("/app/export")).toBe(false);
    expect(isConfigRoute("/app/projects-extra")).toBe(false);
  });
});
