"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import TimerBar from "@/components/TimerBar";
import { isConfigRoute } from "@/lib/shell-routes";

export function TimerDockSlot({
  timezone,
}: {
  timezone: string;
}): JSX.Element | null {
  const pathname = usePathname() ?? "/app";
  if (isConfigRoute(pathname)) return null;
  return (
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
      <TimerBar timezone={timezone} />
    </div>
  );
}

export function AppMain({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname() ?? "/app";
  const config = isConfigRoute(pathname);
  return (
    <main
      className={
        "flex-1 mx-auto max-w-6xl w-full min-w-0 px-4 py-6 " +
        (config
          ? // Tab bar only — the timer dock is not on configuration pages.
            "pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-6"
          : // Mobile dock is grabber + primary row + always-visible project
            // row. Expanded details still grow via globals.css :has().
            "pb-[calc(12rem+env(safe-area-inset-bottom))] md:pb-6")
      }
    >
      {children}
    </main>
  );
}
