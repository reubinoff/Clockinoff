// #99a Dana lock: true-empty vs filtered-empty list surface.
//
// True-empty (no closed rows, no live filters) is the Pulse greeting.
// Filtered-empty is a transient filter miss — no Pulse, no week band,
// no day header, no pinned running row (even if a timer is live).

export type EntryEmptyKind = "true-empty" | "filtered-empty";

export function resolveEntryEmptyKind(opts: {
  closedCount: number;
  hasActiveFilter: boolean;
}): EntryEmptyKind | null {
  if (opts.closedCount > 0) return null;
  return opts.hasActiveFilter ? "filtered-empty" : "true-empty";
}

// Desktop week chrome (band + day header + rows, including the pinned
// running row) stays up when there are matching closed rows, or when a
// timer is live on an unfiltered empty list. Filtered-empty hides it.
export function showDesktopWeekTable(opts: {
  closedCount: number;
  hasActiveFilter: boolean;
  hasRunning: boolean;
}): boolean {
  if (opts.closedCount > 0) return true;
  if (opts.hasActiveFilter) return false;
  return opts.hasRunning;
}

export function showEmptyPulse(kind: EntryEmptyKind | null): boolean {
  return kind === "true-empty";
}

export const TRUE_EMPTY_COPY =
  "Nothing tracked yet — start a timer when you're ready.";
export const FILTERED_EMPTY_COPY = "No entries match these filters.";
export const UNBILLED_EMPTY_COPY = "Nothing unbilled in this range.";

export function entryEmptyCopy(
  kind: EntryEmptyKind,
  filterUnbilled: boolean,
): string {
  if (kind === "true-empty") return TRUE_EMPTY_COPY;
  if (filterUnbilled) return UNBILLED_EMPTY_COPY;
  return FILTERED_EMPTY_COPY;
}
