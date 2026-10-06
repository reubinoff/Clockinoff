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
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT">
  </a>
  <img src="https://img.shields.io/badge/node-%E2%89%A524-brightgreen" alt="Node 24+">
  <img src="https://img.shields.io/badge/next-16-black" alt="Next 16">
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

- **One running timer** per user — starting a second one is rejected; the
  current entry stays running.
- **Manual entries & bulk edit.** Log hours after the fact; multi-select
  rows to re-tag, re-project, mark billable / billed, or delete together.
- **Projects, clients, tags.** Billable projects carry a default hourly
  rate; per-entry rate overrides are supported. Amounts are derived, never
  typed in.
- **CSV & PDF export** over any date range. Empty ranges still export
  cleanly (header-only CSV / a "No entries" PDF page).
- **Timezone-aware.** Times are stored in UTC and shown in your timezone
  (`Asia/Jerusalem` by default, overridable per user).
- **Quiet Pulse UI.** Light and dark palettes, an in-app Appearance
  picker (System · Light · Dark), and motion that respects
  `prefers-reduced-motion`.
- **In-app documentation** at `/docs` — the user guide lives on the same
  origin as the app.
- **Email + password or Continue with Google.** Register with an email +
  password, or use the **Continue with Google** button on `/login` and
  `/register` when the instance has Google sign-in enabled.
- **MIT licensed** and small enough to read end-to-end.

## Not in v1

By design — these are not "coming soon", they are "not what this product is":

- No teams, workspaces, or shared entries.
- No calendar view or dashboards beyond the entry list + exports.
- No Clockify / Toggl / third-party sync.
- No OAuth providers beyond the optional **Continue with Google** button
  on `/login` and `/register`. Email + password remains the primary path.

See the [FAQ](https://clockinoff.reubinoff.com/docs/faq) for the longer
version.

## Try it

The hosted instance is open for self-registration:

- **Live app** → <https://clockinoff.reubinoff.com>
- **Register** → <https://clockinoff.reubinoff.com/register>
- **User guide** → <https://clockinoff.reubinoff.com/docs>

There are no seed accounts — register and you are in.

## Quick start (local dev)

Prerequisites: **Node.js ≥ 24** and **Docker** for Postgres.

```bash
docker compose up -d
npm install
cp .env.example .env
npm run db:migrate
npm run dev
# → http://localhost:3000
```

Register at `/register`, then start a timer from the bar at the top of
every authenticated page.

Contributor setup, commands, and invariants: [`AGENTS.md`](./AGENTS.md).
Environment placeholders: [`.env.example`](./.env.example).

## Documentation

| Audience | Where |
|---|---|
| **Users** (primary) | <https://clockinoff.reubinoff.com/docs> — same markdown as [`/docs`](./docs) |
| Users (optional mirror) | GitHub Pages from `/docs` (`just-the-docs`), off by default |
| Contributors & agents | [`AGENTS.md`](./AGENTS.md) · [`CONTRIBUTING.md`](./CONTRIBUTING.md) |

User-guide pages: [Getting started](https://clockinoff.reubinoff.com/docs/getting-started) ·
[Timer](https://clockinoff.reubinoff.com/docs/timer) ·
[Entries](https://clockinoff.reubinoff.com/docs/entries) ·
[Projects](https://clockinoff.reubinoff.com/docs/projects) ·
[Clients](https://clockinoff.reubinoff.com/docs/clients) ·
[Tags](https://clockinoff.reubinoff.com/docs/tags) ·
[Reports](https://clockinoff.reubinoff.com/docs/reports) ·
[Export](https://clockinoff.reubinoff.com/docs/export) ·
[Account](https://clockinoff.reubinoff.com/docs/account) ·
[FAQ](https://clockinoff.reubinoff.com/docs/faq)

Contributor internals (API, auth rules, CI/CD, Azure deploy, ops) live in
[`AGENTS.md`](./AGENTS.md) — not here.

## Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript** · **Tailwind CSS 3**
- **Postgres 16** · **Drizzle ORM**
- **Auth**: email + password (argon2id, database sessions) with optional
  Continue with Google
- **PDF / CSV**: `@react-pdf/renderer` + a small CSV writer
- **Tests**: Vitest + Playwright
- **CI**: GitHub Actions, ≥90 % coverage on `src/server` + `src/lib`
- **Deploy**: Azure Web App (Node 24) + Azure Database for PostgreSQL

## Contributing

Clockinoff is a solo product, but PRs that fix bugs, tighten tests, or
sharpen docs are welcome. Read [`AGENTS.md`](./AGENTS.md) first.

- Conventional commits; one logical change per commit.
- All DB queries scoped by `user_id`.
- Coverage stays at ≥90 % on `src/server` + `src/lib`.
- User-visible changes update the matching page under [`/docs`](./docs)
  in the same commit.

Bugs and feature requests → [GitHub Issues](https://github.com/reubinoff/Clockinoff/issues).

## License

[MIT](./LICENSE) © 2026 Moshe Reubinoff.
