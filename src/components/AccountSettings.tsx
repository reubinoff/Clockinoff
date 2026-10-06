"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
};

export default function AccountSettings({ email, methods }: Props): JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, setPending] = useState(false);
  const connected = params.get("google") === "connected";
  const errorCode = params.get("error");
  const error =
    errorCode === "google_email_mismatch"
      ? googleEmailMismatchMessage(email)
      : errorCode === "network"
        ? GOOGLE_AUTH_ERROR_COPY.network
        : null;

  useEffect(() => {
    if (!connected) return;
    emitToast(GOOGLE_CONNECTED_TOAST);
    router.replace("/app/account");
  }, [connected, router]);

  function connectGoogle(): void {
    setPending(true);
    window.location.assign("/api/auth/google/start?intent=connect&next=%2Fapp%2Faccount");
  }

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
                <button
                  type="button"
                  className="btn btn-primary !min-h-[40px] !px-4"
                  onClick={connectGoogle}
                  disabled={pending}
                >
                  {pending ? "Connecting…" : "Connect Google"}
                </button>
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
    </section>
  );
}
