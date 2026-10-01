"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatDate,
  formatDayLabel,
  formatDurationHours,
  formatTime,
  formatWeekRangeLabel,
  startOfIsoWeekKey,
} from "@/lib/tz";
import { emitToast, onEntryAdded } from "@/lib/events";
import { handleAuthFailure, isAuthFailure } from "@/lib/auth-ui";
import { IconBillable, IconCheck, IconEdit, IconX } from "@/components/icons";
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

// #81 Mobile Week → Day → Entry: each week carries its Monday-first date-
// range label plus the day groups that fall inside it. We keep the day-group
// shape and totalling untouched so the per-day card chrome keeps working
// identically; the week wrapper is purely additive.
interface WeekGroup {
  key: string;
  label: string;
  totalSeconds: number;
  days: DayGroup[];
}

// V2-7 §Day groups → #81 Week → Day groups: bucket the filtered list by
// zoned day-key first, then by that day's ISO (Monday-first) week-key,
// preserving the server's newest-first order. `now` is passed in so
// Today/Yesterday labels + the "This week" week-label track the user's
// clock without re-rendering every second — both boundaries are stable
// within a session for practical purposes.
function groupByWeek(entries: Entry[], timezone: string, now: Date): WeekGroup[] {
  const weeks: WeekGroup[] = [];
  const byWeekKey = new Map<string, WeekGroup>();
  const byDayKey = new Map<string, DayGroup>();
  for (const e of entries) {
    const start = new Date(e.start_at);
    const dayKey = formatDate(start, timezone);
    const weekKey = startOfIsoWeekKey(start, timezone);
    let w = byWeekKey.get(weekKey);
    if (!w) {
      w = {
        key: weekKey,
        label: formatWeekRangeLabel(weekKey, now, timezone),
        totalSeconds: 0,
        days: [],
      };
      byWeekKey.set(weekKey, w);
      weeks.push(w);
    }
    let d = byDayKey.get(dayKey);
    if (!d) {
      d = {
        key: dayKey,
        label: formatDayLabel(start, timezone, now),
        totalSeconds: 0,
        entries: [],
      };
      byDayKey.set(dayKey, d);
      w.days.push(d);
    }
    d.entries.push(e);
    d.totalSeconds += e.duration_seconds;
    w.totalSeconds += e.duration_seconds;
  }
  return weeks;
}

// Shaul-locked (2026-10-01) billed redesign: a closed billable entry is the
// only shape the Select / sticky bar can act on. Running timer never shows a
// checkbox; non-billable rows render a locked disabled checkbox stub so the
// user can see why they're outside the selection surface.
function isSelectable(e: Entry): boolean {
  return !e.running && e.billable;
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
  // #54 Shaul lock: track every row currently in flight (Save / Delete /
  // Mark billed single-row) so the row can carry the Quiet Pulse dim wash.
  // A set — rather than a single id — lets rapid clicks on different rows
  // all surface pending chrome without one stepping on the other.
  const [pendingRowIds, setPendingRowIds] = useState<Set<string>>(() => new Set());
  // Shaul-locked billed redesign: select mode + checked ids. Entering select
  // mode replaces per-row Edit/⋯/Delete chrome with a 44px checkbox so a
  // single tap toggles instead of opening the sheet. Any filter / search
  // change clears selection + exits select mode so N selected can't lie.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkPending, setBulkPending] = useState(false);
  // V2-6 §1: entry ids whose row should render with the spring-in class.
  // Cleared shortly after the animation duration so subsequent renders
  // (e.g. filter changes) don't re-play the animation on the same row.
  const [springIds, setSpringIds] = useState<Set<string>>(() => new Set());

  // #54 Shaul lock: before dropping router.refresh() the server component
  // used to re-run on every mutation and push a fresh `initial` prop into
  // the list; we now rely on the local optimistic/response state as the
  // source of truth. We still sync the prop so a real cross-tree refresh
  // (e.g. navigation back to /app) still reconciles.
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

  // Dana lock: changing filters clears selection + exits select mode so the
  // sticky bar count can never reference a hidden row.
  const prevFilterKeyRef = useRef<string>(`${filterProject}|${filterUnbilled}|${filterQ}`);
  useEffect(() => {
    const key = `${filterProject}|${filterUnbilled}|${filterQ}`;
    if (key !== prevFilterKeyRef.current) {
      prevFilterKeyRef.current = key;
      if (selectedIds.size > 0) setSelectedIds(new Set());
      if (selectMode) setSelectMode(false);
    }
  }, [filterProject, filterUnbilled, filterQ, selectedIds.size, selectMode]);

  // Prune the selection if a row left the list (deleted / mutated out of
  // scope between fetches) so the sticky bar count stays truthful.
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const visible = new Set(filtered.map((e) => e.id));
    let pruned = false;
    const next = new Set<string>();
    for (const id of selectedIds) {
      if (visible.has(id)) next.add(id);
      else pruned = true;
    }
    if (pruned) setSelectedIds(next);
  }, [filtered, selectedIds]);

  // Recompute Today/Yesterday + "This week" labels on mount so a client
  // whose clock advances past midnight since SSR still sees the correct
  // labels after hydration.
  const now = useMemo(() => new Date(), []);
  const weeks = useMemo(
    () => groupByWeek(filtered, timezone, now),
    [filtered, timezone, now],
  );

  const editing = useMemo(
    () => entries.find((e) => e.id === editingId) ?? null,
    [entries, editingId],
  );

  const selectedList = useMemo(
    () => filtered.filter((e) => selectedIds.has(e.id)),
    [filtered, selectedIds],
  );
  const unbilledSelectedIds = useMemo(
    () => selectedList.filter((e) => e.billable && !e.billed).map((e) => e.id),
    [selectedList],
  );
  const billedSelectedIds = useMemo(
    () => selectedList.filter((e) => e.billable && e.billed).map((e) => e.id),
    [selectedList],
  );
  const visibleSelectable = useMemo(
    () => filtered.filter(isSelectable),
    [filtered],
  );
  const allVisibleSelected =
    visibleSelectable.length > 0 &&
    visibleSelectable.every((e) => selectedIds.has(e.id));

  function markRowPending(id: string, pending: boolean): void {
    setPendingRowIds((cur) => {
      const has = cur.has(id);
      if (pending && has) return cur;
      if (!pending && !has) return cur;
      const next = new Set(cur);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function remove(id: string): Promise<void> {
    setMenuOpenId(null);
    if (!confirm("Delete this entry?")) return;
    // #54 Shaul lock: optimistic remove. On auth failure we restore the
    // row; on other failures we also restore so the user doesn't see a
    // ghost delete that never happened.
    const snapshot = entries;
    const previous = entries.find((e) => e.id === id) ?? null;
    const previousIndex = entries.findIndex((e) => e.id === id);
    markRowPending(id, true);
    setEntries((cur) => cur.filter((e) => e.id !== id));
    setSelectedIds((cur) => {
      if (!cur.has(id)) return cur;
      const next = new Set(cur);
      next.delete(id);
      return next;
    });
    try {
      const res = await fetch(`/api/entries/${id}`, { method: "DELETE" });
      if (res.ok) return;
      if (isAuthFailure(res.status)) {
        handleAuthFailure({
          rollback: () => setEntries(snapshot),
        });
        return;
      }
      // Non-auth failure: put the row back where it was so the UI doesn't
      // imply a successful delete.
      if (previous) {
        setEntries((cur) => {
          if (cur.some((e) => e.id === previous.id)) return cur;
          const next = cur.slice();
          const idx = previousIndex >= 0 ? previousIndex : next.length;
          next.splice(Math.min(idx, next.length), 0, previous);
          return next;
        });
      }
      emitToast("Couldn't delete entry. Try again.");
    } catch {
      if (previous) {
        setEntries((cur) =>
          cur.some((e) => e.id === previous.id) ? cur : [previous, ...cur],
        );
      }
      emitToast("Couldn't delete entry. Try again.");
    } finally {
      markRowPending(id, false);
    }
  }

  // Single-row ⋯ path (outside select mode). Flips billed in place, muted
  // Billed meta appears, keeps the row on the list. Fires the locked
  // "Marked as billed" / "Marked as unbilled" toast.
  async function patchSingleBilled(id: string, billed: boolean): Promise<void> {
    setMenuOpenId(null);
    // #54 Shaul lock: optimistic flip; rollback on failure. The /api/entries
    // PATCH response body is the full updated entry — we take it as the
    // authoritative shape, so no router.refresh() is needed to re-fetch.
    const previous = entries.find((e) => e.id === id) ?? null;
    markRowPending(id, true);
    setEntries((cur) => cur.map((e) => (e.id === id ? { ...e, billed } : e)));
    try {
      const res = await fetch(`/api/entries/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ billed }),
      });
      if (res.ok) {
        const updated = (await res.json()) as Entry;
        setEntries((cur) => cur.map((e) => (e.id === id ? updated : e)));
        emitToast(billed ? "Marked as billed" : "Marked as unbilled");
        return;
      }
      if (isAuthFailure(res.status)) {
        handleAuthFailure({
          rollback: () => {
            if (previous)
              setEntries((cur) =>
                cur.map((e) => (e.id === id ? previous : e)),
              );
          },
        });
        return;
      }
      if (previous) {
        setEntries((cur) => cur.map((e) => (e.id === id ? previous : e)));
      }
      emitToast("Couldn't update entry. Try again.");
    } catch {
      if (previous) {
        setEntries((cur) => cur.map((e) => (e.id === id ? previous : e)));
      }
      emitToast("Couldn't update entry. Try again.");
    } finally {
      markRowPending(id, false);
    }
  }

  async function runBatch(ids: string[], billed: boolean): Promise<void> {
    if (ids.length === 0 || bulkPending) return;
    // #54 Shaul lock: optimistic apply + rollback on failure. The server
    // returns `{ updated }` — our local list already matches the shape it
    // enforces (billable && billed === billed), so no router.refresh.
    const snapshot = entries;
    const previousById = new Map<string, Entry>();
    for (const e of entries) if (ids.includes(e.id)) previousById.set(e.id, e);
    setBulkPending(true);
    for (const id of ids) markRowPending(id, true);
    setEntries((cur) =>
      cur.map((e) => (ids.includes(e.id) ? { ...e, billed } : e)),
    );
    try {
      const res = await fetch("/api/entries/batch-billed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids, billed }),
      });
      if (res.ok) {
        const body = (await res.json()) as { updated: number };
        setSelectedIds(new Set());
        setSelectMode(false);
        emitToast(
          billed
            ? `Marked ${body.updated} as billed.`
            : `Marked ${body.updated} as unbilled.`,
        );
        return;
      }
      if (isAuthFailure(res.status)) {
        handleAuthFailure({
          rollback: () => setEntries(snapshot),
        });
        return;
      }
      setEntries(snapshot);
      emitToast("Couldn't update entries. Try again.");
    } catch {
      setEntries(snapshot);
      emitToast("Couldn't update entries. Try again.");
    } finally {
      for (const id of ids) markRowPending(id, false);
      setBulkPending(false);
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
    // #54 Shaul lock: the edit sheet already awaited PATCH and gives us the
    // authoritative row — merge and keep going. No router.refresh.
    setEntries((cur) =>
      cur.map((e) => (e.id === updated.id ? ({ ...e, ...(updated as Partial<Entry>) } as Entry) : e)),
    );
    setEditingId(null);
    // V2-6 §2: locked copy — "Saved" fires on successful entry edit.
    emitToast("Saved");
  }

  function toggleSelected(id: string): void {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(): void {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
      return;
    }
    const next = new Set(selectedIds);
    for (const e of visibleSelectable) next.add(e.id);
    setSelectedIds(next);
  }

  function enterSelectMode(): void {
    setSelectMode(true);
    setMenuOpenId(null);
  }

  function exitSelectMode(): void {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  const toggleUnbilled = useCallback(() => {
    setFilterUnbilled((v) => !v);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
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
          onClick={toggleUnbilled}
          className={
            "chip min-h-[44px] shrink-0" + (filterUnbilled ? " chip-on" : "")
          }
          title="Show only unbilled entries"
          data-entries-unbilled-chip="true"
        >
          <IconBillable size={14} aria-hidden />
          <span>Unbilled</span>
        </button>
        {selectMode ? (
          <button
            type="button"
            className="btn btn-ghost min-h-[44px] shrink-0 px-3"
            onClick={exitSelectMode}
            data-entries-select-done="true"
          >
            Done
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-ghost min-h-[44px] shrink-0 px-3"
            onClick={enterSelectMode}
            disabled={entries.length === 0}
            data-entries-select-btn="true"
          >
            Select
          </button>
        )}
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
        <div className="space-y-6" data-entries-weeks="true">
          {weeks.map((w) => (
            <section
              key={w.key}
              aria-label={w.label}
              className="space-y-3"
              data-entries-week={w.key}
            >
              {/* #81 Week band: sticks just under the sticky app header on
                  scroll so the user always sees which week the current
                  rows belong to while scanning down a long range. The
                  band is a flat canvas-tinted surface — not a card — so
                  it reads as a header rather than a competing card. z
                  stays below the app header (z-20) and below the mobile
                  timer dock (z-30) so neither is covered. */}
              <header
                className={
                  // Mobile app header is logo-row + 44px user menu + 10px pad
                  // top/bottom + 1px border ≈ 65px tall, so pin the week band
                  // right below it. z-[5] stays under the app header (z-20)
                  // and the mobile timer dock (z-30) so neither is covered.
                  "sticky top-[64px] z-[5] -mx-4 px-4 py-2 border-b border-border " +
                  "bg-canvas/95 backdrop-blur supports-[backdrop-filter]:bg-canvas/80 " +
                  "md:static md:mx-0 md:px-1 md:py-1 md:border-0 md:bg-transparent md:backdrop-blur-0"
                }
                data-entries-week-header="true"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-body-sm font-semibold tracking-tight text-ink">
                    {w.label}
                  </h2>
                  <span
                    className="text-xs text-muted tabular-nums shrink-0"
                    data-entries-week-total={w.key}
                  >
                    <span className="timer-digits text-ink">
                      {formatDurationHours(w.totalSeconds)}
                    </span>
                    h total
                  </span>
                </div>
              </header>
              <div className="space-y-5">
          {w.days.map((g) => (
            <section
              key={g.key}
              aria-label={g.label}
              className="space-y-2"
              data-entries-day={g.key}
            >
              <header className="flex items-baseline justify-between px-1">
                <h3 className="text-body-sm font-semibold text-ink">
                  {g.label}
                </h3>
                <span
                  className="text-xs text-muted tabular-nums"
                  data-entries-day-total={g.key}
                >
                  <span className="timer-digits">
                    {formatDurationHours(g.totalSeconds)}
                  </span>
                  h total
                </span>
              </header>
              {/* Mobile: card stack with 44px targets. md+: flat one-line
                  rows with a hairline divider — the Clockify-adjacent density
                  pattern. Both share the same row body / data. */}
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {g.entries.map((e) => {
                  const s = new Date(e.start_at);
                  const en = e.end_at ? new Date(e.end_at) : null;
                  const selectable = isSelectable(e);
                  const selected = selectedIds.has(e.id);
                  const inSelect = selectMode;
                  const rowPending = pendingRowIds.has(e.id);
                  return (
                    <li
                      key={e.id}
                      className={
                        "entry-row relative px-3 py-2.5 md:px-4 md:py-2 " +
                        (selected ? "bg-accent-soft " : "") +
                        (springIds.has(e.id) ? "entry-spring-in " : "") +
                        (rowPending ? "entry-row-pending " : "") +
                        "transition-colors"
                      }
                      data-entry-id={e.id}
                      data-entry-selected={selected ? "true" : "false"}
                      data-entry-pending={rowPending ? "true" : "false"}
                      aria-busy={rowPending || undefined}
                    >
                      {/* md+ flat row */}
                      <div className="hidden md:flex md:items-center md:gap-3">
                        {inSelect && (
                          <SelectCheckbox
                            selectable={selectable}
                            selected={selected}
                            label={
                              selectable
                                ? "Select entry"
                                : "Not billable — not selectable"
                            }
                            onToggle={() => selectable && toggleSelected(e.id)}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body-sm text-ink">
                            {e.description || (
                              <span className="text-muted">(no description)</span>
                            )}
                          </p>
                        </div>
                        {e.project_name ? (
                          <span className="chip hidden lg:inline-flex max-w-[200px] truncate">
                            {e.project_name}
                          </span>
                        ) : null}
                        {e.billed && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-border bg-canvas-2 px-2 py-0.5 text-xs text-muted"
                            title="Already billed"
                            aria-label="Billed"
                          >
                            <IconCheck size={12} aria-hidden />
                            Billed
                          </span>
                        )}
                        <span className="text-xs text-muted tabular-nums shrink-0">
                          {formatTime(s, timezone)}–
                          {en ? formatTime(en, timezone) : "…"}
                        </span>
                        <span className="w-16 text-right text-body-sm text-ink tabular-nums shrink-0">
                          <span className="timer-digits">
                            {formatDurationHours(e.duration_seconds)}
                          </span>
                          h
                        </span>
                        {!inSelect && (
                          <div className="flex shrink-0 items-center gap-1">
                            {!e.running && (
                              <button
                                className="btn btn-ghost h-9 min-h-[36px] w-9 min-w-[36px] px-0"
                                onClick={() => beginEdit(e)}
                                aria-label="Edit entry"
                                title="Edit"
                              >
                                <IconEdit size={14} aria-hidden />
                              </button>
                            )}
                            {!e.running && (
                              <RowMoreMenu
                                entry={e}
                                open={menuOpenId === e.id}
                                marking={rowPending}
                                onOpenChange={(open) =>
                                  setMenuOpenId(open ? e.id : null)
                                }
                                onMarkBilled={() => void patchSingleBilled(e.id, true)}
                                onMarkUnbilled={() => void patchSingleBilled(e.id, false)}
                                onDelete={() => void remove(e.id)}
                                compact
                              />
                            )}
                          </div>
                        )}
                      </div>

                      {/* mobile card body */}
                      <div className="flex items-start gap-3 md:hidden">
                        {inSelect && (
                          <SelectCheckbox
                            selectable={selectable}
                            selected={selected}
                            label={
                              selectable
                                ? "Select entry"
                                : "Not billable — not selectable"
                            }
                            onToggle={() => selectable && toggleSelected(e.id)}
                          />
                        )}
                        <div className="min-w-0 flex-1 space-y-1">
                          {/* #63B mobile Today-row action baseline: duration +
                               Edit + ⋯ are a single horizontal cluster at the
                               top-right of the card, aligned with the first
                               line of the description. The old `flex-col`
                               wrapper let ⋯ wrap to a second row on wider
                               descriptions; keeping the whole trailing
                               cluster in one `flex items-center` row with
                               `shrink-0` targets guarantees a single baseline
                               even when the description clamps to two lines
                               or wraps around the duration digit. */}
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-body-sm text-ink line-clamp-2 break-words min-w-0 flex-1">
                              {e.description || (
                                <span className="text-muted">
                                  (no description)
                                </span>
                              )}
                            </p>
                            <div className="flex shrink-0 items-center gap-1">
                              <span className="text-body-sm text-ink tabular-nums">
                                <span className="timer-digits">
                                  {formatDurationHours(e.duration_seconds)}
                                </span>
                                h
                              </span>
                              {!inSelect && !e.running && (
                                <>
                                  <button
                                    className="btn btn-ghost h-11 min-h-[44px] w-11 min-w-[44px] px-0"
                                    onClick={() => beginEdit(e)}
                                    aria-label="Edit entry"
                                    title="Edit"
                                  >
                                    <IconEdit size={16} aria-hidden />
                                  </button>
                                  <RowMoreMenu
                                    entry={e}
                                    open={menuOpenId === e.id}
                                    marking={rowPending}
                                    onOpenChange={(open) =>
                                      setMenuOpenId(open ? e.id : null)
                                    }
                                    onMarkBilled={() => void patchSingleBilled(e.id, true)}
                                    onMarkUnbilled={() => void patchSingleBilled(e.id, false)}
                                    onDelete={() => void remove(e.id)}
                                  />
                                </>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-muted tabular-nums">
                            {formatTime(s, timezone)}–
                            {en ? formatTime(en, timezone) : "…"}
                            {e.project_name ? (
                              <>
                                <span className="mx-1.5">·</span>
                                {e.project_name}
                              </>
                            ) : null}
                          </p>
                          {(e.tag_names.length > 0 || e.billed || (!inSelect && !selectable)) && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              {e.tag_names.map((t) => (
                                <span key={t} className="tag">
                                  {t}
                                </span>
                              ))}
                              {e.billed && (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full border border-border bg-canvas-2 px-2 py-0.5 text-xs text-muted"
                                  title="Already billed"
                                  aria-label="Billed"
                                >
                                  <IconCheck size={12} aria-hidden />
                                  Billed
                                </span>
                              )}
                              {inSelect && !selectable && (
                                <span className="text-xs text-muted">
                                  Not billable — not selectable
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
              </div>
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

      {selectMode && selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          canSelectAll={visibleSelectable.length > 0}
          allSelected={allVisibleSelected}
          canMarkBilled={unbilledSelectedIds.length > 0}
          canMarkUnbilled={billedSelectedIds.length > 0}
          pending={bulkPending}
          onToggleSelectAll={toggleSelectAll}
          onClear={() => setSelectedIds(new Set())}
          onMarkBilled={() => void runBatch(unbilledSelectedIds, true)}
          onMarkUnbilled={() => void runBatch(billedSelectedIds, false)}
        />
      )}
    </div>
  );
}

function SelectCheckbox({
  selectable,
  selected,
  label,
  onToggle,
}: {
  selectable: boolean;
  selected: boolean;
  label: string;
  onToggle: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label={label}
      aria-disabled={!selectable}
      disabled={!selectable}
      onClick={onToggle}
      className={
        "flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center " +
        "md:h-9 md:w-9 md:min-h-[36px] md:min-w-[36px] rounded-md"
      }
      data-entry-checkbox="true"
    >
      <span
        className={
          "flex h-5 w-5 items-center justify-center rounded-md border transition-colors " +
          (selected
            ? "border-accent bg-accent text-accent-fg"
            : selectable
              ? "border-border-strong bg-surface"
              : "border-border bg-canvas-2 opacity-60")
        }
      >
        {selected && <IconCheck size={12} aria-hidden />}
      </span>
    </button>
  );
}

function RowMoreMenu({
  entry,
  open,
  marking,
  onOpenChange,
  onMarkBilled,
  onMarkUnbilled,
  onDelete,
  compact,
}: {
  entry: Entry;
  open: boolean;
  marking: boolean;
  onOpenChange: (open: boolean) => void;
  onMarkBilled: () => void;
  onMarkUnbilled: () => void;
  onDelete: () => void;
  compact?: boolean;
}): JSX.Element {
  const canBill = entry.billable && !entry.billed;
  const canUnbill = entry.billable && entry.billed;
  const btnClass = compact
    ? "btn btn-ghost h-9 min-h-[36px] w-9 min-w-[36px] px-0"
    : "btn btn-ghost h-11 min-h-[44px] w-11 min-w-[44px] px-0";
  return (
    <div className="relative">
      <button
        className={btnClass}
        onClick={(evt) => {
          evt.stopPropagation();
          onOpenChange(!open);
        }}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={marking || undefined}
        title="More"
        data-entry-more-btn={entry.id}
      >
        <span aria-hidden className="text-lg leading-none">
          ⋯
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-10 mt-1 w-48 rounded-xl border border-border bg-surface shadow-card-lg py-1"
          onClick={(evt) => evt.stopPropagation()}
        >
          {canBill && (
            <button
              role="menuitem"
              type="button"
              className="w-full text-left px-3 py-2 text-body-sm text-ink hover:bg-canvas-2 disabled:opacity-60"
              disabled={marking}
              onClick={onMarkBilled}
            >
              Mark as billed
            </button>
          )}
          {canUnbill && (
            <button
              role="menuitem"
              type="button"
              className="w-full text-left px-3 py-2 text-body-sm text-ink hover:bg-canvas-2 disabled:opacity-60"
              disabled={marking}
              onClick={onMarkUnbilled}
            >
              Mark as unbilled
            </button>
          )}
          <button
            role="menuitem"
            type="button"
            className="w-full text-left px-3 py-2 text-body-sm text-danger hover:bg-danger-soft"
            disabled={marking}
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function BulkActionBar({
  count,
  canSelectAll,
  allSelected,
  canMarkBilled,
  canMarkUnbilled,
  pending,
  onToggleSelectAll,
  onClear,
  onMarkBilled,
  onMarkUnbilled,
}: {
  count: number;
  canSelectAll: boolean;
  allSelected: boolean;
  canMarkBilled: boolean;
  canMarkUnbilled: boolean;
  pending: boolean;
  onToggleSelectAll: () => void;
  onClear: () => void;
  onMarkBilled: () => void;
  onMarkUnbilled: () => void;
}): JSX.Element {
  // Dana lock (#54): exact copy on the primary while a bulk mutation is
  // in flight is "Saving…". We swap only the active side so the other
  // button keeps its stable label (and stays disabled via `pending`).
  const primaryIsBillAction = canMarkBilled;
  const billedLabel =
    pending && primaryIsBillAction ? "Saving…" : "Mark as billed";
  const unbilledLabel =
    pending && !primaryIsBillAction ? "Saving…" : "Mark as unbilled";
  return (
    <div
      role="toolbar"
      aria-label="Bulk entry actions"
      aria-busy={pending || undefined}
      // Mobile: dock above the bottom tab bar (3.5rem) + safe-area inset so
      // tabs stay reachable. Desktop: inline floating card at the bottom
      // right of the main column, matching the Quiet Pulse surface.
      className={
        "fixed inset-x-0 z-40 border-t border-border bg-surface shadow-card-lg " +
        "bottom-[calc(3.5rem+env(safe-area-inset-bottom))] " +
        "md:bottom-6 md:inset-x-auto md:right-6 md:left-auto md:rounded-2xl md:border " +
        "md:shadow-card-lg md:max-w-xl"
      }
      data-bulk-action-bar="true"
      data-bulk-pending={pending ? "true" : "false"}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-3 md:py-2.5">
        <div className="flex items-center justify-between gap-3 md:justify-start">
          <span className="text-body-sm text-muted">
            <span className="text-ink font-medium tabular-nums">{count}</span>{" "}
            selected
          </span>
          {canSelectAll && (
            <button
              type="button"
              className="text-xs text-muted hover:text-ink underline underline-offset-2"
              onClick={onToggleSelectAll}
              disabled={pending}
              data-bulk-select-all="true"
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm min-h-[36px]"
            onClick={onClear}
            disabled={pending}
            data-bulk-clear="true"
            aria-label="Clear selection"
          >
            <IconX size={14} aria-hidden />
            <span>Clear</span>
          </button>
        </div>
        {/* #64 mobile billed sticky: equal-width Mark unbilled / Mark billed.
             `flex-1` with different label widths still read as unequal on
             narrow screens because flex basis is `0%` but intrinsic content
             min-sizes diverge. A 2-column grid pins each button to half of
             the row, matching the rest of the Quiet Pulse 44px chrome. On
             md+ we fall back to the floating inline cluster. */}
        <div className="grid grid-cols-2 gap-2 md:ml-auto md:flex md:items-center">
          <button
            type="button"
            className="btn btn-sm min-h-[44px] w-full md:w-auto"
            onClick={onMarkUnbilled}
            disabled={!canMarkUnbilled || pending}
            aria-busy={pending && !primaryIsBillAction ? true : undefined}
            data-bulk-mark-unbilled="true"
            title={canMarkUnbilled ? undefined : "Nothing billed in selection"}
          >
            {pending && !primaryIsBillAction && (
              <span className="quiet-pulse-spinner" aria-hidden />
            )}
            {unbilledLabel}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm min-h-[44px] w-full md:w-auto"
            onClick={onMarkBilled}
            disabled={!canMarkBilled || pending}
            aria-busy={pending && primaryIsBillAction ? true : undefined}
            data-bulk-mark-billed="true"
            title={canMarkBilled ? undefined : "Already billed"}
          >
            {pending && primaryIsBillAction && (
              <span className="quiet-pulse-spinner" aria-hidden />
            )}
            {billedLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
