// Shared bits of the Google OAuth "Continue with Google" flow that are
// not themselves HTTP handlers. Lives in `src/lib/` because Next 16's
// route typegen rejects any non-handler, non-segment-config export from
// a `route.ts` module — moving them out of the route file keeps
// `next build` green without diluting the handler surface.
//
// Covered by `tests/server/google-start-route.test.ts` which exercises
// `sanitiseNext` directly plus the cookie name through the GET handler.

export const OAUTH_STATE_COOKIE = "timely_oauth_state";
export const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

// Only allow relative `next` paths back into the app. Blocks protocol /
// host escape (`//evil`, `https://evil`, `http:evil`) so this flow can
// never be used as an open-redirect vector. Ariel smoke scope.
export function sanitiseNext(input: string | null | undefined): string {
  if (!input) return "/app";
  if (typeof input !== "string") return "/app";
  if (input.length > 1024) return "/app";
  if (!input.startsWith("/")) return "/app";
  if (input.startsWith("//")) return "/app";
  if (input.startsWith("/\\")) return "/app";
  return input;
}
