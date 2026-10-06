"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Segment = {
  href: string;
  label: string;
};

const SEGMENTS: readonly Segment[] = [
  { href: "/app/projects", label: "Projects" },
  { href: "/app/clients", label: "Clients" },
  { href: "/app/tags", label: "Tags" },
];

export default function LibraryTabs(): JSX.Element {
  const pathname = usePathname() ?? "";
  return (
    <nav
      aria-label="Library"
      // Mobile-first: desktop surfaces Projects / Clients / Tags under the
      // top-nav Library group. This segment stays on the library pages
      // below md so the bottom-tab Library landing can switch children.
      className="md:hidden mb-4"
    >
      <ul className="inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1">
        {SEGMENTS.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={
                  "inline-flex items-center justify-center min-h-[36px] px-3 rounded-full text-body-sm transition-colors " +
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas " +
                  (active
                    ? "bg-accent-soft text-accent"
                    : "text-muted hover:text-ink hover:bg-canvas-2")
                }
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
