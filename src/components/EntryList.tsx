"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatDate,
  formatDayLabel,
  formatDurationHms,
  formatDurationHours,
  formatTime,
  formatWeekRangeLabel,
  startOfIsoWeekKey,
} from "@/lib/tz";
import {
  emitToast,
  emitTimerChanged,
  onEntryAdded,
  onTimerChanged,
} from "@/lib/events";
import { handleAuthFailure, isAuthFailure } from "@/lib/auth-ui";
import { projectColor } from "@/lib/project-color";
import {
  IconBillable,
  IconCheck,
  IconEdit,
  IconPlay,
  IconX,
} from "@/components/icons";
import EditEntrySheet, { type EditableEntry } from "@/components/EditEntrySheet";
import { Pulse } from "@/components/mascot/Pulse";

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

// GET /api/timer returns the running EntryView directly, or null. We only
// read the fields the pinned desktop running row needs; project name is
// resolved against the `projects` prop when the payload lacks it.
interface RunningEntry {
  id: string;
  description: string;
  project_id: string | null;
  project_name: string | null;
  start_at: string;
  billable: boolean;
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
  // #99a desktop running row: Today's day group is the only slot that may
  // hold the pinned purple-wash row. We mark the Today bucket (and create
  // it synthetically when there are no closed entries yet today) so the
  // table knows exactly where to inject it.
  isToday: boolean;
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
  isCurrent: boolean;
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
  const todayKey = formatDate(now, timezone);
  const thisWeekKey = startOfIsoWeekKey(now, timezone);
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
        isCurrent: weekKey === thisWeekKey,
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
        isToday: dayKey === todayKey,
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

// #99a desktop running row: a pinned purple-wash row sits at the top of
// the Today day group. If Today currently has no closed entries, we
// synthesise an empty Today group (zero total — #81 math stays closed-
// only) in the current week so the running row has a home. A synthesised
// week is also created when the user hasn't logged anything this week yet.
function ensureTodayGroup(
  weeks: WeekGroup[],
  timezone: string,
  now: Date,
): WeekGroup[] {
  const todayKey = formatDate(now, timezone);
  const thisWeekKey = startOfIsoWeekKey(now, timezone);
  if (weeks.some((w) => w.days.some((d) => d.key === todayKey))) return weeks;
  const todayGroup: DayGroup = {
    key: todayKey,
    label: formatDayLabel(now, timezone, now),
    totalSeconds: 0,
    entries: [],
    isToday: true,
  };
  const currentWeek = weeks.find((w) => w.key === thisWeekKey);
  if (currentWeek) {
    return weeks.map((w) =>
      w === currentWeek ? { ...w, days: [todayGroup, ...w.days] } : w,
    );
  }
  const synthetic: WeekGroup = {
    key: thisWeekKey,
    label: formatWeekRangeLabel(thisWeekKey, now, timezone),
    totalSeconds: 0,
    days: [todayGroup],
    isCurrent: true,
  };
  return [synthetic, ...weeks];
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
  // #84 play-to-resume: a row's Play button fires POST /api/timer/start with
  // the row's project/description/billable/tags. We hold a per-row pending
  // flag so a double-tap can't fire twice, and a single `timerRunning` hint
  // so every Play button on the list dims the moment one timer is live. We
  // never trust it for ordering — the server is the source of truth and a
  // 409 TIMER_ALREADY_RUNNING is still handled — but it keeps the UI calm.
  const [resumePendingIds, setResumePendingIds] = useState<Set<string>>(
    () => new Set(),
  );
  // #99a desktop running row: beyond the plain running boolean we track the
  // live running entry payload so the pinned row can render description +
  // project + start-time + live elapsed. The 1s tick (below) advances
  // `now` only while the tab is visible, so the row and dock share the
  // same elapsed value without a double timer or a background heartbeat.
  const [runningEntry, setRunningEntry] = useState<RunningEntry | null>(null);
  const timerRunning = runningEntry !== null;
  // V2-6 §1: entry ids whose row should render with the spring-in class.
  // Cleared shortly after the animation duration so subsequent renders
  // (e.g. filter changes) don't re-play the animation on the same row.
  const [springIds, setSpringIds] = useState<Set<string>>(() => new Set());
  // Live tick for the pinned desktop running row. Only mounts while a
  // timer is live and the tab is visible — matches the dock's cadence so
  // the two surfaces can't disagree about elapsed by more than ~1s.
  const [tickNow, setTickNow] = useState(() => Date.now());

  // #54 Shaul lock: before dropping router.refresh() the server component
  // used to re-run on every mutation and push a fresh `initial` prop into
  // the list; we now rely on the local optimistic/response state as the
  // source of truth. We still sync the prop so a real cross-tree refresh
  // (e.g. navigation back to /app) still reconciles.
  useEffect(() => {
    setEntries(initial);
  }, [initial]);

  // #84 play-to-resume + #99a pinned running row: both need to know
  // whether a timer is already running. The probe (and the onTimerChanged
  // bus wiring) now also hands us the running entry payload so the
  // pinned desktop row can render description / project / start without
  // waiting on a page reload. All failures are silent on purpose: the
  // dim-every-Play hint + 409 fallback still protects the start path.
  useEffect(() => {
    let cancelled = false;
    async function probe(): Promise<void> {
      try {
        const res = await fetch("/api/timer", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as RunningEntry | null;
        setRunningEntry(data);
      } catch {
        // Silent — the Play fallback still handles the 409 case.
      }
    }
    void probe();
    const unsubscribe = onTimerChanged(() => {
      void probe();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // #99a desktop running row: tick once per second while the tab is
  // visible and a timer is running. Pausing on `document.hidden` means
  // the background tab doesn't burn CPU, and when it comes back the
  // first tick re-snaps the elapsed from `start_at` (not from a stale
  // counter) so the row rejoins the dock in sync.
  useEffect(() => {
    if (!timerRunning) return;
    let id: ReturnType<typeof setInterval> | null = null;
    function start(): void {
      if (id !== null) return;
      setTickNow(Date.now());
      id = setInterval(() => {
        setTickNow(Date.now());
      }, 1000);
    }
    function stop(): void {
      if (id !== null) clearInterval(id);
      id = null;
    }
    function onVis(): void {
      if (document.hidden) stop();
      else start();
    }
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [timerRunning]);

  // #99a desktop sticky week band: the band pins to `top: var(--app-header-h)`
  // on md+ because the app header's height is not stable (the TimerBar
  // dock can expand its Details panel inside it). A ResizeObserver on the
  // layout header writes the current height to the CSS variable, so the
  // week band always sits flush under whichever chrome is currently
  // showing. The variable has a pre-hydration default of 64px set in
  // globals.css so there's no first-paint jump before the observer runs.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const header = document.querySelector(
      '[data-app-header="true"]',
    ) as HTMLElement | null;
    if (!header) return;
    const root = document.documentElement;
    function sync(): void {
      if (!header) return;
      const h = header.getBoundingClientRect().height;
      root.style.setProperty("--app-header-h", `${Math.round(h)}px`);
    }
    sync();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", sync);
      return () => {
        window.removeEventListener("resize", sync);
        root.style.removeProperty("--app-header-h");
      };
    }
    const ro = new ResizeObserver(() => sync());
    ro.observe(header);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--app-header-h");
    };
  }, []);

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

  // #99a filtered-vs-true empty: the Pulse mascot is reserved for the true
  // empty case. Any live filter (search box, project pick, Unbilled chip)
  // means the empty-list state is transient, so we drop Pulse and swap in
  // the dedicated copy per the dude-locked wording.
  const hasActiveFilter =
    filterQ.length > 0 || filterProject !== "" || filterUnbilled;

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
  const closedWeeks = useMemo(
    () => groupByWeek(filtered, timezone, now),
    [filtered, timezone, now],
  );
  // Inject the Today group (synthesised when empty) only when a timer is
  // actually running — otherwise an empty Today section would spuriously
  // appear on an otherwise all-closed Monday. Totals are untouched; the
  // synthetic Today group starts at 0h so #81/#56 math stays closed-only.
  const weeks = useMemo(
    () =>
      runningEntry
        ? ensureTodayGroup(closedWeeks, timezone, now)
        : closedWeeks,
    [closedWeeks, runningEntry, timezone, now],
  );

  const projectNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) m.set(p.id, p.name);
    return m;
  }, [projects]);

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

  function markRowResumePending(id: string, pending: boolean): void {
    setResumePendingIds((cur) => {
      const has = cur.has(id);
      if (pending && has) return cur;
      if (!pending && !has) return cur;
      const next = new Set(cur);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // #84 play-to-resume: start a NEW timer with the stopped row's
  // description + project + billable + tags. Resuming never resurrects
  // the original entry: the server inserts a fresh row (new id, new
  // start_at) so the historical card stays untouched and the dock takes
  // ownership of the live timer. The row's own data in the list isn't
  // mutated, so we don't need to patch EntryList state on success — the
  // dock reloads on `onTimerChanged`, and once stopped the fresh entry
  // springs into the top of the list via the existing emitEntryAdded
  // path. We respect TIMER_ALREADY_RUNNING by surfacing a short toast
  // ("A timer is already running") and marking local state so every
  // Play on the list dims until the dock emits again.
  async function resume(entry: Entry): Promise<void> {
    if (entry.running) return;
    if (resumePendingIds.has(entry.id)) return;
    markRowResumePending(entry.id, true);
    try {
      const res = await fetch("/api/timer/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description: entry.description,
          project_id: entry.project_id,
          billable: entry.billable,
          tag_ids: entry.tag_ids,
        }),
      });
      if (res.ok) {
        emitTimerChanged();
        emitToast("Timer resumed");
        return;
      }
      if (isAuthFailure(res.status)) {
        handleAuthFailure({ rollback: () => undefined });
        return;
      }
      if (res.status === 409) {
        // Server-side guard: another timer is already running. Keep the
        // list honest even if our local hint said otherwise, and surface
        // the gentle version of the 409 — the user does not care about
        // the id, they care that nothing double-started.
        emitTimerChanged();
        emitToast("A timer is already running");
        return;
      }
      emitToast("Couldn't start timer. Try again.");
    } catch {
      emitToast("Couldn't start timer. Try again.");
    } finally {
      markRowResumePending(entry.id, false);
    }
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

  // #99a desktop running row — resolve project display name from the
  // payload or fall back to the local projects list; strings from the
  // server are rendered as plain React text so there's no HTML injection
  // surface (Ariel lock on #99 §LOCK).
  const runningProjectName =
    runningEntry?.project_name ??
    (runningEntry?.project_id
      ? projectNameById.get(runningEntry.project_id) ?? null
      : null);
  const runningElapsedSeconds = runningEntry
    ? Math.max(
        0,
        Math.floor(
          (tickNow - new Date(runningEntry.start_at).getTime()) / 1000,
        ),
      )
    : 0;

  // #99a desktop running row: when there are no closed entries but a timer
  // is running, the DESKTOP table still needs to paint (synthetic Today
  // group with the pinned row). The MOBILE surface is the dock — showing
  // a lonely "0h this week" band on 390 would be noise, so the mobile
  // empty-state card still wins there. We separate the two visibility
  // conditions instead of forcing one tree to serve both.
  const noClosedEntries = filtered.length === 0;
  const showDesktopEmpty = noClosedEntries && !runningEntry;
  const showMobileEmpty = noClosedEntries;

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

      {noClosedEntries && (
        <div
          className={
            "card p-6 text-center text-muted text-sm " +
            // Desktop + running timer: hide the empty state so the pinned
            // running row in the synthetic Today group reads as the live
            // surface. Mobile still shows the empty card since the dock
            // owns the running state on <md.
            (!showDesktopEmpty ? "md:hidden " : "") +
            (!showMobileEmpty ? "hidden md:block" : "")
          }
        >
          {/* #99a empty-state split (dude lock):
              - true-empty (no filters) → #60 Pulse + dude copy
              - filtered-empty, Unbilled chip   → existing "Nothing unbilled…"
              - filtered-empty, anything else   → no Pulse + the new line */}
          {!hasActiveFilter ? (
            <>
              <Pulse
                variant="empty"
                alt=""
                className="mx-auto mb-3 h-[132px] w-[132px]"
              />
              Nothing tracked yet — start a timer when you&rsquo;re ready.
            </>
          ) : filterUnbilled ? (
            "Nothing unbilled in this range."
          ) : (
            "No entries match these filters."
          )}
        </div>
      )}
      {(filtered.length > 0 || runningEntry) && (
        <div
          className={
            "space-y-6 " +
            // When there are no closed entries we only paint on desktop
            // (the synthetic Today week carrying the pinned running row).
            // Mobile sees the empty card above instead.
            (noClosedEntries ? "hidden md:block" : "")
          }
          data-entries-weeks="true"
        >
          {weeks.map((w, wi) => {
            const weekHeadingId = `entries-week-heading-${w.key}`;
            return (
              <section
                key={w.key}
                aria-label={w.label}
                // Mobile keeps the ~12px gap under the sticky band so day
                // cards don't butt up against the week spine. On md+ the
                // band + table form one rounded surface (`rounded-t-2xl`
                // on the band, `rounded-b-2xl` on the table), so the
                // extra vertical rhythm is dropped.
                className="space-y-3 md:space-y-0"
                data-entries-week={w.key}
              >
                {/* #99a desktop sticky week band — on md+ this is the ONLY
                    sticky layer in the list. It pins at
                    `top: var(--app-header-h)`; the ResizeObserver effect
                    above keeps that variable in sync with the real header
                    height (dock expand/collapse changes it). On ~390 the
                    mobile band keeps its original `top-[64px]` so the
                    thin brand strip stays visible as the user scrolls a
                    long week — z stays below the app header (z-20) and
                    the mobile timer dock (z-30) so neither is covered. */}
                <header
                  className={
                    "sticky top-[64px] z-[5] -mx-4 px-4 py-2.5 border-b border-border " +
                    "bg-canvas-2/80 backdrop-blur supports-[backdrop-filter]:bg-canvas-2/70 " +
                    "md:mx-0 md:top-[var(--app-header-h)] md:rounded-t-2xl md:border md:border-b-0 md:border-border " +
                    "md:bg-canvas-2 md:px-3 md:py-2 md:backdrop-blur-0"
                  }
                  data-entries-week-header="true"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h2
                      id={weekHeadingId}
                      className="text-title-sm font-semibold tracking-tight text-ink"
                    >
                      {w.label}
                    </h2>
                    <span
                      className="text-body-sm text-muted tabular-nums shrink-0"
                      data-entries-week-total={w.key}
                    >
                      <span className="timer-digits text-ink font-medium">
                        {formatDurationHours(w.totalSeconds)}
                      </span>
                      h total
                    </span>
                  </div>
                </header>

                {/* Mobile <md: keep the locked per-day card stack. 99a is a
                    desktop-only slice — mobile 48px polish lives in 99b. */}
                <div className="space-y-6 md:hidden">
                  {w.days.map((g) => (
                    <section
                      key={g.key}
                      aria-label={g.label}
                      className="space-y-3"
                      data-entries-day={g.key}
                    >
                      <header className="flex items-baseline justify-between px-1 pt-1">
                        <h3 className="text-label uppercase entry-day-header">
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
                      {g.entries.length > 0 && (
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
                                  "entry-row relative px-3 py-2.5 " +
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
                                <div className="flex items-start gap-3">
                                  {inSelect && (
                                    <SelectCheckbox
                                      selectable={selectable}
                                      selected={selected}
                                      label={
                                        selectable
                                          ? "Select entry"
                                          : "Not billable — not selectable"
                                      }
                                      onToggle={() =>
                                        selectable && toggleSelected(e.id)
                                      }
                                    />
                                  )}
                                  <div className="min-w-0 flex-1 space-y-2">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        {e.project_name ? (
                                          <ProjectChip
                                            name={e.project_name}
                                            projectId={e.project_id}
                                            className="max-w-full"
                                          />
                                        ) : (
                                          <span className="text-xs text-muted">
                                            No project
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex shrink-0 items-center gap-1 pt-0.5">
                                        <span className="text-body-sm text-ink tabular-nums">
                                          <span className="timer-digits">
                                            {formatDurationHours(e.duration_seconds)}
                                          </span>
                                          h
                                        </span>
                                        {!inSelect && !e.running && (
                                          <>
                                            <button
                                              className="btn btn-ghost h-9 min-h-[36px] w-9 min-w-[36px] px-0"
                                              onClick={() => beginEdit(e)}
                                              aria-label="Edit entry"
                                              title="Edit"
                                            >
                                              <IconEdit size={14} aria-hidden />
                                            </button>
                                            <RowMoreMenu
                                              entry={e}
                                              open={menuOpenId === e.id}
                                              marking={rowPending}
                                              onOpenChange={(open) =>
                                                setMenuOpenId(open ? e.id : null)
                                              }
                                              onMarkBilled={() =>
                                                void patchSingleBilled(e.id, true)
                                              }
                                              onMarkUnbilled={() =>
                                                void patchSingleBilled(e.id, false)
                                              }
                                              onDelete={() => void remove(e.id)}
                                              compact
                                            />
                                          </>
                                        )}
                                      </div>
                                    </div>
                                    <p className="text-body-sm text-ink line-clamp-2 break-words">
                                      {e.description || (
                                        <span className="text-muted">
                                          No description
                                        </span>
                                      )}
                                    </p>
                                    <div className="flex items-end justify-between gap-3 pt-0.5">
                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs text-muted tabular-nums">
                                          {formatTime(s, timezone)}–
                                          {en ? formatTime(en, timezone) : "…"}
                                        </p>
                                        {(e.tag_names.length > 0 ||
                                          e.billed ||
                                          (inSelect && !selectable)) && (
                                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
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
                                      {!inSelect && !e.running && (
                                        <ResumeButton
                                          pending={resumePendingIds.has(e.id)}
                                          timerRunning={timerRunning}
                                          onResume={() => void resume(e)}
                                        />
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>
                  ))}
                </div>

                {/* md+ ≥ 768: real continuous <table> per week. One table
                    body per day, newest first; the day header is a
                    `<th scope="rowgroup">` and the entry rows are plain
                    `<tr>`s. The pinned desktop running row (if any)
                    renders at the top of Today only. */}
                <WeekTable
                  week={w}
                  inSelect={selectMode}
                  showColumnHeaders={wi === 0}
                  weekHeadingId={weekHeadingId}
                  timezone={timezone}
                  selectedIds={selectedIds}
                  pendingRowIds={pendingRowIds}
                  resumePendingIds={resumePendingIds}
                  springIds={springIds}
                  menuOpenId={menuOpenId}
                  timerRunning={timerRunning}
                  runningEntry={runningEntry}
                  runningElapsedSeconds={runningElapsedSeconds}
                  runningProjectName={runningProjectName}
                  onToggleSelected={toggleSelected}
                  onBeginEdit={beginEdit}
                  onResume={(e) => void resume(e)}
                  onOpenMenu={(id) => setMenuOpenId(id)}
                  onMarkBilled={(id) => void patchSingleBilled(id, true)}
                  onMarkUnbilled={(id) => void patchSingleBilled(id, false)}
                  onDelete={(id) => void remove(id)}
                />
              </section>
            );
          })}
        </div>
      )}

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

// #99a desktop week table. One `<table>` per week, labelled by the week
// band `<h2>` via aria-labelledby. Column widths are reserved via a
// `<colgroup>` so cell content can grow/shrink without pushing neighbours.
function WeekTable({
  week,
  inSelect,
  showColumnHeaders,
  weekHeadingId,
  timezone,
  selectedIds,
  pendingRowIds,
  resumePendingIds,
  springIds,
  menuOpenId,
  timerRunning,
  runningEntry,
  runningElapsedSeconds,
  runningProjectName,
  onToggleSelected,
  onBeginEdit,
  onResume,
  onOpenMenu,
  onMarkBilled,
  onMarkUnbilled,
  onDelete,
}: {
  week: WeekGroup;
  inSelect: boolean;
  showColumnHeaders: boolean;
  weekHeadingId: string;
  timezone: string;
  selectedIds: Set<string>;
  pendingRowIds: Set<string>;
  resumePendingIds: Set<string>;
  springIds: Set<string>;
  menuOpenId: string | null;
  timerRunning: boolean;
  runningEntry: RunningEntry | null;
  runningElapsedSeconds: number;
  runningProjectName: string | null;
  onToggleSelected: (id: string) => void;
  onBeginEdit: (e: Entry) => void;
  onResume: (e: Entry) => void;
  onOpenMenu: (id: string | null) => void;
  onMarkBilled: (id: string) => void;
  onMarkUnbilled: (id: string) => void;
  onDelete: (id: string) => void;
}): JSX.Element {
  // The column count varies with Select mode (prepended checkbox col) so
  // the day-header `colspan` can span the whole row cleanly.
  const totalCols = (inSelect ? 1 : 0) + 6;
  return (
    <div className="hidden md:block overflow-hidden rounded-b-2xl border border-t-0 border-border bg-surface">
      <table
        className="w-full border-collapse table-fixed text-left"
        aria-labelledby={weekHeadingId}
        data-entries-week-table={week.key}
      >
        <colgroup>
          {inSelect && <col className="w-9" />}
          <col className="w-[128px] lg:w-[168px]" />
          <col />
          <col className="hidden lg:table-column w-[176px]" />
          <col className="w-[104px] lg:w-[112px]" />
          <col className="w-[80px] lg:w-[88px]" />
          <col className="w-[108px]" />
        </colgroup>
        <thead className={showColumnHeaders ? "" : "sr-only"}>
          <tr className="h-8 border-b border-border">
            {inSelect && (
              <th scope="col" className="pl-4">
                <span className="sr-only">Select</span>
              </th>
            )}
            <th
              scope="col"
              className="text-label uppercase text-muted font-medium pl-4 pr-2"
            >
              Project
            </th>
            <th
              scope="col"
              className="text-label uppercase text-muted font-medium px-2"
            >
              Description
            </th>
            <th
              scope="col"
              className="hidden lg:table-cell text-label uppercase text-muted font-medium px-2"
            >
              Tags
            </th>
            <th
              scope="col"
              className="text-label uppercase text-muted font-medium px-2"
            >
              Time
            </th>
            <th
              scope="col"
              className="text-label uppercase text-muted font-medium text-right px-2"
            >
              Duration
            </th>
            <th scope="col" className="pr-4 pl-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        {week.days.map((g) => (
          <tbody key={g.key} data-entries-day={g.key}>
            <tr className="h-9">
              <th
                scope="rowgroup"
                colSpan={totalCols}
                className="pt-3 pb-1 border-b border-border font-normal"
              >
                <div className="flex items-baseline justify-between px-4">
                  <span className="text-label uppercase entry-day-header font-semibold tracking-wide">
                    {g.label}
                  </span>
                  <span
                    className="text-xs text-muted tabular-nums"
                    data-entries-day-total={g.key}
                  >
                    <span className="timer-digits">
                      {formatDurationHours(g.totalSeconds)}
                    </span>
                    h total
                  </span>
                </div>
              </th>
            </tr>
            {g.isToday && runningEntry && (
              <RunningTableRow
                inSelect={inSelect}
                runningEntry={runningEntry}
                elapsedSeconds={runningElapsedSeconds}
                projectName={runningProjectName}
                timezone={timezone}
              />
            )}
            {g.entries.map((e) => (
              <EntryTableRow
                key={e.id}
                entry={e}
                inSelect={inSelect}
                selected={selectedIds.has(e.id)}
                pending={pendingRowIds.has(e.id)}
                resumePending={resumePendingIds.has(e.id)}
                sprung={springIds.has(e.id)}
                menuOpen={menuOpenId === e.id}
                timerRunning={timerRunning}
                timezone={timezone}
                onToggleSelected={() => onToggleSelected(e.id)}
                onBeginEdit={() => onBeginEdit(e)}
                onResume={() => onResume(e)}
                onOpenMenu={(open) => onOpenMenu(open ? e.id : null)}
                onMarkBilled={() => onMarkBilled(e.id)}
                onMarkUnbilled={() => onMarkUnbilled(e.id)}
                onDelete={() => onDelete(e.id)}
              />
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function EntryTableRow({
  entry: e,
  inSelect,
  selected,
  pending,
  resumePending,
  sprung,
  menuOpen,
  timerRunning,
  timezone,
  onToggleSelected,
  onBeginEdit,
  onResume,
  onOpenMenu,
  onMarkBilled,
  onMarkUnbilled,
  onDelete,
}: {
  entry: Entry;
  inSelect: boolean;
  selected: boolean;
  pending: boolean;
  resumePending: boolean;
  sprung: boolean;
  menuOpen: boolean;
  timerRunning: boolean;
  timezone: string;
  onToggleSelected: () => void;
  onBeginEdit: () => void;
  onResume: () => void;
  onOpenMenu: (open: boolean) => void;
  onMarkBilled: () => void;
  onMarkUnbilled: () => void;
  onDelete: () => void;
}): JSX.Element {
  const s = new Date(e.start_at);
  const en = e.end_at ? new Date(e.end_at) : null;
  const selectable = isSelectable(e);
  const hoursLabel = `${formatDurationHours(e.duration_seconds)} hours`;
  // At md 768–1023 the Meta column is dropped and the muted "Billed" pill
  // moves inline right after the description so the state stays legible
  // without needing the extra column (brief §1 md 768–1023).
  const visibleTags = e.tag_names.slice(0, 2);
  const extraTags = Math.max(0, e.tag_names.length - visibleTags.length);
  return (
    <tr
      className={
        "entry-table-row h-11 border-b border-border " +
        (sprung ? "entry-spring-in " : "") +
        (pending ? "entry-row-pending " : "")
      }
      data-entry-id={e.id}
      data-entry-selected={selected ? "true" : "false"}
      data-entry-pending={pending ? "true" : "false"}
      aria-busy={pending || undefined}
    >
      {inSelect && (
        <td className="pl-4 align-middle">
          <SelectCheckbox
            selectable={selectable}
            selected={selected}
            label={
              selectable ? "Select entry" : "Not billable — not selectable"
            }
            onToggle={() => selectable && onToggleSelected()}
            desktop
          />
        </td>
      )}
      <td className="pl-4 pr-2 align-middle">
        {e.project_name ? (
          <ProjectChip
            name={e.project_name}
            projectId={e.project_id}
            className="max-w-full"
          />
        ) : (
          <span className="text-xs text-muted">No project</span>
        )}
      </td>
      <td className="px-2 align-middle">
        <div className="flex items-center gap-2 min-w-0">
          <p
            className="truncate text-body-sm text-ink min-w-0"
            title={e.description || undefined}
          >
            {e.description || (
              <span className="text-muted">No description</span>
            )}
          </p>
          {/* md 768–1023: Billed inline here. Hidden on lg+ because the
              Meta column takes it over. */}
          {e.billed && (
            <span
              className="lg:hidden inline-flex items-center gap-1 rounded-full border border-border bg-canvas-2 px-2 py-0.5 text-xs text-muted shrink-0"
              title="Already billed"
              aria-label="Billed"
            >
              <IconCheck size={12} aria-hidden />
              Billed
            </span>
          )}
        </div>
      </td>
      <td className="hidden lg:table-cell px-2 align-middle">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {visibleTags.map((t) => (
            <span key={t} className="tag truncate max-w-[80px]" title={t}>
              {t}
            </span>
          ))}
          {extraTags > 0 && (
            <span
              className="text-xs text-muted"
              title={e.tag_names.slice(2).join(", ")}
            >
              +{extraTags}
            </span>
          )}
          {e.billable && (
            <span
              className="text-xs text-muted"
              aria-label="Billable"
              title="Billable"
            >
              $
            </span>
          )}
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
        </div>
      </td>
      <td className="px-2 align-middle">
        <span className="text-xs text-muted tabular-nums">
          {formatTime(s, timezone)}–{en ? formatTime(en, timezone) : "…"}
        </span>
      </td>
      <td className="px-2 align-middle text-right">
        <span
          className="text-body-sm text-ink tabular-nums"
          aria-label={hoursLabel}
        >
          <span className="timer-digits">
            {formatDurationHours(e.duration_seconds)}
          </span>
          h
        </span>
      </td>
      <td className="pr-4 pl-2 align-middle">
        {!inSelect && (
          <div
            className="entry-row-actions flex items-center justify-end gap-1"
            data-entry-actions="true"
          >
            <ResumeButton
              size="sm"
              pending={resumePending}
              timerRunning={timerRunning}
              onResume={onResume}
            />
            <button
              className="btn btn-ghost h-8 min-h-[32px] w-8 min-w-[32px] px-0"
              onClick={onBeginEdit}
              aria-label="Edit entry"
              title="Edit"
            >
              <IconEdit size={14} aria-hidden />
            </button>
            <RowMoreMenu
              entry={e}
              open={menuOpen}
              marking={pending}
              onOpenChange={onOpenMenu}
              onMarkBilled={onMarkBilled}
              onMarkUnbilled={onMarkUnbilled}
              onDelete={onDelete}
              size="sm"
            />
          </div>
        )}
      </td>
    </tr>
  );
}

// #99a desktop pinned running row. accent-soft wash + 2px accent left
// bar (both via `.entry-running-row` in globals.css). No row actions —
// Stop lives in the dock, so the row is `aria-describedby` the hidden
// hint below so AT users hear "Controlled from the timer".
function RunningTableRow({
  inSelect,
  runningEntry,
  elapsedSeconds,
  projectName,
  timezone,
}: {
  inSelect: boolean;
  runningEntry: RunningEntry;
  elapsedSeconds: number;
  projectName: string | null;
  timezone: string;
}): JSX.Element {
  const describedById = "entry-running-row-controlled-by-timer";
  const s = new Date(runningEntry.start_at);
  return (
    <tr
      className="entry-table-row entry-running-row h-11 border-b border-border"
      data-entry-running="true"
      aria-describedby={describedById}
    >
      {inSelect && (
        <td className="pl-4 align-middle">
          {/* Running is never selectable per the Shaul lock on #64. */}
          <span className="sr-only">Not selectable while running</span>
        </td>
      )}
      <td className="pl-4 pr-2 align-middle">
        {projectName ? (
          <ProjectChip
            name={projectName}
            projectId={runningEntry.project_id}
            className="max-w-full"
          />
        ) : (
          <span className="text-xs text-muted">No project</span>
        )}
      </td>
      <td className="px-2 align-middle">
        <div className="flex items-center gap-2 min-w-0">
          {/* Dark #10 ban: `accent` as small text fails on dark surface
              (3.04:1). Label stays on `ink`; the running semantic cue is
              carried by the dot + "Running" label pair, never by colour
              alone. */}
          <span
            className="entry-running-label inline-flex items-center gap-1.5 text-body-sm font-medium shrink-0"
            data-entry-running-label="true"
          >
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full bg-accent"
            />
            Running
          </span>
          <p
            className="truncate text-body-sm text-ink-2 min-w-0"
            title={runningEntry.description || undefined}
          >
            {runningEntry.description || (
              <span className="text-muted">No description</span>
            )}
          </p>
        </div>
      </td>
      <td className="hidden lg:table-cell px-2 align-middle">
        <span className="text-xs text-muted">Controlled from the timer</span>
      </td>
      <td className="px-2 align-middle">
        <span className="text-xs text-muted tabular-nums">
          {formatTime(s, timezone)}–now
        </span>
      </td>
      <td className="px-2 align-middle text-right">
        <span
          className="text-body-sm text-ink tabular-nums timer-digits"
          aria-live="polite"
          aria-label="Elapsed time"
        >
          {formatDurationHms(elapsedSeconds)}
        </span>
      </td>
      <td className="pr-4 pl-2 align-middle">
        {/* Reserved slot — kept empty so the actions column keeps the
            same reserved 108px width on every row. One unique hint
            target for aria-describedby (duplicate ids would break
            the AT association when the Tags column is visible). */}
        <span className="sr-only" id={describedById}>
          Controlled from the timer
        </span>
      </td>
    </tr>
  );
}

function ProjectChip({
  name,
  projectId,
  className = "",
}: {
  name: string;
  projectId: string | null;
  className?: string;
}): JSX.Element {
  // #84 colored project chip. The dot comes from a stable hash of the
  // project id (falling back to the display name when the id is missing,
  // which happens for the lg+ row before a page refresh after a rename).
  // The dot is decorative chrome, so we keep aria-hidden and leave the
  // name as the accessible text.
  const color = projectColor(projectId ?? name);
  return (
    <span
      className={"chip inline-flex items-center gap-1.5 truncate " + className}
      data-entry-project-chip="true"
      title={name}
    >
      {color && (
        <span
          aria-hidden
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          data-entry-project-dot="true"
        />
      )}
      <span className="truncate">{name}</span>
    </span>
  );
}

function ResumeButton({
  pending,
  timerRunning,
  onResume,
  compact,
  size,
}: {
  pending: boolean;
  timerRunning: boolean;
  onResume: () => void;
  compact?: boolean;
  size?: "sm";
}): JSX.Element {
  // #84 play-to-resume. Visual: accent-tinted ghost so the icon pops but
  // never fights the dock's primary purple Start — the dock remains the
  // only solid primary. Disabled while a timer is already running (hint
  // only; server still arbitrates on 409) or while a resume request is
  // in flight for this specific row.
  const disabled = pending || timerRunning;
  const sizeClass =
    size === "sm"
      ? "h-8 min-h-[32px] w-8 min-w-[32px]"
      : compact
        ? "h-9 min-h-[36px] w-9 min-w-[36px]"
        : "h-11 min-h-[44px] w-11 min-w-[44px]";
  const title = timerRunning
    ? "Stop the current timer first"
    : pending
      ? "Starting…"
      : "Start a new timer with this entry's project and description";
  return (
    <button
      type="button"
      className={
        "btn btn-ghost text-accent hover:text-accent hover:bg-accent-soft " +
        sizeClass +
        " px-0"
      }
      onClick={onResume}
      disabled={disabled}
      aria-label="Start timer from this entry"
      aria-busy={pending || undefined}
      title={title}
      data-entry-resume-btn="true"
    >
      <IconPlay size={size === "sm" ? 14 : compact ? 14 : 16} aria-hidden />
    </button>
  );
}

function SelectCheckbox({
  selectable,
  selected,
  label,
  onToggle,
  desktop,
}: {
  selectable: boolean;
  selected: boolean;
  label: string;
  onToggle: () => void;
  desktop?: boolean;
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
        desktop
          ? "flex h-8 w-8 min-h-[32px] min-w-[32px] shrink-0 items-center justify-center rounded-md"
          : "flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center " +
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
  size,
}: {
  entry: Entry;
  open: boolean;
  marking: boolean;
  onOpenChange: (open: boolean) => void;
  onMarkBilled: () => void;
  onMarkUnbilled: () => void;
  onDelete: () => void;
  compact?: boolean;
  size?: "sm";
}): JSX.Element {
  const canBill = entry.billable && !entry.billed;
  const canUnbill = entry.billable && entry.billed;
  const btnClass =
    size === "sm"
      ? "btn btn-ghost h-8 min-h-[32px] w-8 min-w-[32px] px-0"
      : compact
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
