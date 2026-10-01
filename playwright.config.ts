import { defineConfig } from "@playwright/test";

// When PLAYWRIGHT_BASE_URL is set (e.g. `npm run dev` already running) we
// point tests at it and don't spin up our own server. Otherwise Playwright
// will build+start the app on :3000 itself, which is what CI wants.
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  // Run `tests/e2e/global-setup.ts` before anything else (including the
  // webServer). It migrates the Playwright app DB using the same
  // `runMigrations()` path unit tests use. If migrations throw, Playwright
  // aborts and the CI job fails hard — see GitHub issue #55.
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: externalBaseUrl ?? "http://localhost:3000",
    // Emulate `prefers-reduced-motion: reduce` so the TimerBar's idle Start
    // button (`.timer-start-idle` → `start-idle-breath` keyframes in
    // src/app/globals.css) and the running-pulse are suppressed. Without
    // this Playwright reports "element is not stable" when clicking Start
    // because the infinite breath animation keeps nudging transform.
    // The CSS already honours this media query (reduced-motion block at
    // `.timer-running-pulse, .timer-start-idle { animation: none; }`), so
    // this is a harness-only tweak — product motion stays intact for
    // humans.
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : [["list"]],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "npm run start",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
