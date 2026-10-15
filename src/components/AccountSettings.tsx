"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DeleteAccountDialog, { DELETE_ACCOUNT_COPY } from "@/components/DeleteAccountDialog";
import { emitToast } from "@/lib/events";
import {
  GOOGLE_AUTH_ERROR_COPY,
  GOOGLE_CONNECTED_TOAST,
  googleEmailMismatchMessage,
} from "@/lib/google-auth-errors";

type Methods = {
  hasPassword: boolean;
  googleConnected: boolean;
  googleEmail: string | null;
};

type Props = {
  email: string;
  methods: Methods;
  isAdmin: boolean;
  /** Google-only self-delete window: sessions.created_at within five minutes. */
  sessionFresh: boolean;
};

const CONNECT_GOOGLE_HREF =
  "/api/auth/google/start?intent=connect&next=%2Fapp%2Faccount";

export default function AccountSettings({
  email,
  methods,
  isAdmin,
  sessionFresh,
}: Props): JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const connected = params.get("google") === "connected";
  const deleteRequested = params.get("delete") === "1";
  const errorCode = params.get("error");
  const error =
    errorCode === "google_email_mismatch"
      ? googleEmailMismatchMessage(email)
      : errorCode === "network"
        ? GOOGLE_AUTH_ERROR_COPY.network
        : null;
  const [open, setOpen] = useState(false);
  const [staleReturn, setStaleReturn] = useState(false);
  const [handledDelete, setHandledDelete] = useState(false);
  if (deleteRequested && !handledDelete) {
    setHandledDelete(true);
    const googleOnly = !methods.hasPassword;
    if (!isAdmin && googleOnly && sessionFresh) setOpen(true);
    else if (!isAdmin && googleOnly && !sessionFresh) setStaleReturn(true);
  }

  useEffect(() => {
    if (!connected && !deleteRequested) return;
    if (connected) emitToast(GOOGLE_CONNECTED_TOAST);
    router.replace("/app/account");
  }, [connected, deleteRequested, router]);

  return (
    <section className="space-y-4 max-w-xl">
      <div>
        <h1 className="text-title text-ink">Account</h1>
        <p className="text-body-sm text-muted">Sign-in methods for {email}.</p>
      </div>
      <div className="card p-4 space-y-4">
        <h2 className="text-sm font-medium text-ink">Sign-in methods</h2>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ink">Password · {methods.hasPassword ? "On" : "Off"}</span>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-3 text-sm">
            {methods.googleConnected ? (
              <span className="text-ink">Google · connected</span>
            ) : (
              <>
                <span className="text-ink">Google</span>
                <a
                  href={CONNECT_GOOGLE_HREF}
                  className="btn btn-primary !min-h-[40px] !px-4"
                >
                  Connect Google
                </a>
              </>
            )}
          </div>
          {methods.googleConnected && methods.googleEmail ? (
            <p className="text-xs text-muted">{methods.googleEmail}</p>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <div className="mt-8">
        <h2 className="text-sm font-medium text-ink">Danger zone</h2>
        <p className="mt-1 text-body-sm text-muted">
          {isAdmin ? DELETE_ACCOUNT_COPY.admin : DELETE_ACCOUNT_COPY.zoneHelper}
        </p>
        {staleReturn && !isAdmin ? (
          <p role="alert" className="mt-2 text-body-sm text-danger">
            {DELETE_ACCOUNT_COPY.reauthRequired}
          </p>
        ) : null}
        <button
          type="button"
          className="btn btn-danger mt-3"
          disabled={isAdmin}
          title={isAdmin ? DELETE_ACCOUNT_COPY.admin : undefined}
          onClick={() => {
            if (!isAdmin) setOpen(true);
          }}
        >
          Delete account
        </button>
      </div>
      {open && !isAdmin ? (
        <DeleteAccountDialog
          email={email}
          hasPassword={methods.hasPassword}
          sessionFresh={sessionFresh}
          reauthAlert={staleReturn}
          onClose={() => {
            setOpen(false);
            setStaleReturn(false);
          }}
        />
      ) : null}
    </section>
  );
}
