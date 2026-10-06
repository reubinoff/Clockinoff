"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  IconTimer,
  IconLibrary,
  IconReports,
  IconExport,
  type IconProps,
} from "@/components/icons";
import { useRunningTimer } from "@/components/RunningTimerProvider";

type TabItem = {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
  match: (pathname: string) => boolean;
};

const LIBRARY_ROUTES = ["/app/projects", "/app/clients", "/app/tags"] as const;

const TABS: TabItem[] = [
  {
    href: "/app",
    label: "Timer",
    Icon: IconTimer,
    match: (p) => p === "/app",
  },
  {
    // Library groups the three existing library routes. Default target is
    // projects; Library is active on any of them.
    href: "/app/projects",
    label: "Library",
    Icon: IconLibrary,
    match: (p) => LIBRARY_ROUTES.some((r) => p === r || p.startsWith(r + "/")),
  },
  {
    // #56 Reports is reachable from mobile too — the layout is desktop-first
    // (brief locks mobile polish as a follow-up), but a mobile user still
    // needs to open it. The page re-stacks total → bar → list → donut at
    // narrow widths so nothing overflows the viewport.
    href: "/app/reports",
    label: "Reports",
    Icon: IconReports,
    match: (p) => p.startsWith("/app/reports"),
  },
  {
    href: "/app/export",
    label: "Export",
    Icon: IconExport,
    match: (p) => p.startsWith("/app/export"),
  },
];

export default function BottomTabBar(): JSX.Element {
  const pathname = usePathname() ?? "/app";
  const running = useRunningTimer();
  const showRunning = Boolean(running?.config && running.running);
  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-surface border-t border-border pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex items-stretch justify-around">
        {TABS.map(({ href, label, Icon, match }) => {
          const active = match(pathname);
          const timerRunning = label === "Timer" && showRunning;
          const caption = timerRunning ? running!.label : label;
          return (
            <li key={label} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={
                  timerRunning ? `Timer running ${running!.label}` : label
                }
                className={
                  "tab-link" + (active ? " tab-link-active" : "")
                }
                data-running-timer-tab={timerRunning ? "true" : undefined}
              >
                <Icon size={22} aria-hidden />
                <span
                  className={
                    "text-[11px] leading-none" +
                    (timerRunning ? " timer-digits" : "")
                  }
                >
                  {timerRunning && (
                    <span
                      className="timer-running-dot mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
                      aria-hidden
                    />
                  )}
                  {caption}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
