import { describe, expect, it } from "vitest";
import {
  AUDIT_FORWARDED_FOR_MAX,
  AUDIT_USER_AGENT_MAX,
  capAuditForwardedFor,
  capAuditUserAgent,
} from "@/lib/audit-user-agent";

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

  it("stores text only, dropping control characters", () => {
    expect(capAuditUserAgent("bad\u0000agent\nline")).toBe("badagentline");
    expect(capAuditUserAgent("\u0000")).toBeNull();
  });

  it("strips CR and LF before the 512 cap", () => {
    const injected = `ua\r\nINJECTED\n${"a".repeat(600)}`;
    const capped = capAuditUserAgent(injected);
    expect(capped).toHaveLength(AUDIT_USER_AGENT_MAX);
    expect(capped).not.toMatch(/[\r\n]/);
    expect(capped?.startsWith("uaINJECTED")).toBe(true);
  });
});

describe("capAuditForwardedFor", () => {
  it("caps the raw header text at 512 characters", () => {
    const raw = `x-forwarded-for: ${"1.2.3.4, ".repeat(80)}203.0.113.50`;
    const capped = capAuditForwardedFor(raw);
    expect(AUDIT_FORWARDED_FOR_MAX).toBe(512);
    expect(capped).toHaveLength(512);
    expect(capped).toBe(raw.slice(0, 512));
  });

  it("drops blank and non-text values", () => {
    expect(capAuditForwardedFor("  x-client-ip: 203.0.113.10  ")).toBe(
      "x-client-ip: 203.0.113.10",
    );
    expect(capAuditForwardedFor(" \n\u0000 ")).toBeNull();
    expect(capAuditForwardedFor(null)).toBeNull();
  });
});