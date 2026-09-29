import { expect, test } from "@playwright/test";

// Regression for issue #27 — after creating a project the timer project
// dropdown must include it (previously stuck on "No project").
// Optional/non-blocking in CI (see README). Run locally with:
//   npm run dev
//   PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e

const email = `dropdown-${Date.now()}@example.com`;
const password = "password123";
const projectName = `Proj ${Date.now()}`;

test("timer project dropdown updates after project create", async ({ page }) => {
  await page.goto("/register");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/);

  // V2-5: dock details (project + billable + tz) are collapsed by default —
  // expand them so the project dropdown is in the accessibility tree.
  await page.getByRole("button", { name: "Show timer details" }).click();

  const projectSelect = page.getByRole("combobox", { name: "Project" });
  await expect(projectSelect).toBeVisible();
  // Before creating the project, the dropdown only offers the sentinel option.
  await expect(projectSelect.locator("option")).toHaveText(["No project"]);

  await page.goto("/app/projects");
  // Full navigation remounts the dock; expand details again so the
  // dropdown re-enters the DOM.
  await page.getByRole("button", { name: "Show timer details" }).click();
  // The Name input is the required text input in the "Add project" form.
  await page.locator('form input[required]').first().fill(projectName);
  await page.click("button:has-text('Add')");

  // Dropdown lives in the sticky header (same page tree); the new project
  // must appear without a manual page reload. Native <option> elements are
  // not "visible" per Playwright until the select opens, so assert on the
  // rendered option list and then verify selection works.
  await expect
    .poll(async () => projectSelect.locator("option").allInnerTexts(), { timeout: 5000 })
    .toContain(projectName);

  await projectSelect.selectOption({ label: projectName });
  await expect(projectSelect).not.toHaveValue("");
});
