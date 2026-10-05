import { expect, test } from "@playwright/test";

// Nightly regression for #56 Quiet Pulse Summary (Reports). The smoke spec
// only proves the auth + timer + export happy path works end-to-end; this
// file asserts the Reports page shows the *right numbers* for a seeded
// data set and that the client only talks to /api/entries (no new report
// endpoints snuck in). Negative + empty-range coverage lives alongside so
// the three Reports surfaces (positive values, no-API-drift, empty) are
// pinned by the same workflow.

// Lock the browser into UTC so the client's "Today" preset buckets line
// up with the UTC day keys we seed. The register page's detectTimezone
// hits `Intl.DateTimeFormat().resolvedOptions().timeZone` which Playwright
// honours — the user record ends up with timezone="UTC", and the
// client-side `summarize()` buckets entries by that same zone.
test.use({ timezoneId: "UTC" });

async function registerAndSeed(
  page: import("@playwright/test").Page,
  opts: { email: string; password: string },
): Promise<{
  day: string;
  projects: { alpha: string; beta: string };
  totalSeconds: number;
}> {
  await page.goto("/register");
  await page.fill('input[type="email"]', opts.email);
  await page.fill('input[type="password"]', opts.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/);

  const request = page.request;
  // Create two named projects via the authenticated API using the browser's
  // cookie jar (same pattern as smoke.spec.ts).
  const alphaName = `Alpha ${Date.now()}`;
  const betaName = `Beta ${Date.now() + 1}`;
  const alphaRes = await request.post("/api/projects", { data: { name: alphaName } });
  expect(alphaRes.ok(), `project create failed: ${alphaRes.status()}`).toBeTruthy();
  const alpha = (await alphaRes.json()) as { id: string; name: string };
  const betaRes = await request.post("/api/projects", { data: { name: betaName } });
  expect(betaRes.ok()).toBeTruthy();
  const beta = (await betaRes.json()) as { id: string; name: string };

  // Pick a "today" window in UTC. Nightly runs at 02:15 UTC so entries at
  // 00:00–01:30 UTC are safely before the test wall-clock on CI. For
  // locally-triggered runs across the day boundary we fall back to the
  // SAME UTC day the test's own clock reports so the day key never drifts
  // out of range mid-run.
  const day = new Date().toISOString().slice(0, 10);

  // Seed:
  //   • Alpha: 1h       →   3600s   → 28.57% of 3h30m total
  //   • Beta : 2h       →   7200s   → 57.14%
  //   • No project 30m  →   1800s   → 14.29%
  // Keep the hours small so the row never crosses UTC midnight regardless
  // of when nightly fires.
  const seeds = [
    {
      description: "regression alpha",
      project_id: alpha.id,
      start_at: `${day}T00:00:00Z`,
      end_at: `${day}T01:00:00Z`,
    },
    {
      description: "regression beta",
      project_id: beta.id,
      start_at: `${day}T01:00:00Z`,
      end_at: `${day}T03:00:00Z`,
    },
    {
      description: "regression no-project",
      project_id: null,
      start_at: `${day}T03:00:00Z`,
      end_at: `${day}T03:30:00Z`,
    },
  ];
  for (const seed of seeds) {
    const res = await request.post("/api/entries", { data: seed });
    expect(res.status(), `entry create failed body=${await res.text()}`).toBe(201);
  }

  return {
    day,
    projects: { alpha: alpha.name, beta: beta.name },
    totalSeconds: 3600 + 7200 + 1800,
  };
}

test.describe.serial("Reports (#56 Quiet Pulse Summary) — regression", () => {
  const password = "correct-horse-battery";

  test("Reports shows correct totals, project breakdown and export link for seeded entries", async ({
    page,
  }) => {
    const email = `reports-pos-${Date.now()}@example.com`;
    const seeded = await registerAndSeed(page, { email, password });

    // Track every API path the Reports client touches — the brief forbids
    // introducing a dedicated reports/summary/charts endpoint, so the
    // client must stay on /api/entries. We watch requests from navigation
    // onwards so project/entries POSTs from seeding aren't counted.
    const apiHits: string[] = [];
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (url.pathname.startsWith("/api/")) apiHits.push(url.pathname);
    });

    await page.goto("/app/reports");
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();

    // The default preset is "This month" — switch to Today so the seeded
    // single-day totals are a stable target.
    const chips = page.getByRole("group", { name: "Range" }).getByRole("button");
    const expectedChips = [
      "Today",
      "This week",
      "Last week",
      "This month",
      "Last month",
      "Custom",
    ];
    await expect(chips).toHaveText(expectedChips);
    await page.getByRole("button", { name: "Today" }).click();
    await expect(page.getByRole("button", { name: "Today" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Totals block: Quiet Pulse voice is `X.YYh`. 3600+7200+1800 = 12600s
    // → 3.50h total. Because every seed is on the same UTC day, "peak day"
    // equals the overall total.
    const totalText = page.locator("p.text-\\[2\\.5rem\\]");
    await expect(totalText).toHaveText("3.50h");
    await expect(page.getByText("Peak day · 3.50h")).toBeVisible();

    // Project list: Beta (2h, 57%), Alpha (1h, 29%), No project (0.5h, 14%).
    // The list is a <ul> inside the "By project" card — scope the matcher to
    // avoid colliding with any future list elsewhere on the page.
    const byProjectCard = page
      .getByRole("heading", { name: "By project" })
      .locator("..")
      .locator("..");
    const items = byProjectCard.locator("ul > li");
    await expect(items).toHaveCount(3);

    const first = items.nth(0);
    await expect(first).toContainText(seeded.projects.beta);
    await expect(first).toContainText("2.00h");
    await expect(first).toContainText("57%");

    const second = items.nth(1);
    await expect(second).toContainText(seeded.projects.alpha);
    await expect(second).toContainText("1.00h");
    await expect(second).toContainText("29%");

    const third = items.nth(2);
    await expect(third).toContainText("No project");
    await expect(third).toContainText("0.50h");
    await expect(third).toContainText("14%");

    // Donut center total should mirror the headline figure (hoursText).
    const donut = page.getByRole("heading", { name: "Distribution" }).locator("..");
    await expect(donut).toContainText("3.50h");

    // Export link points at /app/export?from=day&to=day for the active range.
    const exportLink = page.getByRole("link", {
      name: "Export this range as CSV or PDF",
    });
    const href = await exportLink.getAttribute("href");
    expect(href).toBe(
      `/app/export?from=${encodeURIComponent(seeded.day)}&to=${encodeURIComponent(seeded.day)}`,
    );

    // Give any in-flight entries fetch a beat to settle before snapshotting
    // the hits list — the useEffect fires immediately on mount + on each
    // preset toggle.
    await page.waitForTimeout(300);

    const uniquePaths = Array.from(new Set(apiHits));
    const unexpected = uniquePaths.filter(
      (p) =>
        p.startsWith("/api/reports") ||
        p.startsWith("/api/summary") ||
        p.startsWith("/api/charts"),
    );
    expect(unexpected, `Reports client must not hit new endpoints: ${unexpected.join(", ")}`)
      .toEqual([]);
    expect(uniquePaths.some((p) => p === "/api/entries")).toBe(true);
  });

  test("empty range renders the Quiet Pulse empty hint and 0.00h total", async ({ page }) => {
    const email = `reports-empty-${Date.now()}@example.com`;
    await page.goto("/register");
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/app/);

    await page.goto("/app/reports");
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
    await page.getByRole("button", { name: "Today" }).click();

    const totalText = page.locator("p.text-\\[2\\.5rem\\]");
    await expect(totalText).toHaveText("0.00h");
    await expect(
      page.getByText("No entries in this range. Try a different window above, or log one from the Timer."),
    ).toBeVisible();
    // Project list shows the empty-grouping hint instead of a <ul>.
    await expect(page.getByText("No projects to group — log an entry first.")).toBeVisible();
  });

  test("unauthenticated /app/reports redirects to /login with next=/app/reports", async ({
    page,
  }) => {
    const res = await page.goto("/app/reports");
    // Final URL must be /login?next=/app/reports (proxy guard).
    expect(page.url()).toContain("/login");
    const parsed = new URL(page.url());
    expect(parsed.pathname).toBe("/login");
    expect(parsed.searchParams.get("next")).toBe("/app/reports");
    // The server responds with the login page body; just assert 200 OK so
    // we don't lock ourselves to the proxy's exact 302/307 code (Next can
    // swap between them across versions).
    expect(res?.status()).toBeGreaterThanOrEqual(200);
    expect(res?.status()).toBeLessThan(400);
  });
});
