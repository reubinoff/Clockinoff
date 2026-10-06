// Client-safe helpers for the Google OAuth "next" path and the state cookie
// name. No Node APIs, no crypto — #123 can import `sanitiseNext` from the
// login client later. HMAC sign/verify lives in `src/lib/oauth-state.ts`
// behind `import "server-only"`.

export const OAUTH_STATE_COOKIE = "timely_oauth_state";
export const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

// Dummy base used when the caller has no public origin handy. Only used
// to detect protocol-relative / absolute escapes; the return value is
// always a same-origin relative path. Google start/callback pass
// `publicOrigin(req)` so a same-site absolute URL canonicalises.
export const SANITISE_NEXT_ORIGIN = "https://clockinoff.invalid";
const DEFAULT_NEXT = "/app";
const UNSAFE_CHAR = /[\u0000-\u001F\u007F\\]/;
const UNSAFE_PERCENT = /%(?:0[0-9A-Fa-f]|1[0-9A-Fa-f]|7[Ff]|5[Cc])/;

export type OAuthIntent = "signin" | "connect";

export interface OAuthStatePayload {
  s: string;
  n: string;
  i?: OAuthIntent;
  uid?: string;
  exp?: number;
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

// Parse-and-compare, not prefix checks. WHATWG URL parsing strips TAB /
// CR / LF, so `"/\t/evil"` becomes the protocol-relative `//evil` and
// `new URL(..., origin)` walks off-site. Reject control chars and `\`
// first, then require the parsed origin to match.
export function sanitiseNext(input: string | null | undefined, origin = SANITISE_NEXT_ORIGIN): string {
  if (!input || typeof input !== "string") return DEFAULT_NEXT;
  if (input.length > 1024) return DEFAULT_NEXT;
  if (UNSAFE_CHAR.test(input) || UNSAFE_PERCENT.test(input)) return DEFAULT_NEXT;
  // Bare tokens like `not-a-path` are same-origin relative paths after
  // `new URL(input, origin)`. Only a leading `/` or an absolute URL is
  // eligible — then the origin check decides.
  if (!input.startsWith("/") && !/^[a-zA-Z][a-zA-Z+.-]*:/.test(input)) {
    return DEFAULT_NEXT;
  }
  let base: string;
  try {
    base = new URL(origin).origin;
  } catch {
    return DEFAULT_NEXT;
  }
  try {
    const url = new URL(input, base);
    if (url.origin !== base) return DEFAULT_NEXT;
    if (url.username || url.password) return DEFAULT_NEXT;
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (!next.startsWith("/") || next.startsWith("//")) return DEFAULT_NEXT;
    if (UNSAFE_CHAR.test(next) || UNSAFE_PERCENT.test(next)) return DEFAULT_NEXT;
    const again = new URL(next, base);
    if (again.origin !== base) return DEFAULT_NEXT;
    return next;
  } catch {
    return DEFAULT_NEXT;
  }
}
