import { spawn } from "node:child_process";

// Playwright global setup: migrate the SAME schema unit tests use against the
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
// Why we spawn instead of import (Shaul lock):
//   Playwright's TypeScript loader compiles globalSetup to CommonJS, which
//   chokes on `import.meta.url` inside `src/server/db/migrate.ts`
//   (`SyntaxError: Cannot use 'import.meta' outside a module`). We must NOT
//   import `migrate.ts` from here. Instead we spawn the migrate CLI as a
//   child process (same `npm run db:migrate` script a human would run) with
//   the Nightly DB URL forced into `DATABASE_URL`. The spawned process
//   runs under tsx with ESM semantics intact and uses the exact same
//   `runMigrations()` SQL path.
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

  // Force the migrate CLI to connect to the DB we just resolved, regardless of
  // the parent's NODE_ENV. The CLI (`src/server/db/migrate.ts` → `client.ts`)
  // reads `DATABASE_URL` in production and `DATABASE_URL_TEST` in test; we
  // normalise both so either resolution path lands on the target.
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: targetUrl,
    DATABASE_URL_TEST: targetUrl,
  };

  await runMigrateCli(childEnv);
  console.log("[playwright] app DB migrate completed.");
}

function runMigrateCli(env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    // Use `npm run db:migrate` so this matches what humans and CI already
    // use. On Windows npm is a .cmd shim, hence `shell: true`.
    const child = spawn("npm", ["run", "db:migrate"], {
      env,
      stdio: "inherit",
      shell: true,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `[playwright] db:migrate exited with ${
            signal ? `signal ${signal}` : `code ${code}`
          }`,
        ),
      );
    });
  });
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
