import { listEntries, type EntryView, type ListEntriesFilters } from "./entries";
import { toCsv } from "@/lib/csv";
import {
  DEFAULT_TZ,
  endOfDayExclusiveInZone,
  formatDate,
  formatDurationHours,
  formatTime,
  zonedIsoToUtc,
} from "@/lib/tz";
import { errors } from "@/lib/errors";

export const EXPORT_MAX_SPAN_DAYS = 366;
export const EXPORT_MAX_ROWS = 10_000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EXPORT_PAGE_SIZE = 200;

// `billed` is appended at the end so existing CSV consumers keep their column
// indices; the older columns (`billable`, `rate`, `amount`) keep their names
// and positions. See EXPORT-PDF brief §Columns.
export const EXPORT_HEADERS = [
  "date",
  "start",
  "end",
  "duration",
  "description",
  "project",
  "client",
  "tags",
  "billable",
  "rate",
  "amount",
  "billed",
] as const;

export interface ExportInput {
  from: Date;
  to: Date;
  timezone?: string;
  project_id?: string | null;
  client_id?: string | null;
  tag_id?: string | null;
  billable?: boolean;
}

export interface ExportRow {
  date: string;
  start: string;
  end: string;
  duration: string;
  description: string;
  project: string;
  client: string;
  tags: string;
  billable: string;
  rate: string;
  amount: string;
  billed: string;
}

export function parseExportBound(v: string | null, tz: string, endOfDay = false): Date | undefined {
  if (!v) return undefined;
  // Reject control characters so `from=2026-01-01%0D%0A` cannot reach
  // `Content-Disposition` or be silently accepted by `new Date`.
  if (/[\u0000-\u001F\u007F]/.test(v)) return undefined;
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      return endOfDay ? endOfDayExclusiveInZone(v, tz) : zonedIsoToUtc(v, tz);
    }
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d;
  } catch {
    return undefined;
  }
}

export function exportDownloadFilename(from: Date, to: Date, ext: "csv" | "pdf"): string {
  return `timely-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.${ext}`;
}

async function fetchAllClosed(userId: string, filters: ExportInput): Promise<EntryView[]> {
  const collected: EntryView[] = [];
  let cursor: string | null = null;
  const maxPages = Math.ceil(EXPORT_MAX_ROWS / EXPORT_PAGE_SIZE) + 1;
  for (let i = 0; i < maxPages; i++) {
    const listFilters: ListEntriesFilters = {
      from: filters.from,
      to: filters.to,
      project_id: filters.project_id ?? undefined,
      client_id: filters.client_id ?? undefined,
      tag_id: filters.tag_id ?? undefined,
      billable: filters.billable,
      include_running: false,
      limit: EXPORT_PAGE_SIZE,
      cursor,
    };
    const page = await listEntries(userId, listFilters);
    collected.push(...page.entries);
    if (collected.length > EXPORT_MAX_ROWS) {
      throw errors.validation(
        `Export is limited to ${EXPORT_MAX_ROWS} entries. Narrow the date range and try again.`,
      );
    }
    if (!page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return collected;
}

export function toExportRow(entry: EntryView, tz: string): ExportRow {
  const start = new Date(entry.start_at);
  const end = entry.end_at ? new Date(entry.end_at) : null;
  return {
    date: formatDate(start, tz),
    start: formatTime(start, tz),
    end: end ? formatTime(end, tz) : "",
    duration: formatDurationHours(entry.duration_seconds),
    description: entry.description,
    project: entry.project_name ?? "",
    client: entry.client_name ?? "",
    tags: entry.tag_names.join(", "),
    billable: entry.billable ? "yes" : "no",
    rate: entry.effective_rate == null ? "" : entry.effective_rate.toFixed(2),
    amount: entry.amount == null ? "" : entry.amount.toFixed(2),
    // `billed` only meaningfully applies to billable entries (server + DB
    // check enforces this) but we still stamp "no" on non-billable rows so
    // the column is never blank — matches the `billable` column's shape.
    billed: entry.billed ? "yes" : "no",
  };
}

export function validateExportRange(input: {
  from?: Date;
  to?: Date;
}): { from: Date; to: Date } {
  if (!input.from || isNaN(input.from.getTime())) {
    throw errors.validation("from is required");
  }
  if (!input.to || isNaN(input.to.getTime())) {
    throw errors.validation("to is required");
  }
  if (input.from.getTime() > input.to.getTime()) {
    throw errors.validation("from must be <= to");
  }
  if (input.to.getTime() - input.from.getTime() > EXPORT_MAX_SPAN_DAYS * MS_PER_DAY) {
    throw errors.validation(
      `Export range cannot exceed ${EXPORT_MAX_SPAN_DAYS} days. Narrow the dates and try again.`,
    );
  }
  return { from: input.from, to: input.to };
}

export async function getExportRows(
  userId: string,
  input: ExportInput,
  tz: string = DEFAULT_TZ,
): Promise<{ rows: ExportRow[]; totalSeconds: number; totalAmount: number; entries: EntryView[] }> {
  const entries = await fetchAllClosed(userId, input);
  const rows = entries.map((e) => toExportRow(e, tz));
  const totalSeconds = entries.reduce((s, e) => s + e.duration_seconds, 0);
  const totalAmount = entries.reduce((s, e) => s + (e.amount ?? 0), 0);
  return { rows, totalSeconds, totalAmount, entries };
}

export function rowsToCsv(rows: readonly ExportRow[]): string {
  const data = rows.map((r) => EXPORT_HEADERS.map((h) => r[h]));
  return toCsv(data, EXPORT_HEADERS as unknown as readonly string[]);
}
