import { describe, expect, it } from "vitest";
import { ADMIN_GUARD, adminActionErrorMessage } from "@/lib/admin-copy";

describe("admin guard copy", () => {
  it("keeps the locked strings and falls back otherwise", () => {
    expect(adminActionErrorMessage(ADMIN_GUARD.selfRemove)).toBe(ADMIN_GUARD.selfRemove);
    expect(adminActionErrorMessage(ADMIN_GUARD.selfBlock)).toBe(ADMIN_GUARD.selfBlock);
    expect(adminActionErrorMessage(ADMIN_GUARD.selfDemote)).toBe(ADMIN_GUARD.selfDemote);
    expect(adminActionErrorMessage(ADMIN_GUARD.lastAdmin)).toBe(ADMIN_GUARD.lastAdmin);
    expect(adminActionErrorMessage(ADMIN_GUARD.lastAdminDemote)).toBe(
      ADMIN_GUARD.lastAdminDemote,
    );
    expect(adminActionErrorMessage("nope")).toBe(ADMIN_GUARD.generic);
    expect(adminActionErrorMessage(null)).toBe(ADMIN_GUARD.generic);
  });
});
