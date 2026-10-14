"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AdminBulkConfirmDialog,
  AdminConfirmDialog,
  AdminPageHeader,
  RolePill,
  StatusPill,
  UserActions,
  activityLabel,
  adminActionButtonClass,
  formatCreated,
  useAdminConfirm,
  type AdminActionKind,
  type AdminUser,
} from "@/components/admin/admin-ui";
import { parseTypedConfirmCount, partitionBulk, bulkSkippedToast } from "@/lib/admin-bulk";
import {
  BULK_REMOVE_CAP,
  adminActionErrorMessage,
  bulkRemoveFailureMessage,
} from "@/lib/admin-copy";
import {
  adminUserAriaSort,
  nextAdminUserSort,
  parseAdminUserSort,
  type AdminUserSort,
  type AdminUserSortDir,
  type AdminUserSortKey,
} from "@/lib/admin-sort";
import { emitToast } from "@/lib/events";
import { IconCheck, IconChevronDown } from "@/components/icons";

interface ListResponse {
  users: AdminUser[];
  page: number;
  page_size: number;
  total: number;
  admins_count: number;
}

const BULK_KINDS: AdminActionKind[] = ["remove", "block", "unblock", "promote", "demote"];
const EMPTY_USERS: AdminUser[] = [];

const SORT_COLUMNS: { key: AdminUserSortKey; label: string }[] = [
  { key: "email", label: "Email" },
  { key: "role", label: "Role" },
  { key: "status", label: "Status" },
  { key: "created", label: "Created" },
  { key: "activity", label: "Activity" },
];

const SORT_OPTIONS: { sort: AdminUserSortKey; dir: AdminUserSortDir; label: string }[] = [
  { sort: "email", dir: "asc", label: "Email A–Z" },
  { sort: "email", dir: "desc", label: "Email Z–A" },
  { sort: "role", dir: "asc", label: "Role, admin first" },
  { sort: "role", dir: "desc", label: "Role, user first" },
  { sort: "status", dir: "asc", label: "Status, active first" },
  { sort: "status", dir: "desc", label: "Status, blocked first" },
  { sort: "created", dir: "desc", label: "Created, newest" },
  { sort: "created", dir: "asc", label: "Created, oldest" },
  { sort: "activity", dir: "desc", label: "Activity, most entries" },
  { sort: "activity", dir: "asc", label: "Activity, fewest entries" },
];

export default function AdminUsers({
  actorId,
  timezone,
}: {
  actorId: string;
  timezone: string;
}): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const urlSort = parseAdminUserSort(params.get("sort"), params.get("dir"));
  const urlSortKey = `${urlSort.sort}:${urlSort.dir}`;
  const [sortState, setSortState] = useState<AdminUserSort>(urlSort);
  // URL is the refresh/back source of truth. Clicks update state immediately
  // so the list request does not wait on the history update, then this
  // catches a later param change (including back/forward).
  const [seenUrlSort, setSeenUrlSort] = useState(urlSortKey);
  if (urlSortKey !== seenUrlSort) {
    setSeenUrlSort(urlSortKey);
    setSortState((current) =>
      current.sort === urlSort.sort && current.dir === urlSort.dir ? current : urlSort,
    );
  }
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkKind, setBulkKind] = useState<AdminActionKind | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const bulkInFlight = useRef(false);
  const bulkDismissed = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  // Reset to page 1 when the debounced query changes (render-time adjust).
  const [prevDebounced, setPrevDebounced] = useState(debounced);
  if (debounced !== prevDebounced) {
    setPrevDebounced(debounced);
    if (page !== 1) setPage(1);
  }

  const load = useCallback(async () => {
    const query = new URLSearchParams();
    if (debounced) query.set("q", debounced);
    query.set("page", String(page));
    query.set("sort", sortState.sort);
    query.set("dir", sortState.dir);
    const res = await fetch(`/api/admin/users?${query.toString()}`, { cache: "no-store" });
    if (!res.ok) {
      setError("Couldn’t load users. Try again.");
      return;
    }
    setError(null);
    setData((await res.json()) as ListResponse);
    setSelected(new Set());
  }, [debounced, page, sortState.sort, sortState.dir]);

  function applySort(next: AdminUserSort): void {
    setSortState(next);
    if (page !== 1) setPage(1);
    const nextParams = new URLSearchParams(params.toString());
    nextParams.set("sort", next.sort);
    nextParams.set("dir", next.dir);
    const qs = nextParams.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  useEffect(() => {
    // setState runs after await inside load; the rule still flags the call.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on query / page
    void load();
  }, [load]);

  const confirm = useAdminConfirm(load);
  const users = data?.users ?? EMPTY_USERS;
  const total = data?.total ?? 0;
  const pageSize = data?.page_size ?? 25;
  const adminsCount = data?.admins_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const trueEmpty = data != null && total === 0 && debounced.length === 0;
  const filteredEmpty = data != null && users.length === 0 && debounced.length > 0;
  const showList = !trueEmpty && !filteredEmpty && data != null;

  const selectedUsers = useMemo(
    () => users.filter((user) => selected.has(user.id)),
    [users, selected],
  );
  const allOnPage = users.length > 0 && users.every((user) => selected.has(user.id));
  const someOnPage = users.some((user) => selected.has(user.id));

  function toggleOne(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage(): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (users.every((user) => next.has(user.id))) {
        for (const user of users) next.delete(user.id);
      } else {
        for (const user of users) next.add(user.id);
      }
      return next;
    });
  }

  function clearSelection(): void {
    setSelected(new Set());
  }

  const bulkPlan = bulkKind
    ? partitionBulk(bulkKind, selectedUsers, actorId, adminsCount)
    : null;

  function askBulk(kind: AdminActionKind): void {
    bulkDismissed.current = false;
    setBulkError(null);
    setBulkKind(kind);
  }

  function cancelBulk(): void {
    if (bulkInFlight.current) return;
    bulkDismissed.current = true;
    setBulkKind(null);
    setBulkError(null);
  }

  function confirmBulk(typedCount: string): boolean {
    if (bulkInFlight.current || bulkDismissed.current) return false;
    if (!bulkKind || !bulkPlan || bulkPlan.eligible.length === 0 || bulkBusy) return false;
    if (bulkKind === "remove" && bulkPlan.eligible.length > BULK_REMOVE_CAP) return false;
    const confirmCount = bulkKind === "remove" ? parseTypedConfirmCount(typedCount) : null;
    if (bulkKind === "remove" && confirmCount === null) return false;
    bulkInFlight.current = true;
    const localSkipped = bulkPlan.skipped.length;
    const kind = bulkKind;
    const ids = bulkPlan.eligible.map((user) => user.id);
    setBulkBusy(true);
    void (async () => {
      try {
        const res = await fetch("/api/admin/users/bulk", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: kind,
            ids,
            ...(kind === "remove" ? { confirmCount } : {}),
          }),
        });
        if (!res.ok) {
          let message: string | undefined;
          try {
            const body = (await res.json()) as { error?: { message?: string } };
            message = body.error?.message;
          } catch {
            message = undefined;
          }
          if (kind === "remove") {
            setBulkError(bulkRemoveFailureMessage(message));
            return;
          }
          emitToast(adminActionErrorMessage(message));
          return;
        }
        const body = (await res.json()) as { applied?: number; skipped?: number };
        const applied = Number(body.applied) || 0;
        const skipped = localSkipped + (Number(body.skipped) || 0);
        const toast = bulkSkippedToast(kind, applied, skipped);
        setBulkError(null);
        setBulkKind(null);
        if (toast) emitToast(toast);
        await load();
        router.refresh();
      } finally {
        bulkInFlight.current = false;
        setBulkBusy(false);
      }
    })();
    return true;
  }

  return (
    <section className="space-y-4">
      <AdminPageHeader title="Users" subcopy="Everyone on this instance." />
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="admin-user-search">Search by email</label>
        <input
          id="admin-user-search"
          className="input max-w-sm"
          placeholder="Search by email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q ? (
          <button type="button" className="btn btn-ghost" onClick={() => setQ("")}>
            Clear
          </button>
        ) : null}
      </div>
      {error ? <p className="text-body-sm text-danger" role="status">{error}</p> : null}
      {selectedUsers.length > 0 ? (
        <BulkToolbar
          count={selectedUsers.length}
          actorId={actorId}
          adminsCount={adminsCount}
          users={selectedUsers}
          pending={bulkBusy || confirm.busy}
          onClear={clearSelection}
          onAsk={askBulk}
        />
      ) : null}
      {trueEmpty ? (
        <div className="rounded-2xl border border-border bg-surface px-4 py-10 text-center">
          <p className="text-ink">No users yet.</p>
          <p className="mt-1 text-body-sm text-muted">
            Bootstrap the first admin from ops — this screen stays empty until accounts exist.
          </p>
        </div>
      ) : null}
      {filteredEmpty ? (
        <div className="rounded-2xl border border-border bg-surface px-4 py-10 text-center">
          <p className="text-ink">No users match that email.</p>
        </div>
      ) : null}
      {showList ? (
        <div className="md:hidden space-y-2">
          <div className="flex items-center gap-2 px-1">
            <SelectBox
              label="Select all on this page"
              checked={allOnPage}
              mixed={!allOnPage && someOnPage}
              onChange={togglePage}
              compact={false}
            />
            <span className="text-body-sm text-muted">Select all</span>
          </div>
          <label className="flex items-center gap-2 px-1 text-body-sm text-muted" htmlFor="admin-user-sort">
            Sort by
            <select
              id="admin-user-sort"
              className="input max-w-[16rem]"
              value={`${sortState.sort}:${sortState.dir}`}
              onChange={(e) => {
                const [sort, dir] = e.target.value.split(":");
                applySort(parseAdminUserSort(sort, dir));
              }}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={`${option.sort}:${option.dir}`} value={`${option.sort}:${option.dir}`}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {users.map((user) => (
              <li key={user.id} className="flex items-start gap-1 px-2 py-3">
                <SelectBox
                  label={`Select ${user.email}`}
                  checked={selected.has(user.id)}
                  mixed={false}
                  onChange={() => toggleOne(user.id)}
                  compact={false}
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <Link
                    href={`/admin/users/${user.id}`}
                    className="block truncate text-ink"
                    title={user.email}
                  >
                    {user.email}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2">
                    <RolePill role={user.role} />
                    <StatusPill status={user.status} />
                    <span className="text-muted tabular-nums">{formatCreated(user.created_at, timezone)}</span>
                    <span className="text-ink tabular-nums">{activityLabel(user.entries_count)}</span>
                  </div>
                  <UserActions
                    user={user}
                    actorId={actorId}
                    adminsCount={adminsCount}
                    onAsk={confirm.ask}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {showList ? (
        <div className="hidden md:block overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full text-left text-body-sm">
            <thead className="text-muted">
              <tr className="h-11 border-b border-border">
                <th className="w-12 px-2 font-medium">
                  <SelectBox
                    label="Select all on this page"
                    checked={allOnPage}
                    mixed={!allOnPage && someOnPage}
                    onChange={togglePage}
                    compact
                  />
                </th>
                {SORT_COLUMNS.map((column) => (
                  <SortHeader
                    key={column.key}
                    column={column.key}
                    label={column.label}
                    active={sortState}
                    onSort={() => applySort(nextAdminUserSort(sortState, column.key))}
                  />
                ))}
                <th className="px-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="h-11 border-b border-border last:border-b-0">
                  <td className="px-2">
                    <SelectBox
                      label={`Select ${user.email}`}
                      checked={selected.has(user.id)}
                      mixed={false}
                      onChange={() => toggleOne(user.id)}
                      compact
                    />
                  </td>
                  <td className="px-3 max-w-[220px]">
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="block truncate text-ink hover:underline"
                      title={user.email}
                    >
                      {user.email}
                    </Link>
                  </td>
                  <td className="px-3"><RolePill role={user.role} /></td>
                  <td className="px-3"><StatusPill status={user.status} /></td>
                  <td className="px-3 text-muted tabular-nums whitespace-nowrap">
                    {formatCreated(user.created_at, timezone)}
                  </td>
                  <td className="px-3 text-ink tabular-nums whitespace-nowrap">
                    {activityLabel(user.entries_count)}
                  </td>
                  <td className="px-3">
                    <UserActions
                      user={user}
                      actorId={actorId}
                      adminsCount={adminsCount}
                      onAsk={confirm.ask}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {data && total > pageSize ? (
        <div className="flex items-center justify-end gap-2 text-body-sm">
          <button
            type="button"
            className="btn !min-h-[36px]"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="text-muted tabular-nums">
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            className="btn !min-h-[36px]"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
      {confirm.pendingUser && confirm.pendingKind ? (
        <AdminConfirmDialog
          user={confirm.pendingUser}
          kind={confirm.pendingKind}
          timeZone={timezone}
          pending={confirm.busy}
          onCancel={confirm.cancel}
          onConfirm={() => void confirm.confirm()}
        />
      ) : null}
      {bulkKind && bulkPlan && bulkPlan.eligible.length > 0 ? (
        <AdminBulkConfirmDialog
          kind={bulkKind}
          emails={bulkPlan.eligible.map((user) => user.email)}
          skipped={bulkPlan.skipped.length}
          pending={bulkBusy}
          error={bulkKind === "remove" ? bulkError : null}
          onCancel={cancelBulk}
          onConfirm={confirmBulk}
        />
      ) : null}
    </section>
  );
}

function SortHeader({
  column,
  label,
  active,
  onSort,
}: {
  column: AdminUserSortKey;
  label: string;
  active: AdminUserSort;
  onSort: () => void;
}): JSX.Element {
  const sorted = column === active.sort;
  return (
    <th aria-sort={adminUserAriaSort(column, active)} className="px-1 font-medium">
      <button
        type="button"
        onClick={onSort}
        className="inline-flex h-11 items-center gap-1 rounded-md px-2 font-medium text-muted hover:text-ink focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        {label}
        {sorted ? (
          <IconChevronDown
            size={14}
            className={active.dir === "asc" ? "rotate-180" : undefined}
            aria-hidden
          />
        ) : (
          <span className="inline-block w-3.5" aria-hidden />
        )}
      </button>
    </th>
  );
}

function BulkToolbar({
  count,
  users,
  actorId,
  adminsCount,
  pending,
  onClear,
  onAsk,
}: {
  count: number;
  users: AdminUser[];
  actorId: string;
  adminsCount: number;
  pending: boolean;
  onClear: () => void;
  onAsk: (kind: AdminActionKind) => void;
}): JSX.Element {
  const visible = BULK_KINDS.filter(
    (kind) => partitionBulk(kind, users, actorId, adminsCount).eligible.length > 0,
  );
  return (
    <div
      role="toolbar"
      aria-label="Bulk user actions"
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-2"
    >
      <span className="text-body-sm text-muted">
        <span className="font-medium tabular-nums text-ink">{count}</span> selected
      </span>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={onClear}
        disabled={pending}
        aria-label="Clear selection"
      >
        Clear
      </button>
      <div className="flex flex-wrap items-center gap-2 md:ml-auto">
        {visible.map((kind) => (
          <button
            key={kind}
            type="button"
            className={`${adminActionButtonClass(kind)} btn-sm`}
            disabled={pending}
            onClick={() => onAsk(kind)}
          >
            {kind === "remove"
              ? "Remove"
              : kind === "block"
                ? "Block"
                : kind === "unblock"
                  ? "Unblock"
                  : kind === "promote"
                    ? "Promote"
                    : "Demote"}
          </button>
        ))}
      </div>
    </div>
  );
}

function SelectBox({
  label,
  checked,
  mixed,
  onChange,
  compact,
}: {
  label: string;
  checked: boolean;
  mixed: boolean;
  onChange: () => void;
  compact: boolean;
}): JSX.Element {
  const on = checked || mixed;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked ? true : mixed ? "mixed" : false}
      aria-label={label}
      onClick={onChange}
      className={
        compact
          ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
          : "flex h-11 w-11 shrink-0 items-center justify-center rounded-md"
      }
    >
      <span
        className={
          "flex h-5 w-5 items-center justify-center rounded-md border transition-colors " +
          (on ? "border-accent bg-accent text-accent-fg" : "border-border-strong bg-surface")
        }
      >
        {checked ? <IconCheck size={12} aria-hidden /> : null}
        {mixed && !checked ? <span className="h-0.5 w-2.5 rounded-full bg-accent-fg" /> : null}
      </span>
    </button>
  );
}
