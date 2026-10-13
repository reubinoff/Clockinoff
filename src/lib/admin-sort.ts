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

export function parseAdminUserSort(
  sort: string | null | undefined,
  dir: string | null | undefined,
): AdminUserSort {
  return {
    sort:
      sort && SORT_KEYS.has(sort) ? (sort as AdminUserSortKey) : DEFAULT_ADMIN_USER_SORT,
    dir: dir === "asc" || dir === "desc" ? dir : DEFAULT_ADMIN_USER_SORT_DIR,
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
