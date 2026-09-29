import Link from "next/link";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, getSessionUser } from "@/server/auth/session";
import TimerBar from "@/components/TimerBar";
import LogoutButton from "@/components/LogoutButton";
import AppNav from "@/components/AppNav";
import BottomTabBar from "@/components/BottomTabBar";
import HeaderUserMenu from "@/components/HeaderUserMenu";
import Toaster from "@/components/Toaster";
import { Mark } from "@/components/brand/Mark";
import { DOCS_URL } from "@/lib/docs";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}): Promise<JSX.Element> {
  const sid = cookies().get(SESSION_COOKIE)?.value;
  const user = await getSessionUser(sid);
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <header className="border-b border-border bg-surface sticky top-0 z-20">
        <div className="mx-auto max-w-6xl px-4 py-2.5 flex items-center gap-6">
          <Link
            href="/app"
            className="inline-flex items-center gap-2 font-semibold tracking-tight text-ink shrink-0"
            aria-label="Timely home"
          >
            <Mark size={24} />
            <span className="text-sm">Timely</span>
          </Link>
          <div className="hidden md:block">
            <AppNav />
          </div>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span
              className="text-muted max-w-[180px] truncate hidden md:inline"
              title={user.email}
            >
              {user.email}
            </span>
            <a
              className="text-muted hover:text-ink underline underline-offset-2"
              href={DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open user documentation in a new tab"
            >
              Docs
            </a>
            <div className="hidden md:block">
              <LogoutButton />
            </div>
            <HeaderUserMenu email={user.email} />
          </div>
        </div>
        <div
          className={
            // Docked bottom on mobile (above tab bar), inline in header on desktop.
            // safe-area-inset-bottom only lives on the tab bar; the dock sits
            // exactly above it so the inset is not applied twice.
            "md:static md:z-auto md:inset-x-auto md:bottom-auto " +
            "fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 " +
            "shadow-[0_-1px_2px_rgba(17,24,39,0.04)] md:shadow-none"
          }
        >
          <TimerBar timezone={user.timezone} />
        </div>
      </header>
      <main
        className={
          "flex-1 mx-auto max-w-6xl w-full px-4 py-6 " +
          // Reserve room for docked timer + bottom tab bar on mobile.
          "pb-[calc(16rem+env(safe-area-inset-bottom))] md:pb-6"
        }
      >
        {children}
      </main>
      <footer className="hidden md:block border-t border-border py-4 text-center text-xs text-muted">
        <span>Timely · {user.timezone}</span>
        <span aria-hidden="true"> · </span>
        <a
          className="hover:text-ink underline underline-offset-2"
          href={DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Docs
        </a>
      </footer>
      <BottomTabBar />
      <Toaster />
    </div>
  );
}
