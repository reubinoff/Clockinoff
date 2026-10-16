"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import HeaderUserMenu, {
  ACCOUNT_TRIGGER_SIZE_CLASS,
} from "@/components/HeaderUserMenu";

type Phase =
  | { status: "pending" }
  | { status: "signed-out" }
  | { status: "signed-in"; email: string; isAdmin: boolean };

/**
 * Below xl the signed-out links are 163.5px (Sign in + gap-4 + Create
 * account at 390). The placeholder and the account trigger are narrower,
 * so the slot reserves this width and nothing grows when the links appear.
 * At xl the slot stays the account trigger's max width.
 */
const SLOT_CLASS =
  "flex shrink-0 items-center justify-end min-w-[10.21875rem] xl:min-w-0 xl:w-[11.25rem]";

const PLACEHOLDER_CLASS =
  "skeleton-pulse inline-block shrink-0 rounded-xl md:rounded-full " +
  "xl:w-[11.25rem] xl:rounded-lg " +
  ACCOUNT_TRIGGER_SIZE_CLASS;

function readSignedIn(body: unknown): { email: string; isAdmin: boolean } | null {
  if (!body || typeof body !== "object") return null;
  const record = body as { email?: unknown; role?: unknown };
  if (typeof record.email !== "string") return null;
  const email = record.email.trim();
  if (!email) return null;
  return { email, isAdmin: record.role === "admin" };
}

function SignedOutLinks(): JSX.Element {
  return (
    <div
      data-docs-auth="signed-out"
      className={SLOT_CLASS + " min-h-[44px] gap-4 text-sm md:min-h-8"}
    >
      <Link
        href="/login"
        className="whitespace-nowrap text-muted hover:text-ink underline underline-offset-2"
      >
        Sign in
      </Link>
      <Link
        href="/register"
        className="whitespace-nowrap text-ink hover:text-accent underline underline-offset-2"
      >
        Create account
      </Link>
    </div>
  );
}

/**
 * Account corner of the public `/docs` header (#232).
 *
 * The page itself stays static. This slot never receives a session or an
 * email from the server. It asks `/api/auth/me` in the browser
 * (`cache: "no-store"`) and only then paints the account menu. Until that
 * returns, the slot is a placeholder the same size as the trigger. A 401
 * or any failed check falls back to Sign in / Create account.
 */
export default function DocsAuthSlot(): JSX.Element {
  const [phase, setPhase] = useState<Phase>({ status: "pending" });

  useEffect(() => {
    const ac = new AbortController();
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          signal: ac.signal,
          headers: { accept: "application/json" },
        });
        if (!active) return;
        if (!res.ok) {
          setPhase({ status: "signed-out" });
          return;
        }
        const signedIn = readSignedIn(await res.json());
        if (!active) return;
        setPhase(
          signedIn
            ? { status: "signed-in", ...signedIn }
            : { status: "signed-out" },
        );
      } catch {
        if (!active) return;
        setPhase({ status: "signed-out" });
      }
    })();
    return () => {
      active = false;
      ac.abort();
    };
  }, []);

  if (phase.status === "signed-in") {
    return (
      <div data-docs-auth="signed-in" className={SLOT_CLASS}>
        <HeaderUserMenu email={phase.email} isAdmin={phase.isAdmin} />
      </div>
    );
  }

  if (phase.status === "signed-out") {
    return <SignedOutLinks />;
  }

  return (
    <div
      data-docs-auth="pending"
      className={SLOT_CLASS}
      aria-busy="true"
      aria-label="Loading account"
    >
      <span
        data-docs-auth-placeholder="true"
        aria-hidden="true"
        className={PLACEHOLDER_CLASS}
      />
    </div>
  );
}
