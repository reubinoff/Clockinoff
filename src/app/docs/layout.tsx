import Link from "next/link";
import type { ReactNode } from "react";
import { Mark } from "@/components/brand/Mark";
import { listDocPages } from "@/lib/docs-content";

export const metadata = {
  title: "User docs",
  description: "Clockinoff / Timely — user documentation.",
};

export default function DocsLayout({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const pages = listDocPages();
  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <header className="border-b border-border bg-surface sticky top-0 z-20">
        <div className="mx-auto max-w-6xl px-4 py-2.5 flex items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-semibold tracking-tight text-ink shrink-0"
            aria-label="Timely home"
          >
            <Mark size={24} />
            <span className="text-sm">Timely</span>
          </Link>
          <span
            className="text-xs uppercase tracking-wide text-muted border-l border-border pl-4"
            aria-hidden="true"
          >
            User docs
          </span>
          <div className="ml-auto flex items-center gap-4 text-sm">
            <Link
              href="/login"
              className="text-muted hover:text-ink underline underline-offset-2"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="text-ink hover:text-accent underline underline-offset-2"
            >
              Create account
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl w-full px-4 py-6 flex flex-col md:flex-row md:gap-10">
        <aside className="md:w-56 md:shrink-0 md:sticky md:top-20 md:self-start mb-6 md:mb-0">
          <nav
            aria-label="Docs navigation"
            className="rounded-xl border border-border bg-surface p-3"
          >
            <ul className="space-y-1 text-sm">
              {pages.map((p) => {
                const href = p.slug ? `/docs/${p.slug}` : "/docs";
                return (
                  <li key={p.slug || "home"}>
                    <Link
                      href={href}
                      className="block rounded-md px-2 py-1.5 text-ink-2 hover:bg-canvas-2 hover:text-ink"
                    >
                      {p.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>
        <main className="flex-1 min-w-0">
          <article className="docs-prose rounded-xl border border-border bg-surface p-6 md:p-8">
            {children}
          </article>
        </main>
      </div>
      <footer className="border-t border-border py-4 text-center text-xs text-muted">
        <span>Timely user docs</span>
        <span aria-hidden="true"> · </span>
        <Link href="/" className="hover:text-ink underline underline-offset-2">
          Back to app
        </Link>
      </footer>
    </div>
  );
}
