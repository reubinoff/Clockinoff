import { describe, expect, it } from "vitest";
import { AUDIT_USER_AGENT_MAX, capAuditUserAgent } from "@/lib/audit-user-agent";

describe("capAuditUserAgent", () => {
  it("caps the value at 512 characters before insert", () => {
    const agent = `UA/${"a".repeat(800)}`;
    const capped = capAuditUserAgent(`  ${agent}  `);
    expect(AUDIT_USER_AGENT_MAX).toBe(512);
    expect(capped).toHaveLength(512);
    expect(capped).toBe(agent.slice(0, 512));
  });

  it("keeps a short agent and drops blank values", () => {
    expect(capAuditUserAgent("ClockinoffAdmin/9")).toBe("ClockinoffAdmin/9");
    expect(capAuditUserAgent("   ")).toBeNull();
    expect(capAuditUserAgent(null)).toBeNull();
    expect(capAuditUserAgent(undefined)).toBeNull();
  });
});