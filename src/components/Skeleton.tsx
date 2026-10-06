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
    <li className="entry-row relative px-3 py-2.5 md:hidden">
      <div className="flex items-start gap-3">
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

// #99a desktop skeleton row — matches the md+ table grid (chip 96 ·
// description 60% · time 88 · duration 48, 44px tall) so there's no
// column jump when the real rows hydrate.
function SkeletonTableRow(): JSX.Element {
  return (
    <tr aria-hidden className="h-11 border-b border-border">
      <td className="pl-4 pr-2 align-middle">
        <SkeletonBar width="96px" height="0.9rem" className="rounded-full" />
      </td>
      <td className="px-2 align-middle">
        <SkeletonBar width="60%" height="0.75rem" />
      </td>
      <td className="w-0 max-w-0 p-0 overflow-hidden align-middle lg:w-auto lg:max-w-none lg:px-2">
        <SkeletonBar width="120px" height="0.65rem" className="hidden lg:inline-block" />
      </td>
      <td className="px-2 align-middle">
        <SkeletonBar width="88px" height="0.65rem" />
      </td>
      <td className="px-2 align-middle text-right">
        <SkeletonBar width="48px" height="0.75rem" />
      </td>
      <td className="pr-4 pl-2 align-middle" />
    </tr>
  );
}

export function SkeletonDaySection({ rows = 3 }: { rows?: number }): JSX.Element {
  return (
    <section aria-hidden className="space-y-2">
      {/* mobile card shape */}
      <div className="md:hidden">
        <header className="flex items-baseline justify-between px-1">
          <SkeletonBar width="80px" height="0.9rem" />
          <SkeletonBar width="56px" height="0.7rem" />
        </header>
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonEntryRow key={i} />
          ))}
        </ul>
      </div>
      {/* md+ table shape — same column grid as the live EntryList so the
          hydrate hand-off never shifts the layout. */}
      <div className="hidden md:block overflow-hidden rounded-2xl border border-border bg-surface">
        <table className="w-full border-collapse table-fixed">
          <colgroup>
            <col className="w-[128px] lg:w-[168px]" />
            <col />
            <col className="w-0 lg:w-[176px]" />
            <col className="w-[104px] lg:w-[112px]" />
            <col className="w-[80px] lg:w-[88px]" />
            <col className="w-[108px]" />
          </colgroup>
          <tbody>
            <tr aria-hidden className="h-9">
              <td colSpan={6} className="px-4 pt-3 pb-1">
                <SkeletonBar width="80px" height="0.75rem" />
              </td>
            </tr>
            {Array.from({ length: rows }).map((_, i) => (
              <SkeletonTableRow key={i} />
            ))}
          </tbody>
        </table>
      </div>
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
