"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AdminConfirmDialog,
  AdminPageHeader,
  RolePill,
  StatusPill,
  UserActions,
  activityLabel,
  formatCreated,
  useAdminConfirm,
  type AdminUser,
} from "@/components/admin/admin-ui";

interface ListResponse {
  users: AdminUser[];
  page: number;
  page_size: number;
  total: number;
  admins_count: number;
}

export default function AdminUsers({
  actorId,
  timezone,
}: {
  actorId: string;
  timezone: string;
}): JSX.Element {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [debounced]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (debounced) params.set("q", debounced);
    params.set("page", String(page));
    const res = await fetch(`/api/admin/users?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) {
      setError("Couldn’t load users. Try again.");
      return;
    }
    setError(null);
    setData((await res.json()) as ListResponse);
  }, [debounced, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirm = useAdminConfirm(load);
  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.page_size ?? 25;
  const adminsCount = data?.admins_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const trueEmpty = data != null && total === 0 && debounced.length === 0;
  const filteredEmpty = data != null && users.length === 0 && debounced.length > 0;

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
      {!trueEmpty && !filteredEmpty && data ? (
        <ul className="md:hidden divide-y divide-border rounded-2xl border border-border bg-surface">
          {users.map((user) => (
            <li key={user.id} className="space-y-2 px-3 py-3">
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
            </li>
          ))}
        </ul>
      ) : null}
      {!trueEmpty && !filteredEmpty && data ? (
        <div className="hidden md:block overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full text-left text-body-sm">
            <thead className="text-muted">
              <tr className="h-11 border-b border-border">
                <th className="px-3 font-medium">Email</th>
                <th className="px-3 font-medium">Role</th>
                <th className="px-3 font-medium">Status</th>
                <th className="px-3 font-medium">Created</th>
                <th className="px-3 font-medium">Activity</th>
                <th className="px-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="h-11 border-b border-border last:border-b-0">
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
    </section>
  );
}
