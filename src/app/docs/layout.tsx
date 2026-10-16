import Link from "next/link";
import type { ReactNode } from "react";
import { Mark } from "@/components/brand/Mark";
import DocsAuthSlot from "@/components/DocsAuthSlot";
import { listDocPages } from "@/lib/docs-content";

export const metadata = {
  title: "User docs",
  description: "Clockinoff — user documentation.",
};

export default function DocsLayout({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const pages = listDocPages();
  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <header className="sticky top-0 z-20 w-full min-w-0 border-b border-border bg-surface">
        {/* Below sm, gap-4 plus the account slot ran past the 16px inset
            and 0.4px past a 390px viewport. The tighter gap keeps the
            right edge on the same inset as the logo. */}
        <div className="mx-auto flex w-full max-w-6xl min-w-0 items-center gap-2 px-4 py-2.5 sm:gap-4">
          <Link
            href="/"
            className="inline-flex shrink-0 items-center gap-2 font-semibold tracking-tight text-ink"
            aria-label="Clockinoff home"
          >
            <Mark size={24} />
            <span className="text-sm">Clockinoff</span>
          </Link>
          <span
            className="min-w-0 truncate whitespace-nowrap border-l border-border pl-1 text-xs uppercase tracking-wide text-muted sm:pl-4"
            aria-hidden="true"
          >
            User docs
          </span>
          {/* Static for every visitor. The slot fetches /api/auth/me in the
              browser so a session never lands in the Front Door or ISR HTML. */}
          <div className="ml-auto flex shrink-0 items-center">
            <DocsAuthSlot />
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
        <span>Clockinoff user docs</span>
        <span aria-hidden="true"> · </span>
        <Link href="/" className="hover:text-ink underline underline-offset-2">
          Back to app
        </Link>
      </footer>
    </div>
  );
}
