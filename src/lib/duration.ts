export interface HmParts {
  hours: number;
  minutes: number;
}

export function splitHm(totalSeconds: number): HmParts {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  return { hours, minutes };
}

export function combineHm(hours: number, minutes: number): number {
  const h = Number.isFinite(hours) ? Math.max(0, Math.floor(hours)) : 0;
  const m = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0;
  return h * 3600 + m * 60;
}

export function clampHours(h: number): number {
  if (!Number.isFinite(h)) return 0;
  if (h < 0) return 0;
  if (h > 999) return 999;
  return Math.floor(h);
}

export function clampMinutes(m: number): number {
  if (!Number.isFinite(m)) return 0;
  if (m < 0) return 0;
  if (m > 59) return 59;
  return Math.floor(m);
}

export function stepMinutes(current: number, delta: number): number {
  const raw = current + delta;
  if (raw < 0) return 0;
  if (raw > 59) return 59;
  return raw;
}

export function stepHours(current: number, delta: number): number {
  const raw = current + delta;
  if (raw < 0) return 0;
  if (raw > 999) return 999;
  return raw;
}

export function formatHm({ hours, minutes }: HmParts): string {
  const h = hours.toString().padStart(2, "0");
  const m = minutes.toString().padStart(2, "0");
  return `${h}:${m}`;
}
