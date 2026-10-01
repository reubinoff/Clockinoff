import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard for the 2026-10-01 Clockinoff #75 incident.
//
// `scripts/migrate.mjs` runs as the Azure App Service startup command, before
// `node server.js`, inside the Next.js standalone deploy bundle produced by
// `.github/workflows/cd.yml`. The standalone `node_modules` is traced from
// the Next build; CD overlays a small, explicit allowlist (argon2,
// pdfkit/fontkit, @react-pdf/*) on top of it.
//
// Any `import "<pkg>"` added to `scripts/migrate.mjs` whose package is NOT in
// the standalone trace AND NOT in CD's overlay allowlist will crash the
// migrate step with `ERR_MODULE_NOT_FOUND`, which crash-loops the Web App
// and returns 503 for every request. The incident that motivated this test
// was `import { parse } from "pg-connection-string";` (a transitive of `pg`
// the tracer did not keep). This test fails if that specific regression —
// or any other bare import outside the small allowlist — comes back.
//
// If you genuinely need a new package here, update both this allowlist AND
// `.github/workflows/cd.yml` so the dependency is present in `deploy/` at
// runtime, in the same PR.

const MIGRATE_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "scripts",
  "migrate.mjs",
);

// Packages CD guarantees are on disk in the deploy bundle at migrate time.
// `pg` and `@azure/identity` are production dependencies in package.json and
// are reliably traced into the standalone output.
const ALLOWED_PACKAGES = new Set<string>(["pg", "@azure/identity"]);

const BANNED_PACKAGES = new Set<string>(["pg-connection-string"]);

// Match ESM static imports: `import ... from "<specifier>"` or
// `import "<specifier>"`. Also match top-level dynamic imports of a string
// literal: `import("<specifier>")`.
const IMPORT_RE =
  /\bimport\s+(?:[^'"`;]*?\s+from\s+)?["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;

function packageOf(specifier: string): string | null {
  if (specifier.startsWith("node:")) return null;
  if (specifier.startsWith(".") || specifier.startsWith("/")) return null;
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    if (!name) return null;
    return `${scope}/${name}`;
  }
  const [first] = specifier.split("/");
  return first ?? null;
}

async function extractImportPackages(source: string): Promise<string[]> {
  const pkgs = new Set<string>();
  for (const match of source.matchAll(IMPORT_RE)) {
    const specifier = match[1] ?? match[2];
    if (!specifier) continue;
    const pkg = packageOf(specifier);
    if (pkg) pkgs.add(pkg);
  }
  return [...pkgs].sort();
}

describe("scripts/migrate.mjs import allowlist (Clockinoff #75 regression)", () => {
  it("does not import pg-connection-string", async () => {
    const source = await readFile(MIGRATE_PATH, "utf8");
    // Guard against any syntactic form of the banned import, including the
    // dynamic variant and import() calls, even in commented-out code — the
    // regex above is lenient on purpose.
    expect(source).not.toMatch(/from\s+["']pg-connection-string["']/);
    expect(source).not.toMatch(/import\(\s*["']pg-connection-string["']\s*\)/);
  });

  it("only imports packages CD guarantees are in the deploy bundle", async () => {
    const source = await readFile(MIGRATE_PATH, "utf8");
    const pkgs = await extractImportPackages(source);
    const forbidden = pkgs.filter((p) => BANNED_PACKAGES.has(p));
    expect(forbidden).toEqual([]);
    const unknown = pkgs.filter((p) => !ALLOWED_PACKAGES.has(p));
    expect(unknown, "disallowed migrate.mjs imports: " + unknown.join(", ")).toEqual([]);
  });
});
