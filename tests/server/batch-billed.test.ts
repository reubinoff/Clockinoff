import { beforeEach, describe, expect, it, vi } from "vitest";
import { truncateAll } from "../setup";
import { makeUser } from "../helpers";
import {
  batchSetBilled,
  createEntry,
  getEntryById,
  startTimer,
} from "@/server/services/entries";

// Mock cookies() the same way routes-uuid.test.ts does so we can drive the
// route handler directly and cover auth + body validation + wiring.
// Next 16 made cookies() async — the mock returns a Promise.
let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (_name: string) =>
      cookieValue === undefined ? undefined : { name: "timely_session", value: cookieValue },
  }),
}));

import { POST as batchBilledPost } from "@/app/api/entries/batch-billed/route";

function postBody(body: unknown): Request {
  return new Request("http://x/api/entries/batch-billed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function makeBillableEntry(userId: string, day: string): Promise<string> {
  const e = await createEntry(userId, {
    start_at: `${day}T09:00:00Z`,
    end_at: `${day}T10:00:00Z`,
  });
  return e.id;
}

describe("batchSetBilled service (Shaul-locked, 2026-10-01)", () => {
  beforeEach(async () => {
    await truncateAll();
    cookieValue = undefined;
  });

  it("marks a batch of billable entries as billed in one shot", async () => {
    const { user } = await makeUser();
    const a = await makeBillableEntry(user.id, "2026-02-01");
    const b = await makeBillableEntry(user.id, "2026-02-02");
    const res = await batchSetBilled(user.id, [a, b], true);
    expect(res.updated).toBe(2);
    expect((await getEntryById(user.id, a)).billed).toBe(true);
    expect((await getEntryById(user.id, b)).billed).toBe(true);
  });

  it("unmarks billed back to unbilled on request", async () => {
    const { user } = await makeUser();
    const a = await makeBillableEntry(user.id, "2026-02-03");
    await batchSetBilled(user.id, [a], true);
    const res = await batchSetBilled(user.id, [a], false);
    expect(res.updated).toBe(1);
    expect((await getEntryById(user.id, a)).billed).toBe(false);
  });

  it("dedupes duplicate ids before counting", async () => {
    const { user } = await makeUser();
    const a = await makeBillableEntry(user.id, "2026-02-04");
    const res = await batchSetBilled(user.id, [a, a, a], true);
    expect(res.updated).toBe(1);
  });

  // All-or-nothing: a single non-billable id in the batch rejects the whole
  // request and must not flip any other row's billed flag.
  it("rejects whole batch if any id is non-billable and writes nothing", async () => {
    const { user } = await makeUser();
    const good = await makeBillableEntry(user.id, "2026-02-05");
    const bad = await createEntry(user.id, {
      start_at: "2026-02-05T11:00:00Z",
      end_at: "2026-02-05T12:00:00Z",
      billable: false,
    });
    await expect(
      batchSetBilled(user.id, [good, bad.id], true),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await getEntryById(user.id, good)).billed).toBe(false);
    expect((await getEntryById(user.id, bad.id)).billed).toBe(false);
  });

  // Ownership: id owned by another user → whole batch 400, no writes.
  it("rejects whole batch if any id is foreign and writes nothing (IDOR guard)", async () => {
    const { user: me } = await makeUser("me-batch@ex.com");
    const { user: other } = await makeUser("other-batch@ex.com");
    const mine = await makeBillableEntry(me.id, "2026-02-06");
    const theirs = await makeBillableEntry(other.id, "2026-02-06");
    await expect(
      batchSetBilled(me.id, [mine, theirs], true),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await getEntryById(me.id, mine)).billed).toBe(false);
    // The foreign row stays untouched too.
    expect((await getEntryById(other.id, theirs)).billed).toBe(false);
  });

  it("rejects whole batch if any id is unknown", async () => {
    const { user } = await makeUser();
    const good = await makeBillableEntry(user.id, "2026-02-07");
    const unknown = "00000000-0000-4000-8000-000000000000";
    await expect(
      batchSetBilled(user.id, [good, unknown], true),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await getEntryById(user.id, good)).billed).toBe(false);
  });

  it("rejects when ids array is empty or missing", async () => {
    const { user } = await makeUser();
    await expect(batchSetBilled(user.id, [], true)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("rejects a batch that references a running timer", async () => {
    const { user } = await makeUser();
    const run = await startTimer(user.id);
    await expect(
      batchSetBilled(user.id, [run.id], true),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects obviously bad ids inside the array (shape guard)", async () => {
    const { user } = await makeUser();
    // The service checks shape before touching the DB; this covers the
    // narrow guard that catches null/empty strings slipping past the route.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(
      batchSetBilled(user.id, ["", "x"] as unknown as string[], true),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects a batch larger than the hard cap", async () => {
    const { user } = await makeUser();
    const bogus = "00000000-0000-4000-8000-000000000000";
    const ids = Array.from({ length: 501 }, (_, i) =>
      bogus.slice(0, -3) + String(i).padStart(3, "0"),
    );
    await expect(batchSetBilled(user.id, ids, true)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});

describe("POST /api/entries/batch-billed route", () => {
  beforeEach(async () => {
    await truncateAll();
    cookieValue = undefined;
  });

  it("401 UNAUTHORIZED when no session cookie", async () => {
    const res = await batchBilledPost(
      postBody({ ids: ["00000000-0000-4000-8000-000000000000"], billed: true }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: { code: "UNAUTHORIZED", message: expect.any(String) } });
  });

  it("200 OK for a valid batch; returns { updated: N }", async () => {
    const { user, session } = await makeUser();
    cookieValue = session.id;
    const a = await makeBillableEntry(user.id, "2026-03-01");
    const b = await makeBillableEntry(user.id, "2026-03-02");
    const res = await batchBilledPost(postBody({ ids: [a, b], billed: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ updated: 2 });
    expect((await getEntryById(user.id, a)).billed).toBe(true);
    expect((await getEntryById(user.id, b)).billed).toBe(true);
  });

  it("400 VALIDATION for malformed UUID in ids", async () => {
    const { session } = await makeUser();
    cookieValue = session.id;
    const res = await batchBilledPost(
      postBody({ ids: ["not-a-uuid"], billed: true }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION");
  });

  it("400 VALIDATION when billed is not boolean", async () => {
    const { session } = await makeUser();
    cookieValue = session.id;
    const res = await batchBilledPost(
      postBody({ ids: ["00000000-0000-4000-8000-000000000000"], billed: "yes" }),
    );
    expect(res.status).toBe(400);
  });

  it("400 VALIDATION when ids is not an array", async () => {
    const { session } = await makeUser();
    cookieValue = session.id;
    const res = await batchBilledPost(postBody({ ids: "nope", billed: true }));
    expect(res.status).toBe(400);
  });

  it("400 VALIDATION when body is missing", async () => {
    const { session } = await makeUser();
    cookieValue = session.id;
    const res = await batchBilledPost(
      new Request("http://x/api/entries/batch-billed", {
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400 VALIDATION + no writes when batch mixes ok + foreign id", async () => {
    const { user: me, session: mySession } = await makeUser("me-route@ex.com");
    const { user: other } = await makeUser("other-route@ex.com");
    cookieValue = mySession.id;
    const mine = await makeBillableEntry(me.id, "2026-03-05");
    const theirs = await makeBillableEntry(other.id, "2026-03-05");
    const res = await batchBilledPost(postBody({ ids: [mine, theirs], billed: true }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION");
    expect((await getEntryById(me.id, mine)).billed).toBe(false);
    expect((await getEntryById(other.id, theirs)).billed).toBe(false);
  });

  it("400 VALIDATION + no writes when batch mixes billable + non-billable", async () => {
    const { user, session } = await makeUser();
    cookieValue = session.id;
    const good = await makeBillableEntry(user.id, "2026-03-06");
    const bad = await createEntry(user.id, {
      start_at: "2026-03-06T11:00:00Z",
      end_at: "2026-03-06T12:00:00Z",
      billable: false,
    });
    const res = await batchBilledPost(postBody({ ids: [good, bad.id], billed: true }));
    expect(res.status).toBe(400);
    expect((await getEntryById(user.id, good)).billed).toBe(false);
  });
});
