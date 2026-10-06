// Vitest runs in Node and has no Next.js server-only rewrite. The real
// `server-only` package throws when evaluated outside a server webpack
// graph; this stub lets unit tests import `@/lib/oauth-state`.
export {};
