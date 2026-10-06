"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconMore } from "@/components/icons";
import AppearanceSelect from "@/components/AppearanceSelect";
import { DOCS_URL } from "@/lib/docs";

interface Props {
  email: string;
  variant: "mobile" | "compact";
}

function initialFromEmail(email: string): string {
  const trimmed = email.trim();
  if (!trimmed) return "?";
  return trimmed[0].toUpperCase();
}

export default function HeaderUserMenu({
  email,
  variant,
}: Props): JSX.Element {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const compact = variant === "compact";

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
    <div
      ref={containerRef}
      className={
        "relative " + (compact ? "hidden md:block xl:hidden" : "md:hidden")
      }
    >
      <button
        ref={buttonRef}
        type="button"
        className={
          compact
            ? "inline-flex h-8 w-8 items-center justify-center rounded-full bg-canvas-2 text-body-sm font-medium text-ink " +
              "hover:bg-border focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-ring"
            : "btn btn-ghost !min-h-[44px] !min-w-[44px] !px-2"
        }
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
      >
        {compact ? (
          <span aria-hidden>{initialFromEmail(email)}</span>
        ) : (
          <IconMore size={20} aria-hidden />
        )}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-surface shadow-card-lg p-2 z-40"
        >
          <div
            role="presentation"
            className="px-2 py-1.5 text-xs text-muted truncate"
            title={email}
          >
            {email}
          </div>
          <div role="none" className="border-t border-border mt-1 pt-1">
            <Link
              href="/app/account"
              role="menuitem"
              className="account-menu-item"
              onClick={close}
            >
              Account
            </Link>
          </div>
          {compact ? (
            <div role="none" className="border-t border-border mt-1 pt-1">
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
            </div>
          ) : null}
          {/* Same AppearanceSelect as the desktop cluster. Both commit
              `timely.appearance` and subscribe so the closed menu does
              not keep a stale Dark/Light value (#140). */}
          <div role="none" className="border-t border-border mt-1 pt-1">
            <AppearanceSelect variant="menu" />
          </div>
          <div role="none" className="border-t border-border mt-1 pt-1">
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
      )}
    </div>
  );
}
