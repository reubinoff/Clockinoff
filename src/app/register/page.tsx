"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordField } from "@/components/auth/PasswordField";
import { TimezoneSelect } from "@/components/auth/TimezoneSelect";
import { IconAlert } from "@/components/icons";
import { DEFAULT_TIMEZONE, detectTimezone } from "@/lib/timezones";

export default function RegisterPage(): JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimezone(detectTimezone());
    emailRef.current?.focus();
  }, []);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, timezone }),
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
      router.push("/app?welcome=1");
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
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
          />
        </div>
        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={8}
          required
          helper="At least 8 characters"
          describedById={error ? "auth-error" : undefined}
        />
        <TimezoneSelect
          id="timezone"
          label="Timezone"
          value={timezone}
          onChange={setTimezone}
          required
        />
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
        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={pending}
        >
          {pending ? "Creating…" : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}
