import { expect, test } from "@playwright/test";

// End-to-end regression smoke: register → run timer → verify the entries
// list refreshed on stop → export the day as CSV and PDF via the same
// authenticated session cookie the app just set.
//
// Local invocation (see README):
//   npm run dev
//   PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e
// In CI (nightly) Playwright starts `next start` itself via webServer.

const email = `e2e-${Date.now()}@example.com`;
const password = "correct-horse-battery";
const description = `playwright smoke ${Date.now()}`;

test.describe.serial("Timer smoke", () => {
  test("register → start/stop timer → entries list refreshes → CSV + PDF export", async ({
    page,
    request,
  }) => {
    await page.goto("/register");
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/app/);

    await page.fill('input[placeholder*="Start a new timer"]', description);
    await page.click("button:has-text('Start')");
    await expect(page.locator("button:has-text('Stop')")).toBeVisible();
    await page.waitForTimeout(1500);
    await page.click("button:has-text('Stop')");
    await expect(page.locator("button:has-text('Start')")).toBeVisible();

    // Entries list refresh: after Stop the just-recorded entry must be
    // visible without a manual reload (see EntryList `useEffect` on initial).
    await expect(page.getByText(description).first()).toBeVisible({ timeout: 10_000 });

    const today = new Date().toISOString().slice(0, 10);

    const csvRes = await request.get(`/api/export/csv?from=${today}&to=${today}`);
    expect(csvRes.status()).toBe(200);
    expect(csvRes.headers()["content-type"] ?? "").toContain("text/csv");
    const csvText = await csvRes.text();
    expect(csvText.split("\n")[0]).toContain("date,start,end,duration");
    expect(csvText).toContain(description);

    const pdfRes = await request.get(`/api/export/pdf?from=${today}&to=${today}`);
    expect(pdfRes.status()).toBe(200);
    expect(pdfRes.headers()["content-type"] ?? "").toContain("application/pdf");
    const pdfBuf = await pdfRes.body();
    // PDFs start with the "%PDF-" magic bytes; enough to prove we didn't
    // receive an HTML error page or an empty body.
    expect(pdfBuf.slice(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdfBuf.byteLength).toBeGreaterThan(500);
  });
});
