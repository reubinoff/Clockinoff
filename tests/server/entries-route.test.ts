import { beforeEach, describe, expect, it, vi } from "vitest";
import { truncateAll } from "../setup";
import { makeProject, makeUser } from "../helpers";

// Mirror the batch-billed route test pattern: swap the next/headers cookie
// jar for a lightweight controllable mock so we can drive the route
// handler directly and cover POST /api/entries (manual-add path for #65).
let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () =>
      cookieValue === undefined
        ? undefined
        : { name: "timely_session", value: cookieValue },
  }),
}));

import { POST as entriesPost } from "@/app/api/entries/route";

function postBody(body: unknown): Request {
  return new Request("http://x/api/entries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/entries — manual add (#65)", () => {
  beforeEach(async () => {
    await truncateAll();
    cookieValue = undefined;
  });

  it("rejects unauthenticated callers with 401", async () => {
    const res = await entriesPost(
      postBody({
        description: "x",
        start_at: "2026-01-01T09:00:00Z",
        end_at: "2026-01-01T10:00:00Z",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("creates a closed entry (happy path)", async () => {
    const { user, session } = await makeUser();
    cookieValue = session.id;
    const project = await makeProject(user.id, { name: "p" });
    const res = await entriesPost(
      postBody({
        description: "write brief",
        project_id: project.id,
        billable: true,
        start_at: "2026-04-01T09:00:00Z",
        end_at: "2026-04-01T10:30:00Z",
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.description).toBe("write brief");
    expect(body.project_id).toBe(project.id);
    expect(body.billable).toBe(true);
    expect(body.running).toBe(false);
    expect(body.duration_seconds).toBe(90 * 60);
  });

  it("creates an entry with an empty description (matches Start)", async () => {
    const { session } = await makeUser();
    cookieValue = session.id;
    const res = await entriesPost(
      postBody({
        start_at: "2026-04-02T09:00:00Z",
        end_at: "2026-04-02T09:30:00Z",
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.description).toBe("");
    expect(body.billable).toBe(true);
    expect(body.duration_seconds).toBe(1800);
  });

  it("rejects end < start with 400 VALIDATION", async () => {
    const { session } = await makeUser();
    cookieValue = session.id;
    const res = await entriesPost(
      postBody({
        description: "backwards",
        start_at: "2026-04-03T10:00:00Z",
        end_at: "2026-04-03T09:00:00Z",
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      error: { code: "VALIDATION", message: expect.any(String) },
    });
  });

  it("rejects end == start with 400 VALIDATION", async () => {
    const { session } = await makeUser();
    cookieValue = session.id;
    const res = await entriesPost(
      postBody({
        start_at: "2026-04-04T10:00:00Z",
        end_at: "2026-04-04T10:00:00Z",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects invalid JSON body with 400 VALIDATION", async () => {
    const { session } = await makeUser();
    cookieValue = session.id;
    const req = new Request("http://x/api/entries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const res = await entriesPost(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION");
  });
});
