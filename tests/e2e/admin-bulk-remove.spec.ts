import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import argon2 from "argon2";
import pg from "pg";
import { BULK_REMOVE_COPY } from "@/lib/admin-copy";

// Admin bulk-remove against `next start` (#219). Seeds an admin and users
// directly so the register rate limit does not apply. Dialog screenshots
// land in test-results/admin-removal-dialog for the CI artifact.

const password = "correct-horse-battery";
const LONG_UA = `ClockinoffE2E/${"a".repeat(600)}`;
const SHOT_DIR = "test-results/admin-removal-dialog";

const stamp = Date.now();
const adminEmail = `e2e-admin-${stamp}@example.com`;
const keepEmail = `e2e-keep-${stamp}@example.com`;
const otherEmail = `e2e-other-${stamp}@example.com`;
const mismatchAEmail = `e2e-mis-a-${stamp}@example.com`;
const mismatchBEmail = `e2e-mis-b-${stamp}@example.com`;
const doubleEmail = `e2e-dbl-${stamp}@example.com`;
const happyEmail = `e2e-happy-${stamp}@example.com`;

const SHOT_THEMES = ["light", "dark"] as const;
const SHOT_WIDTHS = [390, 768, 1280] as const;
const SHOT_STATES = ["opened", "mismatch", "matching", "inflight", "success"] as const;

function shotUser(theme: string, width: number, kind: "keep" | "misa" | "misb" | "ok" | "adm"): string {
  return `shot-${theme}-${width}-${kind}-${stamp}@example.com`;
}

function shotFile(theme: string, width: number, state: string): string {
  return `${SHOT_DIR}/219-${theme}-${width}-${state}.png`;
}

const ids = new Map<string, string>();

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

async function withDb<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function seed(): Promise<void> {
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  const rows: Array<{ email: string; role: "admin" | "user"; createdAt: string | null }> = [];
  // Older than the behaviour-test users so created-desc page 1 still
  // shows those rows (page size is 25).
  for (const theme of SHOT_THEMES) {
    for (const width of SHOT_WIDTHS) {
      rows.push(
        { email: shotUser(theme, width, "keep"), role: "user", createdAt: "2020-01-01T00:00:00Z" },
        { email: shotUser(theme, width, "misa"), role: "user", createdAt: "2020-01-01T00:00:00Z" },
        { email: shotUser(theme, width, "misb"), role: "user", createdAt: "2020-01-01T00:00:00Z" },
        { email: shotUser(theme, width, "ok"), role: "user", createdAt: "2020-01-01T00:00:00Z" },
        { email: shotUser(theme, width, "adm"), role: "admin", createdAt: "2020-01-01T00:00:00Z" },
      );
    }
  }
  rows.push(
    { email: adminEmail, role: "admin", createdAt: null },
    { email: keepEmail, role: "user", createdAt: null },
    { email: otherEmail, role: "user", createdAt: null },
    { email: mismatchAEmail, role: "user", createdAt: null },
    { email: mismatchBEmail, role: "user", createdAt: null },
    { email: doubleEmail, role: "user", createdAt: null },
    { email: happyEmail, role: "user", createdAt: null },
  );
  await withDb(async (client) => {
    const applied = await client.query<{ name: string }>(
      'select name from "__migrations" order by name',
    );
    if (applied.rows.length === 0) throw new Error("no migrations applied");
    for (const row of applied.rows) console.log(`migration ${row.name}`);

    for (const row of rows) {
      const inserted = await client.query<{ id: string }>(
        `insert into users (email, password_hash, role, timezone, created_at)
         values ($1, $2, $3, 'Asia/Jerusalem', coalesce($4::timestamptz, now()))
         returning id`,
        [row.email, hash, row.role, row.createdAt],
      );
      const id = inserted.rows[0]?.id;
      if (!id) throw new Error(`seed failed for ${row.email}`);
      ids.set(row.email, id);
    }
  });
}

async function deleteUser(email: string): Promise<void> {
  await withDb(async (client) => {
    const result = await client.query("delete from users where lower(email) = lower($1)", [email]);
    if (result.rowCount !== 1) {
      throw new Error(`expected to delete ${email}, deleted ${String(result.rowCount)}`);
    }
  });
}

async function userExists(email: string): Promise<boolean> {
  return withDb(async (client) => {
    const result = await client.query("select 1 from users where lower(email) = lower($1)", [email]);
    return result.rowCount === 1;
  });
}

interface AuditRow {
  result: {
    removed: Array<{ id: string; deleted: number }>;
    skipped: string[];
    failed: string[];
  };
  user_agent: string | null;
  session_id_hash: string | null;
  client_ip: string | null;
  status: string;
}

async function latestAuditFor(actorEmail: string, targetId: string): Promise<AuditRow> {
  return withDb(async (client) => {
    const result = await client.query<AuditRow>(
      `select result, user_agent, session_id_hash, client_ip, status
         from audit_events
        where lower(actor_email) = lower($1)
          and result->'removed' @> $2::jsonb
        order by created_at desc
        limit 1`,
      [actorEmail, JSON.stringify([{ id: targetId }])],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`no audit row for ${actorEmail} removing ${targetId}`);
    return row;
  });
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/app/);
  await page.goto("/admin/users");
  await expect(page.getByRole("link", { name: email, exact: true }).first()).toBeVisible();
}

function bulkPosts(page: Page): { count: () => number } {
  let n = 0;
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/api/admin/users/bulk")) n += 1;
  });
  return { count: () => n };
}

async function openRemove(page: Page, emails: string[]): Promise<ReturnType<Page["getByRole"]>> {
  for (const email of emails) {
    await page.getByRole("checkbox", { name: `Select ${email}` }).click();
  }
  await page
    .getByRole("toolbar", { name: "Bulk user actions" })
    .getByRole("button", { name: "Remove" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await seed();
});

async function useTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  // Init scripts run on every navigation, so a one-shot write would wipe a
  // later choice. sessionStorage survives the reload that applies it.
  await page.addInitScript(() => {
    const stored = sessionStorage.getItem("e2e-theme") ?? "light";
    localStorage.setItem("timely.appearance", stored);
  });
  await page.evaluate((value) => {
    sessionStorage.setItem("e2e-theme", value);
  }, theme);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

async function filterShots(page: Page, theme: string, width: number): Promise<void> {
  await page.locator("#admin-user-search").fill(`shot-${theme}-${width}-`);
  await expect(
    page.getByRole("link", { name: shotUser(theme, width, "keep"), exact: true }),
  ).toBeVisible();
}

async function selectOnly(page: Page, emails: string[]): Promise<void> {
  const clear = page.getByRole("button", { name: "Clear selection" });
  if (await clear.isVisible()) await clear.click();
  for (const email of emails) {
    await page.getByRole("checkbox", { name: `Select ${email}` }).click();
  }
}

async function saveShot(page: Page, theme: string, width: number, state: string): Promise<void> {
  const path = shotFile(theme, width, state);
  await page.screenshot({ path, animations: "disabled" });
  expect((await stat(path)).size).toBeGreaterThan(1000);
  console.log(`saved ${path}`);
}

for (const theme of SHOT_THEMES) {
  for (const width of SHOT_WIDTHS) {
    test(`saves 219-${theme}-${width} remove dialog states`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await login(page, adminEmail);
      await useTheme(page, theme);
      await filterShots(page, theme, width);

      const keep = shotUser(theme, width, "keep");
      const misa = shotUser(theme, width, "misa");
      const misb = shotUser(theme, width, "misb");
      const ok = shotUser(theme, width, "ok");
      const adm = shotUser(theme, width, "adm");
      const toolbar = page.getByRole("toolbar", { name: "Bulk user actions" });

      await selectOnly(page, [keep]);
      await toolbar.getByRole("button", { name: "Remove" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.locator("#admin-bulk-remove-count")).toHaveValue("");
      await expect(dialog.getByRole("button", { name: "Remove" })).toBeDisabled();
      await expect(dialog.getByRole("button", { name: "Cancel" })).toBeEnabled();
      await saveShot(page, theme, width, "opened");
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();

      await selectOnly(page, [misa, misb]);
      await toolbar.getByRole("button", { name: "Remove" }).click();
      await expect(dialog).toContainText("Remove 2 users?");
      await dialog.getByLabel("Type 2 to confirm").fill("2");
      await deleteUser(misb);
      const mismatchResponse = page.waitForResponse(
        (res) => res.url().includes("/api/admin/users/bulk") && res.request().method() === "POST",
      );
      await dialog.getByRole("button", { name: "Remove" }).click();
      expect((await mismatchResponse).status()).toBe(400);
      await expect(dialog.getByRole("alert")).toHaveText(BULK_REMOVE_COPY.mismatch);
      await expect(dialog.getByLabel("Type 2 to confirm")).toHaveValue("2");
      await saveShot(page, theme, width, "mismatch");
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();

      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await filterShots(page, theme, width);

      await selectOnly(page, [keep]);
      await toolbar.getByRole("button", { name: "Remove" }).click();
      await expect(dialog).toBeVisible();
      await dialog.getByLabel("Type 1 to confirm").fill("1");
      await expect(dialog.getByRole("button", { name: "Remove" })).toBeEnabled();
      await expect(dialog.getByRole("alert")).toHaveCount(0);
      await saveShot(page, theme, width, "matching");

      let releaseHold = (): void => {};
      let requestStarted = false;
      let markSettled = (): void => {};
      const settled = new Promise<void>((resolve) => {
        markSettled = resolve;
      });
      await page.route("**/api/admin/users/bulk", async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        requestStarted = true;
        await new Promise<void>((resolve) => {
          releaseHold = resolve;
        });
        // 500 leaves the dialog up and deletes nobody. Abort races with
        // unroute and leaves both buttons stuck disabled.
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "INTERNAL", message: "held" } }),
        });
        markSettled();
      });
      try {
        await dialog.getByRole("button", { name: "Remove" }).click();
        await expect(dialog.getByRole("button", { name: "Remove" })).toBeDisabled();
        await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
        await saveShot(page, theme, width, "inflight");
      } finally {
        releaseHold();
        if (requestStarted) await settled;
        await page.unroute("**/api/admin/users/bulk");
      }
      await expect(dialog.getByRole("button", { name: "Cancel" })).toBeEnabled();
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();

      await selectOnly(page, [adm, ok]);
      await toolbar.getByRole("button", { name: "Remove" }).click();
      await expect(dialog).toContainText("Remove 1 user?");
      await expect(dialog).toContainText("1 will be skipped (admins or you).");
      await dialog.getByLabel("Type 1 to confirm").fill("1");
      const successResponse = page.waitForResponse(
        (res) => res.url().includes("/api/admin/users/bulk") && res.request().method() === "POST",
      );
      await dialog.getByRole("button", { name: "Remove" }).click();
      expect((await successResponse).status()).toBe(200);
      await expect(page.getByRole("status").filter({ hasText: "Removed 1. Skipped 1." })).toBeVisible();
      await expect(page.getByRole("link", { name: ok, exact: true })).toHaveCount(0);
      await expect(page.getByRole("link", { name: keep, exact: true })).toBeVisible();
      if (width >= 768) {
        const table = page.locator("table");
        await expect(table).toBeVisible();
        await expect(table).not.toContainText(ok);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await saveShot(page, theme, width, "success");
    });
  }
}

test("writes every 219 dialog screenshot", async () => {
  for (const theme of SHOT_THEMES) {
    for (const width of SHOT_WIDTHS) {
      for (const state of SHOT_STATES) {
        const path = shotFile(theme, width, state);
        expect((await stat(path)).size).toBeGreaterThan(1000);
      }
    }
  }
});

test("does not call /bulk for select, keyboard, Select all, Escape, or backdrop", async ({
  page,
}) => {
  await login(page, adminEmail);
  const posts = bulkPosts(page);
  const rowBox = page.getByRole("checkbox", { name: `Select ${keepEmail}` });
  await rowBox.click();
  const toolbar = page.getByRole("toolbar", { name: "Bulk user actions" });
  await expect(toolbar).toBeVisible();
  const row = page.locator("table").getByRole("row").filter({ hasText: keepEmail });

  // Keys land on the toolbar and the row. They must not activate Remove.
  // Pressing the checkbox itself toggles selection; that is not this case.
  for (const target of [toolbar, row]) {
    for (const key of ["Enter", " "]) {
      await target.dispatchEvent("keydown", { key });
      await target.dispatchEvent("keyup", { key });
    }
  }
  await toolbar.getByText("selected").click();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  await row.locator("td").nth(4).click();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");

  await page.getByRole("checkbox", { name: "Select all on this page" }).click();
  expect(posts.count()).toBe(0);

  await toolbar.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(posts.count()).toBe(0);

  await toolbar.getByRole("button", { name: "Remove" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const backdrop = page.locator("[role='presentation']").filter({ has: dialog });
  await backdrop.click({ position: { x: 8, y: 8 } });
  await expect(dialog).toBeHidden();
  expect(posts.count()).toBe(0);
  await expect(toolbar).toBeVisible();
});

test("a typed count that no longer matches returns 400 and keeps the dialog open", async ({
  page,
}) => {
  await login(page, adminEmail);
  const dialog = await openRemove(page, [mismatchAEmail, mismatchBEmail]);
  await expect(dialog).toContainText("Remove 2 users?");
  await dialog.getByLabel("Type 2 to confirm").fill("2");
  await deleteUser(mismatchBEmail);

  const responsePromise = page.waitForResponse(
    (res) => res.url().includes("/api/admin/users/bulk") && res.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Remove" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(400);
  const body = (await response.json()) as { error: { message: string } };
  expect(body.error.message).toBe(BULK_REMOVE_COPY.mismatch);
  await expect(dialog.getByRole("alert")).toHaveText(BULK_REMOVE_COPY.mismatch);
  await expect(dialog).toBeVisible();
  expect(await userExists(mismatchAEmail)).toBe(true);
  expect(await userExists(mismatchBEmail)).toBe(false);
});

test("double-clicking Remove sends exactly one request", async ({ page }) => {
  await login(page, adminEmail);
  const posts = bulkPosts(page);
  const dialog = await openRemove(page, [doubleEmail]);
  await dialog.getByLabel("Type 1 to confirm").fill("1");
  const confirm = dialog.getByRole("button", { name: "Remove" });
  const responsePromise = page.waitForResponse(
    (res) => res.url().includes("/api/admin/users/bulk") && res.request().method() === "POST",
  );
  await confirm.evaluate((el: HTMLButtonElement) => {
    el.click();
    el.click();
  });
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  await expect(dialog).toBeHidden();
  expect(posts.count()).toBe(1);
  expect(await userExists(doubleEmail)).toBe(false);
});

test.describe("happy path audit row", () => {
  test.use({ userAgent: LONG_UA });

  test("records deleted rowCount, capped user-agent, session hash, and client ip", async ({
    page,
  }) => {
    await login(page, adminEmail);
    const dialog = await openRemove(page, [happyEmail]);
    await dialog.getByLabel("Type 1 to confirm").fill("1");
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/admin/users/bulk") && res.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "Remove" }).click();
    expect((await responsePromise).status()).toBe(200);
    await expect(dialog).toBeHidden();

    const targetId = ids.get(happyEmail);
    if (!targetId) throw new Error("missing happy user id");
    const audit = await latestAuditFor(adminEmail, targetId);
    expect(audit.status).toBe("completed");
    expect(audit.result.removed).toEqual([{ id: targetId, deleted: 1 }]);
    expect(audit.user_agent).toHaveLength(512);
    expect(audit.user_agent).toBe(LONG_UA.slice(0, 512));

    const cookies = await page.context().cookies();
    const token = cookies.find((cookie) => cookie.name === "timely_session")?.value;
    expect(token).toBeTruthy();
    expect(audit.session_id_hash).toBe(hashSessionToken(token ?? ""));
    expect(audit.session_id_hash).not.toBe(token);
    expect(audit.client_ip).toMatch(/^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/);
  });
});
