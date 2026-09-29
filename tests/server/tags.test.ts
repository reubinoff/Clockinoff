import { beforeEach, describe, expect, it } from "vitest";
import { truncateAll } from "../setup";
import { makeUser } from "../helpers";
import { createTag, deleteTag, listTags, updateTag } from "@/server/services/tags";

describe("tags service", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("CRUD tags", async () => {
    const { user } = await makeUser();
    const t = await createTag(user.id, { name: "Focus" });
    expect(t.name).toBe("Focus");
    const list = await listTags(user.id);
    expect(list.map((r) => r.name)).toEqual(["Focus"]);
    const upd = await updateTag(user.id, t.id, { name: "Deep Work" });
    expect(upd.name).toBe("Deep Work");
    await deleteTag(user.id, t.id);
    expect(await listTags(user.id)).toHaveLength(0);
  });

  it("rejects duplicate names (case-insensitive)", async () => {
    const { user } = await makeUser();
    await createTag(user.id, { name: "focus" });
    await expect(createTag(user.id, { name: "FOCUS" })).rejects.toMatchObject({
      status: 409,
    });
    const t2 = await createTag(user.id, { name: "other" });
    await expect(updateTag(user.id, t2.id, { name: "Focus" })).rejects.toMatchObject({
      status: 409,
    });
  });

  it("validates input", async () => {
    const { user } = await makeUser();
    await expect(createTag(user.id, { name: "" })).rejects.toMatchObject({ code: "VALIDATION" });
    const t = await createTag(user.id, { name: "ok" });
    await expect(updateTag(user.id, t.id, { name: "" })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("scopes to owner", async () => {
    const a = await makeUser("a@ex.com");
    const b = await makeUser("b@ex.com");
    const t = await createTag(a.user.id, { name: "focus" });
    await expect(updateTag(b.user.id, t.id, { name: "hijack" })).rejects.toMatchObject({
      status: 404,
    });
    await expect(deleteTag(b.user.id, t.id)).rejects.toMatchObject({ status: 404 });
  });
});
