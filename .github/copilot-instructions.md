# GitHub Copilot repository instructions

The full instructions for AI coding agents on this repo live in
[`AGENTS.md`](../AGENTS.md). Copilot, Copilot Chat, and Copilot
coding-agent should treat that file as the source of truth and read it
before proposing changes. Do not duplicate its content here.

Fast recap so you never forget the highest-risk items:

- **Stack is locked.** Next.js 14 App Router + Drizzle + Postgres 16.
  Auth is custom argon2id + DB sessions with the `timely_session`
  cookie — **NOT** Auth.js / NextAuth, despite the `NEXTAUTH_*` env
  var names. Do not add `next-auth` / `@auth/*` packages.
- **Every query is scoped by `user_id`.** No cross-user reads or writes.
- **Migrations only via `npm run db:generate`.** Never hand-edit files
  under `./drizzle/`, and never run `db:push` on a shared branch or in
  production.
- **Coverage gate is real** (`vitest.config.ts`: ≥90% lines/statements/
  functions, ≥80% branches on `src/server` + `src/lib`). Do not lower
  thresholds to make a red test green.
- **Before you propose a PR:** `npm run typecheck && npm run lint && npm run test:coverage`.
- **Never commit `.env`, secrets, tokens, or PII.** Use placeholders
  from `.env.example` in examples.
- **Do not modify `.github/workflows/*.yml`** without an explicit human
  ask on the PR.
- **Commit as `cursoragent <cursoragent@cursor.com>`.** Never author as
  `reubinoff` / `reubinoff-prime` or `moshe@primesec.ai`. Branch off
  `main`, open a draft PR to `main`, never push directly to `main`.
- **Owner labels are the assignment for bots.** Every issue must
  carry exactly one of `dude` / `shaul` / `gabi` / `nati` / `ariel`.
  PRs inherit the same label as the issue they close. Do not use
  GitHub's `assignees` field for bots; do not invent new owner
  labels. Source of truth: [`.github/owner-labels.yml`](owner-labels.yml).

For anything not covered above — architecture invariants, error
codes, deploy steps, the full "do not touch" list — see
[`AGENTS.md`](../AGENTS.md).
