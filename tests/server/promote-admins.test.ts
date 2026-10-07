import { beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/server/db/client";
import { promoteAdminsByEmail } from "../../scripts/promote-admins.mjs";
import { makeUser } from "../helpers";
import { truncateAll } from "../setup";

describe("scripts/promote-admins", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("dry-run matches without changing role", async () => {
    const { user } = await makeUser("owner@example.com");
    const result = await promoteAdminsByEmail(getPool(), [user.email], { confirm: false });
    expect(result.dryRun).toBe(true);
    expect(result.promoted).toBe(0);
    expect(result.matched).toHaveLength(1);
    const still = await getPool().query('SELECT role FROM "users" WHERE id = $1', [user.id]);
    expect(still.rows[0].role).toBe("user");
  });

  it("--yes promotes matched emails and reports missing ones", async () => {
    const { user } = await makeUser("Owner@Example.com");
    const result = await promoteAdminsByEmail(
      getPool(),
      ["owner@example.com", "missing@example.com"],
      { confirm: true },
    );
    expect(result.dryRun).toBe(false);
    expect(result.promoted).toBe(1);
    expect(result.missing).toEqual(["missing@example.com"]);
    const row = await getPool().query('SELECT role FROM "users" WHERE id = $1', [user.id]);
    expect(row.rows[0].role).toBe("admin");

    const second = await promoteAdminsByEmail(getPool(), ["owner@example.com"], { confirm: true });
    expect(second.promoted).toBe(0);
  });
});
