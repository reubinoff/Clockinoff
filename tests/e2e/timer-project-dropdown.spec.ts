import { expect, test } from "@playwright/test";

// Regression for issue #27 — after creating a project the timer project
// dropdown must include it (previously stuck on "No project").
// Optional/non-blocking in CI (see README). Run locally with:
//   npm run dev
//   PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e

const email = `dropdown-${Date.now()}@example.com`;
const password = "correct-horse-battery";
const projectName = `Proj ${Date.now()}`;

test("timer project dropdown updates after project create", async ({ page }) => {
  await page.goto("/register");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/);

  // #101: project is visible on the timer dock without expanding details.
  // #102: the dock is hidden on /app/projects, so the dropdown is read on
  // the timer page after the project is created.
  const timerDock = page.locator(".timer-dock");
  const projectSelect = timerDock.getByRole("combobox", {
    name: "Project",
    exact: true,
  });
  await expect(projectSelect).toBeVisible();
  // Before creating the project, the dropdown only offers the sentinel option.
  await expect(projectSelect.locator("option")).toHaveText(["No project"]);

  await page.goto("/app/projects");
  await expect(page.locator(".timer-dock")).toHaveCount(0);
  // The Name input is the required text input in the "Add project" form.
  await page.locator('form input[required]').first().fill(projectName);
  await page.click("button:has-text('Add')");
  await expect(page.getByText(projectName).first()).toBeVisible({ timeout: 5000 });

  await page.goto("/app");
  await expect(projectSelect).toBeVisible();
  // Native <option> elements are not "visible" per Playwright until the
  // select opens, so assert on the rendered option list and then verify
  // selection works.
  await expect
    .poll(async () => projectSelect.locator("option").allInnerTexts(), { timeout: 5000 })
    .toContain(projectName);

  await projectSelect.selectOption({ label: projectName });
  await expect(projectSelect).not.toHaveValue("");
});
