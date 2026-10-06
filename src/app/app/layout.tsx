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
import AppearanceSelect from "@/components/AppearanceSelect";
import { Mark } from "@/components/brand/Mark";
import { DOCS_URL } from "@/lib/docs";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}): Promise<JSX.Element> {
  const sid = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = await getSessionUser(sid);
  if (!user) redirect("/login");

  return (
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
                account side shrinks instead; below xl it is only the
                compact initial, so the row fits the tablet width. */}
            <div className="hidden shrink-0 md:block">
              <AppNav />
            </div>
            <div className="ml-auto flex min-w-0 shrink items-center gap-2 text-sm">
              {/* xl+ account cluster: email · Account · Docs · Appearance ·
                  Log out on one baseline. At 768 the compact menu below
                  replaces this so the header cannot overflow (#141). */}
              <div className="hidden min-w-0 xl:flex items-center gap-3">
                <span
                  className="text-muted min-w-0 max-w-[180px] truncate"
                  title={user.email}
                >
                  {user.email}
                </span>
                <Link
                  href="/app/account"
                  className="text-muted hover:text-ink underline underline-offset-2 whitespace-nowrap"
                >
                  Account
                </Link>
                <a
                  className="text-muted hover:text-ink underline underline-offset-2 whitespace-nowrap"
                  href={DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open user documentation in a new tab"
                >
                  Docs
                </a>
                <AppearanceSelect />
                <LogoutButton />
              </div>
              <HeaderUserMenu email={user.email} variant="compact" />
              <a
                className="text-muted hover:text-ink underline underline-offset-2 whitespace-nowrap md:hidden"
                href={DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open user documentation in a new tab"
              >
                Docs
              </a>
              <HeaderUserMenu email={user.email} variant="mobile" />
            </div>
          </div>
        </header>
        <div
          className={
            // Docked bottom on mobile (above tab bar), full-bleed band
            // under the thin header on desktop. Not a header child.
            // safe-area-inset-bottom only lives on the tab bar; the dock
            // sits exactly above it so the inset is not applied twice.
            "w-full md:static md:z-auto md:inset-x-auto md:bottom-auto " +
            "fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 " +
            "shadow-[0_-1px_2px_rgba(17,24,39,0.04)] md:shadow-none"
          }
          data-app-dock="true"
        >
          <TimerBar timezone={user.timezone} />
        </div>
      </div>
      <main
        className={
          "flex-1 mx-auto max-w-6xl w-full min-w-0 px-4 py-6 " +
          // #82 Reserve room for docked timer + bottom tab bar on mobile.
          // The dock is now a thin collapsed band by default (grabber + one
          // row of description/elapsed/primary), so the base reservation is
          // smaller than the previous 16rem. When the grabber is expanded,
          // globals.css bumps this to 22rem via :has() on the dock's
          // `data-timer-details-open="true"` attribute so the expanded
          // panel never permanently covers the first entry row.
          "pb-[calc(9rem+env(safe-area-inset-bottom))] md:pb-6"
        }
      >
        {children}
      </main>
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
  );
}
