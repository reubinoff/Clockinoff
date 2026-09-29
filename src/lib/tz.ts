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

export function startOfDayInZone(input: string, tz: string = DEFAULT_TZ): Date {
  return zonedIsoToUtc(`${input.slice(0, 10)}T00:00:00`, tz);
}

export function endOfDayExclusiveInZone(input: string, tz: string = DEFAULT_TZ): Date {
  const d0 = startOfDayInZone(input, tz);
  return new Date(d0.getTime() + 24 * 60 * 60 * 1000);
}

export { DEFAULT_TZ };
