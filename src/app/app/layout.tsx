import Link from "next/link";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, getSessionUser } from "@/server/auth/session";
import TimerBar from "@/components/TimerBar";
import LogoutButton from "@/components/LogoutButton";
import { Mark } from "@/components/brand/Mark";

export const dynamic = "force-dynamic";

const NAV: { href: string; label: string }[] = [
  { href: "/app", label: "Timer" },
  { href: "/app/projects", label: "Projects" },
  { href: "/app/clients", label: "Clients" },
  { href: "/app/tags", label: "Tags" },
  { href: "/app/export", label: "Export" },
];

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}): Promise<JSX.Element> {
  const sid = cookies().get(SESSION_COOKIE)?.value;
  const user = await getSessionUser(sid);
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-surface sticky top-0 z-20">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-6">
          <Link
            href="/app"
            className="inline-flex items-center gap-2 font-semibold tracking-tight text-ink"
          >
            <Mark size={24} />
            <span>Timely</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted">
            {NAV.map((n) => (
              <Link key={n.href} className="hover:text-ink" href={n.href}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-muted">{user.email}</span>
            <LogoutButton />
          </div>
        </div>
        <TimerBar timezone={user.timezone} />
      </header>
      <main className="flex-1 mx-auto max-w-6xl w-full px-4 py-6">{children}</main>
      <footer className="border-t border-border py-4 text-center text-xs text-muted">
        Timely · {user.timezone}
      </footer>
    </div>
  );
}
