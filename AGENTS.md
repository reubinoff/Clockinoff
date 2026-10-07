# AGENTS.md — Agent operating manual for Clockinoff

> This file is the primary contract for any AI coding agent (Cursor, Claude Code,
> Codex, etc.) working on this repo. It follows the emerging [AGENTS.md](https://agents.md)
> convention: a single markdown file at the repo root that both agents and
> humans can read to learn the codebase, the workflows, and the house rules.
>
> **If a rule here conflicts with a random file elsewhere, this file wins
> unless the user says otherwise in the current session.**

---

## 1. What this repo is

**Clockinoff / Timely v1** — a tiny, solo time tracker. Manual entries + one
running timer + projects/clients/tags + CSV/PDF export. No calendar, no teams,
no Clockify sync. Auth is email + password with an optional
**Continue with Google** button on `/login` + `/register` (enabled per
deploy via `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`; see
[§12 Authentication](#12-authentication)). The public product overview
lives in [`README.md`](./README.md); contributor internals (API, auth
rules, CI/CD, Azure deploy, ops) live in [§11–15](#11-api-surface)
below. Read both before making non-trivial changes.

### Stack (short)

- **Next.js 16** App Router · React 19 · TypeScript · Tailwind
- **Postgres 16** · **Drizzle ORM** (`drizzle-kit` migrations under `./drizzle`)
- **Auth**: email + password (argon2id) + DB sessions + `httpOnly` cookie;
  optional **Continue with Google** (OAuth 2.0 / OIDC) when
  `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are set — same session
  cookie, no second user table
- **PDF/CSV export**: `@react-pdf/renderer` + hand-rolled CSV
- **Tests**: Vitest (unit + API) + Playwright (smoke)
- **CI**: GitHub Actions with a Postgres 16 service container and a **≥90%
  coverage gate** on `src/server` + `src/lib`
- **Deploy**: single Azure Web App (Node 24) + Azure Postgres Flexible Server

### Code layout

```
src/
  app/                Next.js App Router (pages + /api route handlers)
    api/              Route handlers: auth, clients, projects, tags,
                      timer, entries, export
    app/              Authenticated app shell + panels
    login/  register/ Auth pages
  components/         Client components (TimerBar, EntryList, panels…)
  lib/                Framework-free helpers: errors, tz, money, csv, id, docs-content
  server/
    auth/             passwords (argon2id), session, service
    db/               drizzle client, schema, migrate runner
    services/         Business logic: clients/projects/tags/entries/
                      timer/export/pdf — all owner-scoped
  middleware.ts       Gates /app/* and /api/* (except auth routes)

docs/                 User-facing documentation (served in-app at /docs)
drizzle/              Generated SQL migrations (do not hand-edit; regenerate)
tests/
  lib/    server/     Vitest unit + API tests
  e2e/                Playwright smoke test
.github/              dependabot.yml (weekly npm + Actions updates)
  workflows/          ci.yml · nightly.yml · grype.yml (SARIF) · cd.yml
                      · dependency-check.yml
```

### Invariants an agent must not silently break

- **User documentation is part of the surface area.** The markdown
  source lives in [`/docs`](./docs) and the **primary** rendering is
  the in-app `/docs` route (Next.js — `src/app/docs/*` +
  `src/lib/docs-content.ts`) served on the same origin as the app, so
  the Docs link in the app shell always resolves. The GitHub Pages
  mirror at <https://reubinoff.github.io/Clockinoff/> is an optional
  secondary rendering of the same files. The Docs link is wired from
  the authenticated app shell (top header on all sizes, plus the
  desktop footer) and from the login/register screens via
  `src/lib/docs.ts`. Any change that alters user-visible behaviour —
  new UI, new/renamed page, new filter, new export column, changed
  defaults, changed error text — **must update the matching page under
  `/docs` in the same commit** (which updates both the in-app route and
  the Pages mirror automatically, since they share the source). If you
  add a new doc page, also add it to `DOC_PAGES` in
  `src/lib/docs-content.ts`. If you cannot update the docs in the same
  commit, open a follow-up issue and link it from the commit body. See
  §10 for the mapping from code to doc page.
- **One running timer per user** — enforced by a partial unique index
  (`WHERE end_at IS NULL`). Second start returns HTTP 409
  `TIMER_ALREADY_RUNNING` with `entry_id`. Do not drop the index.
- **`start_at < end_at`** — CHECK constraint when `end_at IS NOT NULL`.
- **All queries scoped by `user_id`** — every service verifies ownership. A new
  service without an ownership check is a bug.
- **Errors** — always shape as `{ error: { code, message } }` using
  `src/lib/errors.ts` codes: `VALIDATION`, `UNAUTHORIZED`, `FORBIDDEN`,
  `NOT_FOUND`, `TIMER_ALREADY_RUNNING`, `TIMER_NOT_RUNNING`, `CONFLICT`,
  `INTERNAL`. `FORBIDDEN` is the non-admin response from `/api/admin/*`.
- **Timezone** — timestamps stored as UTC `timestamptz`; render in the user's
  TZ (default `Asia/Jerusalem`) via `src/lib/tz.ts`. Do not compute day
  boundaries in JS `Date` local time.
- **Export**: `from` + `to` query params are **required**. Empty range must
  still return 200 (CSV header row / “No entries” PDF page).
- **Overlaps between *closed* entries are allowed by design** — e.g. for
  corrections after a forgotten stop. The one-timer rule applies only
  while `end_at IS NULL`.
- **`amount` is derived**: `billable ? duration_hours * effective_rate : null`,
  where `effective_rate = entry.rate ?? project.default_rate`. Clients
  never POST a monetary amount. The second concurrent timer start loses
  on the DB unique index, not in app code (`tests/server/timer.test.ts`
  covers the parallel race).

---

## 2. Environment setup

Prerequisites: Node.js ≥ 24 (CI uses Node 24), Docker for Postgres.

```bash
docker compose up -d        # starts Postgres 16 with timely + timely_test DBs
npm install
cp .env.example .env        # defaults match docker-compose; do NOT commit .env
npm run db:migrate          # apply drizzle migrations
npm run dev                 # http://localhost:3000
```

Register at `/register` then use the timer bar. There are no seed accounts.

### Environment variables

See [`.env.example`](./.env.example). **Never invent, guess, or commit secret
values.** If a task needs a new secret, add it to `.env.example` with a
placeholder and document it in AGENTS.md (and `.env.example`). Actual secret values are
set by the repo owner in Azure Web App Configuration and GitHub Actions
secrets — an agent should not touch those.

`OAUTH_STATE_SECRET` is the HMAC key for the Google OAuth state cookie.
Required in production (boot and `/api/health` fail closed if unset or
shorter than 32 bytes). Never reuse `NEXTAUTH_SECRET` for it.

---

## 3. Commands an agent should know

| Purpose | Command |
|---|---|
| Dev server | `npm run dev` |
| Type-check | `npm run typecheck` |
| Lint | `npm run lint` |
| Unit + API tests | `npm test` |
| Tests with coverage gate (≥90%) | `npm run test:coverage` |
| Playwright smoke | `npm run test:e2e` (needs `npm run dev` in another shell) |
| Generate migration from schema | `npm run db:generate` |
| Apply migrations | `npm run db:migrate` |
| Drizzle Studio | `npm run db:studio` |
| Production build | `npm run build` |
| Production start | `npm start` (`next start`) |
| Purge users by email | `npm run ops:delete-users` (see [§15](#15-ops-scripts)) |
| Promote admins by email | `npm run ops:promote-admins` (see [§15](#15-ops-scripts)) |

**Before pushing anything to `main`**, run at minimum:

```bash
npm run typecheck && npm run lint && npm run test:coverage
```

If you cannot run the full suite in the sandbox (missing Docker/Postgres,
etc.), say so explicitly in the PR description or commit body — do **not**
silently skip and claim green.

---

## 4. Coding conventions

- **TypeScript strict**. No `any` unless justified in a comment.
- **Route handlers** live under `src/app/api/**` and delegate to
  `src/server/services/*`. Route handlers do parsing (zod) + auth
  (`getSessionUser`) + response shaping. Services do the actual work.
- **Zod** for every request body / query param the API accepts.
- **Errors**: throw `AppError` (or the code helpers) from services; let route
  handlers convert with the shared helper in `src/lib/errors.ts` /
  `src/server/http.ts`.
- **DB access** only through `src/server/db/client.ts`. New tables → edit
  `src/server/db/schema.ts`, then `npm run db:generate` to produce a new SQL
  file under `./drizzle`. Never hand-edit an existing committed migration.
- **Money / duration math** goes through `src/lib/money.ts`. Do not sprinkle
  `toFixed(2)` in components.
- **Time zone math** goes through `src/lib/tz.ts`.
- **Coverage floor**: `src/server` + `src/lib` must stay ≥90% lines /
  statements / functions and ≥80% branches (enforced in `vitest.config.ts`).
  A new file in those trees needs tests in the same PR.
- **Tailwind** for styling; no CSS-in-JS.
- **Comments**: explain *why*, not *what*. Do not narrate the diff in code
  comments.
- **Directory guides**: [`src/AGENTS.md`](./src/AGENTS.md) (where code goes)
  and [`tests/AGENTS.md`](./tests/AGENTS.md) (how tests are named and run).
  This file still wins if they disagree.

---

## 5. Opening issues / bugs

Bugs and feature requests go to
[GitHub Issues](https://github.com/reubinoff/Clockinoff/issues).

Use this shape for a bug report:

```
Title: <area>: <one-line symptom>          e.g. timer: 409 on first start after logout

Environment
  - Where: local dev / Azure preview / Azure prod
  - Node version, browser (if UI)
  - Commit SHA if known

Steps to reproduce
  1. …
  2. …
  3. …

Expected
  <what should happen>

Actual
  <what happens, with error code / stack / screenshot>

Notes
  - Related PR / commit / issue links
  - Logs snippet (redact any real secret)
```

For a feature request, replace *Steps/Expected/Actual* with **Problem**,
**Proposed change**, and **Out of scope** (what you are explicitly *not*
asking for — helps keep v1 honest).

Suggested labels (already present in the repo where applicable):
`bug`, `enhancement`, `documentation`, `chore`, `security`, `good-first-issue`.

**Agents opening issues on behalf of the user** should say so in the issue
body (e.g. “Filed by Cursor agent on behalf of @reubinoff”) so humans can
disambiguate.

---

## 6. Commits

### Style

- **[Conventional Commits](https://www.conventionalcommits.org)**. The history
  already uses them: `feat(services): …`, `fix(cd): …`, `chore(deps): …`,
  `docs: …`, `test: …`, `ci: …`.
- One logical change per commit. Do not batch unrelated changes.
- Subject line ≤ 72 chars, imperative mood (“add”, not “added”).
- Body wraps at ~72 chars; use it when the *why* isn’t obvious from the diff.
- Reference issues with `Fixes #14` / `Refs #14` in the body so GitHub can
  close them on merge to `main`.

### Attribution — **prefer `cursoragent`**

When an AI agent authors a commit, it **must** be attributed to the
Cursor agent identity, not to a human collaborator:

```
Author: Cursor Agent <cursoragent@cursor.com>
```

The repo’s git config on cloud agents is already set this way; do not
override it. Do **not** add `Co-authored-by:` trailers for real humans unless
they actually co-authored the change.

Never force-push or amend commits already pushed to `main` unless the user
explicitly asks. Never rewrite history on shared branches.

---

## 7. PR / push norms

### Moshe’s standing order

> **Push straight to `main` when the change is approved. Do not open a PR
> unless you are blocked.**

“Blocked” means one of:

- CI is red and you can’t fix it before pushing.
- The change touches deploy config, secrets surface, DB schema in a
  destructive way, or otherwise needs a human eyeball.
- The user is unreachable and the change is risky (large refactor, new
  dependency, breaking API change).
- Branch protection on `main` rejects the push.

If any of those are true, open a **draft PR** with the diff + a short
“why this needs review” note and stop.

### The happy path (approved change, not blocked)

```bash
git checkout main
git pull --ff-only origin main

# … make edits …

npm run typecheck && npm run lint && npm run test:coverage

git add -A
git commit -m "feat(area): concise summary" -m "Fixes #<n> if applicable."
git push origin main
```

Then, if the commit closed an issue via `Fixes #n`, verify on GitHub that the
issue actually closed; if not, close it manually with a link to the commit.

### When a PR *is* the right call

Use `cursor/<descriptive-kebab>` branch names (matches the existing history —
`cursor/add-azure-cd-workflow-f9d1`, `cursor/ci-cd-warnings-cleanup-1427`).
PRs are **draft by default**; mark ready when CI is green and self-review
is done.

---

## 8. What agents must not do

- Do **not** invent secrets, API keys, database URLs, or OAuth client IDs.
  Use placeholders in `.env.example` and stop.
- Do **not** add new unsolicited third-party integrations (no Clockify
  sync, no analytics SDKs, no additional OAuth providers, no telemetry
  SDKs). The existing **Continue with Google** OAuth path on `/login`
  and `/register` is in-scope and may be maintained; do not remove it
  or re-introduce auto-attach of Google onto an account that already
  has `password_hash` (see [§12](#12-authentication) / #122).
- Do **not** relax the coverage gate, the timer unique index, the
  `start_at < end_at` check, or ownership scoping to make a test pass.
- Do **not** rewrite committed migrations. Add a new one.
- Do **not** `git push --force` or `git commit --amend` shared history.
- Do **not** merge PRs, enable auto-merge, or change branch protection rules.
- Do **not** answer secrets or tokens back into chat, PR descriptions, or
  commit messages, even if you can see them in the environment.

---

## 9. Ambient context for Cursor

Cursor loads this file automatically as agent context. Additional
project-wide rules can live under `.cursor/rules/*.mdc`; if you add any,
keep them **short, factual, and non-overlapping** with this file — this
document remains the source of truth. Tree-local guides live at
[`src/AGENTS.md`](./src/AGENTS.md) and [`tests/AGENTS.md`](./tests/AGENTS.md).

For higher-level onboarding aimed at humans, see
[`CONTRIBUTING.md`](./CONTRIBUTING.md), which is a thin pointer to this file.

---

## 10. User docs — keep them in sync

Clockinoff ships an end-user documentation site built from Markdown under
[`/docs`](./docs). The default production target is the **in-app `/docs`
route** rendered by `src/app/docs/*` + `src/lib/docs-content.ts` on the
same public origin as the app (e.g. `https://clockinoff.reubinoff.com/docs`),
so the Docs link never 404s regardless of whether an external mirror is
enabled. The same `/docs` folder also happens to be a valid Jekyll /
`just-the-docs` site (optional GitHub Pages mirror at
<https://reubinoff.github.io/Clockinoff/>). The web app links to the
docs from the app-shell header (visible on both mobile and desktop) and
the desktop footer, plus the login/register screens, via `src/lib/docs.ts`
(`DOCS_URL`, override with `NEXT_PUBLIC_DOCS_URL`).

**Whenever you change user-visible behaviour, update the matching doc
page in the same commit.** Use this mapping:

| Change | Update this page |
|---|---|
| Registration form, timezone default, auth cookie behaviour | [`docs/getting-started.md`](./docs/getting-started.md) |
| Timer bar (start / stop / discard, editing running entry, one-timer rule) | [`docs/timer.md`](./docs/timer.md) |
| Entries list (columns, filters, delete flow) | [`docs/entries.md`](./docs/entries.md) |
| Projects UI (default rate/billable, archive/delete) | [`docs/projects.md`](./docs/projects.md) |
| Clients UI (archive/delete) | [`docs/clients.md`](./docs/clients.md) |
| Tags UI | [`docs/tags.md`](./docs/tags.md) |
| Reports page (range picker, bar chart, project list, donut, export link) | [`docs/reports.md`](./docs/reports.md) |
| Export page or CSV/PDF format, empty-range behaviour | [`docs/export.md`](./docs/export.md) |
| Account / timezone / sign-out flow | [`docs/account.md`](./docs/account.md) |
| One-timer rule, overlaps, currency, "not in v1" list | [`docs/faq.md`](./docs/faq.md) |
| Product intro, principles, top-level "what Clockinoff is" | [`docs/index.md`](./docs/index.md) |

Rules of the road for `/docs`:

- The docs describe **actual v1 UI behaviour**, not roadmap items. If a
 feature only exists in the API, say so explicitly (see the tags and
 entries pages for the current tone).
- Do not add build steps to `/docs`. The in-app renderer is deliberately
 small (markdown + a tiny Jekyll-syntax preprocessor; see
 `src/lib/docs-content.ts`) and GitHub Pages builds the same tree for
 free when enabled — keep both paths dependency-free so the Azure App
 Service CD workflow is not affected.
- If you add a new doc page, add it to `DOC_PAGES` in
 `src/lib/docs-content.ts` so the in-app sidebar and the static
 `generateStaticParams` list see it, and update the mapping table above.
- Do not link back into the running app from `/docs` with absolute
 URLs; use relative paths (`/register`, `/app`, …) so the docs work
 against any instance.
- If you rename or delete a doc page, update the internal cross-links,
 the `DOC_PAGES` list, and the mapping table above.

If a change is genuinely docs-only (typo, wording, screenshot), a
docs-only commit straight to `main` is fine — CD will re-run but is a
no-op because no application code changed.

---

## 11. API surface

Route handlers live under `src/app/api/**` and delegate to owner-scoped
services in `src/server/services/*`. Every error is shaped as
`{ error: { code, message } }` with codes `VALIDATION`, `UNAUTHORIZED`,
`FORBIDDEN`, `NOT_FOUND`, `TIMER_ALREADY_RUNNING`, `TIMER_NOT_RUNNING`,
`CONFLICT`, `INTERNAL`.

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
| `GET` | `/api/admin/users` | admin only; `?q` email search, `?page` (~25) |
| `GET` / `DELETE` | `/api/admin/users/:id` | detail + hard-delete; no self-delete, no last admin |
| `POST` | `/api/admin/users/bulk` | `{ action, ids }` for the current page (max 25); each id uses the single-user mutator (`remove` → `removeAdminUser`); ineligible ids are skipped |
| `POST` | `/api/admin/users/:id/block` | deny login, delete sessions; no self-block |
| `POST` | `/api/admin/users/:id/unblock` | clear block |
| `POST` | `/api/admin/users/:id/promote` | role → admin |
| `POST` | `/api/admin/users/:id/demote` | no self-demote, no last admin |
| `GET` | `/api/admin/stats?from&to` | instance KPIs + signup / active / hours series; omits `is_test` users |

User-facing walkthroughs live under [`/docs`](./docs). Do not dump this
table into the public README.

---

## 12. Authentication

Users carry `role` (`user` | `admin`, default `user`), an optional
`blocked_at`, and `is_test` (boolean, default false). Admins reach
`/admin` and `/api/admin/*`. Everyone else is redirected from `/admin`
to `/app`; the API returns `403 FORBIDDEN`.

`is_test` is set on create when the lowercased email matches the #193
QA seed allowlist
`^(gabi|dana|ariel)\.qa\.[a-z0-9.+_-]+@primesec\.ai$`
(`src/lib/qa-allowlist.ts`). `drizzle/0006_users_is_test.sql` backfills
existing matches. Admin Overview (`GET /api/admin/stats`: user, active,
admin, hours, entries, billable, and the signup / active / hours series)
omits those rows. Admin Users still lists them. Owner-scoped Reports and
CSV/PDF stay the signed-in user's own entries.

A blocked user cannot sign in (same `401` body as a bad password) and
any live session is ignored. Blocking also deletes that user's session
rows. Bootstrap the first admin with `ADMIN_EMAILS` and/or
`npm run ops:promote-admins` — see [§15](#15-ops-scripts).

Clockinoff has two sign-in paths that share one user table:

1. **Email + password** (primary). Passwords are stored as **argon2id**
   hashes; the plaintext is never persisted or logged. Sessions are rows
   in the `sessions` table. The `timely_session` cookie carries a
   high-entropy token; the row primary key is `sha256(token)` so a
   database or backup leak is not enough to impersonate a user. Cookie
   flags: `httpOnly` / `SameSite=Lax` (also `Secure` in production).
   Expired rows are purged hourly from the Node instrumentation hook.
   Each user is capped at 20 concurrent sessions; the oldest is evicted
   on the 21st sign-in.
2. **Continue with Google** (optional, deployer-configured). A single
   secondary button on `/login` and `/register` runs a server-side
   OAuth 2.0 / OIDC flow against Google, verifies the `id_token`, and
   issues the same session cookie as the password path. Account rules
   (Shaul / #122):
   - **Verified email, no existing user** → create a Google-only user
     (no `password_hash`), attach the Google `sub`, sign in.
   - **Verified email, existing user already linked to this `sub`** →
     sign in.
   - **Verified email, existing Google-only user** (no
     `password_hash`) → keep today's linking: attach the `sub` if
     missing; a *different* `sub` fails closed.
   - **Verified email, existing user with `password_hash` and no
     matching `sub`** → Google **never** auto-attaches. Refuse and
     tell the user to sign in with their password, then link Google
     from Settings.
   - **Email not verified at Google** → fail closed.

Do not document or re-introduce auto-attach onto a password account.
That path is a pre-hijack (#122) and is not current behaviour. The
Settings "link Google" flow is the only way to attach Google to an
account that already has `password_hash`. In-app `/docs` follow when
#122 ships — do not copy the old attach-to-password wording forward.

### Google env vars

Set in [`.env.example`](./.env.example) locally and in the Web App
configuration (or your platform's equivalent) in production:

| Variable | Required | Notes |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Yes to enable the button | OAuth 2.0 client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Yes to enable the button | Matching client secret |
| `GOOGLE_REDIRECT_URI` | Optional | Overrides the default `<NEXTAUTH_URL>/api/auth/google/callback`. Production value is `<prod-callback>` |

Leave `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` blank and the
`/api/auth/google/start` route fail-closes to `/login?error=network` —
the button is still rendered on the auth screens but clicking it just
returns the user to `/login` with the generic error. Email + password
continues to work.

User TZ defaults to **Asia/Jerusalem**, overridable per user from the
Account panel. Timestamps are stored as UTC (`timestamptz`); the export
and UI render in the user's TZ. All day-boundary math goes through
`src/lib/tz.ts` — never JS `Date` local time. See the boundary test in
`tests/server/export.test.ts`.

---

## 13. CI & CD

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
- **[`eslint.yml`](./.github/workflows/eslint.yml)** — publishes the
  repo ESLint (lockfile + `eslint.config.mjs`) as SARIF to Security →
  Code scanning. `npm ci` runs the TypeScript 6 link so
  typescript-eslint can lint while root `tsc` stays on TypeScript 7.
  Paths are rewritten to repo-relative URIs before upload. Lint
  failures still fail the `ci.yml` lint job; this workflow does not
  gate deploy.
- **[`grype.yml`](./.github/workflows/grype.yml)** — Anchore Grype scan
  against the production dependency tree (`npm ci --omit=dev`). Fails
  CI only on **Critical** or **High**; known accepted findings are
  baselined in [`.grype.yaml`](./.grype.yaml) with a short rationale.
  SARIF is uploaded to GitHub **Security → Code scanning**. Decoupled
  from `cd.yml` so Azure deploy is not gated on it.
- **[`dependabot.yml`](./.github/dependabot.yml)** — weekly Dependabot
  version updates for **npm** and **GitHub Actions** (Monday 06:00
  Asia/Jerusalem). Minor/patch npm updates are grouped into one PR;
  GitHub Actions updates are grouped the same way. Major npm bumps stay
  as individual PRs. Conventional-commit prefix is `chore(deps)`.
- **[`dependency-check.yml`](./.github/workflows/dependency-check.yml)** —
  when `package.json`, `package-lock.json`, or workflow YAML change:
  pull requests run GitHub's `dependency-review-action` (fail on High+),
  and pushes to `main` run production-only
  `npm audit --audit-level=high`. This is the "manifest changed on main"
  check; Dependabot covers the weekly scan.
- **[`cd.yml`](./.github/workflows/cd.yml)** — pushes to `main` build the
  Next.js standalone bundle, run two pre-deploy smoke tests (argon2 native
  load + a tiny PDF render), and deploy to the production Azure Web App
  (`<webapp>`) via OIDC. After deploy the job polls
  `https://clockinoff.reubinoff.com/api/health` (azurewebsites.net
  fallback) for about four minutes and fails unless the body is
  `{ ok: true }` (#187).

---

## 14. Deploy to Azure

Target: **single Azure Web App (Linux, Node 24)** + **Azure Database for
PostgreSQL Flexible Server**. The deploy workflow lives in
[`.github/workflows/cd.yml`](./.github/workflows/cd.yml) and is the source
of truth; the short version is:

1. Create a Postgres Flexible Server (version 16) and note the connection string.
2. Create a Web App (Linux, Node 24, `next start`). Wire up OIDC federation to the GitHub repo.
3. In **Configuration → Application settings**, set:

   | App Setting | Value |
   |---|---|
   | `DATABASE_URL` | `postgres://<user>:<pw>@<host>:5432/<db>?sslmode=verify-full` |
   | `NEXTAUTH_SECRET` | 32+ byte random secret (cookie / crypto surface) |
   | `NEXTAUTH_URL` | Public URL of your Web App |
   | `NODE_ENV` | `production` |
   | `WEBSITE_NODE_DEFAULT_VERSION` | `~24` |
   | `PG_MIGRATOR_CLIENT_ID` | ClientId of the migrator UAMI (`<migrator-uami>`) assigned to the Web App (required when `PG_AZURE_AD_AUTH=1`; see [Entra / Managed Identity for Postgres](#entra--managed-identity-for-postgres-optional)) |
   | `PG_MIGRATOR_PG_USER` | Required in production when `PG_AZURE_AD_AUTH` is on. Postgres role the migrate step connects as. Non-production may omit it |
   | `APPLICATIONINSIGHTS_CONNECTION_STRING` | Key Vault reference to the App Insights connection string (optional — see below) |

4. The CD job runs `npm run db:migrate` against the target DB before
   starting the app. There is nothing else to wire — no Clockify, no
   calendar callbacks. Outbound only. If you want the **Continue with
   Google** button to work on your deploy, also set the three
   `GOOGLE_*` App Settings described in
   [§12 Authentication](#12-authentication); leaving them blank disables
   the button path (`/api/auth/google/start` fail-closes to
   `/login?error=network`) and the rest of the app keeps working.

### Entra / Managed Identity for Postgres (optional)

The pool and the migrate script accept a passwordless `DATABASE_URL`
backed by Microsoft Entra. When the URL has no password component —
e.g. `postgresql://<runtime-role>@<pg-host>:5432/<db>?sslmode=verify-full` —
the app mints a short-lived access token for the Azure Postgres Entra
scope and feeds it to `pg` as the password. Tokens are cached
in-process until shortly before expiry and refreshed on new pool
connections.

**Two identities, by design** (Clockinoff #75):

- **Runtime pool** (`src/server/db/client.ts`) — authenticates via
  `DefaultAzureCredential` (on App Service, the system-assigned
  managed identity / `<runtime-role>`, DML-only). All request-handling
  queries go through this identity.
- **Startup migrator** (`scripts/migrate.mjs`, run before `node
  server.js`) — authenticates via `ManagedIdentityCredential` pinned
  to a user-assigned managed identity (`<migrator-uami>`). That UAMI
  holds DDL on schema `public`. Its clientId is read from
  `PG_MIGRATOR_CLIENT_ID` (**required** when `PG_AZURE_AD_AUTH` is on
  — the script fails fast if it is missing). The migrate step also
  overrides the Postgres `user` to the role in `PG_MIGRATOR_PG_USER`.
  That variable is **required in production** when AAD auth is on
  (Nati confirmed the App Setting is set). Non-production may omit it
  and fall back to `DEFAULT_MIGRATOR_PG_USER` in `scripts/migrate.mjs`.
  The passwordless URL's `<runtime-role>` is only correct for the
  runtime pool. The Entra principal in the token must match the
  Postgres role — do not send the migrator token as the runtime user.

**Shared Postgres with guide-me (#187).** Clockinoff and guide-me may
share one Azure Postgres server. The Clockinoff migrator role
(`PG_MIGRATOR_PG_USER`) must own Clockinoff's tables (`users`,
`sessions`, `clients`, `projects`, `tags`, `time_entries`,
`time_entry_tags`, and `__migrations`). guide-me's role (guideme) must
not own them. In AAD / migrator mode, `scripts/migrate.mjs` checks that
the connected role can alter those tables before it applies pending SQL
  and exits 1 if it cannot (the error names the connected role and the
  current owner). The script does not run `ALTER ... OWNER TO`. Transfer
ownership in Azure / Postgres out of band, then redeploy. CD fails the
job if `/api/health` does not return `{ ok: true }` after deploy, so a
startup migrate failure is not reported as success.

**TLS (`sslmode`, #139).** Production `DATABASE_URL` must use
`sslmode=verify-full`. Boot (`src/instrumentation.ts`) and
`scripts/migrate.mjs` refuse to start in production when `sslmode` is
`disable`, `no-verify`, or missing. Loopback hosts are exempt so
Nightly `next start` can keep using the CI Postgres container.
`sslmode=require` still boots: Nati must flip the Key Vault secret /
App Setting `DATABASE_URL` from `require` to `verify-full`. Do not
invent or commit that secret.

Mode selection:

- Force the token path with `PG_AZURE_AD_AUTH=1`.
- Force the static-password path with `PG_AZURE_AD_AUTH=0` (handy for
  rollback while the KV reference flips back to a passworded URL).
- Omit the flag and the mode is picked by URL shape: passwordless →
  token, passworded → static. This lets prod flip modes by swapping
  only the Key Vault secret the `DATABASE_URL` App Setting points at.

Access tokens and the full connection string are never logged — see
the redaction contract below.

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

---

## 15. Ops scripts

One-shot maintenance helpers live under [`scripts/`](./scripts/) and
speak directly to Postgres via `DATABASE_URL`. They never take a
password on the command line. Read the script `--help` / source for
invocation — do not copy account-name patterns or emails into docs.

**Promote admins** (`npm run ops:promote-admins`,
[`scripts/promote-admins.mjs`](./scripts/promote-admins.mjs)): sets
`users.role` to `admin` for the given emails (or `ADMIN_EMAILS` /
`EMAILS`). Dry-run unless `--yes`. Does not demote anyone left off the
list. The running app also treats `ADMIN_EMAILS` as a one-way promote:
matching addresses are created as admin, and an existing user is
promoted on their next successful sign-in.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
