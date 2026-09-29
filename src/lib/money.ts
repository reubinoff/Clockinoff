export function durationHours(startAt: Date, endAt: Date): number {
  const ms = endAt.getTime() - startAt.getTime();
  if (ms <= 0) return 0;
  return ms / 3_600_000;
}

export function durationSeconds(startAt: Date, endAt: Date): number {
  const ms = endAt.getTime() - startAt.getTime();
  if (ms <= 0) return 0;
  return Math.round(ms / 1000);
}

export function effectiveRate(
  entryRate: string | number | null | undefined,
  projectRate: string | number | null | undefined,
): number | null {
  const pick = entryRate ?? projectRate;
  if (pick === null || pick === undefined) return null;
  const n = typeof pick === "string" ? Number(pick) : pick;
  if (!Number.isFinite(n)) return null;
  return n;
}

export function computeAmount(params: {
  billable: boolean;
  startAt: Date;
  endAt: Date | null;
  entryRate: string | number | null | undefined;
  projectRate: string | number | null | undefined;
}): number | null {
  const { billable, startAt, endAt, entryRate, projectRate } = params;
  if (!billable || !endAt) return null;
  const rate = effectiveRate(entryRate, projectRate);
  if (rate === null) return null;
  const hours = durationHours(startAt, endAt);
  return Math.round(hours * rate * 100) / 100;
}
