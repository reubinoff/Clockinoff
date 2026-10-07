# `tests/` — agent guide

Shorter contract for tests. The repo root [`AGENTS.md`](../AGENTS.md) still
wins if the two disagree. Coverage is enforced only on a full run.

## Where tests go

| Test | Path | Runner |
|---|---|---|
| `src/lib/<name>.ts` | `tests/lib/<name>.test.ts` | Vitest |
| Service / auth / db | `tests/server/<area>.test.ts` | Vitest |
| Route handler | `tests/server/<area>-route.test.ts` | Vitest |
| React component | `tests/components/<kebab-name>.test.tsx` | Vitest + jsdom |
| Browser smoke | `tests/e2e/<name>.spec.ts` | Playwright |

Vitest includes `tests/**/*.test.ts` and `tests/**/*.test.tsx` only.
`tests/e2e/**` is excluded. Playwright files stay `*.spec.ts`.

Shared DB fixtures live in `tests/helpers.ts`: `makeUser`, `makeClient`,
`makeProject`, `makeTag`. `truncateAll` lives in `tests/setup.ts`. Call it
from `beforeEach` in tests that write rows. `tests/setup.ts` migrates
`DATABASE_URL_TEST` once per run (default
`postgres://timely:timely@localhost:5432/timely_test`).

## How to write them

- Import the unit under test from `@/…`, the same alias app code uses.
- Route tests import the handler, they do not boot Next:

  `import { POST as loginPost } from "@/app/api/auth/login/route"`

- Assert `ApiError` failures with `rejects.toMatchObject({ code, status })`.
  Assert HTTP bodies as `{ error: { code, message } }`.
- Component tests start with `// @vitest-environment jsdom`, render with
  Testing Library, and `cleanup()` in `afterEach`.
- Describe blocks name the behaviour (`"second start returns TIMER_ALREADY_RUNNING"`).
  Keep one behaviour per `it`.

Vitest runs files sequentially (`fileParallelism: false`, `maxWorkers: 1`,
`isolate: true`) because API tests share one Postgres pool and each file's
`vi.mock("next/headers")` has its own cookie jar. Do not turn file
parallelism back on.

## Coverage

`npm run test:coverage` gates `src/server/**` and `src/lib/**` at ≥90% lines,
statements, and functions, and ≥80% branches (`vitest.config.ts`). A new file
in those trees needs a test in the same change. `schema.ts` and `migrate.ts`
are excluded. A single-file Vitest run will miss the gate; use the full
script before claiming green.

Playwright (`npm run test:e2e`) needs the app already running, except in the
nightly workflow. It is not part of the coverage gate.

## Do not

- Do not lower the coverage thresholds, skip ownership cases, or delete the
  parallel timer-start race in `tests/server/timer.test.ts` to go green.
- Do not point tests at the dev database. Use `DATABASE_URL_TEST`.
- Do not import `tests/e2e` from Vitest, or Vitest helpers into Playwright.
- Do not commit real secrets. The test secrets in `tests/setup.ts` are
  fixtures, not production values.
