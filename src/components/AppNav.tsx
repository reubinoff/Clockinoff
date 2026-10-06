"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import {
  IconTimer,
  IconLibrary,
  IconProject,
  IconClient,
  IconTag,
  IconReports,
  IconExport,
  IconChevronDown,
  type IconProps,
} from "@/components/icons";

type NavItem = {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
  match: (pathname: string) => boolean;
};

const LIBRARY_ROUTES = ["/app/projects", "/app/clients", "/app/tags"] as const;

const LIBRARY: readonly NavItem[] = [
  {
    href: "/app/projects",
    label: "Projects",
    Icon: IconProject,
    match: (p) => p === "/app/projects" || p.startsWith("/app/projects/"),
  },
  {
    href: "/app/clients",
    label: "Clients",
    Icon: IconClient,
    match: (p) => p === "/app/clients" || p.startsWith("/app/clients/"),
  },
  {
    href: "/app/tags",
    label: "Tags",
    Icon: IconTag,
    match: (p) => p === "/app/tags" || p.startsWith("/app/tags/"),
  },
];

function isLibraryPath(pathname: string): boolean {
  return LIBRARY_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));
}

const NAV: NavItem[] = [
  {
    href: "/app",
    label: "Timer",
    Icon: IconTimer,
    match: (p) => p === "/app",
  },
  {
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

function LibraryNav(): JSX.Element {
  const pathname = usePathname() ?? "/app";
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const libraryActive = isLibraryPath(pathname);

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

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        className={"nav-link" + (libraryActive ? " nav-link-active" : "")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Library"
        onClick={() => setOpen((v) => !v)}
        data-nav-library="true"
      >
        <IconLibrary size={16} aria-hidden />
        <span>Library</span>
        <IconChevronDown
          size={14}
          aria-hidden
          className={
            "transition-transform" + (open ? " rotate-180" : "")
          }
        />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Library"
          className="absolute left-0 mt-1 w-44 rounded-xl border border-border bg-surface shadow-card-lg p-1 z-40"
        >
          {LIBRARY.map(({ href, label, Icon, match }) => {
            const active = match(pathname);
            return (
              <Link
                key={href}
                href={href}
                role="menuitem"
                aria-current={active ? "page" : undefined}
                className={
                  "nav-link w-full justify-start" +
                  (active ? " nav-link-active" : "")
                }
                onClick={close}
              >
                <Icon size={16} aria-hidden />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TopLink({ href, label, Icon, match, pathname }: NavItem & { pathname: string }): JSX.Element {
  const active = match(pathname);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={"nav-link" + (active ? " nav-link-active" : "")}
    >
      <Icon size={16} aria-hidden />
      <span>{label}</span>
    </Link>
  );
}

export default function AppNav(): JSX.Element {
  const pathname = usePathname() ?? "/app";
  const timer = NAV[0];
  const rest = NAV.slice(1);
  return (
    <nav aria-label="Primary" className="flex flex-nowrap items-center gap-0.5">
      <TopLink {...timer} pathname={pathname} />
      <LibraryNav />
      {rest.map((item) => (
        <TopLink key={item.href} {...item} pathname={pathname} />
      ))}
    </nav>
  );
}
