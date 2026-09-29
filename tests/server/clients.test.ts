import { beforeEach, describe, expect, it } from "vitest";
import { truncateAll } from "../setup";
import { makeUser } from "../helpers";
import {
  createClient,
  deleteClient,
  listClients,
  updateClient,
} from "@/server/services/clients";

describe("clients service", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("creates, updates, lists, deletes", async () => {
    const { user } = await makeUser();
    const c = await createClient(user.id, { name: "Acme" });
    expect(c.name).toBe("Acme");
    const upd = await updateClient(user.id, c.id, { name: "Acme Inc" });
    expect(upd.name).toBe("Acme Inc");
    const archived = await updateClient(user.id, c.id, { archived: true });
    expect(archived.archivedAt).not.toBeNull();
    const activeOnly = await listClients(user.id, { archived: false });
    expect(activeOnly).toHaveLength(0);
    const all = await listClients(user.id, { archived: true });
    expect(all).toHaveLength(1);
    await deleteClient(user.id, c.id);
    expect(await listClients(user.id, { archived: true })).toHaveLength(0);
  });

  it("validates input", async () => {
    const { user } = await makeUser();
    await expect(createClient(user.id, { name: "" })).rejects.toMatchObject({ code: "VALIDATION" });
    const c = await createClient(user.id, { name: "X" });
    await expect(updateClient(user.id, c.id, {})).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(updateClient(user.id, c.id, { name: "" })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("scopes to user", async () => {
    const a = await makeUser("a@ex.com");
    const b = await makeUser("b@ex.com");
    const c = await createClient(a.user.id, { name: "Owned" });
    await expect(updateClient(b.user.id, c.id, { name: "hijack" })).rejects.toMatchObject({
      status: 404,
    });
    await expect(deleteClient(b.user.id, c.id)).rejects.toMatchObject({ status: 404 });
  });

  it("can unarchive by setting archived=false", async () => {
    const { user } = await makeUser();
    const c = await createClient(user.id, { name: "X" });
    await updateClient(user.id, c.id, { archived: true });
    const u = await updateClient(user.id, c.id, { archived: false });
    expect(u.archivedAt).toBeNull();
  });
});
