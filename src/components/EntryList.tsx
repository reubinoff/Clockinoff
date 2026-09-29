"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate, formatDurationHours, formatTime } from "@/lib/tz";
import { emitToast, onEntryAdded } from "@/lib/events";
import { IconBillable, IconEdit } from "@/components/icons";
import EditEntrySheet, { type EditableEntry } from "@/components/EditEntrySheet";

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
  const [editingId, setEditingId] = useState<string | null>(null);
  // V2-6 §1: entry ids whose row should render with the spring-in class.
  // Cleared shortly after the animation duration so subsequent renders
  // (e.g. filter changes) don't re-play the animation on the same row.
  const [springIds, setSpringIds] = useState<Set<string>>(() => new Set());

  // Slice D (#47): after TimerBar Stop/Discard (or any timer→entry mutation)
  // the server component re-runs via router.refresh() and passes a fresh
  // `initial` prop, but useState only reads it on mount. Sync it so the list
  // reflects the just-stopped row without a hard reload.
  useEffect(() => {
    setEntries(initial);
  }, [initial]);

  useEffect(() => {
    return onEntryAdded<Entry>((added) => {
      setEntries((cur) =>
        cur.some((e) => e.id === added.id) ? cur : [added, ...cur],
      );
      setSpringIds((cur) => {
        const next = new Set(cur);
        next.add(added.id);
        return next;
      });
      // Match the moderate motion token (~280ms) plus a small slack. The class
      // only controls a one-shot enter animation; removing it after the fact
      // keeps subsequent re-renders quiet.
      setTimeout(() => {
        setSpringIds((cur) => {
          if (!cur.has(added.id)) return cur;
          const next = new Set(cur);
          next.delete(added.id);
          return next;
        });
      }, 400);
    });
  }, []);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (filterProject && e.project_id !== filterProject) return false;
      if (filterBillable === "true" && !e.billable) return false;
      if (filterBillable === "false" && e.billable) return false;
      if (filterQ && !e.description.toLowerCase().includes(filterQ.toLowerCase())) return false;
      return true;
    });
  }, [entries, filterProject, filterBillable, filterQ]);

  const editing = useMemo(
    () => entries.find((e) => e.id === editingId) ?? null,
    [entries, editingId],
  );

  async function remove(id: string): Promise<void> {
    if (!confirm("Delete this entry?")) return;
    const res = await fetch(`/api/entries/${id}`, { method: "DELETE" });
    if (res.ok) {
      setEntries((cur) => cur.filter((e) => e.id !== id));
      router.refresh();
    }
  }

  function beginEdit(e: Entry): void {
    if (e.running) return;
    setEditingId(e.id);
  }

  function onSaved(updated: EditableEntry): void {
    setEntries((cur) =>
      cur.map((e) => (e.id === updated.id ? ({ ...e, ...(updated as Partial<Entry>) } as Entry) : e)),
    );
    setEditingId(null);
    // V2-6 §2: locked copy — "Saved" fires on successful entry edit.
    emitToast("Saved");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          className="input w-full sm:w-auto sm:max-w-xs"
          placeholder="Search description…"
          value={filterQ}
          onChange={(e) => setFilterQ(e.target.value)}
        />
        <select
          className="input flex-1 sm:flex-none sm:max-w-[180px]"
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          aria-label="Filter by project"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          className="input flex-1 sm:flex-none sm:max-w-[140px]"
          value={filterBillable}
          onChange={(e) =>
            setFilterBillable(e.target.value as "" | "true" | "false")
          }
          aria-label="Filter by billable"
        >
          <option value="">Billable: any</option>
          <option value="true">Billable</option>
          <option value="false">Not billable</option>
        </select>
        <span className="text-xs text-muted">
          {filtered.length} of {entries.length}
        </span>
      </div>

      {/* Mobile: card rows */}
      <ul className="md:hidden space-y-2">
        {filtered.length === 0 && (
          <li className="card p-6 text-center text-muted text-sm">
            No entries yet. Start the timer above or add one manually.
          </li>
        )}
        {filtered.map((e) => {
          const s = new Date(e.start_at);
          const en = e.end_at ? new Date(e.end_at) : null;
          return (
            <li
              key={e.id}
              className={
                "card p-3 space-y-1.5" +
                (springIds.has(e.id) ? " entry-spring-in" : "")
              }
            >
              <p className="text-sm text-ink line-clamp-2">
                {e.description || (
                  <span className="text-muted">(no description)</span>
                )}
              </p>
              <p className="text-xs text-muted tabular-nums">
                <span className="timer-digits text-ink">
                  {formatDurationHours(e.duration_seconds)}h
                </span>
                <span className="mx-1.5">·</span>
                {formatDate(s, timezone)}
                <span className="mx-1.5">·</span>
                {formatTime(s, timezone)}–{en ? formatTime(en, timezone) : "…"}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {e.project_name ? (
                  <span className="chip">{e.project_name}</span>
                ) : null}
                {e.tag_names.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
                {e.billable && (
                  <span
                    className="inline-flex items-center gap-1 text-xs text-accent"
                    title="Billable"
                    aria-label="Billable"
                  >
                    <IconBillable size={14} aria-hidden />
                    {e.amount != null ? e.amount.toFixed(2) : ""}
                  </span>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                {!e.running && (
                  <button
                    className="btn"
                    onClick={() => beginEdit(e)}
                    aria-label="Edit entry"
                  >
                    <IconEdit size={16} aria-hidden />
                    <span>Edit</span>
                  </button>
                )}
                <button
                  className="btn btn-danger"
                  onClick={() => remove(e.id)}
                  aria-label="Delete entry"
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Desktop: table */}
      <div className="card overflow-x-auto hidden md:block">
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
                <tr
                  key={e.id}
                  className={
                    "border-t border-border h-12" +
                    (springIds.has(e.id) ? " entry-spring-in" : "")
                  }
                >
                  <td className="px-3 py-2">{formatDate(s, timezone)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatTime(s, timezone)}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {en ? formatTime(en, timezone) : "…"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatDurationHours(e.duration_seconds)}
                  </td>
                  <td className="px-3 py-2">{e.description || <span className="text-muted">(no description)</span>}</td>
                  <td className="px-3 py-2">
                    {e.project_name ? (
                      <span className="chip">{e.project_name}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
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
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="inline-flex gap-1.5">
                      {!e.running && (
                        <button
                          className="btn btn-sm"
                          onClick={() => beginEdit(e)}
                          aria-label="Edit entry"
                        >
                          <IconEdit size={14} aria-hidden />
                          <span>Edit</span>
                        </button>
                      )}
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => remove(e.id)}
                        aria-label="Delete entry"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Tags available: {tags.length}</p>
      {editing && (
        <EditEntrySheet
          entry={editing}
          projects={projects}
          tags={tags}
          timezone={timezone}
          onClose={() => setEditingId(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
