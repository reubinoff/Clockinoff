import type { ReactNode } from "react";
import { Mark } from "@/components/brand/Mark";
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
        background:
          "linear-gradient(180deg, #f7f6f3 0%, rgba(237,233,254,0.12) 100%)",
      }}
    >
      <div className="w-full max-w-md">
        <div className="rounded-[20px] border border-border bg-surface shadow-card-lg p-6 md:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <Mark size={40} />
            <span className="text-lg font-semibold leading-none tracking-[-0.01em] text-ink">
              Timely
            </span>
          </div>
          <div className="space-y-1">
            <h1 className="text-title text-ink">{title}</h1>
            <p className="text-body-sm text-muted">{subtitle}</p>
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
