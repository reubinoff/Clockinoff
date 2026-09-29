import { expect, test } from "@playwright/test";

// Timer start/stop + CSV export smoke.
// This test is optional/non-blocking in CI (see README). Run with:
//   npm run dev
//   PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e

const email = `e2e-${Date.now()}@example.com`;
const password = "password123";

test.describe.serial("Timer smoke", () => {
  test("register → start timer → stop → export CSV", async ({ page, request }) => {
    await page.goto("/register");
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/app/);

    await page.fill('input[placeholder*="Start a new timer"]', "playwright test");
    await page.click("button:has-text('Start')");
    await expect(page.locator("button:has-text('Stop')")).toBeVisible();
    await page.waitForTimeout(1500);
    await page.click("button:has-text('Stop')");
    await expect(page.locator("button:has-text('Start')")).toBeVisible();

    const today = new Date().toISOString().slice(0, 10);
    const res = await request.get(`/api/export/csv?from=${today}&to=${today}`);
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text.split("\n")[0]).toContain("date,start,end,duration");
    expect(text).toContain("playwright test");
  });
});
