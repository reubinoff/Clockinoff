"use client";

import {
  GOOGLE_PASSWORD_ACCOUNT_COPY,
  GOOGLE_PASSWORD_ACCOUNT_CTA,
} from "@/lib/google-auth-errors";

type Props = {
  onSignInWithPassword: () => void;
};

export function GooglePasswordAccountBanner({ onSignInWithPassword }: Props): JSX.Element {
  return (
    <div
      role="status"
      className="rounded-xl border border-accent/25 bg-accent-soft px-3 py-3 space-y-3"
      style={{ boxShadow: "inset 3px 0 0 var(--color-accent)" }}
    >
      <p className="text-sm text-ink">{GOOGLE_PASSWORD_ACCOUNT_COPY}</p>
      <button
        type="button"
        className="btn auth-secondary-cta w-full min-h-[44px]!"
        onClick={onSignInWithPassword}
      >
        {GOOGLE_PASSWORD_ACCOUNT_CTA}
      </button>
    </div>
  );
}
