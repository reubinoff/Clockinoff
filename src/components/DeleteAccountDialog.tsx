"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { confirmEmailMatches } from "@/lib/confirm-email";
import { lockBodyScroll } from "@/lib/body-scroll-lock";

export const DELETE_ACCOUNT_COPY = {
  title: "Delete your account?",
  body: "This permanently deletes your account and data. This can’t be undone.",
  bullets: [
    "Your time entries and reports",
    "Projects, clients, and tags",
    "You’ll be signed out on every device",
  ],
  zoneHelper: "Permanently delete your account and all of your data. This can’t be undone.",
  kept: "Nothing is kept. This can’t be undone.",
  reauthNeeded: "For security, sign in with Google again to continue.",
  googleCta: "Sign in with Google again",
  passwordLabel: "Password",
  emailLabel: "Type your email to confirm",
  emailHelper: "Use the address for this account.",
  cancel: "Cancel",
  confirm: "Delete account",
  pending: "Deleting…",
  emailMismatch: "That email doesn’t match your account. Check it and try again.",
  wrongPassword: "Wrong password. Try again.",
  reauthRequired: "For security, sign in with Google again, then try deleting.",
  reauthStale:
    "We couldn’t confirm it was you. Please sign in with Google again to delete your account.",
  rateLimit: "Too many attempts. Wait a few minutes and try again.",
  admin: "Admins can’t delete their own account.",
  failed: "We couldn’t finish deleting your account. Nothing was removed — try again.",
  network: "Couldn’t reach the server. Check your connection and try again.",
  generic: "Couldn’t delete your account. Try again.",
} as const;

export const GOOGLE_REAUTH_HREF =
  "/api/auth/google/start?intent=reauth&next=%2Fapp%2Faccount%3Fdelete%3D1";

export function deleteAccountErrorCopy(status: number, message: string): string {
  if (status === 400) return DELETE_ACCOUNT_COPY.emailMismatch;
  if (status === 401 && message === "reauth_required") return DELETE_ACCOUNT_COPY.reauthRequired;
  if (status === 401) return DELETE_ACCOUNT_COPY.wrongPassword;
  if (status === 429) return DELETE_ACCOUNT_COPY.rateLimit;
  if (status === 403 && /admin/i.test(message)) return DELETE_ACCOUNT_COPY.admin;
  if (status === 403) return DELETE_ACCOUNT_COPY.generic;
  if (status >= 500) return DELETE_ACCOUNT_COPY.failed;
  return DELETE_ACCOUNT_COPY.generic;
}

interface Props {
  email: string;
  hasPassword: boolean;
  sessionFresh: boolean;
  reauthAlert: boolean;
  onClose: () => void;
}

export default function DeleteAccountDialog({
  email,
  hasPassword,
  sessionFresh,
  reauthAlert,
  onClose,
}: Props): JSX.Element {
  const router = useRouter();
  const googleOnly = !hasPassword;
  const [password, setPassword] = useState("");
  const [typedEmail, setTypedEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    reauthAlert && googleOnly && !sessionFresh ? DELETE_ACCOUNT_COPY.reauthRequired : null,
  );
  const [forceReauth, setForceReauth] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const googleRef = useRef<HTMLAnchorElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const pendingRef = useRef(false);
  const lock = useRef(false);
  const focusPassword = useRef(false);
  const focusGoogle = useRef(false);

  const needsReauth = googleOnly && (!sessionFresh || forceReauth || error === DELETE_ACCOUNT_COPY.reauthRequired);
  const emailOk = confirmEmailMatches(email, typedEmail);
  const canDelete = !needsReauth && emailOk && (hasPassword ? password.length > 0 : true) && !pending;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent): void {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (pendingRef.current || lock.current) return;
      onCloseRef.current();
    }
    document.addEventListener("keydown", onKey);
    const unlock = lockBodyScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlock();
    };
  }, []);

  useEffect(() => {
    if (focusPassword.current && error === DELETE_ACCOUNT_COPY.wrongPassword) {
      focusPassword.current = false;
      passwordRef.current?.focus();
    }
    if (focusGoogle.current && error === DELETE_ACCOUNT_COPY.reauthRequired) {
      focusGoogle.current = false;
      googleRef.current?.focus();
    }
  }, [error, needsReauth]);

  function close(): void {
    if (pending || lock.current) return;
    setPassword("");
    onClose();
  }

  function onPanelKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key !== "Tab" || !panelRef.current) return;
    const nodes = [
      ...panelRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), a[href]",
      ),
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

  async function confirm(): Promise<void> {
    if (!canDelete || lock.current) return;
    lock.current = true;
    setPending(true);
    setError(null);
    let succeeded = false;
    try {
      const res = await fetch("/api/auth/me", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          hasPassword
            ? { password, confirmEmail: typedEmail }
            : { confirmEmail: typedEmail },
        ),
      });
      if (res.status === 204) {
        succeeded = true;
        router.push("/login?deleted=1");
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => null);
      const message =
        data && typeof data === "object" && data.error && typeof data.error.message === "string"
          ? data.error.message
          : "";
      const copy = deleteAccountErrorCopy(res.status, message);
      setPassword("");
      if (copy === DELETE_ACCOUNT_COPY.wrongPassword) focusPassword.current = true;
      if (copy === DELETE_ACCOUNT_COPY.reauthRequired) {
        focusGoogle.current = true;
        setForceReauth(true);
      }
      setError(copy);
    } catch {
      setPassword("");
      setError(DELETE_ACCOUNT_COPY.network);
    } finally {
      if (!succeeded) {
        lock.current = false;
        setPending(false);
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 sheet-backdrop-enter"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        aria-busy={pending || undefined}
        className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-surface shadow-card-lg sheet-panel-enter"
        onKeyDown={onPanelKeyDown}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4">
          <h2 id="delete-account-title" className="text-title-sm text-ink">
            {DELETE_ACCOUNT_COPY.title}
          </h2>
          <p className="mt-2 text-body-sm text-ink-2">{DELETE_ACCOUNT_COPY.body}</p>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-body-sm text-ink">
            {DELETE_ACCOUNT_COPY.bullets.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-3 text-body-sm text-muted">{DELETE_ACCOUNT_COPY.kept}</p>

          {needsReauth ? (
            <div className="mt-4 space-y-3 rounded-xl border border-border bg-canvas-2 p-3">
              <p className="text-body-sm text-ink-2">{DELETE_ACCOUNT_COPY.reauthNeeded}</p>
              <GoogleButton
                href={GOOGLE_REAUTH_HREF}
                label={DELETE_ACCOUNT_COPY.googleCta}
                anchorRef={googleRef}
              />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {hasPassword ? (
                <div className="space-y-1">
                  <label htmlFor="delete-account-password" className="block text-sm font-medium text-ink">
                    {DELETE_ACCOUNT_COPY.passwordLabel}
                  </label>
                  <input
                    id="delete-account-password"
                    ref={passwordRef}
                    className="input"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    disabled={pending}
                  />
                </div>
              ) : null}
              <div className="space-y-1">
                <label htmlFor="delete-account-email" className="block text-sm font-medium text-ink">
                  {DELETE_ACCOUNT_COPY.emailLabel}
                </label>
                <input
                  id="delete-account-email"
                  className="input"
                  type="email"
                  autoComplete="off"
                  placeholder={email}
                  value={typedEmail}
                  onChange={(e) => setTypedEmail(e.target.value)}
                  disabled={pending}
                  aria-describedby="delete-account-email-help"
                />
                <p id="delete-account-email-help" className="text-xs text-muted">
                  {DELETE_ACCOUNT_COPY.emailHelper}
                </p>
              </div>
            </div>
          )}

          {error ? (
            <p role="alert" className="mt-3 text-body-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            className="btn w-full sm:w-auto"
            onClick={close}
            disabled={pending}
          >
            {DELETE_ACCOUNT_COPY.cancel}
          </button>
          {needsReauth ? null : (
            <button
              type="button"
              className="btn btn-danger-fill w-full sm:w-auto"
              onClick={() => void confirm()}
              disabled={!canDelete}
            >
              {pending ? DELETE_ACCOUNT_COPY.pending : DELETE_ACCOUNT_COPY.confirm}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
