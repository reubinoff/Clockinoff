import type { ReactNode } from "react";
import { Mark } from "@/components/brand/Mark";

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
      className="min-h-screen w-full px-4 py-10 flex items-center justify-center"
      style={{
        background:
          "linear-gradient(180deg, #fafaf9 0%, rgba(237,233,254,0.5) 100%)",
      }}
    >
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-border bg-surface shadow-card-lg p-6 md:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <Mark size={40} />
            <div>
              <div className="text-lg font-semibold leading-tight text-ink">
                Timely
              </div>
              <div className="text-xs text-muted">Solo time tracker</div>
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-ink leading-tight">{title}</h1>
            <p className="text-sm text-muted">{subtitle}</p>
          </div>
          {children}
        </div>
        {footer ? (
          <p className="mt-4 text-center text-sm text-muted">{footer}</p>
        ) : null}
      </div>
    </main>
  );
}
