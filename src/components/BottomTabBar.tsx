"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  IconTimer,
  IconProject,
  IconClient,
  IconTag,
  IconExport,
  type IconProps,
} from "@/components/icons";

type TabItem = {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
  match: (pathname: string) => boolean;
};

const TABS: TabItem[] = [
  {
    href: "/app",
    label: "Timer",
    Icon: IconTimer,
    match: (p) => p === "/app",
  },
  {
    href: "/app/projects",
    label: "Projects",
    Icon: IconProject,
    match: (p) => p.startsWith("/app/projects"),
  },
  {
    href: "/app/clients",
    label: "Clients",
    Icon: IconClient,
    match: (p) => p.startsWith("/app/clients"),
  },
  {
    href: "/app/tags",
    label: "Tags",
    Icon: IconTag,
    match: (p) => p.startsWith("/app/tags"),
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
            <li key={href} className="flex-1">
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
