import { beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/server/db/client";
import { demoteUsersByEmail } from "../../scripts/demote-user.mjs";
import { makeUser } from "../helpers";
import { truncateAll } from "../setup";

describe("scripts/demote-user", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("dry-run matches without changing role", async () => {
    const { user } = await makeUser("qa@example.com");
    await getPool().query(`UPDATE "users" SET role = 'admin' WHERE id = $1`, [user.id]);
    const result = await demoteUsersByEmail(getPool(), [user.email], { confirm: false });
    expect(result.dryRun).toBe(true);
    expect(result.demoted).toBe(0);
    const still = await getPool().query(`SELECT role FROM "users" WHERE id = $1`, [user.id]);
    expect(still.rows[0].role).toBe("admin");
  });

  it("--yes demotes matched emails and reports missing ones", async () => {
    const { user } = await makeUser("QA@Example.com");
    await getPool().query(`UPDATE "users" SET role = 'admin' WHERE id = $1`, [user.id]);
    const result = await demoteUsersByEmail(
      getPool(),
      ["qa@example.com", "missing@example.com"],
      { confirm: true },
    );
    expect(result.dryRun).toBe(false);
    expect(result.demoted).toBe(1);
    expect(result.missing).toEqual(["missing@example.com"]);
    const row = await getPool().query(`SELECT role FROM "users" WHERE id = $1`, [user.id]);
    expect(row.rows[0].role).toBe("user");

    const second = await demoteUsersByEmail(getPool(), ["qa@example.com"], { confirm: true });
    expect(second.demoted).toBe(0);
  });
});
