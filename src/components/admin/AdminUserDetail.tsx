"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AdminConfirmDialog,
  AdminPageHeader,
  RolePill,
  StatusPill,
  adminActionButtonClass,
  formatCreated,
  guardTitle,
  useAdminConfirm,
  type AdminActionKind,
  type AdminUser,
} from "@/components/admin/admin-ui";

interface Detail {
  user: AdminUser;
  admins_count: number;
  stats: {
    entries: number;
    hours: number;
    billable_amount: number | null;
    last_active_at: string | null;
  };
}

export default function AdminUserDetail({
  userId,
  actorId,
  timezone,
}: {
  userId: string;
  actorId: string;
  timezone: string;
}): JSX.Element {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/users/${userId}`, { cache: "no-store" });
    if (res.status === 404) {
      setMissing(true);
      setDetail(null);
      return;
    }
    if (!res.ok) {
      setError("Couldn’t load this user. Try again.");
      return;
    }
    setError(null);
    setMissing(false);
    setDetail((await res.json()) as Detail);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirm = useAdminConfirm(load);
  const user = detail?.user;

  return (
    <section className="space-y-6">
      <AdminPageHeader
        title={user?.email ?? "User"}
        backHref="/admin/users"
      />
      {error ? <p className="text-body-sm text-danger" role="status">{error}</p> : null}
      {missing ? <p className="text-body-sm text-muted">That user is gone.</p> : null}
      {user && detail ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <RolePill role={user.role} />
            <StatusPill status={user.status} />
            <span className="text-body-sm text-muted">
              Created {formatCreated(user.created_at, timezone)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Entries" value={String(detail.stats.entries)} />
            <Stat label="Hours" value={`${detail.stats.hours.toFixed(2)}h`} />
            {detail.stats.billable_amount != null ? (
              <Stat label="Billable" value={detail.stats.billable_amount.toFixed(2)} />
            ) : null}
            {detail.stats.last_active_at ? (
              <Stat
                label="Last active"
                value={formatCreated(detail.stats.last_active_at, timezone)}
              />
            ) : null}
          </div>
          <DetailActions
            user={user}
            actorId={actorId}
            adminsCount={detail.admins_count}
            onAsk={confirm.ask}
          />
        </>
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

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
      <p className="text-label text-muted">{label}</p>
      <p className="mt-1 text-title-sm text-ink tabular-nums">{value}</p>
    </div>
  );
}

function DetailActions({
  user,
  actorId,
  adminsCount,
  onAsk,
}: {
  user: AdminUser;
  actorId: string;
  adminsCount: number;
  onAsk: (kind: AdminActionKind, user: AdminUser) => void;
}): JSX.Element {
  const items: { kind: AdminActionKind; label: string }[] = [
    { kind: "remove", label: "Remove" },
    user.status === "blocked"
      ? { kind: "unblock", label: "Unblock" }
      : { kind: "block", label: "Block" },
    user.role === "admin"
      ? { kind: "demote", label: "Demote" }
      : { kind: "promote", label: "Promote" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const title = guardTitle(item.kind, user, actorId, adminsCount);
        return (
          <span key={item.kind} title={title}>
            <button
              type="button"
              className={adminActionButtonClass(item.kind)}
              disabled={Boolean(title)}
              onClick={() => onAsk(item.kind, user)}
            >
              {item.label}
            </button>
          </span>
        );
      })}
    </div>
  );
}
