# Timely / Clockinoff — v1

A tiny, clean, solo time tracker. Manual entries + one running timer + projects/clients/tags + CSV/PDF export. No calendar. No teams. No Clockify sync. No Google auth.

Built to the [attached tech design](uploads/timely-tech-design.md).

## Stack

- **Next.js 14** (App Router) + React 18 + TypeScript
- **Postgres 16** + **Drizzle ORM** + drizzle-kit migrations
- **Auth**: email + password (argon2id) with **database sessions** and `httpOnly / Secure / SameSite=Lax` cookie
- **PDF**: `@react-pdf/renderer`
- **Testing**: Vitest (unit + API) + Playwright (smoke)
- **CI**: GitHub Actions with a Postgres service container and a **≥90% coverage gate** on `src/server` + `src/lib`

## Local development

Prerequisites: Node.js ≥ 20, Docker (or a local Postgres 16).

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

# Playwright smoke (register → timer → CSV export)
# In one terminal:
npm run dev
# In another:
npx playwright install --with-deps chromium
npm run test:e2e
```

The Playwright smoke test is not wired into CI by default (kept optional / non-blocking as the design allows) — Vitest suite is the required gate.

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

## CI

`.github/workflows/ci.yml` boots a Postgres 16 service container, runs `npm ci`, migrates both DBs, type-checks, lints, and runs `npm run test:coverage`. Coverage thresholds are enforced by Vitest (`vitest.config.ts`) on `src/server` + `src/lib`: ≥90% lines / statements / functions and ≥80% branches.

The build job compiles `next build` to catch runtime regressions.

## Deploy to Azure

Target: **single Azure Web App (Node 20)** + **Azure Database for PostgreSQL Flexible Server**.

1. Create a Flexible Server (Postgres 16). Note the connection string.
2. Create a Web App (Linux, Node 20). Deployment: GitHub Actions or Oryx builds. The app runs `next start`.
3. In **Configuration → Application settings**, set:

   | App Setting | Value |
   |---|---|
   | `DATABASE_URL` | `postgres://<user>:<pw>@<host>:5432/<db>?sslmode=require` |
   | `NEXTAUTH_SECRET` | 32+ byte random secret (used for cookie signing surface / crypto) |
   | `NEXTAUTH_URL` | Public URL of your Web App |
   | `NODE_ENV` | `production` |
   | `WEBSITE_NODE_DEFAULT_VERSION` | `~20` |

4. In your GH Actions deploy job (post-CI), run `npm run db:migrate` against the production DB before starting the app. There is nothing else — no Clockify, no Google, no calendar callbacks. Outbound only.

## Out of scope (v1)

Calendar, teams, Clockify sync, Google auth, dashboards beyond entry list + export.

## For AI coding agents

Cursor, GitHub Copilot, Claude Code, Codex, Aider, and friends should read
[`AGENTS.md`](AGENTS.md) before proposing changes. Tool-specific pointers
(`.cursor/rules/project.mdc`, `.github/copilot-instructions.md`) all defer
to that single file.
