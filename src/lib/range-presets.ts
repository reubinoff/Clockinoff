// Shared range keys for Reports (#56) and Admin (#142). Day keys are
// YYYY-MM-DD in the browser's local calendar — the same contract the
// Reports picker already emits. The server re-interprets those keys in
// the account timezone.

export type RangePresetKey =
  | "today"
  | "this-week"
  | "last-week"
  | "this-month"
  | "last-month"
  | "custom";

export interface DayRange {
  from: string;
  to: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = (day + 6) % 7; // Monday-first, matches the rest of the app
  copy.setDate(copy.getDate() - diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function rangeForPreset(
  key: Exclude<RangePresetKey, "custom">,
  now: Date = new Date(),
): DayRange {
  if (key === "today") {
    const k = fmtDate(now);
    return { from: k, to: k };
  }
  if (key === "this-week") {
    return { from: fmtDate(startOfWeek(now)), to: fmtDate(now) };
  }
  if (key === "last-week") {
    const thisStart = startOfWeek(now);
    const lastStart = new Date(thisStart);
    lastStart.setDate(thisStart.getDate() - 7);
    const lastEnd = new Date(thisStart);
    lastEnd.setDate(thisStart.getDate() - 1);
    return { from: fmtDate(lastStart), to: fmtDate(lastEnd) };
  }
  if (key === "this-month") {
    return { from: fmtDate(startOfMonth(now)), to: fmtDate(now) };
  }
  const thisMonthStart = startOfMonth(now);
  const lastMonthEnd = new Date(thisMonthStart);
  lastMonthEnd.setDate(0);
  const lastMonthStart = startOfMonth(lastMonthEnd);
  return { from: fmtDate(lastMonthStart), to: fmtDate(endOfMonth(lastMonthStart)) };
}
