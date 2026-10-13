import { expect, test } from "@playwright/test";
import pg from "pg";

// Header click on /admin/users writes sort + dir into the URL and sets
// aria-sort. The card layout at 390 uses the same params via Sort by.

const password = "correct-horse-battery";

function databaseUrl(): string {
  if (process.env.NODE_ENV === "test") {
    return process.env.DATABASE_URL_TEST || process.env.DATABASE_URL || "";
  }
  return process.env.DATABASE_URL || "";
}

async function promote(email: string): Promise<void> {
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set; cannot promote the e2e admin");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query(
      "update users set role = 'admin' where lower(email) = lower($1)",
      [email],
    );
    if (result.rowCount !== 1) {
      throw new Error(`expected to promote one user, updated ${String(result.rowCount)}`);
    }
  } finally {
    await client.end();
  }
}

test("admin users header click sets aria-sort and reorders the list", async ({ page }) => {
  const stamp = Date.now();
  const older = `a-sort-${stamp}@example.com`;
  const newer = `m-sort-${stamp}@example.com`;

  const first = await page.request.post("/api/auth/register", {
    data: { email: older, password },
  });
  expect(first.status()).toBe(201);
  const second = await page.request.post("/api/auth/register", {
    data: { email: newer, password },
  });
  expect(second.status()).toBe(201);
  await promote(older);

  await page.goto("/login");
  await page.locator('input[type="email"]').fill(older);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/app/);
  await page.goto("/admin/users");

  const table = page.locator("table");
  await expect(page.getByRole("columnheader", { name: "Created" })).toHaveAttribute(
    "aria-sort",
    "descending",
  );
  await expect(page.getByRole("columnheader", { name: "Email" })).toHaveAttribute(
    "aria-sort",
    "none",
  );
  await expect(page.locator("#admin-user-sort")).toBeHidden();

  await page.getByLabel("Search by email").fill(`sort-${stamp}`);
  await expect(table.getByRole("link", { name: older })).toBeVisible();
  await expect(table.getByRole("link", { name: newer })).toBeVisible();

  const order = async (): Promise<string[]> => table.locator("tbody a").allTextContents();
  await expect.poll(async () => {
    const names = await order();
    return names.indexOf(newer) >= 0 && names.indexOf(newer) < names.indexOf(older);
  }).toBe(true);

  const emailHeader = page.getByRole("columnheader", { name: "Email" });
  await emailHeader.getByRole("button", { name: "Email" }).click();
  await expect(emailHeader).toHaveAttribute("aria-sort", "ascending");
  await expect(page.getByRole("columnheader", { name: "Created" })).toHaveAttribute(
    "aria-sort",
    "none",
  );
  await expect(page).toHaveURL(/sort=email/);
  await expect(page).toHaveURL(/dir=asc/);
  await expect.poll(async () => {
    const names = await order();
    return names.indexOf(older) >= 0 && names.indexOf(older) < names.indexOf(newer);
  }).toBe(true);

  await emailHeader.getByRole("button", { name: "Email" }).focus();
  await page.keyboard.press("Enter");
  await expect(emailHeader).toHaveAttribute("aria-sort", "descending");
  await expect(page).toHaveURL(/dir=desc/);

  await page.reload();
  await expect(page.getByRole("columnheader", { name: "Email" })).toHaveAttribute(
    "aria-sort",
    "descending",
  );

  await page.setViewportSize({ width: 768, height: 800 });
  await expect(page.getByRole("columnheader", { name: "Email" })).toBeVisible();
  await expect(page.locator("#admin-user-sort")).toBeHidden();

  await page.setViewportSize({ width: 390, height: 800 });
  await expect(page.locator("#admin-user-sort")).toBeVisible();
  await page.locator("#admin-user-sort").selectOption("email:asc");
  await expect(page).toHaveURL(/sort=email/);
  await expect(page).toHaveURL(/dir=asc/);
  await page.getByLabel("Search by email").fill(`sort-${stamp}`);
  const cards = page.locator("div.md\\:hidden ul a");
  await expect.poll(async () => {
    const names = await cards.allTextContents();
    return names.indexOf(older) >= 0 && names.indexOf(older) < names.indexOf(newer);
  }).toBe(true);
});
