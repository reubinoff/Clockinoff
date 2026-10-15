// Admin Users list sort (#198). Keys match the visible columns.
// Anything else falls back to Created, newest first.

export const ADMIN_USER_SORT_KEYS = [
  "email",
  "role",
  "status",
  "created",
  "activity",
] as const;

export type AdminUserSortKey = (typeof ADMIN_USER_SORT_KEYS)[number];
export type AdminUserSortDir = "asc" | "desc";

export const DEFAULT_ADMIN_USER_SORT: AdminUserSortKey = "created";
export const DEFAULT_ADMIN_USER_SORT_DIR: AdminUserSortDir = "desc";

const SORT_KEYS = new Set<string>(ADMIN_USER_SORT_KEYS);

export interface AdminUserSort {
  sort: AdminUserSortKey;
  dir: AdminUserSortDir;
}

// Query strings can repeat a key (`sort=email&sort=__proto__`,
// `dir=asc&dir=desc`). Taking the first value would honor an allowlisted
// key that arrived beside a hostile one. A repeated `sort` or `dir`
// drops the whole pair back to Created desc, same as an unknown key.
export function adminUserSortFromSearchParams(
  params: { getAll(name: string): string[] },
): AdminUserSort {
  const sorts = params.getAll("sort");
  const dirs = params.getAll("dir");
  if (sorts.length > 1 || dirs.length > 1) {
    return { sort: DEFAULT_ADMIN_USER_SORT, dir: DEFAULT_ADMIN_USER_SORT_DIR };
  }
  return parseAdminUserSort(
    sorts.length === 0 ? undefined : sorts[0],
    dirs.length === 0 ? undefined : dirs[0],
  );
}

export function parseAdminUserSort(
  sort: string | null | undefined,
  dir: string | null | undefined,
): AdminUserSort {
  // Omitted params use the default for that field. A present value that
  // is not an exact allowlist match (wrong case, unknown key, injection)
  // drops the whole pair back to created desc so a bad dir cannot keep
  // a chosen column.
  const sortOmitted = sort == null;
  const dirOmitted = dir == null;
  const sortOk = typeof sort === "string" && SORT_KEYS.has(sort);
  const dirOk = dir === "asc" || dir === "desc";
  if ((!sortOmitted && !sortOk) || (!dirOmitted && !dirOk)) {
    return { sort: DEFAULT_ADMIN_USER_SORT, dir: DEFAULT_ADMIN_USER_SORT_DIR };
  }
  return {
    sort: sortOk ? (sort as AdminUserSortKey) : DEFAULT_ADMIN_USER_SORT,
    dir: dirOk ? dir : DEFAULT_ADMIN_USER_SORT_DIR,
  };
}

// First click on a column uses that column's natural direction
// (A–Z, admin first, active first, newest, most entries). A second
// click on the active column flips direction.
const INITIAL_DIR: Record<AdminUserSortKey, AdminUserSortDir> = {
  email: "asc",
  role: "asc",
  status: "asc",
  created: "desc",
  activity: "desc",
};

export function nextAdminUserSort(
  current: AdminUserSort,
  column: AdminUserSortKey,
): AdminUserSort {
  if (current.sort === column) {
    return { sort: column, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { sort: column, dir: INITIAL_DIR[column] };
}

export function adminUserAriaSort(
  column: AdminUserSortKey,
  active: AdminUserSort,
): "ascending" | "descending" | "none" {
  if (column !== active.sort) return "none";
  return active.dir === "asc" ? "ascending" : "descending";
}
