import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./tests/empty-server-only.ts"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    sequence: { concurrent: false },
    // Vitest 4 removed poolOptions.forks.singleFork. Keep a single worker
    // so API tests share one Postgres pool, but leave isolation on: each
    // file's vi.mock("next/headers") closes over its own cookie jar.
    pool: "forks",
    maxWorkers: 1,
    isolate: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["tests/e2e/**", "node_modules/**", ".next/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      include: ["src/server/**", "src/lib/**"],
      exclude: [
        "src/server/db/migrate.ts",
        "src/server/db/schema.ts",
        "**/*.d.ts",
        "**/*.md",
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 80,
      },
    },
  },
});
