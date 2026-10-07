# `src/` — agent guide

Shorter contract for code under `src/`. The repo root
[`AGENTS.md`](../AGENTS.md) still wins if the two disagree. User-visible
behaviour changes still update the matching page under `/docs` in the same
commit (root §10).

## Where code goes

| Path | Put this here |
|---|---|
| `src/app/` | App Router pages and layouts. Auth screens: `login/`, `register/`. Authenticated shell: `app/`. In-app docs: `docs/`. |
| `src/app/api/**/route.ts` | Route handlers only: parse the request, resolve the session, call a service, shape the response. |
| `src/components/` | Client UI. PascalCase files (`TimerBar.tsx`). `"use client"` when the file uses hooks or browser APIs. |
| `src/lib/` | Framework-free helpers (errors, tz, money, csv, ids). No DB, no `next/headers`. |
| `src/server/services/` | Owner-scoped business logic. |
| `src/server/auth/` | Passwords, sessions, Google OAuth. |
| `src/server/db/` | Drizzle client, schema, migrator. All queries go through `client.ts`. |
| `src/server/http.ts` | `requireUser`, `readJson`, `jsonError`. |

Import app code with the `@/` alias (`@/lib/tz`, `@/server/services/entries`).
It maps to `src/`.

## Naming

- Files in `lib/`, `server/`, and `app/api/` are kebab-case or a short domain
  name (`entries.ts`, `http.ts`, `tag-ids.ts`).
- React components are PascalCase, default-exported when that is the public
  component.
- API JSON uses snake_case fields already on the wire (`entry_id`,
  `start_at`). Drizzle columns in TypeScript are camelCase (`userId`,
  `startAt`). Do not mix the two in one layer.

## Request path

1. Handler reads the body with `readJson` (64 KiB cap) and the user with
   `requireUser` from `@/server/http`.
2. Handler calls a function in `src/server/services/*` (or `src/server/auth/`)
   and passes `user.id` into every owner-scoped call.
3. Services throw `ApiError` via the `errors` helpers in `@/lib/errors`.
   Handlers catch and return `jsonError(err)`. Do not invent a second error
   shape. Codes: `VALIDATION`, `UNAUTHORIZED`, `NOT_FOUND`,
   `TIMER_ALREADY_RUNNING`, `TIMER_NOT_RUNNING`, `CONFLICT`, `RATE_LIMITED`,
   `INTERNAL`.
4. New request bodies and query params are validated (zod, as in
   `src/lib/tag-ids.ts`, or the same explicit checks the neighbouring service
   already uses). Clients never POST a monetary `amount`.

## Do

- Scope every query by `user_id`. A service that skips the ownership check is
  a bug.
- Keep one running timer per user (partial unique index, `end_at IS NULL`).
  A second start is HTTP 409 `TIMER_ALREADY_RUNNING` with `entry_id`.
- Store timestamps as UTC `timestamptz`. Day boundaries go through
  `src/lib/tz.ts`. Money and duration go through `src/lib/money.ts`.
- New tables: edit `src/server/db/schema.ts`, then `npm run db:generate`.
  Never hand-edit a committed file under `drizzle/`.
- Comments explain why. TypeScript stays strict; no `any` unless a comment
  says why.

## Do not

- Do not compute day boundaries with `Date` local time.
- Do not drop `start_at < end_at` or the one-timer index.
- Do not auto-attach Google onto a user that already has `password_hash`.
- Do not log passwords, session cookies, bearer tokens, or a full
  `DATABASE_URL`.
- Do not add CSS-in-JS. Style with Tailwind.
- Do not put business rules in route handlers or React components.
