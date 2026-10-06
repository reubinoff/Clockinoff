"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordField } from "@/components/auth/PasswordField";
import { AuthDivider } from "@/components/auth/AuthDivider";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { GooglePasswordAccountBanner } from "@/components/auth/GooglePasswordAccountBanner";
import { IconAlert } from "@/components/icons";
import {
  googleAuthErrorMessage,
  googlePasswordAccountPrefillEmail,
  isGooglePasswordAccountError,
} from "@/lib/google-auth-errors";

export default function LoginPage(): JSX.Element {
  return (
    <Suspense
      fallback={
        <main className="min-h-dvh grid place-items-center bg-canvas" />
      }
    >
      <LoginForm />
    </Suspense>
  );
}

function LoginForm(): JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/app";
  const errorCode = params.get("error");
  const showPasswordAccountBanner = isGooglePasswordAccountError(errorCode);
  const googleErrorFromQuery = googleAuthErrorMessage(errorCode);
  const prefilledEmail = googlePasswordAccountPrefillEmail(params.get("email"));
  const [email, setEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(googleErrorFromQuery);
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showPasswordAccountBanner) return;
    emailRef.current?.focus();
  }, [showPasswordAccountBanner]);

  function focusPasswordAndPrefill(): void {
    if (!email.trim() && prefilledEmail) setEmail(prefilledEmail);
    passwordRef.current?.focus();
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg =
          data && typeof data === "object" && data.error?.message
            ? String(data.error.message)
            : "Something went wrong. Try again.";
        setError(msg);
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  function startGoogle(): void {
    // Google button handles its own "connecting" state; also disable the
    // email/password form while we navigate away so no double-tap can race
    // the OAuth round-trip.
    setGooglePending(true);
    setPending(true);
    setError(null);
    const target = `/api/auth/google/start?next=${encodeURIComponent(next)}`;
    window.location.href = target;
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to keep your pulse going."
      footer={
        <>
          New here?{" "}
          <Link className="text-accent hover:underline" href="/register">
            Create an account
          </Link>
        </>
      }
    >
      {showPasswordAccountBanner ? (
        <GooglePasswordAccountBanner onSignInWithPassword={focusPasswordAndPrefill} />
      ) : null}
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
          autoComplete="current-password"
          required
          describedById={error ? "auth-error" : undefined}
          inputRef={passwordRef}
        />
        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={pending}
        >
          {pending && !googlePending ? "Signing in…" : "Log in"}
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
            <span>{error}</span>
          </p>
        ) : null}
      </form>
    </AuthShell>
  );
}
