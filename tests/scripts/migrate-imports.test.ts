import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Regression guard for the Clockinoff production 503 that followed tip
// 0eb44e6 (PR #85). The CD workflow copies ONLY `scripts/migrate.mjs`
// into the Next.js standalone deploy bundle (see
// `.github/workflows/cd.yml`, "Runtime migration runner"). That bundle
// contains the dependencies Next's output tracing pulled in from `src/`,
// plus a handful of belt-and-braces re-copies. Anything else that
// `migrate.mjs` imports is almost certainly missing from the deploy
// `node_modules`, which crashes App Service startup with
// `ERR_MODULE_NOT_FOUND` and 503s every HTTP request until rollback.
//
// Allowlist: node:* builtins, `pg`, and `@azure/identity`. All three are
// production dependencies in package.json and have been verified present
// under `deploy/node_modules` either by Next tracing (`pg`,
// `@azure/identity` are referenced from `src/server/db/*`) or by cd.yml
// re-copy. If you need to add a package here, you also need to teach
// cd.yml to copy it into `deploy/node_modules/` or confirm Next tracing
// now covers it from `src/` — otherwise this test is doing its job.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATE_PATH = path.resolve(HERE, "..", "..", "scripts", "migrate.mjs");

const ALLOWED_PACKAGES = new Set<string>(["pg", "@azure/identity"]);

// Grabs the specifier (quoted path) from static and dynamic imports:
//   import x from "pkg"
//   import * as x from "pkg"
//   import "pkg"
//   await import("pkg")
const STATIC_IMPORT_RE = /^\s*import\b[^"'`;]*["']([^"']+)["']/gm;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

function packageNameOf(specifier: string): string {
  if (specifier.startsWith("@")) {
    return specifier.split("/").slice(0, 2).join("/");
  }
  return specifier.split("/")[0];
}

describe("scripts/migrate.mjs runtime imports", () => {
  it("imports only node:* builtins and the deploy-bundle allowlist", async () => {
    const src = await readFile(MIGRATE_PATH, "utf8");

    const specifiers: string[] = [];
    for (const match of src.matchAll(STATIC_IMPORT_RE)) specifiers.push(match[1]);
    for (const match of src.matchAll(DYNAMIC_IMPORT_RE)) specifiers.push(match[1]);

    const offenders: string[] = [];
    for (const specifier of specifiers) {
      if (specifier.startsWith("node:")) continue;
      if (specifier.startsWith(".") || specifier.startsWith("/")) continue;
      const pkg = packageNameOf(specifier);
      if (!ALLOWED_PACKAGES.has(pkg)) {
        offenders.push(specifier);
      }
    }

    expect(
      offenders,
      `scripts/migrate.mjs may only import node:* builtins or ${[...ALLOWED_PACKAGES]
        .map((p) => `"${p}"`)
        .join(
          ", ",
        )}. Found disallowed imports: ${offenders.map((s) => `"${s}"`).join(", ")}. ` +
        "The CD workflow copies migrate.mjs into the Next.js standalone deploy bundle, which does not contain arbitrary transitive deps. " +
        "If you need to add a package, update .github/workflows/cd.yml to re-copy it into deploy/node_modules/ and extend the allowlist in this test.",
    ).toEqual([]);
  });

  it("does not import pg-connection-string (production 503 regression)", async () => {
    const src = await readFile(MIGRATE_PATH, "utf8");

    const specifiers: string[] = [];
    for (const match of src.matchAll(STATIC_IMPORT_RE)) specifiers.push(match[1]);
    for (const match of src.matchAll(DYNAMIC_IMPORT_RE)) specifiers.push(match[1]);

    expect(
      specifiers,
      "scripts/migrate.mjs must not import pg-connection-string. It is a transitive dep of pg that Next's standalone output tracing does not include, so importing it crash-loops migrate at startup with ERR_MODULE_NOT_FOUND and 503s the Web App (tip 0eb44e6, PR #85). Parse DATABASE_URL with `new URL(...)` instead.",
    ).not.toContain("pg-connection-string");
  });
});
