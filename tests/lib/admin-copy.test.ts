import { describe, expect, it } from "vitest";
import {
  ADMIN_GUARD,
  BULK_REMOVE_COPY,
  adminActionErrorMessage,
  bulkRemoveFailureMessage,
} from "@/lib/admin-copy";

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
    expect(adminActionErrorMessage(ADMIN_GUARD.adminRemove)).toBe(ADMIN_GUARD.adminRemove);
    expect(adminActionErrorMessage(ADMIN_GUARD.adminBlock)).toBe(ADMIN_GUARD.adminBlock);
  });

  it("maps bulk-remove failures to the locked copy and hides anything else", () => {
    expect(bulkRemoveFailureMessage(BULK_REMOVE_COPY.mismatch)).toBe(BULK_REMOVE_COPY.mismatch);
    expect(bulkRemoveFailureMessage(BULK_REMOVE_COPY.overCap)).toBe(BULK_REMOVE_COPY.overCap);
    expect(bulkRemoveFailureMessage("password hash leaked")).toBe(BULK_REMOVE_COPY.generic);
    expect(bulkRemoveFailureMessage(null)).toBe(BULK_REMOVE_COPY.generic);
  });
});
