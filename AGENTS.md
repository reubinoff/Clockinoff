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
no Clockify sync, no Google auth. The full product scope lives in
[`README.md`](./README.md); read it before making non-trivial changes.

### Stack (short)

- **Next.js 16** App Router · React 19 · TypeScript · Tailwind
- **Postgres 16** · **Drizzle ORM** (`drizzle-kit` migrations under `./drizzle`)
- **Auth**: email + password (argon2id) + DB sessions + `httpOnly` cookie
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
  lib/                Framework-free helpers: errors, tz, money, csv, id
  server/
    auth/             passwords (argon2id), session, service
    db/               drizzle client, schema, migrate runner
    services/         Business logic: clients/projects/tags/entries/
                      timer/export/pdf — all owner-scoped
  middleware.ts       Gates /app/* and /api/* (except auth routes)

drizzle/              Generated SQL migrations (do not hand-edit; regenerate)
tests/
  lib/    server/     Vitest unit + API tests
  e2e/                Playwright smoke test
.github/workflows/    ci.yml (test+build) + cd.yml (Azure Web App deploy)
```

### Invariants an agent must not silently break

- **User documentation is part of the surface area.** The end-user site
  lives in [`/docs`](./docs) (published from GitHub Pages) and is linked
  from the authenticated app shell (top header on all sizes, plus the
  desktop footer) and from the login/register screens via
  `src/lib/docs.ts`. Any change
  that alters user-visible behaviour — new UI, new/renamed page, new
  filter, new export column, changed defaults, changed error text —
  **must update the matching page under `/docs` in the same commit**.
  If you cannot update the docs in the same commit, open a follow-up
  issue and link it from the commit body. See §10 for the mapping from
  code to doc page.
- **One running timer per user** — enforced by a partial unique index
  (`WHERE end_at IS NULL`). Second start returns HTTP 409
  `TIMER_ALREADY_RUNNING` with `entry_id`. Do not drop the index.
- **`start_at < end_at`** — CHECK constraint when `end_at IS NOT NULL`.
- **All queries scoped by `user_id`** — every service verifies ownership. A new
  service without an ownership check is a bug.
- **Errors** — always shape as `{ error: { code, message } }` using
  `src/lib/errors.ts` codes: `VALIDATION`, `UNAUTHORIZED`, `NOT_FOUND`,
  `TIMER_ALREADY_RUNNING`, `TIMER_NOT_RUNNING`, `CONFLICT`, `INTERNAL`.
- **Timezone** — timestamps stored as UTC `timestamptz`; render in the user's
  TZ (default `Asia/Jerusalem`) via `src/lib/tz.ts`. Do not compute day
  boundaries in JS `Date` local time.
- **Export**: `from` + `to` query params are **required**. Empty range must
  still return 200 (CSV header row / “No entries” PDF page).

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
placeholder and document it in the README/AGENTS.md. Actual secret values are
set by the repo owner in Azure Web App Configuration and GitHub Actions
secrets — an agent should not touch those.

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
- Do **not** add new third-party integrations that weren’t explicitly asked
  for (no Clockify sync, no Google auth, no analytics SDKs, no telemetry).
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
document remains the source of truth.

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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
