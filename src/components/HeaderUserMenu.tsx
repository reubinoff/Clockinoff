"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconMore } from "@/components/icons";
import AppearanceSelect from "@/components/AppearanceSelect";

interface Props {
  email: string;
}

export default function HeaderUserMenu({ email }: Props): JSX.Element {
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
    <div ref={containerRef} className="relative md:hidden">
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-ghost !min-h-[44px] !min-w-[44px] !px-2"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
      >
        <IconMore size={20} aria-hidden />
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
              className="btn btn-ghost w-full justify-start !min-h-[44px]"
              onClick={close}
            >
              Account
            </Link>
          </div>
          {/* V2-10 Dark #10: Appearance lives in the mobile account
              overflow, above Log out, alongside the desktop pref. Same
              locked `timely.appearance` key backs both. */}
          <div role="none" className="border-t border-border mt-1 pt-1">
            <AppearanceSelect variant="menu" />
          </div>
          <div role="none" className="border-t border-border mt-1 pt-1">
            <button
              type="button"
              role="menuitem"
              className="btn btn-ghost w-full justify-start !min-h-[44px]"
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
