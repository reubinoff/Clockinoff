# Contributing

This repo is **AI-first**: humans and AI coding agents (Cursor, Claude Code,
Codex, …) share one operating manual.

- If you are a human: read [`AGENTS.md`](./AGENTS.md). Everything you need —
  local setup, tests, coding conventions, how to open a bug, commit style,
  and push/PR rules — is in there.
- If you are an AI agent: [`AGENTS.md`](./AGENTS.md) is your contract.
  Follow it. If a rule elsewhere conflicts, AGENTS.md wins unless the current
  user says otherwise.

## Quick links

- Bugs / feature requests → [GitHub Issues](https://github.com/reubinoff/Clockinoff/issues)
  (template in [AGENTS.md §5](./AGENTS.md#5-opening-issues--bugs))
- Local dev + commands → [`README.md`](./README.md) and
  [AGENTS.md §2–3](./AGENTS.md#2-environment-setup)
- Commit style → Conventional Commits; agents commit as
  `Cursor Agent <cursoragent@cursor.com>`
  ([AGENTS.md §6](./AGENTS.md#6-commits))
- Push / PR norm → **approved changes go straight to `main`; open a PR only
  when blocked** ([AGENTS.md §7](./AGENTS.md#7-pr--push-norms))

Before pushing to `main`, at minimum:

```bash
npm run typecheck && npm run lint && npm run test:coverage
```
