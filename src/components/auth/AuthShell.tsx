import type { ReactNode } from "react";
import { Mark } from "@/components/brand/Mark";
import { Pulse } from "@/components/mascot/Pulse";
import { DOCS_URL } from "@/lib/docs";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}): JSX.Element {
  return (
    <main
      className="min-h-dvh w-full px-4 py-10 flex items-center justify-center"
      style={{
        // V2-10 Dark #10: the auth-shell wash is tokenized so dark auth
        // gets the deep violet fade (canvas → accent-soft ~12%) without
        // a separate theme branch. Same recipe, both palettes.
        background:
          "linear-gradient(180deg, var(--color-canvas) 0%, color-mix(in srgb, var(--color-accent-soft) 12%, transparent) 100%)",
      }}
    >
      <div className="w-full max-w-md">
        <div className="rounded-[20px] border border-border bg-surface shadow-card-lg p-6 md:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <Mark size={40} />
            <span className="text-lg font-semibold leading-none tracking-[-0.01em] text-ink">
              Clockinoff
            </span>
          </div>
          <div className="space-y-1">
            <h1 className="text-title text-ink">{title}</h1>
            <p className="text-body-sm text-muted">{subtitle}</p>
          </div>
          {/* #60 Quiet Pulse — auth flourish. Hidden on narrow mobile
              (`hidden sm:flex`) so the form never feels cramped, as the
              Dana handoff explicitly asks for (“omit if cramped”). Does
              not replace the brand mark (which stays in the header
              row). Decorative: the title/subtitle above explain the
              moment. */}
          <div className="hidden sm:flex justify-center pt-1">
            <Pulse variant="auth" alt="" className="h-[72px] w-[72px]" />
          </div>
          {children}
        </div>
        {footer ? (
          <p className="mt-4 text-center text-sm text-muted">{footer}</p>
        ) : null}
        <p className="mt-3 text-center text-xs text-muted">
          <a
            className="hover:text-ink underline underline-offset-2"
            href={DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Read the user docs
          </a>
        </p>
      </div>
    </main>
  );
}
