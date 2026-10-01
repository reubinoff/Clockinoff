<p align="center">
  <a href="https://clockinoff.reubinoff.com">
    <img src="public/timely-wordmark.svg" alt="Clockinoff" height="72">
  </a>
</p>

<p align="center">
  <em>A tiny, honest time tracker for people who work alone.</em>
</p>

<p align="center">
  <a href="https://github.com/reubinoff/Clockinoff/actions/workflows/ci.yml?query=branch%3Amain">
    <img src="https://github.com/reubinoff/Clockinoff/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI">
  </a>
  <a href="https://github.com/reubinoff/Clockinoff/actions/workflows/nightly.yml">
    <img src="https://github.com/reubinoff/Clockinoff/actions/workflows/nightly.yml/badge.svg" alt="Nightly regression">
  </a>
  <a href="https://github.com/reubinoff/Clockinoff/actions/workflows/grype.yml">
    <img src="https://github.com/reubinoff/Clockinoff/actions/workflows/grype.yml/badge.svg" alt="Grype vulnerability scan">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT">
  </a>
  <img src="https://img.shields.io/badge/node-%E2%89%A524-brightgreen" alt="Node 24+">
  <img src="https://img.shields.io/badge/next-16-black" alt="Next 16">
  <img src="https://img.shields.io/badge/react-19-61dafb" alt="React 19">
  <img src="https://img.shields.io/badge/postgres-16-336791" alt="Postgres 16">
</p>

<p align="center">
  <strong>Live app</strong>: <a href="https://clockinoff.reubinoff.com">clockinoff.reubinoff.com</a>
  &nbsp;·&nbsp;
  <strong>User guide</strong>: <a href="https://clockinoff.reubinoff.com/docs">clockinoff.reubinoff.com/docs</a>
  &nbsp;·&nbsp;
  <strong>Source</strong>: <a href="https://github.com/reubinoff/Clockinoff">github.com/reubinoff/Clockinoff</a>
</p>

---

**Clockinoff** (internally named **Timely**) is a single-user time tracker
for freelancers and solo consultants. One running timer, projects / clients /
tags, CSV & PDF export over any date range — and nothing else. It is
deliberately not a team product.

If you have ever opened Clockify or Toggl and felt the UI was asking you to
run a company, Clockinoff is the opposite of that.

## Features

- **One running timer** per user, enforced in Postgres by a partial unique
  index. A second start returns HTTP `409 TIMER_ALREADY_RUNNING` with the
  running `entry_id` — never a silent duplicate.
- **Manual entries & bulk edit.** Log hours after the fact; multi-select
  rows to re-tag, re-project, mark billable / billed, or delete in a single
  server round-trip.
- **Projects, clients, tags.** Billable projects carry a default hourly
  rate; per-entry rate overrides are supported. `amount` is derived server-side,
  never typed in by the user.
- **CSV & PDF export** over any `from`/`to` range. Empty ranges still return
  `200` (CSV header row / "No entries" PDF page) so pipelines never see a
  surprise error.
- **Timezone-aware.** Timestamps are stored as UTC `timestamptz` and
  rendered in your TZ (`Asia/Jerusalem` by default, user-overridable).
  Day boundaries for filters and export are computed in your TZ, not the
  server's.
- **Quiet Pulse UI.** Locked light + dark palettes with an in-app
  Appearance picker (System · Light · Dark), motion tokens that respect
  `prefers-reduced-motion`, and skeleton states that read as *intentional
  wait*, not a frozen click.
- **In-app documentation** at `/docs` — the same markdown is served inside
  the running app so the "Docs" link always resolves regardless of GitHub
  Pages state.
- **Email + password or Continue with Google.** Register and sign in with
  an email + password (argon2id hashes, DB sessions, `httpOnly` cookie),
  or use the **Continue with Google** button on `/login` and `/register`
  when the deployer has configured the OAuth client. See
  [Authentication](#authentication) for the exact env wiring and
  attach-vs-create rules.
- **MIT licensed** and small enough to read end-to-end.

## Not in v1

By design — these are not "coming soon", they are "not what this product is":

- No teams, workspaces, or shared entries.
- No calendar view or dashboards beyond the entry list + exports.
- No Clockify / Toggl / third-party sync.
- No OAuth providers beyond the single **Continue with Google** button
  on `/login` and `/register` (optional, enabled only when the deployer
  sets `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — see
  [Authentication](#authentication)). Email + password with argon2id
  remains the primary path.

See the [FAQ](https://clockinoff.reubinoff.com/docs/faq) for the longer
version.

## Try it

The hosted instance is open for self-registration:

- **Live app** → <https://clockinoff.reubinoff.com>
- **Register** → <https://clockinoff.reubinoff.com/register>
- **User guide** → <https://clockinoff.reubinoff.com/docs>

There are no seed accounts — register with an email + password and you are
in. The session cookie is `httpOnly / SameSite=Lax` (`Secure` in prod);
password hashes are argon2id.

## Quick start (local dev)

Prerequisites: **Node.js ≥ 24** (CI uses Node 24) and **Docker** for the
Postgres service container.

```bash
# 1. Start Postgres 16 (creates `timely` + `timely_test` databases)
docker compose up -d

# 2. Install
npm install

# 3. Configure (defaults match docker-compose)
cp .env.example .env

# 4. Apply migrations
npm run db:migrate

# 5. Run the dev server
npm run dev
# → http://localhost:3000
```

Register at `/register`, then start a timer from the persistent bar at the
top of every authenticated page.

See [`AGENTS.md`](./AGENTS.md) for the full contributor contract (coding
conventions, invariants, commit style, CI gates). The repo also ships an
[`.env.example`](./.env.example) with every variable the app reads.

## Documentation

End-user documentation (register, use the timer, manage projects / clients /
tags, export CSV & PDF, change timezone) lives as plain Markdown under
[`/docs`](./docs) and is served two ways:

| Audience | Where | Rendered by |
|---|---|---|
| **Users** (primary) | <https://clockinoff.reubinoff.com/docs> | The Next.js app itself — `src/app/docs/*` + `src/lib/docs-content.ts` |
| Users (optional mirror) | GitHub Pages (`just-the-docs`), off by default | Jekyll from the `/docs` folder |
| Agents & contributors | [`AGENTS.md`](./AGENTS.md), [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Markdown in the repo |

Both renderings read the same source, so edits land everywhere at once.
Override the in-app Docs link with `NEXT_PUBLIC_DOCS_URL` if you want it to
point at a Pages mirror or an internal fork.

## Stack

- **Next.js 16** (App Router, webpack build) · **React 19** · **TypeScript** · **Tailwind CSS 3**
- **Postgres 16** · **Drizzle ORM** · `drizzle-kit` migrations under [`./drizzle`](./drizzle)
- **Auth**: email + password with **argon2id**, **database sessions**, and a
  `httpOnly / Secure / SameSite=Lax` cookie; optional **Continue with
  Google** (OAuth 2.0 / OIDC) when `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET` are configured. No other OAuth providers.
- **PDF**: [`@react-pdf/renderer`](https://react-pdf.org/) · **CSV**: hand-rolled streaming writer
- **Testing**: [Vitest](https://vitest.dev/) (unit + API) + [Playwright](https://playwright.dev/) (smoke)
- **Observability**: [`@azure/monitor-opentelemetry`](https://learn.microsoft.com/azure/azure-monitor/app/opentelemetry-enable?tabs=nodejs) with a strict redaction contract
- **CI**: GitHub Actions, Postgres 16 service container, **≥90 % coverage gate** on `src/server` + `src/lib`
- **Deploy**: single **Azure Web App** (Linux, Node 24) + **Azure Database for PostgreSQL Flexible Server**

## API surface (all JSON)

Route handlers live under `src/app/api/**` and delegate to owner-scoped
services in `src/server/services/*`. Every error is shaped as
`{ error: { code, message } }` with codes `VALIDATION`, `UNAUTHORIZED`,
`NOT_FOUND`, `TIMER_ALREADY_RUNNING`, `TIMER_NOT_RUNNING`, `CONFLICT`,
`INTERNAL`.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/auth/register` | `{ email, password, timezone? }` → 201 + session cookie |
| `POST` | `/api/auth/login` | `{ email, password }` → 200 |
| `POST` | `/api/auth/logout` | 204, clears cookie |
| `GET` / `PATCH` | `/api/auth/me` | current user; `PATCH { timezone }` |
| `GET` | `/api/auth/google/start` | begins the **Continue with Google** flow; 302 to Google (fail-closed to `/login?error=network` when Google env vars are blank) |
| `GET` | `/api/auth/google/callback` | OIDC callback; 302 to `/app` on success, `/login?error=...` on cancel / unverified / network |
| CRUD | `/api/clients`, `/api/projects`, `/api/tags` | `?archived=true` includes archived |
| `GET` | `/api/timer` | running entry or `null` |
| `POST` | `/api/timer/start` | 201 running entry; 409 `TIMER_ALREADY_RUNNING` with `entry_id` |
| `POST` | `/api/timer/stop` | 200 closed entry; 404 when nothing is running |
| `PATCH` | `/api/timer` | metadata only (project / client / tags / notes / rate) |
| `DELETE` | `/api/timer` | discards the running entry |
| `GET` / `POST` | `/api/entries` | list + filters + cursor pagination |
| `PATCH` / `DELETE` | `/api/entries/:id` | closed entries only (running → use `/api/timer`) |
| `GET` | `/api/export/csv?from&to` | **from/to required**; empty → header row only, 200 |
| `GET` | `/api/export/pdf?from&to` | **from/to required**; empty → "No entries" page, 200 |

## Data model highlights

- **One running timer per user** — `CREATE UNIQUE INDEX ... WHERE end_at IS NULL`. The second concurrent start loses on the DB constraint, not in app code (`tests/server/timer.test.ts` covers the parallel race).
- **`start_at < end_at`** — CHECK constraint whenever `end_at IS NOT NULL`.
- **Overlaps between *closed* entries are allowed by design** — e.g. for corrections after a forgotten stop.
- **`amount` is derived**: `billable ? duration_hours * effective_rate : null`, where `effective_rate = entry.rate ?? project.default_rate`. Clients never POST a monetary amount.
- **Every row is scoped by `user_id`.** Every service verifies ownership — a new service without an ownership check is treated as a bug.

## Authentication

Clockinoff has two sign-in paths that share one user table:

1. **Email + password** (primary). Passwords are stored as **argon2id**
   hashes; the plaintext is never persisted or logged. Sessions are rows
   in the `sessions` table, referenced by an
   `httpOnly / SameSite=Lax` cookie called `timely_session` (also
   `Secure` in production).
2. **Continue with Google** (optional, deployer-configured). A single
   secondary button on `/login` and `/register` runs a server-side
   OAuth 2.0 / OIDC flow against Google, verifies the `id_token`, and
   issues the same session cookie as the password path. Account rules:
   - **Verified email, no existing user** → create a passwordless user,
     attach the Google `sub`, sign in.
   - **Verified email, existing user without a Google `sub`** → attach
     the `sub` to that user. The existing password keeps working;
     nothing is replaced.
   - **Verified email, existing user with the same `sub`** → sign in.
   - **Verified email, existing user with a *different* `sub`** →
     fail closed (anomaly; never show "account exists").
   - **Email not verified at Google** → fail closed.

### Google env vars

Set in [`.env.example`](./.env.example) locally and in Azure Web App
Configuration (or your platform's equivalent) in production:

| Variable | Required | Notes |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Yes to enable the button | OAuth 2.0 client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Yes to enable the button | Matching client secret |
| `GOOGLE_REDIRECT_URI` | Optional | Overrides the default `<NEXTAUTH_URL>/api/auth/google/callback`. Production value is `https://clockinoff.reubinoff.com/api/auth/google/callback` |

Leave `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` blank and the
`/api/auth/google/start` route fail-closes to `/login?error=network` —
the button is still rendered on the auth screens but clicking it just
returns the user to `/login` with the generic error. Email + password
continues to work.

See the user-facing walkthrough in
[`docs/getting-started.md`](./docs/getting-started.md#or-continue-with-google).

## Timezones

User TZ defaults to **Asia/Jerusalem**, overridable per user from the
Account panel. Timestamps are stored as UTC (`timestamptz`); the export
and UI render in the user's TZ. All day-boundary math goes through
`src/lib/tz.ts` — never JS `Date` local time. See the boundary test in
`tests/server/export.test.ts`.

## Scripts

```bash
# Dev / build
npm run dev              # Next dev server
npm run build            # production build (next build --webpack)
npm start                # next start (used in prod)

# Quality gates
npm run typecheck        # tsc --noEmit
npm run lint             # eslint
npm test                 # vitest run (unit + API)
npm run test:coverage    # vitest with the ≥90% coverage gate
npm run test:e2e         # Playwright smoke (needs dev server or a build)

# Database
npm run db:generate      # regenerate Drizzle SQL from schema
npm run db:migrate       # apply pending migrations from ./drizzle
npm run db:studio        # open Drizzle Studio

# Ops
npm run ops:delete-users # purge users (and their cascaded rows) by email
```

Before pushing to `main`, at minimum:

```bash
npm run typecheck && npm run lint && npm run test:coverage
```

## CI & CD

- **[`ci.yml`](./.github/workflows/ci.yml)** — on every push and PR: a fast
  "Linters" job (ESLint + `tsc --noEmit`, no DB) runs in ~a minute, then a
  full `test` job boots a Postgres 16 service container, migrates both DBs,
  type-checks, lints, and runs `npm run test:coverage`. Coverage thresholds
  are enforced by Vitest (`vitest.config.ts`) on `src/server` + `src/lib`:
  ≥90 % lines / statements / functions and ≥80 % branches. A separate
  `build` job runs `next build` to catch runtime regressions.
- **[`nightly.yml`](./.github/workflows/nightly.yml)** — the full Playwright
  regression (register → timer → entries refresh → CSV/PDF export) runs on
  cron (02:15 UTC) and `workflow_dispatch`. It is additive to CI — nothing
  here deploys.
- **[`grype.yml`](./.github/workflows/grype.yml)** — Anchore Grype scan
  against the production dependency tree (`npm install --omit=dev`). Fails
  CI only on **Critical** or **High**; known accepted findings are
  baselined in [`.grype.yaml`](./.grype.yaml) with a short rationale.
- **[`cd.yml`](./.github/workflows/cd.yml)** — pushes to `main` build the
  Next.js standalone bundle, run two pre-deploy smoke tests (argon2 native
  load + a tiny PDF render), and deploy to the **`clockinoff-prod`** Azure
  Web App via OIDC.

## Deploy to Azure

Target: **single Azure Web App (Linux, Node 24)** + **Azure Database for
PostgreSQL Flexible Server**. The deploy workflow lives in
[`.github/workflows/cd.yml`](./.github/workflows/cd.yml) and is the source
of truth; the short version is:

1. Create a Postgres Flexible Server (version 16) and note the connection string.
2. Create a Web App (Linux, Node 24, `next start`). Wire up OIDC federation to the GitHub repo.
3. In **Configuration → Application settings**, set:

   | App Setting | Value |
   |---|---|
   | `DATABASE_URL` | `postgres://<user>:<pw>@<host>:5432/<db>?sslmode=require` |
   | `NEXTAUTH_SECRET` | 32+ byte random secret (cookie / crypto surface) |
   | `NEXTAUTH_URL` | Public URL of your Web App |
   | `NODE_ENV` | `production` |
   | `WEBSITE_NODE_DEFAULT_VERSION` | `~24` |
   | `APPLICATIONINSIGHTS_CONNECTION_STRING` | Key Vault reference to the App Insights connection string (optional — see below) |

4. The CD job runs `npm run db:migrate` against the target DB before
   starting the app. There is nothing else to wire — no Clockify, no
   calendar callbacks. Outbound only. If you want the **Continue with
   Google** button to work on your deploy, also set the three
   `GOOGLE_*` App Settings described in
   [Authentication](#authentication); leaving them blank disables the
   button path (`/api/auth/google/start` fail-closes to
   `/login?error=network`) and the rest of the app keeps working.

### Application Insights

Server-side telemetry (HTTP requests, exceptions, `pg` queries, `console.*`
output) is exported to Azure Monitor via
[`@azure/monitor-opentelemetry`](https://learn.microsoft.com/azure/azure-monitor/app/opentelemetry-enable?tabs=nodejs).
The SDK is bootstrapped from `src/instrumentation.ts` (Next.js
[`instrumentation` hook](https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation))
and only loads on the Node runtime. When
`APPLICATIONINSIGHTS_CONNECTION_STRING` is unset (local dev, CI,
`next build`), `src/instrumentation.ts` early-returns and the SDK is never
imported.

**Redaction contract** (enforced in `src/instrumentation.node.ts` and
`src/lib/logger.ts`):

- Span attributes matching `authorization`, `cookie`, `set-cookie`,
  `password`, or `timely_session` are replaced with `[REDACTED]` before
  export.
- Log / span bodies with a `postgres://` or `postgresql://` URL are
  replaced with `[REDACTED_DATABASE_URL]` — the full `DATABASE_URL` is
  never emitted.
- `Bearer <token>` values and `timely_session=<value>` cookie substrings
  are redacted from log bodies.
- The scrub is also applied to `console.*` before Azure Monitor's
  `instrumentation-console` bridge captures the call, so third-party logs
  are covered too.

Passwords, session cookies, and the full `DATABASE_URL` are never logged.

### Standalone bundle pitfalls (argon2 + PDF export)

The Azure deploy uses `output: "standalone"` and ships the traced
`.next/standalone` tree, not the full `node_modules`. Next.js traces
reachable `require()`s statically, so it misses assets that are loaded
dynamically at runtime. Two packages we depend on need explicit inclusion
(see `next.config.mjs → experimental.outputFileTracingIncludes` and the
belt-and-suspenders overlay in [`.github/workflows/cd.yml`](./.github/workflows/cd.yml)):

- **argon2** loads a prebuilt `.node` binary via `node-gyp-build`. Without
  the `prebuilds/` tree the app throws "No native build was found ..." at
  startup (fixed in #24).
- **@react-pdf/renderer → pdfkit** resolves the Standard 14 fonts through
  a subpath-imports template `require('#standard-fonts/<Name>')` and reads
  `pdfkit/js/data/sRGB_IEC61966_2_1.icc` at runtime. Without those files
  `GET /api/export/pdf` throws `MODULE_NOT_FOUND` for
  `pdfkit/js/standard-fonts/Helvetica.cjs` and returns HTTP 500 while CSV
  export keeps working.

The CD workflow has two pre-deploy verify steps that fail the pipeline
before `azure/webapps-deploy` runs if either of these regresses:

- *"Verify argon2 native module is loadable in deploy bundle"* — hashes
  and verifies a password against the deploy bundle.
- *"Verify PDF export can render in deploy bundle"* — renders a tiny PDF
  from `deploy/` and asserts the `%PDF` header.

Reproduce locally:

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

## Ops scripts

One-shot maintenance helpers live under [`scripts/`](./scripts/) and speak
directly to Postgres via `DATABASE_URL`.

**Delete users by email** (e.g. leftover pentest accounts). Owned rows —
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

## Project layout

```
src/
  app/                Next.js App Router (pages + /api route handlers)
    api/              Route handlers: auth, clients, projects, tags,
                      timer, entries, export
    app/              Authenticated app shell + panels
    docs/             In-app renderer for the /docs markdown
    login/ register/  Auth pages
  components/         Client components (TimerBar, EntryList, panels…)
  lib/                Framework-free helpers: errors, tz, money, csv, id, docs-content
  server/
    auth/             passwords (argon2id), session, service
    db/               drizzle client, schema, migrate runner
    services/         Business logic: clients / projects / tags / entries /
                      timer / export / pdf — all owner-scoped
  middleware.ts       Gates /app/* and /api/* (except auth routes)

docs/                 User-facing documentation (served in-app at /docs)
drizzle/              Generated SQL migrations (do not hand-edit; regenerate)
tests/
  lib/  server/       Vitest unit + API tests
  e2e/                Playwright smoke test
.github/workflows/    ci.yml · nightly.yml · grype.yml · cd.yml
```

## Contributing

Clockinoff is a solo product, but PRs that fix bugs, tighten tests, or
sharpen docs are welcome. Before you open one, please read
[`AGENTS.md`](./AGENTS.md) — it is the contract for both humans and AI
coding agents working on this repo. Highlights:

- Conventional commit messages; one logical change per commit.
- Zod for every request body / query param.
- All DB queries scoped by `user_id`.
- Coverage stays at ≥90 % on `src/server` + `src/lib`.
- Any change that alters user-visible behaviour updates the matching page
  under [`/docs`](./docs) in the same commit.

Bugs and feature requests → [GitHub Issues](https://github.com/reubinoff/Clockinoff/issues).
For issue templates and the "out of scope" list, see
[`AGENTS.md §5`](./AGENTS.md#5-opening-issues--bugs).

## License

[MIT](./LICENSE) © 2026 Moshe Reubinoff.
