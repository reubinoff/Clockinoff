"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  IconTimer,
  IconLibrary,
  IconExport,
  type IconProps,
} from "@/components/icons";

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
    href: "/app/export",
    label: "Export",
    Icon: IconExport,
    match: (p) => p.startsWith("/app/export"),
  },
];

export default function BottomTabBar(): JSX.Element {
  const pathname = usePathname() ?? "/app";
  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-surface border-t border-border pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex items-stretch justify-around">
        {TABS.map(({ href, label, Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={label} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={label}
                className={
                  "tab-link" + (active ? " tab-link-active" : "")
                }
              >
                <Icon size={22} aria-hidden />
                <span className="text-[11px] leading-none">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
