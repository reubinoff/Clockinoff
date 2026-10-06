"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordField } from "@/components/auth/PasswordField";
import { TimezoneSelect } from "@/components/auth/TimezoneSelect";
import { AuthDivider } from "@/components/auth/AuthDivider";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { IconAlert } from "@/components/icons";
import { DEFAULT_TIMEZONE, detectTimezone } from "@/lib/timezones";
import {
  PASSWORD_COPY,
  PASSWORD_MIN_LENGTH,
  validatePassword,
} from "@/lib/password";
import { googleAuthErrorMessage } from "@/lib/google-auth-errors";
import { REGISTER_FAILURE_COPY } from "@/lib/register-copy";

function RegisterFailureMessage(): JSX.Element {
  const linkLabel = "Sign in";
  const idx = REGISTER_FAILURE_COPY.indexOf(linkLabel);
  if (idx < 0) return <>{REGISTER_FAILURE_COPY}</>;
  return (
    <>
      {REGISTER_FAILURE_COPY.slice(0, idx)}
      <Link
        href="/login"
        className="font-medium underline underline-offset-2"
      >
        {linkLabel}
      </Link>
      {REGISTER_FAILURE_COPY.slice(idx + linkLabel.length)}
    </>
  );
}

export default function RegisterPage(): JSX.Element {
  return (
    <Suspense
      fallback={
        <main className="min-h-dvh grid place-items-center bg-canvas" />
      }
    >
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm(): JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const googleErrorFromQuery = googleAuthErrorMessage(params.get("error"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [error, setError] = useState<string | null>(googleErrorFromQuery);
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimezone(detectTimezone());
    emailRef.current?.focus();
  }, []);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const pwCheck = validatePassword(password);
    if (!pwCheck.ok) {
      setError(pwCheck.message);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, timezone }),
      });
      if (!res.ok) {
        // Same string for a duplicate email and any other failure. A
        // Sign-in link is part of that string — it does not mean we
        // confirmed the address is registered or which sign-in it uses.
        setError(REGISTER_FAILURE_COPY);
        return;
      }
      router.push("/app?welcome=1");
      router.refresh();
    } catch {
      setError(REGISTER_FAILURE_COPY);
    } finally {
      setPending(false);
    }
  }

  function startGoogle(): void {
    setGooglePending(true);
    setPending(true);
    setError(null);
    window.location.href = "/api/auth/google/start?next=%2Fapp";
  }

  return (
    <AuthShell
      title="Start tracking"
      subtitle="One account. One running timer."
      footer={
        <>
          Already tracking?{" "}
          <Link className="text-accent hover:underline" href="/login">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-1">
          <label htmlFor="email" className="block text-sm font-medium text-ink">
            Email
          </label>
          <input
            id="email"
            ref={emailRef}
            className="input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "auth-error" : undefined}
            disabled={pending}
          />
        </div>
        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
          helper={PASSWORD_COPY.helper}
          describedById={error ? "auth-error" : undefined}
        />
        <TimezoneSelect
          id="timezone"
          label="Timezone"
          value={timezone}
          onChange={setTimezone}
          required
        />
        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={pending}
        >
          {pending && !googlePending ? "Creating…" : "Create account"}
        </button>
        <AuthDivider />
        <GoogleButton pending={googlePending} onStart={startGoogle} />
        {error ? (
          <p
            id="auth-error"
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            <IconAlert size={16} className="mt-0.5 shrink-0" />
            <span>
              {error === REGISTER_FAILURE_COPY ? (
                <RegisterFailureMessage />
              ) : (
                error
              )}
            </span>
          </p>
        ) : null}
      </form>
    </AuthShell>
  );
}
