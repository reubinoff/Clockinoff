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
  }) => {
    // Use `page.request` (== page.context().request) so API calls share the
    // same cookie jar as the browser session we just registered in. The
    // top-level `request` fixture is a stand-alone APIRequestContext that
    // does not inherit the page's cookies — authenticated endpoints like
    // /api/export/* reject it with 401. Shaul lock: no weakening of the
    // assertions themselves (we still expect 200 + the correct bodies).
    const request = page.request;
    await page.goto("/register");
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/app/);

    // Scope every timer interaction to the TimerBar dock so we don't fight
    // Playwright strict mode against stray buttons / inputs in panels (e.g.
    // the entry list's "Filter by project" combobox or future dialogs).
    const timerDock = page.locator(".timer-dock");
    await timerDock.getByLabel("Timer description").fill(description);
    // The idle Start button carries a `.timer-start-idle` breath animation
    // (see src/app/globals.css). Playwright's actionability check reports
    // "element is not stable" if we click into that animation, so we both
    // emulate prefers-reduced-motion (playwright.config.ts) *and* assert the
    // button is actually enabled before the click so a regression here fails
    // loudly instead of timing out as a stability flake. Shaul lock: no
    // `{ force: true }`.
    const startBtn = timerDock.getByRole("button", { name: "Start timer" });
    await expect(startBtn).toBeEnabled();
    await startBtn.click();
    await expect(
      timerDock.getByRole("button", { name: "Stop timer" }),
    ).toBeVisible();
    await page.waitForTimeout(1500);
    await timerDock.getByRole("button", { name: "Stop timer" }).click();
    await expect(
      timerDock.getByRole("button", { name: "Start timer" }),
    ).toBeVisible();

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
