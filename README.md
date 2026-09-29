<h1 align="center">Clockinoff</h1>

<p align="center">
  <em>A tiny, clean, solo time tracker — manual entries, one running timer, CSV/PDF export.</em>
</p>

<p align="center">
  <a href="https://github.com/reubinoff/Clockinoff/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/reubinoff/Clockinoff/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D20-brightgreen">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-14-black">
  <img alt="Postgres" src="https://img.shields.io/badge/Postgres-16-336791">
  <img alt="License" src="https://img.shields.io/badge/license-TBD-lightgrey">
</p>

---

## Features

- One running timer per user, enforced at the DB layer
- Manual entries with projects, clients, and tags
- Billable rates with per-entry override and derived amounts
- CSV and PDF export over a date range
- Email + password auth (argon2id) with server-side sessions
- Per-user timezone (default `Asia/Jerusalem`), UTC storage
- ≥90% coverage gate on `src/server` + `src/lib`

## Screenshots

> _Placeholder — drop UI screenshots or a short GIF here._

<!--
![Timer bar](docs/screenshots/timer-bar.png)
![Entries](docs/screenshots/entries.png)
-->

## Quick Start

Prerequisites: **Node.js ≥ 20** and **Docker** (or a local Postgres 16).

```bash
# 1. Start Postgres (creates timely + timely_test databases)
docker compose up -d

# 2. Install deps
npm install

# 3. Configure env (defaults match docker-compose)
cp .env.example .env

# 4. Apply migrations
npm run db:migrate

# 5. Run the dev server
npm run dev
# → http://localhost:3000
```

Register at [`/register`](http://localhost:3000/register), then start a timer from the persistent bar at the top.

## Tech Stack

- **Next.js 14** (App Router) · **React 18** · **TypeScript**
- **PostgreSQL 16** · **Drizzle ORM** + `drizzle-kit` migrations
- **Auth**: email + password (`argon2id`) with DB-backed sessions and `httpOnly / Secure / SameSite=Lax` cookies
- **PDF**: `@react-pdf/renderer`
- **Tests**: Vitest (unit + API) · Playwright (smoke)
- **CI**: GitHub Actions with a Postgres 16 service container

## Environment Variables

Copy `.env.example` to `.env`. All values below are required unless noted.

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | `postgres://timely:timely@localhost:5432/timely` |
| `DATABASE_URL_TEST` | Test DB (used by CI and `npm test`) | `postgres://timely:timely@localhost:5432/timely_test` |
| `NEXTAUTH_SECRET` | 32+ byte random secret for cookie/crypto surface | `change-me-please-32-bytes-min-secret-string` |
| `NEXTAUTH_URL` | Public base URL of the app | `http://localhost:3000` |
| `NODE_ENV` | Runtime mode | `development` / `production` |

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start Next.js in dev mode |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (unit + API) |
| `npm run test:coverage` | Vitest with ≥90% coverage gate |
| `npm run test:e2e` | Playwright smoke (register → timer → CSV) |
| `npm run db:generate` | Regenerate Drizzle SQL from schema |
| `npm run db:migrate` | Apply pending migrations from `./drizzle` |
| `npm run db:studio` | Open Drizzle Studio |

## API Surface

All JSON. Errors follow `{ error: { code, message } }` with codes:
`VALIDATION`, `UNAUTHORIZED`, `NOT_FOUND`, `TIMER_ALREADY_RUNNING`, `TIMER_NOT_RUNNING`, `CONFLICT`, `INTERNAL`.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/auth/register` | `{ email, password, timezone? }` → 201 + session cookie |
| `POST` | `/api/auth/login` / `/logout` | login / logout |
| `GET` / `PATCH` | `/api/auth/me` | current user; PATCH `{ timezone }` |
| CRUD | `/api/clients`, `/api/projects`, `/api/tags` | `?archived=true` includes archived |
| `GET` | `/api/timer` | running entry or `null` |
| `POST` | `/api/timer/start` \| `/stop` | 409 `TIMER_ALREADY_RUNNING` when a timer is live |
| `PATCH` / `DELETE` | `/api/timer` | edit metadata / discard running entry |
| `GET` / `POST` | `/api/entries` | filters + cursor pagination |
| `PATCH` / `DELETE` | `/api/entries/:id` | closed entries only |
| `GET` | `/api/export/csv?from&to` | `from`/`to` required |
| `GET` | `/api/export/pdf?from&to` | `from`/`to` required |

## Deployment

Target: **single Azure Web App** + **Azure Database for PostgreSQL Flexible Server**.

1. Create a Flexible Server (Postgres 16) and grab the connection string.
2. Create a Web App (Linux, Node 20). The app runs `next start`.
3. Set application settings:

   | Setting | Value |
   |---|---|
   | `DATABASE_URL` | `postgres://<user>:<pw>@<host>:5432/<db>?sslmode=require` |
   | `NEXTAUTH_SECRET` | 32+ byte random secret |
   | `NEXTAUTH_URL` | Public URL of your Web App |
   | `NODE_ENV` | `production` |
   | `WEBSITE_NODE_DEFAULT_VERSION` | `~20` |

4. In your deploy job (post-CI), run `npm run db:migrate` against the production DB before starting the app.

### Custom domain

Bind your domain to the Web App, add the TLS binding (Azure Managed Certificate works), and update `NEXTAUTH_URL` to match — cookies are `Secure` in production.

> **Node version:** the app requires Node **≥ 20**. CI currently pins Node 20 in `.github/workflows/ci.yml` and is planned to move to Node 22 — bump the workflow, the Web App runtime, and `WEBSITE_NODE_DEFAULT_VERSION` together.

## Data Model Highlights

- **One running timer per user** — enforced by `CREATE UNIQUE INDEX ... WHERE end_at IS NULL`. Parallel start attempts get 409 by DB constraint.
- Overlaps between **closed** entries are allowed by design.
- `start_at < end_at` — enforced by CHECK constraint whenever `end_at IS NOT NULL`.
- `amount` is derived: `billable ? duration_hours * effective_rate : null`, where `effective_rate = entry.rate ?? project.default_rate`.
- All rows are scoped by `user_id`; every service verifies ownership.

## Out of Scope (v1)

Calendar, teams, Clockify sync, Google auth, dashboards beyond entry list + export.

## Contributing

Contributions are welcome. To get started:

1. Fork and create a feature branch.
2. Run `npm install`, `docker compose up -d`, then `npm run db:migrate`.
3. Before opening a PR, make sure the following pass:
   ```bash
   npm run lint
   npm run typecheck
   npm run test:coverage
   ```
4. Keep changes small and focused; follow existing code style.

Bug reports and feature ideas: please open a [GitHub issue](https://github.com/reubinoff/Clockinoff/issues).

## License

License TBD — a `LICENSE` file will be added. Until then, all rights reserved by the repository owner.
