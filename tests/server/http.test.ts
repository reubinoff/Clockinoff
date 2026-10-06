import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/errors";
import { MAX_JSON_BODY_BYTES, jsonError, noContent, ok, readJson, requireUser } from "@/server/http";
import { truncateAll } from "../setup";
import { makeUser } from "../helpers";

let cookieValue: string | undefined;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (_name: string) =>
      cookieValue === undefined ? undefined : { name: "timely_session", value: cookieValue },
  }),
}));

describe("server/http", () => {
  it("ok returns JSON with default status", async () => {
    const res = ok({ a: 1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ a: 1 });
  });

  it("noContent returns 204 no body", async () => {
    const res = noContent();
    expect(res.status).toBe(204);
  });

  it("readJson throws VALIDATION on bad body", async () => {
    const req = new Request("http://x", { method: "POST", body: "{oops" });
    await expect(readJson(req)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("readJson returns parsed body", async () => {
    const req = new Request("http://x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hi: 1 }),
    });
    await expect(readJson(req)).resolves.toEqual({ hi: 1 });
  });

  it("readJson rejects a Content-Length over the cap with 413", async () => {
    const req = new Request("http://x", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(MAX_JSON_BODY_BYTES + 1),
      },
      body: "x",
    });
    await expect(readJson(req)).rejects.toMatchObject({
      status: 413,
      code: "VALIDATION",
    });
  });

  it("readJson rejects an oversized stream without Content-Length", async () => {
    const encoder = new TextEncoder();
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(encoder.encode("a".repeat(16 * 1024)));
        if (pulls > 8) controller.close();
      },
    });
    const req = new Request("http://x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    await expect(readJson(req)).rejects.toMatchObject({
      status: 413,
      code: "VALIDATION",
    });
  });

  it("jsonError maps ApiError", async () => {
    const err = new ApiError(404, "NOT_FOUND", "Nope");
    const res = jsonError(err);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "NOT_FOUND", message: "Nope" } });
  });

  it("jsonError maps unknown to INTERNAL and logs", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = jsonError(new Error("boom"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL");
    spy.mockRestore();
  });

  describe("requireUser", () => {
    beforeEach(async () => {
      await truncateAll();
    });

    it("throws UNAUTHORIZED when no cookie", async () => {
      cookieValue = undefined;
      await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    });

    it("throws UNAUTHORIZED when cookie unknown", async () => {
      cookieValue = "not-a-real-session";
      await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("returns session user when cookie valid", async () => {
      const { session, user } = await makeUser("http-user@example.com");
      cookieValue = session.id;
      const found = await requireUser();
      expect(found.id).toBe(user.id);
      expect(found.email).toBe("http-user@example.com");
      cookieValue = undefined;
    });
  });
});
