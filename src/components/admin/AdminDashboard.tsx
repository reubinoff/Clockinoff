"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import RangeBarChart from "@/components/reports/RangeBarChart";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import type { DayBucket } from "@/lib/report";
import { rangeForPreset, type RangePresetKey } from "@/lib/range-presets";

interface Stats {
  users: number;
  active: number;
  admins: number;
  hours: number;
  signups_by_day: { date: string; count: number }[];
  active_users_by_day: { date: string; count: number }[];
  hours_by_day: { date: string; hours: number }[];
}

const RANGES: readonly { key: Exclude<RangePresetKey, "today">; label: string }[] = [
  { key: "this-week", label: "This week" },
  { key: "last-week", label: "Last week" },
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "custom", label: "Custom" },
];

function countsToDays(rows: { date: string; count: number }[]): DayBucket[] {
  return rows.map((row) => ({ key: row.date, seconds: row.count }));
}

function hoursToDays(rows: { date: string; hours: number }[]): DayBucket[] {
  return rows.map((row) => ({ key: row.date, seconds: Math.round(row.hours * 3600) }));
}

function seriesEmpty(days: readonly DayBucket[]): boolean {
  return days.every((d) => d.seconds <= 0);
}

export default function AdminDashboard({ timezone }: { timezone: string }): JSX.Element {
  const initial = useMemo(() => rangeForPreset("this-month"), []);
  const [selected, setSelected] = useState<Exclude<RangePresetKey, "today">>("this-month");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (range: { from: string; to: string }) => {
    setError(null);
    const url = `/api/admin/stats?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      setStats(null);
      setError("Couldn’t load instance stats. Try again.");
      return;
    }
    setStats((await res.json()) as Stats);
  }, []);

  useEffect(() => {
    if (from > to) return;
    void load({ from, to });
  }, [from, to, load]);

  function onPreset(key: Exclude<RangePresetKey, "today">): void {
    setSelected(key);
    if (key === "custom") return;
    const next = rangeForPreset(key);
    setFrom(next.from);
    setTo(next.to);
  }

  const signupDays = stats ? countsToDays(stats.signups_by_day) : [];
  const activeDays = stats ? countsToDays(stats.active_users_by_day) : [];
  const hourDays = stats ? hoursToDays(stats.hours_by_day) : [];
  const invalid = from > to;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <AdminPageHeader title="Overview" subcopy="Instance usage at a glance." />
        <Link href="/admin/users" className="text-body-sm text-muted hover:text-ink underline underline-offset-2">
          View users
        </Link>
      </div>

      <div className="card p-4 md:p-5 space-y-4">
        <div>
          <span className="label" id="admin-range-label">Range</span>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="admin-range-label">
            {RANGES.map((r) => {
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
        {selected === "custom" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="admin-from">From</label>
              <input
                id="admin-from"
                className="input"
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setSelected("custom");
                }}
              />
            </div>
            <div>
              <label className="label" htmlFor="admin-to">To</label>
              <input
                id="admin-to"
                className="input"
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setSelected("custom");
                }}
              />
            </div>
          </div>
        ) : null}
        {invalid ? (
          <p className="text-body-sm text-danger" role="status">Pick a From on or before To.</p>
        ) : null}
        {error ? (
          <p className="text-body-sm text-danger" role="status">{error}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Users" value={stats ? String(stats.users) : "–"} />
        <Kpi label="Active" value={stats ? String(stats.active) : "–"} />
        <Kpi label="Admins" value={stats ? String(stats.admins) : "–"} />
        <Kpi label="Hours" value={stats ? `${stats.hours.toFixed(2)}h` : "–"} />
      </div>

      <ChartCard
        title="Signups"
        empty={stats != null && seriesEmpty(signupDays)}
      >
        <RangeBarChart days={signupDays} timezone={timezone} unit="count" ariaLabel="Signups by day" />
      </ChartCard>
      <ChartCard
        title="Active users"
        empty={stats != null && seriesEmpty(activeDays)}
      >
        <RangeBarChart
          days={activeDays}
          timezone={timezone}
          unit="count"
          ariaLabel="Active users by day"
        />
      </ChartCard>
      <ChartCard
        title="Hours tracked"
        empty={stats != null && seriesEmpty(hourDays)}
      >
        <RangeBarChart days={hourDays} timezone={timezone} unit="hours" ariaLabel="Hours by day" />
      </ChartCard>
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
      <p className="text-label text-muted">{label}</p>
      <p className="mt-1 text-title text-ink tabular-nums">{value}</p>
    </div>
  );
}

function ChartCard({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="card p-4 md:p-5">
      <h2 className="text-body font-medium text-ink mb-2">{title}</h2>
      {children}
      {empty ? (
        <p className="mt-3 text-body-sm text-muted">No activity in this range.</p>
      ) : null}
    </div>
  );
}
