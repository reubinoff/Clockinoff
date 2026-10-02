"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  IconTimer,
  IconProject,
  IconClient,
  IconTag,
  IconReports,
  IconExport,
  type IconProps,
} from "@/components/icons";

type NavItem = {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
  match: (pathname: string) => boolean;
};

const NAV: NavItem[] = [
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
    // #56 Quiet Pulse Summary v1: Reports is a read-only aggregate, not a
    // second timer home. Sits before Export in the primary nav because the
    // typical flow is "look at the week / export it".
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

export default function AppNav(): JSX.Element {
  const pathname = usePathname() ?? "/app";
  return (
    <nav aria-label="Primary" className="flex items-center gap-1">
      {NAV.map(({ href, label, Icon, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={
              "nav-link" + (active ? " nav-link-active" : "")
            }
          >
            <Icon size={16} aria-hidden />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
