"use client";

import { useMemo, useState } from "react";
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

type Preset = "today" | "week" | "month";
type QuickRange = Preset | "custom";

interface PresetRange {
  from: string;
  to: string;
}

function presetRange(kind: Preset): PresetRange {
  const t = today();
  if (kind === "today") return { from: t, to: t };
  if (kind === "week") return { from: startOfWeek(), to: t };
  return { from: startOfMonth(), to: t };
}

const QUICK_RANGES: readonly { key: QuickRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "custom", label: "Custom" },
];

async function readExportError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    if (typeof body.error?.message === "string" && body.error.message.length > 0) {
      return body.error.message;
    }
  } catch {
    // Non-JSON error body — keep the generic fallback.
  }
  return "Couldn't prepare the export. Try again.";
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ExportPage(): JSX.Element {
  const initial = useMemo(() => presetRange("month"), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [selected, setSelected] = useState<QuickRange>("month");
  const [pending, setPending] = useState<"csv" | "pdf" | null>(null);
  const [isEmpty, setIsEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function editFrom(v: string): void {
    setFrom(v);
    setSelected("custom");
    setIsEmpty(false);
    setError(null);
  }

  function editTo(v: string): void {
    setTo(v);
    setSelected("custom");
    setIsEmpty(false);
    setError(null);
  }

  function onQuick(key: QuickRange): void {
    setSelected(key);
    setIsEmpty(false);
    setError(null);
    if (key === "custom") return;
    const r = presetRange(key);
    setFrom(r.from);
    setTo(r.to);
  }

  async function download(format: "csv" | "pdf"): Promise<void> {
    if (pending) return;
    setPending(format);
    setIsEmpty(false);
    setError(null);
    try {
      const csvUrl = `/api/export/csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      const csvRes = await fetch(csvUrl, { cache: "no-store" });
      if (!csvRes.ok) {
        setError(await readExportError(csvRes));
        return;
      }
      const csvBlob = await csvRes.blob();
      const csvText = await csvBlob.text();
      const dataLines = csvText.split(/\r?\n/).slice(1).filter((l) => l.length > 0);
      if (dataLines.length === 0) {
        setIsEmpty(true);
        return;
      }
      if (format === "csv") {
        triggerDownload(csvBlob, `timely-${from}-${to}.csv`);
        return;
      }
      const pdfUrl = `/api/export/pdf?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      const pdfRes = await fetch(pdfUrl, { cache: "no-store" });
      if (!pdfRes.ok) {
        setError(await readExportError(pdfRes));
        return;
      }
      const pdfBlob = await pdfRes.blob();
      triggerDownload(pdfBlob, `timely-${from}-${to}.pdf`);
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-title text-ink">Export</h2>
        <p className="text-body-sm text-muted">CSV or PDF. Date range required.</p>
      </div>
      <div className="card w-full p-6 space-y-4">
        <div>
          <label className="label" id="export-quick-label">Quick ranges</label>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-labelledby="export-quick-label"
          >
            {QUICK_RANGES.map((r) => {
              const isActive = selected === r.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => onQuick(r.key)}
                  aria-pressed={isActive}
                  className={
                    "chip whitespace-nowrap shrink-0" +
                    (isActive ? " chip-on" : "")
                  }
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>
        {/* From/To are two columns from sm up. CSV and PDF stay on one
            baseline with each other; at xl that pair lines up with the
            bottom of the date fields. */}
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:flex xl:gap-4">
          <div className="min-w-0 xl:w-56">
            <label className="label" htmlFor="export-from">From</label>
            <input
              id="export-from"
              className="input"
              type="date"
              value={from}
              onChange={(e) => editFrom(e.target.value)}
            />
          </div>
          <div className="min-w-0 xl:w-56">
            <label className="label" htmlFor="export-to">To</label>
            <input
              id="export-to"
              className="input"
              type="date"
              value={to}
              onChange={(e) => editTo(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-end xl:col-auto xl:shrink-0">
            <button
              className="btn btn-primary w-full sm:w-auto"
              onClick={() => download("csv")}
              disabled={!from || !to || pending !== null}
            >
              <IconExport size={16} aria-hidden />
              <span>{pending === "csv" ? "Preparing…" : "Download CSV"}</span>
            </button>
            <button
              className="btn w-full sm:w-auto"
              onClick={() => download("pdf")}
              disabled={!from || !to || pending !== null}
            >
              <IconExport size={16} aria-hidden />
              <span>{pending === "pdf" ? "Preparing…" : "Download PDF"}</span>
            </button>
          </div>
        </div>
        {isEmpty && (
          <p
            className="text-body-sm text-muted"
            role="status"
            aria-live="polite"
          >
            No entries in this range — try different dates.
          </p>
        )}
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
