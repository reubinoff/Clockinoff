"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hoursFromSeconds, summarize, type ReportEntry, type ReportSummary } from "@/lib/report";
import { IconAlert, IconExport } from "@/components/icons";
import RangeBarChart from "@/components/reports/RangeBarChart";
import ProjectDonut from "@/components/reports/ProjectDonut";

interface ReportsSummaryProps {
  timezone: string;
}

type PresetKey = "today" | "this-week" | "last-week" | "this-month" | "last-month" | "custom";

interface Range {
  from: string;
  to: string;
}

const DEFAULT_PRESET = "this-month" as const;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayDate(): Date {
  return new Date();
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

export function rangeForPreset(key: Exclude<PresetKey, "custom">, now: Date = todayDate()): Range {
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
  // last-month
  const thisMonthStart = startOfMonth(now);
  const lastMonthEnd = new Date(thisMonthStart);
  lastMonthEnd.setDate(0);
  const lastMonthStart = startOfMonth(lastMonthEnd);
  return { from: fmtDate(lastMonthStart), to: fmtDate(endOfMonth(lastMonthStart)) };
}

const QUICK_RANGES: readonly { key: PresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "this-week", label: "This week" },
  { key: "last-week", label: "Last week" },
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "custom", label: "Custom" },
];

interface EntryApiRow {
  id: string;
  project_id: string | null;
  project_name: string | null;
  start_at: string;
  duration_seconds: number;
  running?: boolean;
}

interface EntryApiResponse {
  entries: EntryApiRow[];
  next_cursor: string | null;
}

const PAGE_SIZE = 200;
const MAX_PAGES = 50; // 10k entries over any range is way beyond realistic solo use.

function hoursText(seconds: number): string {
  return `${hoursFromSeconds(seconds).toFixed(2)}h`;
}

function formatRangeLabel(range: Range): string {
  const from = new Date(`${range.from}T00:00:00`);
  const to = new Date(`${range.to}T00:00:00`);
  const sameDay = range.from === range.to;
  const sameYear = from.getFullYear() === to.getFullYear();
  const fmtOpts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
  };
  const fromLabel = new Intl.DateTimeFormat("en-US", { ...fmtOpts, year: "numeric" }).format(from);
  if (sameDay) return fromLabel;
  const toLabel = new Intl.DateTimeFormat(
    "en-US",
    sameYear ? fmtOpts : { ...fmtOpts, year: "numeric" },
  ).format(to);
  return `${fromLabel} – ${toLabel}`;
}

export default function ReportsSummary({ timezone }: ReportsSummaryProps): JSX.Element {
  const initial = useMemo(() => rangeForPreset(DEFAULT_PRESET), []);
  const [selected, setSelected] = useState<PresetKey>(DEFAULT_PRESET);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [entries, setEntries] = useState<ReportEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Guard against a stale response landing after the user picked a new
  // range — only the latest request's rows are allowed to replace state.
  const requestSeq = useRef(0);

  const loadRange = useCallback(async (range: Range): Promise<void> => {
    const myRequestId = requestSeq.current + 1;
    requestSeq.current = myRequestId;
    setLoading(true);
    setError(null);
    try {
      const collected: EntryApiRow[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const url = new URL("/api/entries", window.location.origin);
        url.searchParams.set("from", range.from);
        url.searchParams.set("to", range.to);
        url.searchParams.set("limit", String(PAGE_SIZE));
        url.searchParams.set("include_running", "false");
        if (cursor) url.searchParams.set("cursor", cursor);
        const res = await fetch(url.pathname + url.search, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Entries request failed (${res.status})`);
        }
        const body = (await res.json()) as EntryApiResponse;
        for (const row of body.entries) {
          if (row.running) continue;
          collected.push(row);
        }
        if (!body.next_cursor) break;
        cursor = body.next_cursor;
      }
      if (requestSeq.current !== myRequestId) return;
      setEntries(
        collected.map((row) => ({
          id: row.id,
          project_id: row.project_id,
          project_name: row.project_name,
          start_at: row.start_at,
          duration_seconds: row.duration_seconds,
        })),
      );
    } catch (err) {
      if (requestSeq.current !== myRequestId) return;
      setError(err instanceof Error ? err.message : "Could not load entries");
      setEntries([]);
    } finally {
      if (requestSeq.current === myRequestId) {
        setLoading(false);
      }
    }
  }, []);

  // The /api/entries endpoint uses the request `from` as a `startAt >=` lower
  // bound in UTC and `to` as a `startAt <` upper bound. We also need `to` to
  // cover the whole last day, so we send the day *after* `to` to the server
  // and let `src/lib/report.ts` filter by zoned day-key for exact bucketing.
  const serverRangeForUi = useMemo<Range>(() => {
    const toDate = new Date(`${to}T00:00:00`);
    toDate.setDate(toDate.getDate() + 1);
    return { from, to: fmtDate(toDate) };
  }, [from, to]);

  useEffect(() => {
    loadRange(serverRangeForUi);
  }, [loadRange, serverRangeForUi]);

  const summary: ReportSummary = useMemo(
    () => summarize(entries, { from, to }, timezone),
    [entries, from, to, timezone],
  );

  function onPreset(key: PresetKey): void {
    setSelected(key);
    if (key === "custom") return;
    const next = rangeForPreset(key);
    setFrom(next.from);
    setTo(next.to);
  }

  function onFromChange(v: string): void {
    setFrom(v);
    setSelected("custom");
  }

  function onToChange(v: string): void {
    setTo(v);
    setSelected("custom");
  }

  const totalHoursLabel = hoursText(summary.totalSeconds);
  const rangeLabel = formatRangeLabel({ from, to });
  const exportHref = `/app/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const customOpen = selected === "custom";
  const peakDay = useMemo(
    () => summary.days.reduce((best, d) => (d.seconds > best ? d.seconds : best), 0),
    [summary.days],
  );
  const invalidRange = from > to;
  const showEmpty = !loading && !error && !invalidRange && summary.totalSeconds === 0;

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-title text-ink">Reports</h2>
          <p className="text-body-sm text-muted">
            Summary of your tracked hours. Running timer is excluded.
          </p>
        </div>
        <Link
          href={exportHref}
          className="btn"
          aria-label="Export this range as CSV or PDF"
        >
          <IconExport size={16} aria-hidden />
          <span>Export this range</span>
        </Link>
      </header>

      <div className="card p-4 md:p-5 space-y-4">
        <div>
          <span className="label" id="reports-quick-label">Range</span>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-labelledby="reports-quick-label"
          >
            {QUICK_RANGES.map((r) => {
              const active = selected === r.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => onPreset(r.key)}
                  aria-pressed={active}
                  className={"chip whitespace-nowrap shrink-0" + (active ? " chip-on" : "")}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>
        {customOpen ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="reports-from">From</label>
              <input
                id="reports-from"
                className="input"
                type="date"
                value={from}
                onChange={(e) => onFromChange(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="reports-to">To</label>
              <input
                id="reports-to"
                className="input"
                type="date"
                value={to}
                onChange={(e) => onToChange(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <p className="text-body-sm text-muted tabular-nums">{rangeLabel}</p>
        )}
        {invalidRange && (
          <p className="text-body-sm text-danger" role="status" aria-live="polite">
            Pick a “From” on or before “To”.
          </p>
        )}
        {error && !invalidRange && (
          <p className="text-body-sm text-danger inline-flex items-center gap-1" role="status" aria-live="polite">
            <IconAlert size={16} aria-hidden />
            {error}
          </p>
        )}
      </div>

      <div className="card p-5 md:p-6 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-label text-muted uppercase tracking-wide">Total</p>
            <p className="text-[2.5rem] leading-tight font-semibold text-ink tabular-nums">
              {totalHoursLabel}
            </p>
            <p className="text-body-sm text-muted">{rangeLabel}</p>
          </div>
          <p className="text-body-sm text-muted">
            Peak day · {hoursText(peakDay)}
          </p>
        </div>
        <div
          className="relative"
          aria-busy={loading}
          aria-live="polite"
        >
          <RangeBarChart days={summary.days} timezone={timezone} />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface/60">
              <span className="quiet-pulse-spinner" aria-hidden />
              <span className="sr-only">Loading entries…</span>
            </div>
          )}
        </div>
        {showEmpty && (
          <p className="text-body-sm text-muted">
            No entries in this range. Try a different window above, or log one from the Timer.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <div className="md:col-span-3 card p-5 md:p-6 space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-body font-medium text-ink">By project</h3>
            <span className="text-body-sm text-muted tabular-nums">
              {summary.projects.length} {summary.projects.length === 1 ? "project" : "projects"}
            </span>
          </div>
          {summary.projects.length === 0 ? (
            <p className="text-body-sm text-muted">
              {loading ? "Loading…" : "No projects to group — log an entry first."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {summary.projects.map((p) => (
                <li key={p.key} className="flex items-center gap-3 py-2.5">
                  <span
                    aria-hidden
                    className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="flex-1 min-w-0 truncate text-ink">{p.name}</span>
                  <span className="text-body-sm text-muted tabular-nums shrink-0">
                    {Math.round(p.share * 100)}%
                  </span>
                  <span className="tabular-nums text-ink min-w-[72px] text-right">
                    {hoursText(p.seconds)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="md:col-span-2 card p-5 md:p-6">
          <h3 className="text-body font-medium text-ink mb-3">Distribution</h3>
          <ProjectDonut
            projects={summary.projects}
            centerLabel={totalHoursLabel}
            centerSublabel="Total"
          />
        </div>
      </div>
    </section>
  );
}
