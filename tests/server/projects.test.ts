import { beforeEach, describe, expect, it } from "vitest";
import { truncateAll } from "../setup";
import { makeClient, makeUser } from "../helpers";
import {
  createProject,
  deleteProject,
  listProjects,
  updateProject,
} from "@/server/services/projects";

describe("projects service", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("creates, patches, archives, deletes", async () => {
    const { user } = await makeUser();
    const client = await makeClient(user.id, "Acme");
    const p = await createProject(user.id, {
      name: "Website",
      client_id: client.id,
      default_billable: true,
      default_rate: 100,
    });
    expect(p.name).toBe("Website");
    expect(p.defaultRate).toBe("100.00");

    const upd = await updateProject(user.id, p.id, {
      name: "Website v2",
      default_rate: null,
      default_billable: false,
      client_id: null,
    });
    expect(upd.name).toBe("Website v2");
    expect(upd.defaultRate).toBeNull();
    expect(upd.clientId).toBeNull();

    await updateProject(user.id, p.id, { archived: true });
    const active = await listProjects(user.id);
    expect(active).toHaveLength(0);
    const all = await listProjects(user.id, { archived: true });
    expect(all).toHaveLength(1);

    await deleteProject(user.id, p.id);
    expect(await listProjects(user.id, { archived: true })).toHaveLength(0);
  });

  it("rejects invalid rate and unknown client", async () => {
    const { user } = await makeUser();
    await expect(
      createProject(user.id, { name: "Bad", default_rate: -1 }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      createProject(user.id, { name: "Bad", default_rate: "abc" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      createProject(user.id, { name: "Bad", client_id: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createProject(user.id, { name: "" })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("normalizes empty-string rate to null", async () => {
    const { user } = await makeUser();
    const p = await createProject(user.id, { name: "X", default_rate: "" });
    expect(p.defaultRate).toBeNull();
  });

  it("scopes updates and delete to owner", async () => {
    const a = await makeUser("a@ex.com");
    const b = await makeUser("b@ex.com");
    const p = await createProject(a.user.id, { name: "A" });
    await expect(updateProject(b.user.id, p.id, { name: "hijack" })).rejects.toMatchObject({
      status: 404,
    });
    await expect(deleteProject(b.user.id, p.id)).rejects.toMatchObject({ status: 404 });
    await expect(updateProject(a.user.id, p.id, {})).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
