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

export type OAuthIntent = "signin" | "connect";

export interface OAuthStatePayload {
  s: string;
  n: string;
  i?: OAuthIntent;
}

export function readRequestCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie");
  if (!raw) return undefined;
  const part = raw
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${name}=`));
  if (!part) return undefined;
  return decodeURIComponent(part.slice(name.length + 1));
}

export function parseOAuthIntent(raw: string | null | undefined): OAuthIntent {
  return raw === "connect" ? "connect" : "signin";
}

export function parseOAuthState(raw: string | undefined): OAuthStatePayload | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== "object") return null;
    const s = (obj as Record<string, unknown>).s;
    const n = (obj as Record<string, unknown>).n;
    const i = (obj as Record<string, unknown>).i;
    if (typeof s !== "string" || s.length === 0) return null;
    if (typeof n !== "string") return null;
    const intent: OAuthIntent | undefined = i === "connect" ? "connect" : undefined;
    return intent ? { s, n, i: intent } : { s, n };
  } catch {
    return null;
  }
}

export function serialiseOAuthState(state: OAuthStatePayload): string {
  if (state.i === "connect") return JSON.stringify({ s: state.s, n: state.n, i: "connect" });
  return JSON.stringify({ s: state.s, n: state.n });
}

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
