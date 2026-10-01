# Timely / Clockinoff — v1

A tiny, clean, solo time tracker. Manual entries + one running timer + projects/clients/tags + CSV/PDF export. No calendar. No teams. No Clockify sync. No Google auth.

Built to the [attached tech design](uploads/timely-tech-design.md).

## Documentation

End-user documentation (how to register, use the timer, manage projects/clients/tags, and export CSV/PDF) lives in [`/docs`](./docs) and is published as a GitHub Pages site.

- Live docs: <https://reubinoff.github.io/Clockinoff/>
- Source markdown: [`/docs`](./docs/index.md)

The `/docs` folder is a Jekyll site (using the `just-the-docs` remote theme) that GitHub Pages builds automatically. It is completely independent of the Next.js app and does not affect the Azure Web App CD workflow.

To enable Pages on a fork: in the GitHub repo, go to **Settings → Pages → Build and deployment** and select **Source: Deploy from a branch**, **Branch: `main`**, **Folder: `/docs`**.

## Stack

- **Next.js 14** (App Router) + React 18 + TypeScript
- **Postgres 16** + **Drizzle ORM** + drizzle-kit migrations
- **Auth**: email + password (argon2id) with **database sessions** and `httpOnly / Secure / SameSite=Lax` cookie
- **PDF**: `@react-pdf/renderer`
- **Testing**: Vitest (unit + API) + Playwright (smoke)
- **CI**: GitHub Actions with a Postgres service container and a **≥90% coverage gate** on `src/server` + `src/lib`

## Local development

Prerequisites: Node.js ≥ 24, Docker (or a local Postgres 16).

```bash
# 1. Start Postgres (creates timely + timely_test databases)
docker compose up -d

# 2. Install
npm install

# 3. Configure
cp .env.example .env
# edit .env if needed — defaults match docker-compose

# 4. Apply migrations
npm run db:migrate

# 5. Run the dev server
npm run dev
# → http://localhost:3000
```

Register at `/register`, then start a timer from the persistent bar at the top.

### Tests

```bash
# Unit + API tests (Docker Postgres must be up)
npm test

# With coverage gate (≥90% lines on src/server + src/lib)
npm run test:coverage

# Playwright smoke (register → timer → entries refresh → CSV/PDF export)
# Option A — point at an already-running dev server:
npm run dev
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e

# Option B — let Playwright build and start `next start` itself:
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

Push/PR CI (`.github/workflows/ci.yml`) is the required gate and runs the
Vitest suite with the ≥90% coverage bar. The Playwright suite runs nightly
(and on demand) via `.github/workflows/nightly.yml` — see that file for the
cron time and env; the workflow can also be triggered manually from the
Actions tab ("Run workflow" on the "Nightly regression" workflow).

### DB scripts

```bash
npm run db:generate   # regenerate Drizzle SQL from schema
npm run db:migrate    # apply pending migrations from ./drizzle
npm run db:studio     # open Drizzle Studio
```

## Key API surface (all JSON)

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/register` | `{ email, password, timezone? }` → 201 + session cookie |
| POST | `/api/auth/login` | `{ email, password }` → 200 |
| POST | `/api/auth/logout` | 204, clears cookie |
| GET / PATCH | `/api/auth/me` | current user; PATCH `{ timezone }` |
| CRUD | `/api/clients`, `/api/projects`, `/api/tags` | `?archived=true` shows archived |
| GET | `/api/timer` | running entry or `null` |
| POST | `/api/timer/start` | 201 running entry; 409 `TIMER_ALREADY_RUNNING` with `entry_id` |
| POST | `/api/timer/stop` | 200 closed entry; 404 when nothing running |
| PATCH | `/api/timer` | metadata only |
| DELETE | `/api/timer` | discards running entry |
| GET / POST | `/api/entries` | list + filters + cursor pagination |
| PATCH / DELETE | `/api/entries/:id` | closed entries only (running → use `/api/timer`) |
| GET | `/api/export/csv?from&to` | **from/to required**; empty → header row only, 200 |
| GET | `/api/export/pdf?from&to` | **from/to required**; empty → “No entries” page, 200 |

All errors follow `{ error: { code, message } }`; codes: `VALIDATION`, `UNAUTHORIZED`, `NOT_FOUND`, `TIMER_ALREADY_RUNNING`, `TIMER_NOT_RUNNING`, `CONFLICT`, `INTERNAL`.

## Data model highlights

- **One running timer per user** — enforced by `CREATE UNIQUE INDEX ... WHERE end_at IS NULL`. Second running-start attempts get 409 by DB constraint (see `tests/server/timer.test.ts` for the parallel race test).
- **Overlaps between closed entries are allowed by design.**
- **`start_at < end_at`** — enforced by CHECK constraint whenever `end_at IS NOT NULL`.
- **`amount` is derived**: `billable ? duration_hours * effective_rate : null`, where `effective_rate = entry.rate ?? project.default_rate`.
- All rows scoped by `user_id`; every service verifies ownership.

## Timezones

User TZ defaults to **Asia/Jerusalem**, overridable per user. Timestamps are stored as UTC (`timestamptz`); the export and UI render in the user's TZ. See `src/lib/tz.ts` and the boundary test in `tests/server/export.test.ts`.

## Authentication

The tech design calls for "Auth.js Credentials + database sessions". Auth.js Credentials only supports JWT sessions upstream; to honor the design's *database sessions* requirement without stubs we implement a self-contained credentials + DB-session layer in `src/server/auth/`:

- `POST /api/auth/register` and `/login` argon2id-hash passwords and create a row in `sessions` (`id`, `user_id`, `expires_at`).
- The session id is sent as an `httpOnly / SameSite=Lax` cookie named `timely_session` (`Secure` in production).
- `middleware.ts` gates `/app/*` and every `/api/*` except the auth routes; server helpers use `getSessionUser(cookie)` to load the current user.

No Google or OAuth provider is wired in — v1 is email + password only.

## Ops scripts

One-shot maintenance helpers live under [`scripts/`](./scripts/) and speak
directly to Postgres via `DATABASE_URL`.

- **Delete users by email** (e.g. leftover pentest accounts). Owned rows —
  sessions, clients, projects, tags, entries, entry↔tag rows — cascade
  automatically via the `ON DELETE CASCADE` on `user_id`.

  ```bash
  # Dry-run: show what would be deleted.
  DATABASE_URL=postgres://... npm run ops:delete-users -- \
    pentest-ariel-a@example.com pentest-ariel-b@example.com

  # Confirm and actually delete.
  DATABASE_URL=postgres://... npm run ops:delete-users -- --yes \
    pentest-ariel-a@example.com pentest-ariel-b@example.com
  ```

  Emails are matched case-insensitively. Never pass a password on the
  command line — this script only needs the email.

## CI

`.github/workflows/ci.yml` boots a Postgres 16 service container, runs `npm ci`, migrates both DBs, type-checks, lints, and runs `npm run test:coverage`. Coverage thresholds are enforced by Vitest (`vitest.config.ts`) on `src/server` + `src/lib`: ≥90% lines / statements / functions and ≥80% branches.

The build job compiles `next build` to catch runtime regressions.

## Deploy to Azure

Target: **single Azure Web App (Node 24)** + **Azure Database for PostgreSQL Flexible Server**.

1. Create a Flexible Server (Postgres 16). Note the connection string.
2. Create a Web App (Linux, Node 24). Deployment: GitHub Actions or Oryx builds. The app runs `next start`.
3. In **Configuration → Application settings**, set:

   | App Setting | Value |
   |---|---|
   | `DATABASE_URL` | `postgres://<user>:<pw>@<host>:5432/<db>?sslmode=require` |
   | `NEXTAUTH_SECRET` | 32+ byte random secret (used for cookie signing surface / crypto) |
   | `NEXTAUTH_URL` | Public URL of your Web App |
   | `NODE_ENV` | `production` |
   | `WEBSITE_NODE_DEFAULT_VERSION` | `~24` |
   | `APPLICATIONINSIGHTS_CONNECTION_STRING` | Key Vault reference to the App Insights resource's connection string (see "Application Insights" below). |

4. In your GH Actions deploy job (post-CI), run `npm run db:migrate` against the production DB before starting the app. There is nothing else — no Clockify, no Google, no calendar callbacks. Outbound only.

### Application Insights

Server-side telemetry (HTTP requests, exceptions, `pg` queries, and
`console.*` output) is exported to Azure Monitor / Application Insights via
[`@azure/monitor-opentelemetry`](https://learn.microsoft.com/azure/azure-monitor/app/opentelemetry-enable?tabs=nodejs).
The SDK is bootstrapped from `src/instrumentation.ts` (Next.js
[`instrumentation` hook](https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation))
and only loads on the Node.js runtime.

Enable it by setting a single App Setting on the Web App — no code change is
required per environment:

| App Setting | Value |
|---|---|
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Key Vault reference to the App Insights connection string, e.g. `@Microsoft.KeyVault(SecretUri=https://kv-clockinoff-prod.vault.azure.net/secrets/applicationinsights-connection-string/)` |

Production wiring (already provisioned by Nati):

- App Insights resource: `appi-clockinoff-prod` (workspace `log-clockinoff-prod`) in `rg-clockinoff-prod` / `israelcentral`.
- Web App `clockinoff-prod` reads `APPLICATIONINSIGHTS_CONNECTION_STRING` from Key Vault (`applicationinsights-connection-string`) via a Key Vault reference — no plaintext key is stored in App Settings.
- Linux Node 24 uses the OpenTelemetry SDK path; the classic IIS agent is **not** used.

When `APPLICATIONINSIGHTS_CONNECTION_STRING` is unset (local dev, CI, `next
build`), `src/instrumentation.ts` early-returns and the SDK is never imported.

**Redaction contract (Ariel).** The instrumentation strips sensitive material
before it leaves the process. This is enforced in two places
(`src/instrumentation.node.ts` and `src/lib/logger.ts`):

- Span attributes matching `authorization`, `cookie`, `set-cookie`, `password`,
  or `timely_session` are replaced with `[REDACTED]` before export.
- Log / span bodies with a `postgres://` or `postgresql://` URL are replaced
  with `[REDACTED_DATABASE_URL]` — the full `DATABASE_URL` is never emitted.
- `Bearer <token>` values and `timely_session=<value>` cookie substrings are
  redacted from log bodies.
- The scrub is also applied to `console.*` before Azure Monitor's
  [`instrumentation-console`](https://www.npmjs.com/package/@opentelemetry/instrumentation-console)
  bridge captures the call, so third-party logs are covered too.

Passwords, session cookies, and the full DATABASE_URL are never logged.

### Standalone bundle pitfalls (argon2 + PDF export)

The Azure deploy uses `output: "standalone"` and ships the traced
`.next/standalone` tree, not the full `node_modules`. Next.js traces reachable
`require()`s statically, so it misses assets that are loaded dynamically at
runtime. Two packages we depend on need explicit inclusion (see
`next.config.mjs → experimental.outputFileTracingIncludes` and the
belt-and-suspenders overlay in `.github/workflows/cd.yml`):

- **argon2** loads a prebuilt `.node` binary via `node-gyp-build`. Without the
  `prebuilds/` tree the app throws "No native build was found ..." at startup
  (fixed in #24).
- **@react-pdf/renderer → pdfkit** resolves the Standard 14 fonts through a
  subpath-imports template `require('#standard-fonts/<Name>')` and reads
  `pdfkit/js/data/sRGB_IEC61966_2_1.icc` at runtime. Without those files
  `GET /api/export/pdf` throws `MODULE_NOT_FOUND` for
  `pdfkit/js/standard-fonts/Helvetica.cjs` and returns HTTP 500 while CSV export
  keeps working.

The CD workflow has two pre-deploy verify steps that fail the pipeline before
`azure/webapps-deploy` runs if either of these regresses:

- "Verify argon2 native module is loadable in deploy bundle" — hashes and
  verifies a password against the deploy bundle.
- "Verify PDF export can render in deploy bundle" — renders a tiny PDF from
  `deploy/` and asserts the `%PDF` header.

To reproduce / verify locally:

```bash
npm ci
NEXT_TELEMETRY_DISABLED=1 \
  NEXTAUTH_SECRET=build-time-placeholder-build-time-placeholder \
  NEXTAUTH_URL=https://example.com \
  npm run build

# argon2 smoke test
( cd .next/standalone && node -e "const a=require('argon2'); \
  a.hash('smoke',{type:a.argon2id}).then(h=>a.verify(h,'smoke')) \
  .then(ok=>console.log('argon2',ok?'OK':'FAIL'))" )

# PDF render smoke test
( cd .next/standalone && node -e "
  const React=require('react');
  const {Document,Page,Text,renderToStream}=require('@react-pdf/renderer');
  const doc=React.createElement(Document,null,
    React.createElement(Page,{size:'A4'},React.createElement(Text,null,'hi')));
  renderToStream(doc).then(s=>{const c=[]; s.on('data',x=>c.push(x));
    s.on('end',()=>console.log('PDF',Buffer.concat(c).slice(0,4).toString()));})" )
```

Both smoke tests must print `argon2 OK` and `PDF %PDF`.

## Out of scope (v1)

Calendar, teams, Clockify sync, Google auth, dashboards beyond entry list + export.
