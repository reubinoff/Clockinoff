"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ADMIN_GUARD, adminActionErrorMessage } from "@/lib/admin-copy";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import { emitToast } from "@/lib/events";

export interface AdminUser {
  id: string;
  email: string;
  role: "user" | "admin";
  status: "active" | "blocked";
  created_at: string;
  blocked_at: string | null;
  entries_count: number;
}

export type AdminActionKind = "remove" | "block" | "unblock" | "promote" | "demote";

export function formatCreated(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export function activityLabel(count: number): string {
  return `${count} ${count === 1 ? "entry" : "entries"}`;
}

export function roleLabel(role: AdminUser["role"]): string {
  return role === "admin" ? "Admin" : "User";
}

export function statusLabel(status: AdminUser["status"]): string {
  return status === "blocked" ? "Blocked" : "Active";
}

export function RolePill({ role }: { role: AdminUser["role"] }): JSX.Element {
  const admin = role === "admin";
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs " +
        (admin ? "bg-accent-soft text-ink" : "bg-canvas-2 text-ink-2")
      }
    >
      {roleLabel(role)}
    </span>
  );
}

export function StatusPill({ status }: { status: AdminUser["status"] }): JSX.Element {
  const blocked = status === "blocked";
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs " +
        (blocked ? "bg-danger-soft text-danger" : "text-muted")
      }
    >
      {statusLabel(status)}
    </span>
  );
}

export function AdminPageHeader({
  title,
  subcopy,
  backHref,
}: {
  title: string;
  subcopy?: string;
  backHref?: string;
}): JSX.Element {
  const pathname = usePathname() ?? "/admin";
  const links = [
    { href: "/admin", label: "Overview", active: pathname === "/admin" },
    {
      href: "/admin/users",
      label: "Users",
      active: pathname === "/admin/users" || pathname.startsWith("/admin/users/"),
    },
  ];
  return (
    <header className="space-y-3">
      {backHref ? (
        <Link
          href={backHref}
          className="inline-flex text-body-sm text-muted hover:text-ink"
        >
          Back to Users
        </Link>
      ) : null}
      <div>
        <h1 className="text-title text-ink break-all">{title}</h1>
        {subcopy ? <p className="mt-1 text-body-sm text-muted">{subcopy}</p> : null}
      </div>
      <nav aria-label="Admin" className="overflow-x-auto">
        <ul className="inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={link.active ? "page" : undefined}
                className={
                  "inline-flex items-center justify-center min-h-[36px] px-3 rounded-full text-body-sm whitespace-nowrap transition-colors " +
                  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-ring " +
                  (link.active
                    ? "bg-accent-soft text-ink"
                    : "text-muted hover:text-ink hover:bg-canvas-2")
                }
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

const DIALOG: Record<
  AdminActionKind,
  { title: string; body: string; confirm: string; tone: "danger" | "accent" | "secondary" }
> = {
  remove: {
    title: "Remove this user?",
    body: "This permanently deletes their account and data. This can’t be undone.",
    confirm: "Remove",
    tone: "danger",
  },
  block: {
    title: "Block this user?",
    body: "They won’t be able to sign in. Active sessions end now.",
    confirm: "Block",
    tone: "danger",
  },
  unblock: {
    title: "Unblock this user?",
    body: "They can sign in again.",
    confirm: "Unblock",
    tone: "accent",
  },
  promote: {
    title: "Promote to admin?",
    body: "They’ll get access to Admin — users and instance stats.",
    confirm: "Promote",
    tone: "accent",
  },
  demote: {
    title: "Demote from admin?",
    body: "They’ll lose Admin access. Their account stays active.",
    confirm: "Demote",
    tone: "secondary",
  },
};

export function AdminConfirmDialog({
  user,
  kind,
  timeZone,
  pending,
  onCancel,
  onConfirm,
}: {
  user: AdminUser;
  kind: AdminActionKind;
  timeZone: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element {
  const copy = DIALOG[kind];
  const cancelRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);
  useEffect(() => {
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent): void {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onCancelRef.current();
    }
    document.addEventListener("keydown", onKey);
    const unlock = lockBodyScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlock();
    };
  }, []);

  function onPanelKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key !== "Tab" || !panelRef.current) return;
    const nodes = [
      ...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled])"),
    ];
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const confirmClass =
    copy.tone === "danger"
      ? "btn btn-danger-fill"
      : copy.tone === "accent"
        ? "btn btn-accent-fill"
        : "btn btn-secondary-solid";

  const created = formatCreated(user.created_at, timeZone);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 sheet-backdrop-enter"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-confirm-title"
        className="w-full max-w-md rounded-2xl bg-surface shadow-card-lg sheet-panel-enter"
        onKeyDown={onPanelKeyDown}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4">
          <h2 id="admin-confirm-title" className="text-title-sm text-ink">
            {copy.title}
          </h2>
          <p className="mt-2 text-body-sm text-ink-2">{copy.body}</p>
          <dl className="mt-4 space-y-3">
            <PreviewRow label="Email" value={user.email} />
            <PreviewRow label="Role" value={roleLabel(user.role)} />
            <PreviewRow label="Status" value={statusLabel(user.status)} />
            {created ? <PreviewRow label="Created" value={created} /> : null}
          </dl>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button ref={cancelRef} type="button" className="btn" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button type="button" className={confirmClass} onClick={onConfirm} disabled={pending}>
            {copy.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 text-body-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink break-all">{value}</dd>
    </div>
  );
}

export function guardTitle(
  kind: AdminActionKind,
  user: AdminUser,
  actorId: string,
  adminsCount: number,
): string | undefined {
  const self = user.id === actorId;
  const sole = user.role === "admin" && adminsCount <= 1;
  if (kind === "remove") {
    if (sole) return ADMIN_GUARD.lastAdmin;
    if (self) return ADMIN_GUARD.selfRemove;
  }
  if (kind === "demote") {
    if (sole) return ADMIN_GUARD.lastAdminDemote;
    if (self) return ADMIN_GUARD.selfDemote;
  }
  if (kind === "block" && self) return ADMIN_GUARD.selfBlock;
  return undefined;
}

const ACTION_PATH: Record<AdminActionKind, { method: string; suffix: string }> = {
  remove: { method: "DELETE", suffix: "" },
  block: { method: "POST", suffix: "/block" },
  unblock: { method: "POST", suffix: "/unblock" },
  promote: { method: "POST", suffix: "/promote" },
  demote: { method: "POST", suffix: "/demote" },
};

export async function runAdminAction(userId: string, kind: AdminActionKind): Promise<boolean> {
  const spec = ACTION_PATH[kind];
  const res = await fetch(`/api/admin/users/${userId}${spec.suffix}`, {
    method: spec.method,
  });
  if (res.ok) return true;
  let message: string | undefined;
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    message = body.error?.message;
  } catch {
    message = undefined;
  }
  emitToast(adminActionErrorMessage(message));
  return false;
}

export function UserActions({
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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent): void {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
    <div ref={ref} className="relative flex justify-end">
      <button
        type="button"
        className="btn btn-ghost !h-8 !min-h-[32px] !w-8 !min-w-[32px] !px-0"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Actions"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden className="text-lg leading-none">
          ⋯
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-44 rounded-xl border border-border bg-surface p-1 shadow-card-lg"
        >
          <Link
            href={`/admin/users/${user.id}`}
            role="menuitem"
            className="account-menu-item"
            onClick={() => setOpen(false)}
          >
            View
          </Link>
          {items.map((item) => {
            const title = guardTitle(item.kind, user, actorId, adminsCount);
            return (
              <span key={item.kind} title={title} className="block">
                <button
                  type="button"
                  role="menuitem"
                  className="account-menu-item w-full"
                  disabled={Boolean(title)}
                  onClick={() => {
                    setOpen(false);
                    onAsk(item.kind, user);
                  }}
                >
                  {item.label}
                </button>
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function useAdminConfirm(onDone: () => void): {
  pendingUser: AdminUser | null;
  pendingKind: AdminActionKind | null;
  busy: boolean;
  ask: (kind: AdminActionKind, user: AdminUser) => void;
  cancel: () => void;
  confirm: () => Promise<void>;
} {
  const router = useRouter();
  const [pendingUser, setPendingUser] = useState<AdminUser | null>(null);
  const [pendingKind, setPendingKind] = useState<AdminActionKind | null>(null);
  const [busy, setBusy] = useState(false);

  function ask(kind: AdminActionKind, user: AdminUser): void {
    setPendingUser(user);
    setPendingKind(kind);
  }
  function cancel(): void {
    if (busy) return;
    setPendingUser(null);
    setPendingKind(null);
  }
  async function confirm(): Promise<void> {
    if (!pendingUser || !pendingKind) return;
    setBusy(true);
    try {
      const ok = await runAdminAction(pendingUser.id, pendingKind);
      if (!ok) return;
      const removed = pendingKind === "remove";
      const id = pendingUser.id;
      setPendingUser(null);
      setPendingKind(null);
      if (removed && typeof window !== "undefined" && window.location.pathname.endsWith(`/${id}`)) {
        router.push("/admin/users");
        return;
      }
      onDone();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return { pendingUser, pendingKind, busy, ask, cancel, confirm };
}
