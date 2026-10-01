// Quiet Pulse skeleton primitives — Dana lock (#54 brief).
//
// Pure presentational components, no state, so they're fine as a server
// component. Pulse animation is driven by the `.skeleton-pulse` utility
// defined in globals.css; it's suppressed under `prefers-reduced-motion`.

import type { ReactNode } from "react";

export function SkeletonBar({
  className = "",
  width,
  height = "0.75rem",
  ariaHidden = true,
}: {
  className?: string;
  width?: string;
  height?: string;
  ariaHidden?: boolean;
}): JSX.Element {
  return (
    <span
      className={"skeleton-pulse inline-block rounded-md " + className}
      style={{ width, height }}
      aria-hidden={ariaHidden || undefined}
    />
  );
}

export function SkeletonEntryRow(): JSX.Element {
  return (
    <li className="entry-row relative px-3 py-2.5 md:px-4 md:py-2">
      {/* md+ flat row */}
      <div className="hidden md:flex md:items-center md:gap-3">
        <SkeletonBar className="flex-1" width="60%" />
        <SkeletonBar width="80px" height="0.65rem" />
        <SkeletonBar width="48px" height="0.75rem" />
      </div>
      {/* mobile card body */}
      <div className="flex items-start gap-3 md:hidden">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <SkeletonBar className="flex-1" width="70%" />
            <SkeletonBar width="48px" />
          </div>
          <SkeletonBar width="55%" height="0.65rem" />
        </div>
      </div>
    </li>
  );
}

export function SkeletonDaySection({ rows = 3 }: { rows?: number }): JSX.Element {
  return (
    <section aria-hidden className="space-y-2">
      <header className="flex items-baseline justify-between px-1">
        <SkeletonBar width="80px" height="0.9rem" />
        <SkeletonBar width="56px" height="0.7rem" />
      </header>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonEntryRow key={i} />
        ))}
      </ul>
    </section>
  );
}

export function SkeletonFilterToolbar(): JSX.Element {
  return (
    <div
      aria-hidden
      className="flex flex-wrap items-center gap-2"
    >
      <SkeletonBar width="220px" height="2.5rem" className="rounded-xl" />
      <SkeletonBar width="140px" height="2.5rem" className="rounded-xl" />
      <SkeletonBar width="112px" height="2.5rem" className="rounded-full" />
      <SkeletonBar width="80px" height="2.5rem" className="rounded-xl" />
    </div>
  );
}

export function SkeletonList({
  days = 2,
  rowsPerDay = 3,
  showToolbar = true,
  header,
}: {
  days?: number;
  rowsPerDay?: number;
  showToolbar?: boolean;
  header?: ReactNode;
}): JSX.Element {
  return (
    <div className="space-y-4" role="status" aria-label="Loading entries">
      {header}
      {showToolbar && <SkeletonFilterToolbar />}
      <div className="space-y-5">
        {Array.from({ length: days }).map((_, i) => (
          <SkeletonDaySection key={i} rows={rowsPerDay} />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
