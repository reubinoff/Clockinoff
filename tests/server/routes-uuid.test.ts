import { beforeEach, describe, expect, it, vi } from "vitest";
import { truncateAll } from "../setup";
import { makeUser } from "../helpers";

// Route handlers read the session cookie via next/headers. We swap it out
// with a lightweight mock so we can drive the routes directly (same pattern
// as tests/server/http.test.ts).
let cookieValue: string | undefined;

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (_name: string) =>
      cookieValue === undefined ? undefined : { name: "timely_session", value: cookieValue },
  }),
}));

// Imported after the mock so the routes see the mocked cookies().
import { DELETE as clientsDelete, PATCH as clientsPatch } from "@/app/api/clients/[id]/route";
import { DELETE as projectsDelete, PATCH as projectsPatch } from "@/app/api/projects/[id]/route";
import { DELETE as tagsDelete, PATCH as tagsPatch } from "@/app/api/tags/[id]/route";
import { DELETE as entriesDelete, PATCH as entriesPatch } from "@/app/api/entries/[id]/route";

const MALFORMED_IDS = [
  "not-a-uuid",
  "12345",
  "f47ac10b-58cc-4372-a567-0e02b2c3d47", // 1 char short
  "'; DROP TABLE users;--",
];

function jsonPatch(url: string, body: unknown): Request {
  return new Request(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function del(url: string): Request {
  return new Request(url, { method: "DELETE" });
}

describe("route UUID path param validation", () => {
  beforeEach(async () => {
    await truncateAll();
    const { session } = await makeUser(`uuid-${Date.now()}@ex.com`);
    cookieValue = session.id;
  });

  describe("clients/[id]", () => {
    it("PATCH returns 400 VALIDATION for malformed UUID", async () => {
      for (const id of MALFORMED_IDS) {
        const res = await clientsPatch(jsonPatch("http://x", { name: "x" }), { params: { id } });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body).toEqual({ error: { code: "VALIDATION", message: expect.any(String) } });
      }
    });

    it("DELETE returns 400 VALIDATION for malformed UUID", async () => {
      for (const id of MALFORMED_IDS) {
        const res = await clientsDelete(del("http://x"), { params: { id } });
        expect(res.status).toBe(400);
        expect((await res.json()).error.code).toBe("VALIDATION");
      }
    });
  });

  describe("projects/[id]", () => {
    it("PATCH returns 400 VALIDATION for malformed UUID", async () => {
      for (const id of MALFORMED_IDS) {
        const res = await projectsPatch(jsonPatch("http://x", { name: "x" }), { params: { id } });
        expect(res.status).toBe(400);
        expect((await res.json()).error.code).toBe("VALIDATION");
      }
    });

    it("DELETE returns 400 VALIDATION for malformed UUID", async () => {
      for (const id of MALFORMED_IDS) {
        const res = await projectsDelete(del("http://x"), { params: { id } });
        expect(res.status).toBe(400);
        expect((await res.json()).error.code).toBe("VALIDATION");
      }
    });
  });

  describe("tags/[id]", () => {
    it("PATCH returns 400 VALIDATION for malformed UUID", async () => {
      for (const id of MALFORMED_IDS) {
        const res = await tagsPatch(jsonPatch("http://x", { name: "x" }), { params: { id } });
        expect(res.status).toBe(400);
        expect((await res.json()).error.code).toBe("VALIDATION");
      }
    });

    it("DELETE returns 400 VALIDATION for malformed UUID", async () => {
      for (const id of MALFORMED_IDS) {
        const res = await tagsDelete(del("http://x"), { params: { id } });
        expect(res.status).toBe(400);
        expect((await res.json()).error.code).toBe("VALIDATION");
      }
    });
  });

  describe("entries/[id]", () => {
    it("PATCH returns 400 VALIDATION for malformed UUID", async () => {
      for (const id of MALFORMED_IDS) {
        const res = await entriesPatch(jsonPatch("http://x", { description: "x" }), {
          params: { id },
        });
        expect(res.status).toBe(400);
        expect((await res.json()).error.code).toBe("VALIDATION");
      }
    });

    it("DELETE returns 400 VALIDATION for malformed UUID", async () => {
      for (const id of MALFORMED_IDS) {
        const res = await entriesDelete(del("http://x"), { params: { id } });
        expect(res.status).toBe(400);
        expect((await res.json()).error.code).toBe("VALIDATION");
      }
    });
  });

  it("well-formed but unknown UUID still yields 404 (not 400/500)", async () => {
    const unknown = "00000000-0000-4000-8000-000000000000";
    const res = await clientsDelete(del("http://x"), { params: { id: unknown } });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });
});
