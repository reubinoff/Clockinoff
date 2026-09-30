"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  formatDate,
  formatDayLabel,
  formatDurationHours,
  formatTime,
} from "@/lib/tz";
import { emitToast, onEntryAdded } from "@/lib/events";
import { IconBillable, IconCheck, IconEdit } from "@/components/icons";
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
  billed: boolean;
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

interface DayGroup {
  key: string;
  label: string;
  totalSeconds: number;
  entries: Entry[];
}

// V2-7 §Day groups: bucket the filtered list by zoned day-key, preserving the
// server's newest-first order. `now` is passed in so Today/Yesterday labels
// track the user's clock without re-rendering every second — the daily
// boundary is stable within a session for practical purposes.
function groupByDay(entries: Entry[], timezone: string, now: Date): DayGroup[] {
  const groups: DayGroup[] = [];
  const byKey = new Map<string, DayGroup>();
  for (const e of entries) {
    const start = new Date(e.start_at);
    const key = formatDate(start, timezone);
    let g = byKey.get(key);
    if (!g) {
      g = {
        key,
        label: formatDayLabel(start, timezone, now),
        totalSeconds: 0,
        entries: [],
      };
      byKey.set(key, g);
      groups.push(g);
    }
    g.entries.push(e);
    g.totalSeconds += e.duration_seconds;
  }
  return groups;
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
  // Dana lock: single "Unbilled" chip on the day-entries list — default off.
  // On = show only entries where billable && !billed. There is no explicit
  // Billable/Not-billable filter; billed rows quietly recede into the muted
  // "Billed" meta on each row.
  const [filterUnbilled, setFilterUnbilled] = useState(false);
  const [filterQ, setFilterQ] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
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
      if (filterUnbilled && !(e.billable && !e.billed)) return false;
      if (filterQ && !e.description.toLowerCase().includes(filterQ.toLowerCase())) return false;
      return true;
    });
  }, [entries, filterProject, filterUnbilled, filterQ]);

  // Recompute Today/Yesterday labels on mount so a client whose clock advances
  // past midnight since SSR still sees the correct label after hydration.
  const now = useMemo(() => new Date(), []);
  const groups = useMemo(
    () => groupByDay(filtered, timezone, now),
    [filtered, timezone, now],
  );

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

  // Dana lock: Mark as billed stays on the list, does not open the edit
  // sheet, muted Billed meta replaces the row inline, and a "Marked as
  // billed" toast confirms. Only reachable when billable && !billed.
  async function markAsBilled(id: string): Promise<void> {
    setMenuOpenId(null);
    setMarkingId(id);
    try {
      const res = await fetch(`/api/entries/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ billed: true }),
      });
      if (res.ok) {
        const updated = (await res.json()) as Entry;
        setEntries((cur) => cur.map((e) => (e.id === id ? updated : e)));
        emitToast("Marked as billed");
        router.refresh();
      }
    } finally {
      setMarkingId(null);
    }
  }

  useEffect(() => {
    if (menuOpenId === null) return;
    function onDocClick(): void {
      setMenuOpenId(null);
    }
    document.addEventListener("click", onDocClick);
    return () => {
      document.removeEventListener("click", onDocClick);
    };
  }, [menuOpenId]);

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
    <div className="space-y-4">
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
        <button
          type="button"
          role="switch"
          aria-checked={filterUnbilled}
          onClick={() => setFilterUnbilled((v) => !v)}
          className={
            "chip min-h-[44px] shrink-0" + (filterUnbilled ? " chip-on" : "")
          }
          title="Show only unbilled entries"
          data-entries-unbilled-chip="true"
        >
          <IconBillable size={14} aria-hidden />
          <span>Unbilled</span>
        </button>
        <span className="text-xs text-muted">
          {filtered.length} of {entries.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-6 text-center text-muted text-sm">
          {filterUnbilled
            ? "Nothing unbilled in this range."
            : "No entries yet. Start the timer above."}
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.label} className="space-y-2">
              <header className="flex items-baseline justify-between px-1">
                <h3 className="text-body-sm font-semibold text-ink">
                  {g.label}
                </h3>
                <span className="text-xs text-muted tabular-nums">
                  <span className="timer-digits">
                    {formatDurationHours(g.totalSeconds)}
                  </span>
                  h total
                </span>
              </header>
              <ul className="space-y-1.5">
                {g.entries.map((e) => {
                  const s = new Date(e.start_at);
                  const en = e.end_at ? new Date(e.end_at) : null;
                  return (
                    <li
                      key={e.id}
                      className={
                        "card px-3 py-2.5" +
                        (springIds.has(e.id) ? " entry-spring-in" : "")
                      }
                    >
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="text-body-sm text-ink line-clamp-2 break-words">
                            {e.description || (
                              <span className="text-muted">
                                (no description)
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted tabular-nums">
                            <span className="timer-digits text-ink">
                              {formatDurationHours(e.duration_seconds)}h
                            </span>
                            <span className="mx-1.5">·</span>
                            {formatTime(s, timezone)}–
                            {en ? formatTime(en, timezone) : "…"}
                          </p>
                          {(e.project_name ||
                            e.tag_names.length > 0 ||
                            e.billable ||
                            e.billed) && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
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
                              {e.billed && (
                                <span
                                  className="inline-flex items-center gap-1 text-xs text-muted"
                                  title="Already billed"
                                  aria-label="Billed"
                                >
                                  <IconCheck size={12} aria-hidden />
                                  Billed
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          {!e.running && (
                            <button
                              className="btn btn-ghost h-11 min-h-[44px] w-11 min-w-[44px] px-0"
                              onClick={() => beginEdit(e)}
                              aria-label="Edit entry"
                              title="Edit"
                            >
                              <IconEdit size={16} aria-hidden />
                            </button>
                          )}
                          {!e.running && e.billable && !e.billed && (
                            <div className="relative">
                              <button
                                className="btn btn-ghost h-11 min-h-[44px] w-11 min-w-[44px] px-0"
                                onClick={(evt) => {
                                  evt.stopPropagation();
                                  setMenuOpenId((cur) => (cur === e.id ? null : e.id));
                                }}
                                aria-label="More actions"
                                aria-haspopup="menu"
                                aria-expanded={menuOpenId === e.id}
                                title="More"
                                data-entry-more-btn={e.id}
                              >
                                <span aria-hidden className="text-lg leading-none">
                                  ⋯
                                </span>
                              </button>
                              {menuOpenId === e.id && (
                                <div
                                  role="menu"
                                  className="absolute right-0 top-full z-10 mt-1 w-44 rounded-xl border border-border bg-surface shadow-card-lg py-1"
                                  onClick={(evt) => evt.stopPropagation()}
                                >
                                  <button
                                    role="menuitem"
                                    type="button"
                                    className="w-full text-left px-3 py-2 text-body-sm text-ink hover:bg-canvas-2 disabled:opacity-60"
                                    disabled={markingId === e.id}
                                    onClick={() => void markAsBilled(e.id)}
                                  >
                                    Mark as billed
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                          <button
                            className="btn btn-ghost h-11 min-h-[44px] w-11 min-w-[44px] px-0 text-danger hover:bg-danger-soft"
                            onClick={() => remove(e.id)}
                            aria-label="Delete entry"
                            title="Delete"
                          >
                            <span aria-hidden className="text-lg leading-none">
                              ×
                            </span>
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

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
