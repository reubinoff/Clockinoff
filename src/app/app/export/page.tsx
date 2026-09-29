"use client";

import { useState } from "react";

function today(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const pad = (x: number): string => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function ExportPage(): JSX.Element {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [format, setFormat] = useState<"csv" | "pdf">("csv");

  function download(): void {
    const url = `/api/export/${format}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    window.open(url, "_blank", "noopener");
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Export</h2>
        <p className="text-sm text-muted">CSV or PDF. Date range required.</p>
      </div>
      <div className="card p-6 space-y-4 max-w-md">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">From</label>
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">To</label>
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Format</label>
          <div className="flex gap-2">
            {(["csv", "pdf"] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`btn ${format === f ? "btn-primary" : ""}`}
                onClick={() => setFormat(f)}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <button className="btn btn-primary w-full" onClick={download} disabled={!from || !to}>
          Download {format.toUpperCase()}
        </button>
      </div>
    </section>
  );
}
