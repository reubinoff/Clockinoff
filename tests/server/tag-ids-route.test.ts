import { beforeEach, describe, expect, it, vi } from "vitest";
import { truncateAll } from "../setup";
import { makeTag, makeUser } from "../helpers";
import { MAX_TAG_IDS } from "@/lib/tag-ids";
import { createEntry, startTimer } from "@/server/services/entries";

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
import { PATCH as entriesPatch } from "@/app/api/entries/[id]/route";
import { POST as timerStartPost } from "@/app/api/timer/start/route";
import { PATCH as timerPatch } from "@/app/api/timer/route";

function fakeUuid(n: number): string {
  const hex = n.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
}

function jsonReq(url: string, method: string, body: unknown): Request {
  const payload = JSON.stringify(body);
  return new Request(url, {
    method,
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(payload)),
    },
    body: payload,
  });
}

async function expectTagIdsRejected(res: Response): Promise<void> {
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { code: string } };
  expect(body.error.code).toBe("VALIDATION");
}

describe("tag_ids cap on entry/timer writes (#146)", () => {
  let userId = "";

  beforeEach(async () => {
    await truncateAll();
    const { user, session } = await makeUser(`tags-${Date.now()}@ex.com`);
    cookieValue = session.id;
    userId = user.id;
  });

  const tooMany = Array.from({ length: MAX_TAG_IDS + 1 }, (_, i) => fakeUuid(i + 1));

  it("POST /api/entries rejects a non-array, oversize list, and non-UUID", async () => {
    const base = {
      start_at: "2026-04-01T09:00:00Z",
      end_at: "2026-04-01T10:00:00Z",
    };
    await expectTagIdsRejected(
      await entriesPost(jsonReq("http://x/api/entries", "POST", { ...base, tag_ids: {} })),
    );
    await expectTagIdsRejected(
      await entriesPost(jsonReq("http://x/api/entries", "POST", { ...base, tag_ids: tooMany })),
    );
    await expectTagIdsRejected(
      await entriesPost(
        jsonReq("http://x/api/entries", "POST", { ...base, tag_ids: ["not-a-uuid"] }),
      ),
    );
  });

  it("POST /api/timer/start rejects a non-array, oversize list, and non-UUID", async () => {
    await expectTagIdsRejected(
      await timerStartPost(jsonReq("http://x/api/timer/start", "POST", { tag_ids: 123 })),
    );
    await expectTagIdsRejected(
      await timerStartPost(jsonReq("http://x/api/timer/start", "POST", { tag_ids: tooMany })),
    );
    await expectTagIdsRejected(
      await timerStartPost(
        jsonReq("http://x/api/timer/start", "POST", { tag_ids: ["not-a-uuid"] }),
      ),
    );
  });

  it("PATCH /api/timer rejects a non-array, oversize list, and non-UUID", async () => {
    await startTimer(userId);

    await expectTagIdsRejected(
      await timerPatch(jsonReq("http://x/api/timer", "PATCH", { tag_ids: {} })),
    );
    await expectTagIdsRejected(
      await timerPatch(jsonReq("http://x/api/timer", "PATCH", { tag_ids: tooMany })),
    );
    await expectTagIdsRejected(
      await timerPatch(jsonReq("http://x/api/timer", "PATCH", { tag_ids: ["not-a-uuid"] })),
    );
  });

  it("PATCH /api/entries/:id rejects a non-array, oversize list, and non-UUID", async () => {
    const entry = await createEntry(userId, {
      start_at: "2026-04-01T09:00:00Z",
      end_at: "2026-04-01T10:00:00Z",
    });
    const params = { params: Promise.resolve({ id: entry.id }) };

    await expectTagIdsRejected(
      await entriesPatch(jsonReq("http://x/api/entries/id", "PATCH", { tag_ids: {} }), params),
    );
    await expectTagIdsRejected(
      await entriesPatch(jsonReq("http://x/api/entries/id", "PATCH", { tag_ids: tooMany }), params),
    );
    await expectTagIdsRejected(
      await entriesPatch(
        jsonReq("http://x/api/entries/id", "PATCH", { tag_ids: ["not-a-uuid"] }),
        params,
      ),
    );
  });

  it("still accepts a valid owned tag set", async () => {
    const tag = await makeTag(userId, "focus");
    const res = await entriesPost(
      jsonReq("http://x/api/entries", "POST", {
        start_at: "2026-04-01T09:00:00Z",
        end_at: "2026-04-01T10:00:00Z",
        tag_ids: [tag.id],
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { tag_ids: string[] };
    expect(body.tag_ids).toEqual([tag.id]);
  });
});
