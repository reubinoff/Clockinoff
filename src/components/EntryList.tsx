"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate, formatDurationHours, formatTime } from "@/lib/tz";

interface Entry {
  id: string;
  description: string;
  project_id: string | null;
  project_name: string | null;
  client_name: string | null;
  start_at: string;
  end_at: string | null;
  duration_seconds: number;
  billable: boolean;
  rate: number | null;
  effective_rate: number | null;
  amount: number | null;
  tag_ids: string[];
  tag_names: string[];
  running: boolean;
}

interface Option {
  id: string;
  name: string;
}

export default function EntryList({
  initial,
  projects,
  tags,
  timezone,
}: {
  initial: Entry[];
  projects: Option[];
  tags: Option[];
  timezone: string;
}): JSX.Element {
  const router = useRouter();
  const [entries, setEntries] = useState(initial);
  const [filterProject, setFilterProject] = useState("");
  const [filterBillable, setFilterBillable] = useState<"" | "true" | "false">("");
  const [filterQ, setFilterQ] = useState("");

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (filterProject && e.project_id !== filterProject) return false;
      if (filterBillable === "true" && !e.billable) return false;
      if (filterBillable === "false" && e.billable) return false;
      if (filterQ && !e.description.toLowerCase().includes(filterQ.toLowerCase())) return false;
      return true;
    });
  }, [entries, filterProject, filterBillable, filterQ]);

  async function remove(id: string): Promise<void> {
    if (!confirm("Delete this entry?")) return;
    const res = await fetch(`/api/entries/${id}`, { method: "DELETE" });
    if (res.ok) {
      setEntries((cur) => cur.filter((e) => e.id !== id));
      router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          className="input max-w-xs"
          placeholder="Search description…"
          value={filterQ}
          onChange={(e) => setFilterQ(e.target.value)}
        />
        <select
          className="input max-w-[180px]"
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          className="input max-w-[140px]"
          value={filterBillable}
          onChange={(e) =>
            setFilterBillable(e.target.value as "" | "true" | "false")
          }
        >
          <option value="">Billable: any</option>
          <option value="true">Billable</option>
          <option value="false">Not billable</option>
        </select>
        <span className="text-xs text-muted">
          {filtered.length} of {entries.length}
        </span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-canvas-2 text-xs text-muted">
            <tr>
              <th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Start</th>
              <th className="text-left px-3 py-2">End</th>
              <th className="text-right px-3 py-2">Hours</th>
              <th className="text-left px-3 py-2">Description</th>
              <th className="text-left px-3 py-2">Project</th>
              <th className="text-left px-3 py-2">Tags</th>
              <th className="text-right px-3 py-2">Amount</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-10 text-muted">
                  No entries yet. Start the timer above or add one manually.
                </td>
              </tr>
            )}
            {filtered.map((e) => {
              const s = new Date(e.start_at);
              const en = e.end_at ? new Date(e.end_at) : null;
              return (
                <tr key={e.id} className="border-t border-border">
                  <td className="px-3 py-2">{formatDate(s, timezone)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatTime(s, timezone)}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {en ? formatTime(en, timezone) : "…"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatDurationHours(e.duration_seconds)}
                  </td>
                  <td className="px-3 py-2">{e.description || <span className="text-muted">(no description)</span>}</td>
                  <td className="px-3 py-2">{e.project_name ?? <span className="text-muted">—</span>}</td>
                  <td className="px-3 py-2 space-x-1">
                    {e.tag_names.map((t) => (
                      <span key={t} className="tag">
                        {t}
                      </span>
                    ))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {e.billable && e.amount != null ? e.amount.toFixed(2) : ""}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button className="btn btn-danger text-xs" onClick={() => remove(e.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Tags available: {tags.length}</p>
    </div>
  );
}
