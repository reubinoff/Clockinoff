import { beforeEach, describe, expect, it } from "vitest";
import { truncateAll } from "../setup";
import { makeUser, makeClient, makeProject, makeTag } from "../helpers";
import { getPool } from "@/server/db/client";
import { deleteUsersByEmail } from "../../scripts/delete-users.mjs";

describe("scripts/delete-users", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("dry-run reports matches without deleting", async () => {
    const { user } = await makeUser("pentest-ariel-a@example.com");
    const result = await deleteUsersByEmail(getPool(), [user.email], { confirm: false });
    expect(result.dryRun).toBe(true);
    expect(result.deleted).toBe(0);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].email).toBe(user.email);
    const remaining = await getPool().query('SELECT id FROM "users" WHERE id = $1', [user.id]);
    expect(remaining.rowCount).toBe(1);
  });

  it("--yes deletes the users and cascades their owned rows", async () => {
    const { user: a } = await makeUser("pentest-ariel-a@example.com");
    const { user: b } = await makeUser("pentest-ariel-b@example.com");
    const { user: keep } = await makeUser("real-user@example.com");

    const client = await makeClient(a.id, "AcmeA");
    await makeProject(a.id, { name: "PA", clientId: client.id });
    await makeTag(a.id, "focus");
    await makeClient(b.id, "AcmeB");

    const result = await deleteUsersByEmail(
      getPool(),
      ["pentest-ariel-a@example.com", "pentest-ariel-b@example.com"],
      { confirm: true },
    );
    expect(result.dryRun).toBe(false);
    expect(result.deleted).toBe(2);
    expect(result.matched.map((r: { email: string }) => r.email).sort()).toEqual([
      "pentest-ariel-a@example.com",
      "pentest-ariel-b@example.com",
    ]);

    const pool = getPool();
    const { rowCount: usersLeft } = await pool.query(
      'SELECT id FROM "users" WHERE id = ANY($1::uuid[])',
      [[a.id, b.id]],
    );
    expect(usersLeft).toBe(0);
    const { rowCount: clientsLeft } = await pool.query(
      'SELECT id FROM "clients" WHERE user_id = ANY($1::uuid[])',
      [[a.id, b.id]],
    );
    expect(clientsLeft).toBe(0);
    const { rowCount: keepRow } = await pool.query('SELECT id FROM "users" WHERE id = $1', [keep.id]);
    expect(keepRow).toBe(1);
  });

  it("is case-insensitive on email match", async () => {
    const { user } = await makeUser("Pentest-Ariel-A@example.com");
    const result = await deleteUsersByEmail(
      getPool(),
      ["pentest-ariel-a@EXAMPLE.com"],
      { confirm: true },
    );
    expect(result.deleted).toBe(1);
    expect(result.matched[0].id).toBe(user.id);
  });

  it("missing emails are reported but do not fail the run", async () => {
    await makeUser("real@example.com");
    const result = await deleteUsersByEmail(
      getPool(),
      ["no-such-user@example.com"],
      { confirm: true },
    );
    expect(result.deleted).toBe(0);
    expect(result.matched).toHaveLength(0);
    expect(result.missing).toEqual(["no-such-user@example.com"]);
  });

  it("returns an empty summary when no emails are supplied", async () => {
    const result = await deleteUsersByEmail(getPool(), [], { confirm: true });
    expect(result).toEqual({ matched: [], missing: [], deleted: 0, dryRun: false });
  });
});
