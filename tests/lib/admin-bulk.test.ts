import { describe, expect, it } from "vitest";
import { ADMIN_GUARD } from "@/lib/admin-copy";
import {
  bulkConfirmTitle,
  bulkIneligibleReason,
  bulkSampleEmails,
  bulkSkippedToast,
  bulkWillSkipLine,
  isBulkEligible,
  partitionBulk,
  type BulkSubject,
} from "@/lib/admin-bulk";

const actor = "actor";
const self: BulkSubject = { id: actor, role: "admin", status: "active" };
const otherAdmin: BulkSubject = { id: "other-admin", role: "admin", status: "active" };
const member: BulkSubject = { id: "member", role: "user", status: "active" };
const blocked: BulkSubject = { id: "blocked", role: "user", status: "blocked" };

describe("admin bulk eligibility", () => {
  it("skips self and the last admin, and keeps everyone else removable", () => {
    expect(bulkIneligibleReason("remove", self, actor, 1)).toBe(ADMIN_GUARD.lastAdmin);
    expect(bulkIneligibleReason("remove", self, actor, 2)).toBe(ADMIN_GUARD.selfRemove);
    expect(isBulkEligible("remove", member, actor, 1)).toBe(true);
    expect(isBulkEligible("remove", otherAdmin, actor, 2)).toBe(true);
    expect(isBulkEligible("remove", otherAdmin, actor, 1)).toBe(false);
  });

  it("shows block and unblock only for the matching status, never self-block", () => {
    expect(bulkIneligibleReason("block", self, actor, 2)).toBe(ADMIN_GUARD.selfBlock);
    expect(bulkIneligibleReason("block", blocked, actor, 2)).toBe("Already blocked");
    expect(isBulkEligible("block", member, actor, 2)).toBe(true);
    expect(isBulkEligible("unblock", blocked, actor, 2)).toBe(true);
    expect(bulkIneligibleReason("unblock", member, actor, 2)).toBe("Not blocked");
    expect(isBulkEligible("unblock", self, actor, 2)).toBe(false);
  });

  it("promotes non-admins and demotes other admins except the last one", () => {
    expect(isBulkEligible("promote", member, actor, 1)).toBe(true);
    expect(bulkIneligibleReason("promote", otherAdmin, actor, 2)).toBe("Already an admin");
    expect(bulkIneligibleReason("demote", member, actor, 2)).toBe("Not an admin");
    expect(bulkIneligibleReason("demote", self, actor, 1)).toBe(ADMIN_GUARD.lastAdminDemote);
    expect(bulkIneligibleReason("demote", self, actor, 2)).toBe(ADMIN_GUARD.selfDemote);
    expect(isBulkEligible("demote", otherAdmin, actor, 2)).toBe(true);
  });

  it("partitions a mixed selection and builds confirm copy", () => {
    const rows = [self, otherAdmin, member, blocked];
    const removed = partitionBulk("remove", rows, actor, 2);
    expect(removed.eligible.map((u) => u.id)).toEqual(["other-admin", "member", "blocked"]);
    expect(removed.skipped.map((u) => u.id)).toEqual([actor]);

    expect(bulkConfirmTitle("remove", 1)).toBe("Remove 1 user?");
    expect(bulkConfirmTitle("block", 3)).toBe("Block 3 users?");
    expect(bulkSampleEmails(["a", "b", "c", "d"])).toEqual({
      shown: ["a", "b", "c"],
      more: 1,
    });
    expect(bulkSampleEmails(["a"])).toEqual({ shown: ["a"], more: 0 });
    expect(bulkWillSkipLine(0)).toBeNull();
    expect(bulkWillSkipLine(1)).toBe("1 will be skipped.");
    expect(bulkWillSkipLine(2)).toBe("2 will be skipped.");
    expect(bulkSkippedToast("remove", 3, 1)).toBe("Removed 3. Skipped 1.");
    expect(bulkSkippedToast("block", 0, 2)).toBe("Skipped 2.");
    expect(bulkSkippedToast("promote", 2, 0)).toBeNull();
    expect(bulkSkippedToast("demote", 1, 1)).toBe("Demoted 1. Skipped 1.");
    expect(bulkSkippedToast("unblock", 1, 4)).toBe("Unblocked 1. Skipped 4.");
  });
});
