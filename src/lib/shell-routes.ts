// Library (projects / clients / tags) and Account are configuration
// surfaces. The full timer dock stays on Timer, Reports, and Export.
const CONFIG_PREFIXES = [
  "/app/projects",
  "/app/clients",
  "/app/tags",
  "/app/account",
] as const;

export function isConfigRoute(pathname: string): boolean {
  return CONFIG_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
