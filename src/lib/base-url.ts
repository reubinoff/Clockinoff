// Public origin resolver — the only sanctioned source of truth for building
// user-visible absolute URLs on the server (OAuth Location headers, OG meta,
// password-reset links…). Behind Azure App Service / any reverse proxy, the
// `Host` header on the incoming Request is the internal container hostname
// (e.g. `e0a475862be8:3000`), so `new URL(req.url).origin` leaks that into
// 302 redirects and ships users to NXDOMAIN. We always prefer the explicitly
// configured public origin from `NEXTAUTH_URL`, and only fall back to the
// request origin when the env var is unset (local dev convenience).

export function publicOrigin(req?: Request): string {
  const configured = process.env.NEXTAUTH_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall through to the request origin / throw below — a malformed
      // NEXTAUTH_URL is a config bug, not something we should silently
      // paper over with the container host.
    }
  }
  if (req) {
    try {
      return new URL(req.url).origin;
    } catch {
      // Fall through.
    }
  }
  throw new Error("publicOrigin: NEXTAUTH_URL not set and no request available");
}
