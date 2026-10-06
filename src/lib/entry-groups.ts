// #81 Week → Day grouping used by the main entries table. Extracted from
// EntryList so a unit test can lock closed-only day/week totals against
// the #56 report `summarize` math (Shaul #99a PRODUCT LOCK). Pure — no
// DB / no React — so drift fails in `tests/lib` without Postgres.
//
// Totals stay closed-only: a running row (or an explicit `end_at: null`)
// is listed nowhere in these groups and must not add live elapsed. The
// pinned desktop running row is injected separately; `ensureTodayGroup`
// only creates an empty Today bucket (0h) when that row needs a home.

import {
  formatDate,
  formatDayLabel,
  formatWeekRangeLabel,
  startOfIsoWeekKey,
} from "@/lib/tz";

export interface GroupableEntry {
  start_at: string;
  duration_seconds: number;
  running?: boolean;
  end_at?: string | null;
}

export interface EntryDayGroup<T extends GroupableEntry = GroupableEntry> {
  key: string;
  label: string;
  totalSeconds: number;
  entries: T[];
  isToday: boolean;
}

export interface EntryWeekGroup<T extends GroupableEntry = GroupableEntry> {
  key: string;
  label: string;
  totalSeconds: number;
  days: EntryDayGroup<T>[];
  isCurrent: boolean;
}

// Closed = stopped. `running: true` is the list's own flag; `end_at ===
// null` is the API's running shape. Either one is enough to keep live
// elapsed out of the day/week totals even if a caller passes a mixed list.
export function isClosedEntry(e: GroupableEntry): boolean {
  if (e.running) return false;
  if (e.end_at === null) return false;
  return true;
}

export function groupEntriesByWeek<T extends GroupableEntry>(
  entries: readonly T[],
  timezone: string,
  now: Date,
): EntryWeekGroup<T>[] {
  const weeks: EntryWeekGroup<T>[] = [];
  const byWeekKey = new Map<string, EntryWeekGroup<T>>();
  const byDayKey = new Map<string, EntryDayGroup<T>>();
  const todayKey = formatDate(now, timezone);
  const thisWeekKey = startOfIsoWeekKey(now, timezone);
  for (const e of entries) {
    if (!isClosedEntry(e)) continue;
    const start = new Date(e.start_at);
    if (isNaN(start.getTime())) continue;
    const dayKey = formatDate(start, timezone);
    const weekKey = startOfIsoWeekKey(start, timezone);
    let w = byWeekKey.get(weekKey);
    if (!w) {
      w = {
        key: weekKey,
        label: formatWeekRangeLabel(weekKey, now, timezone),
        totalSeconds: 0,
        days: [],
        isCurrent: weekKey === thisWeekKey,
      };
      byWeekKey.set(weekKey, w);
      weeks.push(w);
    }
    let d = byDayKey.get(dayKey);
    if (!d) {
      d = {
        key: dayKey,
        label: formatDayLabel(start, timezone, now),
        totalSeconds: 0,
        entries: [],
        isToday: dayKey === todayKey,
      };
      byDayKey.set(dayKey, d);
      w.days.push(d);
    }
    d.entries.push(e);
    d.totalSeconds += e.duration_seconds;
    w.totalSeconds += e.duration_seconds;
  }
  return weeks;
}

// #99a desktop running row: a pinned purple-wash row sits at the top of
// the Today day group. If Today currently has no closed entries, we
// synthesise an empty Today group (zero total — #81 math stays closed-
// only) in the current week so the running row has a home. A synthesised
// week is also created when the user hasn't logged anything this week yet.
export function ensureTodayGroup<T extends GroupableEntry>(
  weeks: EntryWeekGroup<T>[],
  timezone: string,
  now: Date,
): EntryWeekGroup<T>[] {
  const todayKey = formatDate(now, timezone);
  const thisWeekKey = startOfIsoWeekKey(now, timezone);
  if (weeks.some((w) => w.days.some((d) => d.key === todayKey))) return weeks;
  const todayGroup: EntryDayGroup<T> = {
    key: todayKey,
    label: formatDayLabel(now, timezone, now),
    totalSeconds: 0,
    entries: [],
    isToday: true,
  };
  const currentWeek = weeks.find((w) => w.key === thisWeekKey);
  if (currentWeek) {
    return weeks.map((w) =>
      w === currentWeek ? { ...w, days: [todayGroup, ...w.days] } : w,
    );
  }
  const synthetic: EntryWeekGroup<T> = {
    key: thisWeekKey,
    label: formatWeekRangeLabel(thisWeekKey, now, timezone),
    totalSeconds: 0,
    days: [todayGroup],
    isCurrent: true,
  };
  return [synthetic, ...weeks];
}
