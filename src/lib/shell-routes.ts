// Library (projects / clients / tags), Account, and Admin are
// configuration surfaces. The full timer dock stays on Timer, Reports,
// and Export so it does not cover the admin table on a phone.
const CONFIG_PREFIXES = [
  "/app/projects",
  "/app/clients",
  "/app/tags",
  "/app/account",
] as const;

export function isConfigRoute(pathname: string): boolean {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  return CONFIG_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
