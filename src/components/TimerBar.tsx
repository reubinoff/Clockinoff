"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDurationHms } from "@/lib/tz";
import {
  emitEntryAdded,
  emitToast,
  onProjectsChanged,
  onTimerChanged,
} from "@/lib/events";
import { handleAuthFailure, isAuthFailure } from "@/lib/auth-ui";
import {
  IconPlay,
  IconStop,
  IconDiscard,
  IconBillable,
  IconChevronDown,
  IconEdit,
} from "@/components/icons";
import ManualEntryForm from "@/components/ManualEntryForm";
import ManualEntrySheet from "@/components/ManualEntrySheet";

interface Entry {
  id: string;
  description: string;
  start_at: string;
  end_at: string | null;
  project_id: string | null;
  project_name: string | null;
  billable: boolean;
  running: boolean;
}

interface Project {
  id: string;
  name: string;
  archivedAt: string | null;
}

// `timezone` is still accepted so the server layout keeps supplying it, but
// per #64 the timezone label no longer renders inside the dock — it lives in
// the desktop footer / Account page only. #65 Manual mode and #83 mobile
// Manual sheet both need it, so it is forwarded to ManualEntryForm /
// ManualEntrySheet so start/end time inputs resolve in the user's zone.
export default function TimerBar({
  timezone,
}: {
  timezone: string;
}): JSX.Element {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  // Product-locked: Billable is ON by default. Persisted server-side via the
  // debounced PATCH below and re-read from GET /api/timer on load, so a
  // refresh keeps whatever the user last set on the dock.
  const [billable, setBillable] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState(false);
  // V2-5 Shaul lock: Details (project + billable + tz) collapsed by default.
  // Description stays visible because it's the primary interaction.
  const [detailsOpen, setDetailsOpen] = useState(false);
  // #65 Manual mode: md+ dock toggle Timer ↔ Manual. Default Timer. While a
  // timer is running the toggle is hidden and `mode` is forced back to
  // "timer" so the running wash + Stop/Discard are never obscured.
  const [mode, setMode] = useState<"timer" | "manual">("timer");
  // #83 mobile Manual entry — the dock button opens a V2-9 bottom sheet
  // that renders the same ManualEntryForm. State lives here so the sheet
  // sees the latest projects list without re-fetching on open.
  const [manualSheetOpen, setManualSheetOpen] = useState(false);
  const patchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProjects = useCallback(async () => {
    const res = await fetch("/api/projects", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { projects: Project[] };
      setProjects(data.projects);
    }
  }, []);

  // Shaul/Ariel lock (#54, #67): on initial mount `description`, `projectId`,
  // `billable` are the user's input surface — they can start typing into
  // the dock BEFORE the GET /api/timer response arrives. If that response
  // says "no running entry" we must NOT blow their input away. Only clear
  // the dock-local inputs when the running entry we had locally has
  // disappeared server-side (e.g. stopped or discarded in another tab).
  // `prevEntryRef` mirrors `entry` so we can detect that transition
  // without creating a stale closure in `load`.
  const prevEntryRef = useRef<Entry | null>(null);
  useEffect(() => {
    prevEntryRef.current = entry;
  }, [entry]);

  const load = useCallback(async () => {
    const [tRes, pRes] = await Promise.all([
      fetch("/api/timer", { cache: "no-store" }),
      fetch("/api/projects", { cache: "no-store" }),
    ]);
    if (tRes.ok) {
      const data = (await tRes.json()) as Entry | null;
      const hadEntry = prevEntryRef.current !== null;
      setEntry(data);
      if (data) {
        setDescription(data.description);
        setProjectId(data.project_id ?? "");
        setBillable(data.billable);
      } else if (hadEntry) {
        setDescription("");
        setProjectId("");
        setBillable(true);
      }
    }
    if (pRes.ok) {
      const data = (await pRes.json()) as { projects: Project[] };
      setProjects(data.projects);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // #84 play-to-resume: EntryList starts a fresh timer from a stopped
  // entry's project/description. The dock owns the running state, so
  // re-read /api/timer when that happens; the running wash + Stop
  // controls then light up without the user having to touch the dock.
  useEffect(() => {
    const unsubscribe = onTimerChanged(() => {
      void load();
    });
    return unsubscribe;
  }, [load]);

  // Keep the project dropdown in sync when projects are created/archived/deleted
  // elsewhere in the app (e.g. from ProjectsPanel), and when the tab regains
  // focus after edits in another tab.
  useEffect(() => {
    const unsubscribe = onProjectsChanged(() => {
      void loadProjects();
    });
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") void loadProjects();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadProjects]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!entry) return;
    if (patchTimeout.current) clearTimeout(patchTimeout.current);
    patchTimeout.current = setTimeout(() => {
      void fetch("/api/timer", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description,
          project_id: projectId || null,
          billable,
        }),
      });
    }, 500);
    return () => {
      if (patchTimeout.current) clearTimeout(patchTimeout.current);
    };
  }, [description, projectId, billable, entry]);

  async function start(): Promise<void> {
    // Shaul lock (#54): await the real /api/timer/start response, then set
    // local state from the response body — no mandatory router.refresh().
    // The dock swaps to the running wash as soon as `entry` is set, so
    // `pending` clears after the start response (not after a second timer
    // reload). Projects list is already in local state.
    setPending(true);
    try {
      const res = await fetch("/api/timer/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description,
          project_id: projectId || null,
          billable,
        }),
      });
      if (res.ok) {
        const started = (await res.json()) as Entry;
        setEntry(started);
        setDescription(started.description);
        setProjectId(started.project_id ?? "");
        setBillable(started.billable);
        return;
      }
      if (isAuthFailure(res.status)) {
        handleAuthFailure({
          rollback: () => {
            setEntry(null);
          },
        });
        return;
      }
      // Non-auth failure: leave the idle dock in place; no toast — the
      // mutation didn't happen, so no "success" chrome is implied.
    } finally {
      setPending(false);
    }
  }

  async function stop(): Promise<void> {
    // Shaul lock (#54): we already optimistically clear the dock + emit the
    // just-stopped entry to EntryList via the module bus. The /api/timer/stop
    // response gives us the authoritative row; EntryList dedupes by id.
    // No router.refresh — the list state already matches the server body.
    const previous = entry;
    setPending(true);
    try {
      const res = await fetch("/api/timer/stop", { method: "POST" });
      if (res.ok) {
        const stopped = (await res.json()) as Entry;
        setEntry(null);
        setDescription("");
        setProjectId("");
        setBillable(true);
        emitEntryAdded(stopped);
        emitToast("Logged");
        return;
      }
      if (isAuthFailure(res.status)) {
        // Ariel's rule: no "logged" toast or empty dock after an auth
        // failure. Restore the running entry so the user sees exactly the
        // pre-click state when they come back from re-auth.
        handleAuthFailure({
          rollback: () => {
            if (previous) setEntry(previous);
          },
        });
        return;
      }
    } finally {
      setPending(false);
    }
  }

  async function discard(): Promise<void> {
    if (!confirm("Discard this running timer? This can’t be undone.")) return;
    // Shaul lock (#54): optimistic clear + await DELETE. No router.refresh —
    // the entry never belonged to any list, and TimerBar's own `entry` is
    // the single source of truth for the dock state.
    const previous = entry;
    setPending(true);
    try {
      const res = await fetch("/api/timer", { method: "DELETE" });
      if (res.ok) {
        setEntry(null);
        setDescription("");
        setProjectId("");
        setBillable(true);
        // V2-6 §3: discard produces no list row — toast only.
        emitToast("Discarded");
        return;
      }
      if (isAuthFailure(res.status)) {
        handleAuthFailure({
          rollback: () => {
            if (previous) setEntry(previous);
          },
        });
        return;
      }
    } finally {
      setPending(false);
    }
  }

  const seconds = entry
    ? Math.max(0, Math.floor((now - new Date(entry.start_at).getTime()) / 1000))
    : 0;
  const running = entry !== null;
  // Lock mode to "timer" while running — a Manual Add during a live timer
  // would compete with the running wash and the Stop/Discard primaries,
  // and the locked brief says Manual is only an idle-state entry point.
  // We derive `manualActive` from both state and running so no effect is
  // needed to clamp mode; the toggle itself is also hidden while running.
  const showManualToggle = !running;
  const showMobileManualBtn = !running;
  const manualActive = mode === "manual" && !running;
  const sheetShouldBeOpen = manualSheetOpen && !running;

  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));
  // #82 mobile collapsed band preview: show the typed/running description
  // if there is one, otherwise fall back to the same placeholder the input
  // uses so the band reads as an invitation to tap in. We trim so a stray
  // leading space doesn't suppress the placeholder.
  const hasDescription = description.trim().length > 0;

  return (
    <div
      className={
        // V2-5 §3 running wash: swap the neutral dock surface for an
        // accent-soft tint while a timer is running. Transition on the
        // `--duration-moderate` motion token so it obeys reduced-motion.
        "border-t timer-dock" +
        (running ? " timer-dock-running" : " border-border bg-canvas-2")
      }
      // #64 mobile scroll padding: globals.css uses :has() on this
      // attribute to bump `main`'s mobile pb when Details is open, so the
      // expanded dock never permanently covers the first entry row.
      // #82 the attribute now also drives the collapsed-vs-expanded mobile
      // layout — the collapsed band is a thin description/elapsed/Stop
      // strip, the expanded panel adds the full input + project + billable.
      data-timer-dock-root="true"
      data-timer-details-open={detailsOpen ? "true" : "false"}
      data-timer-mode={manualActive ? "manual" : "timer"}
    >
      {/* #82 mobile grabber (md:hidden). Thin pill handle at the top of the
          dock that toggles the expanded panel. Button itself is 32px tall
          but hitArea pads up to ≥44px via the surrounding py-2 on the band
          below — the grabber plus the first row give a comfortable tap
          target even for the handle alone. */}
      <button
        type="button"
        className="md:hidden flex w-full items-center justify-center py-1.5 group min-h-[20px]"
        onClick={() => setDetailsOpen((v) => !v)}
        aria-expanded={detailsOpen}
        aria-controls="timer-mobile-expanded"
        aria-label={
          detailsOpen ? "Collapse timer details" : "Expand timer details"
        }
        data-timer-grabber="true"
      >
        <span
          className="block h-1 w-10 rounded-full bg-border-strong group-hover:bg-muted transition-colors"
          aria-hidden
        />
      </button>
      {/* #82 mobile collapsed band — thin description / elapsed / primary.
          Tapping the description area expands the full editor so the
          running description stays editable, matching the competitor
          dock without a visible input in the collapsed state. Hidden on
          md+ (desktop keeps the one-baseline band from #64). */}
      <div
        className={
          "md:hidden mx-auto max-w-6xl px-4 pb-2 items-center gap-2 " +
          (detailsOpen ? "hidden" : "flex")
        }
        data-timer-mobile-collapsed="true"
      >
        <button
          type="button"
          onClick={() => setDetailsOpen(true)}
          className="flex-1 min-w-0 inline-flex items-center min-h-[44px] text-left truncate text-body transition-colors hover:text-ink"
          aria-label={
            hasDescription
              ? "Edit timer description"
              : "What are you working on?"
          }
          data-timer-mobile-desc-trigger="true"
        >
          <span
            className={
              "block w-full truncate " +
              (hasDescription ? "text-ink" : "text-muted")
            }
          >
            {hasDescription ? description : "What are you working on?"}
          </span>
        </button>
        <span
          className={
            "timer-digits text-timer-md shrink-0 text-right text-ink min-w-[76px]" +
            (running ? " timer-running-pulse" : "")
          }
          aria-live="polite"
          aria-label={running ? "Elapsed time" : "Timer idle"}
        >
          {running ? formatDurationHms(seconds) : "00:00:00"}
        </span>
        {running ? (
          <button
            className="btn btn-primary press-scale shrink-0 min-h-[44px] !px-4"
            disabled={pending}
            onClick={stop}
            aria-label="Stop timer"
            aria-busy={pending || undefined}
            data-timer-stop-btn="true"
          >
            <IconStop size={16} aria-hidden />
            <span>Stop</span>
          </button>
        ) : (
          <>
            {showMobileManualBtn && (
              <button
                type="button"
                className="btn shrink-0 min-h-[44px] !px-3"
                onClick={() => setManualSheetOpen(true)}
                aria-label="Add manual entry"
                data-timer-manual-mobile-btn="true"
              >
                <IconEdit size={16} aria-hidden />
                <span className="sr-only">Manual</span>
              </button>
            )}
            <button
              className="btn btn-primary timer-start-idle press-scale shrink-0 min-h-[44px] !px-4"
              disabled={pending}
              onClick={start}
              aria-label="Start timer"
              aria-busy={pending || undefined}
              data-timer-start-btn="true"
            >
              <IconPlay size={16} aria-hidden />
              <span>Start</span>
            </button>
          </>
        )}
      </div>
      {/* #65 md+ mode toggle. Quiet segmented control, hidden on mobile and
          while a timer is running. Sits on its own narrow strip above the
          dock row so the main dock baseline keeps the locked #64 order. */}
      {showManualToggle && (
        <div className="hidden md:flex mx-auto max-w-6xl px-4 pt-2">
          <div
            className="inline-flex items-center rounded-full border border-border bg-surface p-0.5"
            role="tablist"
            aria-label="Entry mode"
            data-timer-mode-toggle="true"
          >
            <button
              type="button"
              role="tab"
              aria-selected={!manualActive}
              onClick={() => setMode("timer")}
              className={
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-body-sm transition-colors min-h-[36px] " +
                (manualActive
                  ? "text-muted hover:text-ink"
                  : "bg-canvas-2 text-ink")
              }
              data-timer-mode-timer="true"
            >
              <IconPlay size={14} aria-hidden />
              <span>Timer</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={manualActive}
              onClick={() => setMode("manual")}
              className={
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-body-sm transition-colors min-h-[36px] " +
                (manualActive
                  ? "bg-canvas-2 text-ink"
                  : "text-muted hover:text-ink")
              }
              data-timer-mode-manual="true"
            >
              <IconEdit size={14} aria-hidden />
              <span>Manual</span>
            </button>
          </div>
        </div>
      )}
      {manualActive && (
        <div className="hidden md:block mx-auto max-w-6xl px-4 py-2">
          <ManualEntryForm
            projects={projectOptions}
            timezone={timezone}
            layout="inline"
          />
        </div>
      )}
      <div
        id="timer-mobile-expanded"
        className={
          // #82 mobile: this row is the EXPANDED panel — only shown when the
          // grabber is open. md+ keeps the one-baseline inline dock from
          // #64 (always visible). The desktop manual-form sub-tree still
          // hides the whole timer row via `md:hidden` on itself below.
          "mx-auto max-w-6xl px-4 py-2 flex-col gap-2 md:flex md:flex-row md:flex-wrap md:items-center md:gap-3 " +
          (detailsOpen ? "flex " : "hidden ") +
          (manualActive ? "md:hidden" : "")
        }
      >
        {/* #64 md+ dock lock (Moshe product-lock 2026-10-01):
              description | Project ▾ | Billable chip | 00:00:00 | Start
            is one `items-center` baseline. On md+ we flow every control into
            the same flex row and use `md:order-*` to put project + billable
            BEFORE the duration + Start cluster so the chevron can stay at the
            far right without breaking the dock order. Mobile keeps the
            calm stack (description → duration + Start → optional Details). */}
        <input
          className="input w-full md:flex-1 md:w-auto md:min-w-[280px] md:order-1"
          placeholder="What are you working on?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          data-timer-description="true"
          aria-label="Timer description"
        />
        <div className="flex items-center gap-2 md:contents">
          <span
            className={
              "timer-digits text-timer-md flex-1 md:flex-none md:w-[92px] text-right text-ink md:order-4" +
              (running ? " timer-running-pulse" : "")
            }
            aria-live="polite"
            aria-label={running ? "Elapsed time" : "Timer idle"}
          >
            {running ? formatDurationHms(seconds) : "00:00:00"}
          </span>
          {running ? (
            <>
              <button
                className="btn btn-ghost shrink-0 md:order-5"
                disabled={pending}
                onClick={discard}
                aria-label="Discard running timer"
                aria-busy={pending || undefined}
              >
                <IconDiscard size={16} aria-hidden />
                <span className="hidden sm:inline">Discard</span>
              </button>
              <button
                className="btn btn-primary press-scale flex-1 md:flex-none md:order-6"
                disabled={pending}
                onClick={stop}
                aria-label="Stop timer"
                aria-busy={pending || undefined}
                data-timer-stop-btn="true"
              >
                <IconStop size={16} aria-hidden />
                <span>Stop</span>
              </button>
            </>
          ) : (
            <>
              {/* #83 mobile Manual entry. Secondary (ghost outline) button —
                   purple stays reserved for Start so there are never two
                   competing primaries. Hidden on md+ because desktop uses
                   the segmented Timer | Manual toggle at the top of the
                   dock instead. */}
              {showMobileManualBtn && (
                <button
                  type="button"
                  className="btn md:hidden shrink-0 min-h-[44px]"
                  onClick={() => setManualSheetOpen(true)}
                  aria-label="Add manual entry"
                  data-timer-manual-mobile-btn="true"
                >
                  <IconEdit size={16} aria-hidden />
                  <span>Manual</span>
                </button>
              )}
              <button
                className="btn btn-primary timer-start-idle press-scale flex-1 md:flex-none md:order-6"
                disabled={pending}
                onClick={start}
                aria-label="Start timer"
                aria-busy={pending || undefined}
                data-timer-start-btn="true"
              >
                <IconPlay size={16} aria-hidden />
                <span>Start</span>
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-ghost !min-h-[44px] !min-w-[44px] !px-2 shrink-0 md:order-7 hidden md:inline-flex"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
            aria-controls="timer-details"
            aria-label={detailsOpen ? "Hide timer details" : "Show timer details"}
            title={detailsOpen ? "Hide details" : "Details"}
          >
            <IconChevronDown
              size={16}
              aria-hidden
              className={
                "transition-transform" + (detailsOpen ? " rotate-180" : "")
              }
            />
          </button>
        </div>
        {/* Details (project + billable) — collapsed by default per V2-5.
             #64 md+ lock: on md+ project + billable flow INLINE in the main
             dock row via `md:contents` + `md:order-2/3`, so the whole dock
             reads as a single band. The helper copy "Counts toward client
             work." is now a tooltip on the chip (Dana lock) instead of a
             stacked span that broke the chip's baseline. Timezone no longer
             appears here — it lives in the desktop footer and the Account
             page (see #64 brief). Billable itself is still persisted
             server-side via PATCH /api/timer above so a refresh keeps the
             choice, and the flag is copied onto the entry on Stop. */}
        {detailsOpen && (
          <div
            id="timer-details"
            className="flex flex-col gap-2 md:flex-row md:items-center md:contents"
          >
            <select
              className="input flex-1 md:flex-none md:w-auto md:max-w-[200px] md:order-2"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              aria-label="Project"
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              role="switch"
              aria-checked={billable}
              aria-label="Billable"
              onClick={() => {
                setBillable((b) => {
                  const next = !b;
                  emitToast(next ? "Billable on" : "Billable off");
                  return next;
                });
              }}
              className={
                "chip min-h-[44px] shrink-0 md:order-3" +
                (billable ? " chip-on" : "")
              }
              title="Billable — counts toward client work"
              data-timer-billable-toggle="true"
            >
              <IconBillable size={14} aria-hidden />
              <span>Billable</span>
            </button>
          </div>
        )}
      </div>
      {sheetShouldBeOpen && (
        <ManualEntrySheet
          projects={projectOptions}
          timezone={timezone}
          onClose={() => setManualSheetOpen(false)}
        />
      )}
    </div>
  );
}
