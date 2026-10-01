import { runMigrations } from "../../src/server/db/migrate";
import { closeDb } from "../../src/server/db/client";

// Playwright global setup: run the SAME migrations unit tests use against the
// app DB `next start` is about to serve, before the webServer listens.
//
// Why this exists (see GitHub issue #55):
//   The CI/nightly jobs set `NODE_ENV: test` at job level. That means the
//   workflow's `npm run db:migrate` step resolves to `DATABASE_URL_TEST` and
//   only migrates `timely_test` — the main `timely` DB is never migrated.
//   Unit tests only touch `timely_test` so they still pass, but Playwright
//   boots `next start` with `NODE_ENV=production`, which reads `DATABASE_URL`
//   (= `timely`). Hence `relation "users" does not exist` on register.
//
// Fix: run `runMigrations()` from `src/server/db/migrate.ts` — the exact
// same module `tests/setup.ts` imports for unit tests — against the DB URL
// the Playwright-spawned `next start` will use. If it throws, Playwright
// aborts the run and the job fails hard.
//
// We honour `PLAYWRIGHT_BASE_URL`: when a developer points Playwright at an
// already-running local server, we leave their DB alone.

export default async function globalSetup(): Promise<void> {
  if (process.env.PLAYWRIGHT_BASE_URL) {
    console.log(
      "[playwright] PLAYWRIGHT_BASE_URL is set; skipping app DB migrate " +
        "(assuming the external server already has an up-to-date schema).",
    );
    return;
  }

  // `next start` (our webServer command) inherits this process's env. Mirror
  // the resolution logic of `src/server/db/client.ts` so we migrate the same
  // DB the server will connect to. In the nightly workflow the e2e step sets
  // NODE_ENV=production, so this picks DATABASE_URL (= the `timely` DB).
  const targetUrl =
    process.env.NODE_ENV === "test"
      ? process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL
      : process.env.DATABASE_URL;

  if (!targetUrl) {
    throw new Error(
      "[playwright] Cannot migrate app DB: neither DATABASE_URL nor " +
        "DATABASE_URL_TEST is set. Refusing to boot the e2e server against " +
        "an unmigrated schema.",
    );
  }

  console.log(`[playwright] migrating app DB at ${redact(targetUrl)} …`);
  try {
    const applied = await runMigrations();
    if (applied.length === 0) {
      console.log("[playwright] app DB already up to date.");
    } else {
      console.log(
        `[playwright] applied ${applied.length} migration(s):\n  - ${applied.join("\n  - ")}`,
      );
    }
  } finally {
    await closeDb();
  }
}

function redact(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "<unparseable DATABASE_URL>";
  }
}
