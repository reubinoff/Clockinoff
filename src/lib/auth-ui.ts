// Shaul lock (#54): any mutation that comes back as 401 or 403 must roll back
// optimistic UI and send the user to re-auth. We never leave "saved" chrome
// (toast, dim row, timer running wash) up after an auth failure — Ariel's
// rule — because that implies the server accepted a write it did not.
//
// Framework-free so it stays unit-testable and so route handlers / client
// components / future server actions can share the same contract.

export const AUTH_FAILURE_STATUSES = [401, 403] as const;

export function isAuthFailure(status: number): boolean {
  return status === 401 || status === 403;
}

// Build the `/login?next=…` URL the user should land on after re-authing.
// `currentPath` is injected (rather than read from `window`) so the helper
// stays pure and testable; callers pass `location.pathname + location.search`
// at the call site.
export function buildLoginRedirect(currentPath: string): string {
  const safe =
    currentPath && currentPath.startsWith("/") ? currentPath : "/app";
  return `/login?next=${encodeURIComponent(safe)}`;
}

// Default handler for click-site auth failures. Dispatches a lightweight
// browser-only redirect; callers that need to run cleanup should pass a
// `rollback` closure that undoes the optimistic mutation before we leave.
// A test seam (`navigate`) keeps vitest/jsdom calls deterministic.
export interface HandleAuthFailureOpts {
  rollback?: () => void;
  navigate?: (href: string) => void;
  path?: string;
}

export function handleAuthFailure(opts: HandleAuthFailureOpts = {}): void {
  const { rollback, navigate, path } = opts;
  try {
    rollback?.();
  } catch {
    // Never let a bad rollback eat the redirect — the user still needs to
    // land on /login so they can recover.
  }
  const target = buildLoginRedirect(
    path ??
      (typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/app"),
  );
  const nav =
    navigate ??
    ((href: string) => {
      if (typeof window !== "undefined") {
        window.location.assign(href);
      }
    });
  nav(target);
}
