"use client";

import { useState } from "react";
import { IconExport } from "@/components/icons";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function today(): string {
  return fmt(new Date());
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return fmt(d);
}

function startOfWeek(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = (day + 6) % 7; // Monday-start
  d.setDate(d.getDate() - diff);
  return fmt(d);
}

function startOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  return fmt(d);
}

type Range = { label: string; from: string; to: string };

function buildRanges(): Range[] {
  const t = today();
  return [
    { label: "Today", from: t, to: t },
    { label: "This week", from: startOfWeek(), to: t },
    { label: "This month", from: startOfMonth(), to: t },
    { label: "Last 30 days", from: daysAgo(30), to: t },
  ];
}

export default function ExportPage(): JSX.Element {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());

  function download(format: "csv" | "pdf"): void {
    const url = `/api/export/${format}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    window.open(url, "_blank", "noopener");
  }

  const ranges = buildRanges();

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Export</h2>
        <p className="text-sm text-muted">CSV or PDF. Date range required.</p>
      </div>
      <div className="card p-6 space-y-4 md:max-w-md">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="export-from">From</label>
            <input
              id="export-from"
              className="input"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="export-to">To</label>
            <input
              id="export-to"
              className="input"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label">Quick ranges</label>
          <div
            className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1"
            role="group"
            aria-label="Quick ranges"
          >
            {ranges.map((r) => {
              const active = r.from === from && r.to === to;
              return (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => {
                    setFrom(r.from);
                    setTo(r.to);
                  }}
                  className={
                    "chip whitespace-nowrap shrink-0" +
                    (active ? " chip-on" : "")
                  }
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            className="btn btn-primary w-full sm:flex-1"
            onClick={() => download("csv")}
            disabled={!from || !to}
          >
            <IconExport size={16} aria-hidden />
            <span>Download CSV</span>
          </button>
          <button
            className="btn w-full sm:flex-1"
            onClick={() => download("pdf")}
            disabled={!from || !to}
          >
            <IconExport size={16} aria-hidden />
            <span>Download PDF</span>
          </button>
        </div>
      </div>
    </section>
  );
}
