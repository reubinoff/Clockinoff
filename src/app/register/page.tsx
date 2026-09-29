"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mark } from "@/components/brand/Mark";

const DEFAULT_TZ = "Asia/Jerusalem";

export default function RegisterPage(): JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [timezone, setTimezone] = useState(DEFAULT_TZ);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
        const data = await res.json().catch(() => ({}));
        setError(data?.error?.message ?? "Registration failed");
        return;
      }
      router.push("/app");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Mark size={40} />
          <div>
            <h1 className="text-lg font-semibold leading-tight">Create your account</h1>
            <p className="text-sm text-muted">One account, one running timer.</p>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">Password (min 8 chars)</label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="tz">Timezone</label>
          <input
            id="tz"
            className="input"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button type="submit" className="btn btn-primary w-full" disabled={pending}>
          {pending ? "Creating…" : "Create account"}
        </button>
        <p className="text-sm text-muted text-center">
          Have an account?{" "}
          <Link className="text-accent hover:underline" href="/login">
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
