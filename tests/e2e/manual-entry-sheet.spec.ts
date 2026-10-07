import { expect, test, type Page } from "@playwright/test";

// #184: time-field left inset matches Description/Date, and at 390px the
// Add-manual sheet header stays full ink contrast while Add sits fully
// above the tab bar (no scroll).

const password = "correct-horse-battery";

async function register(page: Page): Promise<void> {
  const email = `manual-184-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  await page.goto("/register");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/);
}

async function fieldPads(page: Page): Promise<{
  description: string;
  date: string;
  start: string;
  end: string;
}> {
  return page.evaluate(() => {
    const pad = (sel: string): string =>
      getComputedStyle(document.querySelector(sel)!).paddingLeft;
    return {
      description: pad("[data-manual-description]"),
      date: pad("[data-manual-date]"),
      start: pad("[data-manual-start]"),
      end: pad("[data-manual-end]"),
    };
  });
}

test.describe("manual entry polish (#184)", () => {
  test("desktop time fields share Description/Date left padding", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await register(page);
    await page.getByRole("tab", { name: "Manual" }).click();
    await expect(page.locator("[data-manual-start]")).toBeVisible();

    const light = await fieldPads(page);
    expect(light.start).toBe(light.description);
    expect(light.end).toBe(light.description);
    expect(light.date).toBe(light.description);

    const clipped = await page.evaluate(() => {
      return ["[data-manual-start]", "[data-manual-end]"].map((sel) => {
        const el = document.querySelector(sel) as HTMLInputElement;
        return el.scrollWidth <= el.clientWidth + 1;
      });
    });
    expect(clipped).toEqual([true, true]);

    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    const dark = await fieldPads(page);
    expect(dark.start).toBe(dark.description);
    expect(dark.date).toBe(dark.description);
  });

  test("390px sheet header is ink and Add clears the tab bar", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await register(page);
    await page.locator('[data-timer-manual-mobile-btn="true"]:visible').click();
    const sheet = page.locator("[data-manual-entry-sheet]");
    await expect(sheet).toBeVisible();

    const add = sheet.locator("[data-manual-add-btn]");
    const tab = page.locator('nav[aria-label="Primary"]').last();
    await expect(add).toBeVisible();
    await expect(tab).toBeVisible();

    const boxes = await page.evaluate(() => {
      const addEl = document.querySelector(
        '[data-manual-form="stacked"] [data-manual-add-btn]',
      )!;
      const tabEl = document.querySelector('nav[aria-label="Primary"].fixed, nav.fixed')
        ?? [...document.querySelectorAll("nav")].find(
          (n) => getComputedStyle(n).position === "fixed",
        )!;
      const header = document.querySelector("#manual-entry-title")!;
      const headerBar = document.querySelector("[data-manual-entry-header]")!;
      const addBox = addEl.getBoundingClientRect();
      const tabBox = tabEl.getBoundingClientRect();
      const headerCs = getComputedStyle(header);
      const barCs = getComputedStyle(headerBar);
      return {
        addTop: addBox.top,
        addBottom: addBox.bottom,
        tabTop: tabBox.top,
        vh: window.innerHeight,
        headerColor: headerCs.color,
        headerOpacity: headerCs.opacity,
        bodyColor: getComputedStyle(document.body).color,
        headerBg: barCs.backgroundColor,
        scrollTop: (addEl.closest(".overflow-y-auto") as HTMLElement | null)?.scrollTop ?? 0,
      };
    });

    expect(boxes.scrollTop).toBe(0);
    expect(boxes.addTop).toBeGreaterThanOrEqual(0);
    expect(boxes.addBottom).toBeLessThanOrEqual(boxes.vh);
    expect(boxes.addBottom).toBeLessThanOrEqual(boxes.tabTop + 1);
    expect(boxes.headerOpacity).toBe("1");
    expect(boxes.headerColor).toBe(boxes.bodyColor);
    expect(boxes.headerBg).not.toBe("rgba(0, 0, 0, 0)");

    const pads = await fieldPads(page);
    expect(pads.start).toBe(pads.description);
    expect(pads.end).toBe(pads.date);

    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    const darkHeader = await page.evaluate(() => {
      const header = document.querySelector("#manual-entry-title")!;
      return {
        color: getComputedStyle(header).color,
        body: getComputedStyle(document.body).color,
        opacity: getComputedStyle(header).opacity,
      };
    });
    expect(darkHeader.opacity).toBe("1");
    expect(darkHeader.color).toBe(darkHeader.body);
  });
});
