import { listEntries, type EntryView, type ListEntriesFilters } from "./entries";
import { toCsv } from "@/lib/csv";
import {
  DEFAULT_TZ,
  formatDate,
  formatDurationHours,
  formatTime,
} from "@/lib/tz";
import { errors } from "@/lib/errors";

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
}

async function fetchAllClosed(userId: string, filters: ExportInput): Promise<EntryView[]> {
  const collected: EntryView[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 200; i++) {
    const listFilters: ListEntriesFilters = {
      from: filters.from,
      to: filters.to,
      project_id: filters.project_id ?? undefined,
      client_id: filters.client_id ?? undefined,
      tag_id: filters.tag_id ?? undefined,
      billable: filters.billable,
      include_running: false,
      limit: 200,
      cursor,
    };
    const page = await listEntries(userId, listFilters);
    collected.push(...page.entries);
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
