const DEFAULT_TZ = "Asia/Jerusalem";

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function partsInZone(d: Date, tz: string): DateParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const hour = map.hour === "24" ? 0 : Number(map.hour);
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function pad(n: number, w = 2): string {
  return n.toString().padStart(w, "0");
}

export function formatDate(d: Date, tz: string = DEFAULT_TZ): string {
  const p = partsInZone(d, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function formatTime(d: Date, tz: string = DEFAULT_TZ): string {
  const p = partsInZone(d, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function formatDateTime(d: Date, tz: string = DEFAULT_TZ): string {
  return `${formatDate(d, tz)} ${formatTime(d, tz)}`;
}

export function formatDurationHms(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export function formatDurationHours(seconds: number): string {
  return (Math.max(0, seconds) / 3600).toFixed(2);
}

function zoneOffsetMinutes(utcMs: number, tz: string): number {
  const p = partsInZone(new Date(utcMs), tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asUtc - utcMs) / 60_000;
}

export function zonedIsoToUtc(input: string, tz: string = DEFAULT_TZ): Date {
  const trimmed = input.trim();
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return new Date(trimmed);
  }
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const normalized = dateOnly ? `${trimmed}T00:00:00` : trimmed;
  const m = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!m) {
    const d = new Date(normalized);
    if (isNaN(d.getTime())) throw new Error(`Invalid date: ${input}`);
    return d;
  }
  const [, y, mo, d, h, mi, s] = m;
  const guess = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s ?? "0"),
  );
  const offset = zoneOffsetMinutes(guess, tz);
  return new Date(guess - offset * 60_000);
}

export function formatDayLabel(
  d: Date,
  tz: string = DEFAULT_TZ,
  now: Date = new Date(),
): string {
  const dKey = formatDate(d, tz);
  const todayKey = formatDate(now, tz);
  if (dKey === todayKey) return "Today";
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (formatDate(yesterday, tz) === dKey) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(d);
}

export function startOfDayInZone(input: string, tz: string = DEFAULT_TZ): Date {
  return zonedIsoToUtc(`${input.slice(0, 10)}T00:00:00`, tz);
}

export function endOfDayExclusiveInZone(input: string, tz: string = DEFAULT_TZ): Date {
  const d0 = startOfDayInZone(input, tz);
  return new Date(d0.getTime() + 24 * 60 * 60 * 1000);
}

// #81 Mobile Week → Day → Entry grouping. We bucket entries by ISO week
// (Monday-first) so Clockify-adjacent competitors align — the week label
// just reads "Mon dd – Sun dd" and the key is the Monday's zoned
// YYYY-MM-DD. We avoid subtracting 86_400_000 ms from the entry's UTC
// timestamp because that can straddle a DST boundary and roll back by
// one hour (ending up on the wrong Monday); instead we take the zoned
// calendar date and march back by whole calendar days using UTC date
// arithmetic, which has no DST surprises.
function pureUtcDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function keyFromPureUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function startOfIsoWeekKey(d: Date, tz: string = DEFAULT_TZ): string {
  const dayKey = formatDate(d, tz);
  const utc = pureUtcDate(dayKey);
  const dow = utc.getUTCDay(); // 0 = Sun .. 6 = Sat
  const back = dow === 0 ? 6 : dow - 1; // march back to Monday
  const monday = new Date(utc.getTime() - back * 24 * 60 * 60 * 1000);
  return keyFromPureUtc(monday);
}

function shortMonthDay(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(d);
}

export function formatWeekRangeLabel(
  weekStartKey: string,
  now: Date = new Date(),
  tz: string = DEFAULT_TZ,
): string {
  const monday = pureUtcDate(weekStartKey);
  const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000);
  const thisWeekKey = startOfIsoWeekKey(now, tz);
  const prefix =
    weekStartKey === thisWeekKey
      ? "This week · "
      : weekStartKey ===
          keyFromPureUtc(new Date(pureUtcDate(thisWeekKey).getTime() - 7 * 24 * 60 * 60 * 1000))
        ? "Last week · "
        : "";
  // En dash between start and end for the quiet-pulse typographic tone.
  return `${prefix}${shortMonthDay(monday)} – ${shortMonthDay(sunday)}`;
}

export { DEFAULT_TZ };
