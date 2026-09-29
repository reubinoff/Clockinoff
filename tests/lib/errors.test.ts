import { describe, expect, it } from "vitest";
import { ApiError, errors, toErrorBody } from "@/lib/errors";

describe("errors", () => {
  it("builds each factory correctly", () => {
    const v = errors.validation("bad", { foo: 1 });
    expect(v.status).toBe(400);
    expect(v.code).toBe("VALIDATION");
    expect(v.details).toEqual({ foo: 1 });

    expect(errors.unauthorized().status).toBe(401);
    expect(errors.notFound().status).toBe(404);
    expect(errors.conflict().status).toBe(409);
    expect(errors.internal().status).toBe(500);
    expect(errors.timerNotRunning().status).toBe(404);
  });

  it("timer-already-running attaches entry_id", () => {
    const e = errors.timerAlreadyRunning("abc");
    expect(e.status).toBe(409);
    expect(e.code).toBe("TIMER_ALREADY_RUNNING");
    const body = toErrorBody(e);
    expect(body.entry_id).toBe("abc");
    expect(body.error.code).toBe("TIMER_ALREADY_RUNNING");
  });

  it("toErrorBody preserves details when set", () => {
    const err = new ApiError(400, "VALIDATION", "bad", { details: { field: "x" } });
    const body = toErrorBody(err);
    expect(body.error.details).toEqual({ field: "x" });
  });

  it("toErrorBody omits details when unset", () => {
    const err = new ApiError(404, "NOT_FOUND", "nope");
    const body = toErrorBody(err);
    expect(body.error.details).toBeUndefined();
  });
});
