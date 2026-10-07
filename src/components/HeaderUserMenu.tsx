"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconMore } from "@/components/icons";
import AppearanceSelect from "@/components/AppearanceSelect";
import { DOCS_URL } from "@/lib/docs";

interface Props {
  email: string;
  isAdmin?: boolean;
}

function initialFromEmail(email: string): string {
  const trimmed = email.trim();
  if (!trimmed) return "?";
  return trimmed[0].toUpperCase();
}

/**
 * One account trigger for every width (#190).
 * ≥1280 shows a truncated email, 768–1279 an initial, and below that
 * the existing ⋯. The menu is the same at each width: Account, Docs,
 * Admin (admins only), then Appearance, then Log out.
 */
export default function HeaderUserMenu({
  email,
  isAdmin = false,
}: Props): JSX.Element {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        buttonRef.current?.focus();
      }
    }
    function onClick(e: MouseEvent): void {
      if (!containerRef.current) return;
      if (containerRef.current.contains(e.target as Node)) return;
      close();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, close]);

  async function logout(): Promise<void> {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      close();
      router.push("/login");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        ref={buttonRef}
        type="button"
        title={email}
        className={
          "inline-flex shrink-0 items-center justify-center border border-transparent " +
          "min-h-[44px] min-w-[44px] rounded-xl bg-transparent px-2 text-muted " +
          "hover:bg-canvas-2 hover:text-ink " +
          "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-ring " +
          "md:h-8 md:w-8 md:min-h-8 md:min-w-8 md:rounded-full md:bg-canvas-2 md:px-0 " +
          "md:text-body-sm md:font-medium md:text-ink md:hover:bg-border " +
          "xl:h-8 xl:w-auto xl:max-w-[11.25rem] xl:min-w-0 xl:shrink xl:overflow-hidden " +
          "xl:rounded-lg xl:bg-transparent xl:px-2 xl:font-normal xl:text-muted " +
          "xl:hover:bg-canvas-2 xl:hover:text-ink"
        }
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu, ${email}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="md:hidden" aria-hidden>
          <IconMore size={20} />
        </span>
        <span className="hidden md:inline xl:hidden" aria-hidden>
          {initialFromEmail(email)}
        </span>
        <span className="hidden min-w-0 truncate xl:inline">{email}</span>
      </button>
      <div
        role="menu"
        aria-label="Account"
        hidden={!open}
        className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-surface shadow-card-lg p-2 z-40"
      >
        <div
          role="presentation"
          className="px-2 py-1.5 text-xs text-muted truncate border-b border-border"
          title={email}
        >
          {email}
        </div>
        <Link
          href="/app/account"
          role="menuitem"
          className="account-menu-item mt-1"
          onClick={close}
        >
          Account
        </Link>
        <a
          role="menuitem"
          className="account-menu-item"
          href={DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={close}
        >
          Docs
        </a>
        {isAdmin ? (
          <Link
            href="/admin"
            role="menuitem"
            className="account-menu-item"
            onClick={close}
          >
            Admin
          </Link>
        ) : null}
        <div role="separator" className="my-1 border-t border-border" />
        {/* Stays mounted while the menu is closed (`hidden`) so a stored
            appearance change still applies without a second header control. */}
        <AppearanceSelect variant="menu" />
        <div role="separator" className="my-1 border-t border-border" />
        <button
          type="button"
          role="menuitem"
          className="account-menu-item"
          onClick={logout}
          disabled={pending}
        >
          {pending ? "Signing out…" : "Log out"}
        </button>
      </div>
    </div>
  );
}
