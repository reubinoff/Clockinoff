import { context, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { afterEach, describe, expect, it } from "vitest";
import { attachAdminActor } from "@/lib/admin-actor";

describe("attachAdminActor", () => {
  afterEach(() => {
    context.disable();
  });

  it("sets the authenticated user id and a custom property on the active span", () => {
    const manager = new AsyncLocalStorageContextManager();
    context.setGlobalContextManager(manager.enable());
    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    const span = provider.getTracer("admin-actor-test").startSpan("admin");
    context.with(trace.setSpan(context.active(), span), () => {
      attachAdminActor("actor-1");
    });
    span.end();
    const finished = exporter.getFinishedSpans();
    expect(finished[0]?.attributes["enduser.id"]).toBe("actor-1");
    expect(finished[0]?.attributes["actor_user_id"]).toBe("actor-1");
  });

  it("does nothing when no span is active", () => {
    expect(() => attachAdminActor("actor-1")).not.toThrow();
  });
});
