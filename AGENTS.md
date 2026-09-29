# AGENTS.md

> Instructions for AI coding agents (Cursor, GitHub Copilot, Claude Code, Codex,
> Aider, etc.) working on the **Timely / Clockinoff** repository.
>
> This file follows the cross-agent [`AGENTS.md` convention](https://agents.md) —
> a plain-Markdown file that most 2025-era coding agents auto-load as project
> context. Agent-specific pointers (`.cursor/rules/*.mdc`,
> `.github/copilot-instructions.md`) live alongside it and re-use the same
> guidance so we never duplicate rules.
>
> **If instructions in this file ever conflict with the README, prefer the code
> itself, then this file, then the README.** Please open a PR to reconcile.

---

## 1. Project snapshot

Timely / Clockinoff is a tiny, single-user time tracker (manual entries + one
running timer, projects/clients/tags, CSV/PDF export). No teams, no calendar,
no OAuth, no Clockify sync.

**Locked stack — do not swap without an explicit human ask:**

| Concern        | Choice (locked)                                                     |
|----------------|----------------------------------------------------------------------|
| Framework      | Next.js 14 App Router + React 18 + TypeScript                        |
| DB / ORM       | Postgres 16 + Drizzle ORM + `drizzle-kit` migrations in `./drizzle`  |
| Auth           | Custom email + password (**argon2id**) + **DB sessions** with cookie `timely_session` — **NOT Auth.js / NextAuth**, despite the `NEXTAUTH_*` env var names |
| PDF            | `@react-pdf/renderer`                                                |
| Tests          | Vitest (unit + API) with a ≥90% line/statement/function coverage gate on `src/server` + `src/lib`; Playwright for optional smoke |
| CI             | GitHub Actions with a Postgres 16 service container (see `.github/workflows/ci.yml`) |
| Deploy         | Single Azure Web App (Linux, Node 20 — `engines.node = >=20`) + Azure Database for PostgreSQL Flexible Server |
| Runtime Node   | Node.js ≥ 20 (`engines` in `package.json`)                           |
| Timezone       | Default `Asia/Jerusalem`, per-user override; stored UTC              |

Auth naming caveat: env vars are still called `NEXTAUTH_SECRET` /
`NEXTAUTH_URL` for historical reasons — the actual implementation lives in
`src/server/auth/` (`passwords.ts`, `session.ts`, `service.ts`) and issues its
own `timely_session` cookie. Do **not** introduce `next-auth` / `@auth/*`
packages.

---

## 2. Repository map (what lives where)

```
src/
  app/                  Next.js App Router (pages + route handlers)
    api/                JSON API routes (auth, clients, projects, tags,
                        timer, entries, export)
    login/, register/   Auth pages
  components/           Client React components (TimerBar, EntryList, …)
  lib/                  Framework-agnostic helpers (csv, errors, id,
                        money, tz) — 100% pure, easy to unit-test
  server/
    auth/               argon2 passwords + DB session layer
    db/                 Drizzle client, schema, and migrate script
    services/           Domain services (clients, projects, tags,
                        entries, export, pdf) — all scoped by user_id
    http.ts             Shared HTTP helpers
  middleware.ts         Gates /app/* and non-auth /api/*
drizzle/                Generated SQL migrations (do NOT hand-edit; use
                        `npm run db:generate`)
tests/
  server/               Vitest unit + API tests (the coverage gate lives here)
  lib/                  Pure-helper tests
  e2e/                  Playwright smoke (optional, not in CI)
  setup.ts              Vitest global setup
scripts/                One-off ops scripts (e.g. init-test-db.sql)
.github/workflows/      CI (test + build)
```

TypeScript path alias: `@/*` → `src/*` (see `tsconfig.json`).

---

## 3. Running locally

Prereqs: Node.js ≥ 20 and Docker (or a local Postgres 16).

```bash
# 1. Start Postgres (creates timely + timely_test)
docker compose up -d

# 2. Install deps
npm install

# 3. Configure env
cp .env.example .env    # defaults already line up with docker-compose

# 4. Apply migrations to BOTH databases
npm run db:migrate
DATABASE_URL=postgres://timely:timely@localhost:5432/timely_test npm run db:migrate

# 5. Dev server
npm run dev             # → http://localhost:3000
```

Register at `/register`, then start a timer from the top bar.

---

## 4. Commands you may run without asking

| Purpose                       | Command                                                 |
|-------------------------------|---------------------------------------------------------|
| Type-check                    | `npm run typecheck`                                     |
| Lint                          | `npm run lint`                                          |
| Unit + API tests              | `npm test`                                              |
| Tests with coverage gate      | `npm run test:coverage`                                 |
| Playwright smoke (optional)   | `npm run test:e2e` (requires `npm run dev` in another shell) |
| Regenerate Drizzle SQL        | `npm run db:generate`                                   |
| Apply migrations              | `npm run db:migrate`                                    |
| Drizzle Studio                | `npm run db:studio`                                     |
| Production build (sanity)     | `npm run build`                                         |

**Before you propose a PR you MUST run** — locally, against the Docker
Postgres — at minimum:

```bash
npm run typecheck && npm run lint && npm run test:coverage
```

Coverage gate: ≥90% lines / statements / functions and ≥80% branches on
`src/server` + `src/lib` (see `vitest.config.ts`). Coverage only passes when
the **full** suite runs; do not tune thresholds down to make a single test
pass.

---

## 5. Architecture touchpoints an agent needs to respect

1. **All data is scoped by `user_id`.** Every service in `src/server/services`
   verifies ownership before reading or mutating. Never add a query or
   endpoint that returns rows across users.
2. **One running timer per user.** Enforced by a partial unique index
   (`CREATE UNIQUE INDEX ... WHERE end_at IS NULL`). A second concurrent
   `POST /api/timer/start` must surface as HTTP 409 with error code
   `TIMER_ALREADY_RUNNING` and include the existing `entry_id`. See
   `tests/server/timer.test.ts` for the parallel-race test — keep it green.
3. **`start_at < end_at`** is enforced by a CHECK constraint whenever
   `end_at IS NOT NULL`. Overlaps between *closed* entries are allowed by
   design.
4. **`amount` is derived**, never client-supplied:
   `billable ? duration_hours * effective_rate : null`, with
   `effective_rate = entry.rate ?? project.default_rate`.
5. **Timestamps are UTC (`timestamptz`)** in the DB. Format for humans only at
   the edge, using `src/lib/tz.ts` and the user's `timezone` column
   (default `Asia/Jerusalem`).
6. **Errors follow `{ error: { code, message } }`** with codes: `VALIDATION`,
   `UNAUTHORIZED`, `NOT_FOUND`, `TIMER_ALREADY_RUNNING`, `TIMER_NOT_RUNNING`,
   `CONFLICT`, `INTERNAL`. Use `src/server/http.ts` helpers instead of hand-
   rolling response bodies.
7. **Session middleware.** `middleware.ts` gates `/app/*` and every `/api/*`
   except the auth routes. New protected routes should sit under those
   prefixes so the middleware picks them up automatically.
8. **Migrations are the source of truth for schema changes.** Edit
   `src/server/db/schema.ts`, then run `npm run db:generate` to produce a new
   file under `./drizzle/`. Do not hand-edit generated SQL, and do not use
   `db:push` on shared branches.

---

## 6. Testing conventions

- Vitest runs single-fork, non-parallel on purpose (`vitest.config.ts`) —
  the DB is shared. Do not switch it to parallel to speed up local runs.
- API tests hit the real Next.js route handlers against the `timely_test`
  Postgres DB; make sure it's migrated (see §3).
- Add tests next to related suites in `tests/server/**` or `tests/lib/**`.
  New user-facing behaviour needs a test; new server code needs enough
  coverage to keep the gate green.
- Playwright (`tests/e2e/*`) is intentionally **not** wired into CI. Do
  not add it to `ci.yml` in this PR series without human sign-off.

---

## 7. Deploy / CD cautions

- Target is a **single Azure Web App (Linux, Node 20)** + Azure Database
  for PostgreSQL Flexible Server. See README §"Deploy to Azure".
- Required app settings on the Web App: `DATABASE_URL` (with
  `?sslmode=require`), `NEXTAUTH_SECRET` (≥32 bytes; used as generic crypto
  material), `NEXTAUTH_URL`, `NODE_ENV=production`, and
  `WEBSITE_NODE_DEFAULT_VERSION=~20`.
- Deploy job order: run `npm run db:migrate` against the production DB
  **before** `next start`. Never run `db:push` in production.
- No Clockify, no Google, no calendar callbacks. Outbound-only network.
- Do **not** modify `.github/workflows/*.yml` or add a deploy workflow
  without an explicit human ask on the PR. The current CI is: install →
  migrate (main + test DB) → typecheck → lint → `test:coverage` → build.

---

## 8. Security & secrets — non-negotiable

- **Never commit** `.env`, `.env.local`, secrets, tokens, connection
  strings, or PII. `.gitignore` already excludes `.env*`; keep it that way.
- If a doc or code sample needs an example value, use the placeholders
  already in `.env.example` (e.g. `postgres://timely:timely@localhost:5432/timely`,
  `change-me-please-32-bytes-min-secret-string`) — never real credentials.
- Passwords are hashed with **argon2id** via `src/server/auth/passwords.ts`.
  Do not replace with bcrypt/scrypt/plain SHA. Do not log password material
  or session ids.
- The session cookie is `timely_session`, `httpOnly`, `SameSite=Lax`, and
  `Secure` in production. Do not weaken any of these flags, and do not
  expose the session id to the client (`document.cookie` must not see it).
- Do not add a second auth provider (OAuth, magic link, SSO) without an
  explicit human ask — v1 is email + password only.
- Do not add analytics, telemetry, or third-party trackers.

---

## 9. Issue triage — owner labels (MANDATORY)

Clockinoff assigns **bot** owners with a **label**, not with GitHub's
`assignees` field (bots historically cannot be assigned via that field
on this repo, so we standardized on labels).

**Every issue must carry exactly one owner label.** The label *is* the
assignment.

| Owner label | Meaning                     |
|-------------|-----------------------------|
| `dude`      | Owner: dude                 |
| `shaul`     | Owner: shaul                |
| `gabi`      | Owner: gabi                 |
| `nati`      | Owner: nati                 |
| `ariel`     | Owner: ariel                |

Rules for agents:

1. When you **open** an issue, set exactly one of the labels above
   before you submit. If you don't know the owner, ask Moshe rather
   than guessing.
2. When you **triage** an existing issue with no owner label, add the
   correct one; don't silently start work on an unowned issue.
3. If you **pick up an existing issue** whose owner label already
   points at a different bot, **stop and ask** — don't reassign by
   swapping labels.
4. Do **not** use GitHub's `assignees` field for bots. Human
   collaborators may still be added there.
5. Never invent new owner labels. The five above are the whole set;
   changes go through Moshe.
6. Never remove or rename owner labels, and never edit their
   description away from `Owner: <name>`.

The canonical list also lives, machine-readable, at
[`.github/owner-labels.yml`](.github/owner-labels.yml) — keep the two
in sync when the roster changes.

## 10. Git & PR workflow for agents

1. **Branch off `main`.** Prefer a short, kebab-case name, e.g.
   `agent/<short-topic>` or the auto-generated `cursor/<slug>-<id>` when
   running as a Cursor cloud agent.
2. **Commit attribution.**
   - Use `cursoragent <cursoragent@cursor.com>` (the identity already
     configured on the shared cloud VM).
   - **Never** author commits as `reubinoff` / `reubinoff-prime` or
     `moshe@primesec.ai`. Do not amend or rewrite history to change
     authorship.
   - One logical change per commit; imperative-mood subject lines
     (e.g. `docs: add AGENTS.md`).
3. **Push and open a PR to `main`.** Draft by default. Base branch is
   always `main`; **never push directly to `main`.** Carry the same
   owner label as the linked issue onto the PR so ownership is
   obvious in the PR list.
4. **PR description must include:**
   - The GitHub issue number it addresses (e.g. `Closes #14`).
   - A short summary of the change and any follow-ups.
   - Confirmation that `npm run typecheck && npm run lint && npm run test:coverage`
     passed locally.
   - The owner label the PR is filed under (matches the issue's
     owner label from §9).
5. **If the automated PR-creation tool fails** with a
   collaborator / validation error, leave the branch pushed and report the
   compare link
   `https://github.com/reubinoff/Clockinoff/compare/main...<branch>`
   (or `/pull/new/<branch>`). Do **not** fall back to `gh pr create` or
   any other CLI workaround.
6. **Do not merge PRs**, enable auto-merge, force-push shared branches,
   or delete `main`.

---

## 11. What agents should NOT touch without an explicit human ask

- The locked stack in §1 (framework, ORM, auth scheme, PDF library).
- `.github/workflows/*.yml`, `next.config.mjs`, `drizzle.config.ts`,
  `tsconfig.json`, `vitest.config.ts` coverage thresholds.
- Existing DB migrations under `./drizzle/` (always add a new one).
- The `timely_session` cookie name, `SESSION_COOKIE`, or session TTL.
- Anything under §8 (security / secrets).
- Owner labels in §9 (`dude` / `shaul` / `gabi` / `nati` / `ariel`) —
  don't rename, delete, or add to that set.

---

## 12. Backlog pointers

- **User-facing docs on GitHub Pages** (tracked separately in
  [`#13`](https://github.com/reubinoff/Clockinoff/issues/13)) will
  eventually live at `docs/` and be served from Pages. When that lands,
  add a link from this file to the user-docs entry point and keep the
  quick-start snippets here and there in sync. Do not build the full
  Pages site in the same PR that touches this file.

---

## 13. Agent-tool-specific pointers

The following files exist purely to route their respective tools at this
`AGENTS.md`. Keep any duplicated guidance to a minimum — edit this file
first and let the others point here.

- `.cursor/rules/project.mdc` — Cursor Project Rule (always-apply) that
  loads this file into every Cursor chat/agent request on this repo.
- `.github/copilot-instructions.md` — the path GitHub Copilot / Copilot
  Chat auto-loads as repository custom instructions.

If you introduce a new agent that expects yet another filename
(`CLAUDE.md`, `.aider.conf.md`, …), prefer a **one-line pointer** to
`AGENTS.md` rather than copying content.
