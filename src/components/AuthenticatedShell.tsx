import Link from "next/link";
import type { ReactNode } from "react";
import AppNav from "@/components/AppNav";
import BottomTabBar from "@/components/BottomTabBar";
import HeaderUserMenu from "@/components/HeaderUserMenu";
import Toaster from "@/components/Toaster";
import { AppMain, TimerDockSlot } from "@/components/AppShell";
import {
  RunningTimerChip,
  RunningTimerProvider,
} from "@/components/RunningTimerProvider";
import { Mark } from "@/components/brand/Mark";
import { DOCS_URL } from "@/lib/docs";
import type { SessionUser } from "@/server/auth/session";

export default function AuthenticatedShell({
  user,
  children,
}: {
  user: SessionUser;
  children: ReactNode;
}): JSX.Element {
  const isAdmin = user.role === "admin";
  return (
    <RunningTimerProvider>
    <div className="min-h-screen flex flex-col bg-canvas min-w-0">
      {/* Shell B: sticky chrome wrapper is header + dock so #99's
          `--app-header-h` measures both. The <header> itself is the thin
          brand/nav/account row only — the dock is a sibling band under it,
          not a child of the header element. */}
      <div
        className="sticky top-0 z-20 w-full min-w-0 left-0 right-0"
        data-app-header="true"
      >
        <header className="w-full min-w-0 border-b border-border bg-surface">
          <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-nowrap items-center gap-3 px-4 py-2">
            <Link
              href="/app"
              className="inline-flex items-center gap-2 font-semibold tracking-tight text-ink shrink-0"
              aria-label="Clockinoff home"
            >
              <Mark size={24} />
              <span className="text-sm">Clockinoff</span>
            </Link>
            {/* Nav stays shrink-0. A shrunk nowrap nav paints outside its
                flex item and widens the page (the #141 768 scroll). The
                account side shrinks instead; from md to xl it is only the
                compact initial, so the row fits the tablet width. */}
            <div className="hidden shrink-0 md:block">
              <AppNav />
            </div>
            <div className="ml-auto flex min-w-0 shrink items-center gap-2 text-sm">
              <RunningTimerChip />
              {/* One account trigger (#190). Not a peer of Timer · Library ·
                  Reports · Export. Admin stays inside the menu (#142). */}
              <HeaderUserMenu email={user.email} isAdmin={isAdmin} />
            </div>
          </div>
        </header>
        <TimerDockSlot timezone={user.timezone} />
      </div>
      <AppMain>{children}</AppMain>
      <footer className="hidden md:block border-t border-border py-4 text-center text-xs text-muted">
        <span>Clockinoff · {user.timezone}</span>
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
    </RunningTimerProvider>
  );
}
