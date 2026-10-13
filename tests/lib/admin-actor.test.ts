import { context, trace, type Span } from "@opentelemetry/api";
import { describe, expect, it } from "vitest";
import { attachAdminActor } from "@/lib/admin-actor";

describe("attachAdminActor", () => {
  it("sets the authenticated user id and a custom property on the active span", () => {
    const attrs = new Map<string, unknown>();
    const span = {
      setAttribute(key: string, value: unknown) {
        attrs.set(key, value);
      },
      spanContext() {
        return { traceId: "1".repeat(32), spanId: "2".repeat(16), traceFlags: 1 };
      },
    } as unknown as Span;
    context.with(trace.setSpan(context.active(), span), () => {
      attachAdminActor("actor-1");
    });
    expect(attrs.get("enduser.id")).toBe("actor-1");
    expect(attrs.get("actor_user_id")).toBe("actor-1");
  });

  it("does nothing when no span is active", () => {
    expect(() => attachAdminActor("actor-1")).not.toThrow();
  });
});
