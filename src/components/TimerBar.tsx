"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDurationHms } from "@/lib/tz";
import { emitEntryAdded, emitToast, onProjectsChanged } from "@/lib/events";
import { handleAuthFailure, isAuthFailure } from "@/lib/auth-ui";
import {
  IconPlay,
  IconStop,
  IconDiscard,
  IconBillable,
  IconChevronDown,
} from "@/components/icons";

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

export default function TimerBar({ timezone }: { timezone: string }): JSX.Element {
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

  return (
    <div
      className={
        // V2-5 §3 running wash: swap the neutral dock surface for an
        // accent-soft tint while a timer is running. Transition on the
        // `--duration-moderate` motion token so it obeys reduced-motion.
        "border-t timer-dock" +
        (running ? " timer-dock-running" : " border-border bg-canvas-2")
      }
    >
      <div className="mx-auto max-w-6xl px-4 py-2 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-3">
        {/* Row 1 (base): description — full width */}
        <input
          className="input w-full md:flex-1 md:w-auto md:min-w-[280px]"
          placeholder="What are you working on?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          data-timer-description="true"
          aria-label="Timer description"
        />
        {/* Row 2 (base): duration + Start/Stop (+ Discard when running) + Details toggle */}
        <div className="flex items-center gap-2 md:contents">
          <span
            className={
              "timer-digits text-timer-md flex-1 md:flex-none md:w-[92px] text-right text-ink" +
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
                className="btn btn-ghost shrink-0"
                disabled={pending}
                onClick={discard}
                aria-label="Discard running timer"
                aria-busy={pending || undefined}
              >
                <IconDiscard size={16} aria-hidden />
                <span className="hidden sm:inline">Discard</span>
              </button>
              <button
                className="btn btn-primary press-scale flex-1 md:flex-none"
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
            <button
              className="btn btn-primary timer-start-idle press-scale flex-1 md:flex-none"
              disabled={pending}
              onClick={start}
              aria-label="Start timer"
              aria-busy={pending || undefined}
              data-timer-start-btn="true"
            >
              <IconPlay size={16} aria-hidden />
              <span>Start</span>
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost !min-h-[44px] !min-w-[44px] !px-2 shrink-0"
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
        {/* Details (project + billable + tz) — collapsed by default per V2-5.
             Billable lives here as a quiet switch (Dana lock). Default on;
             persisted server-side via PATCH /api/timer above so a refresh
             keeps the choice, and copied onto the entry on Stop. */}
        {detailsOpen && (
          <div
            id="timer-details"
            className="flex flex-col gap-2 md:flex-row md:items-center md:contents"
          >
            <select
              className="input flex-1 md:flex-none md:w-auto md:max-w-[200px]"
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
            <div className="flex flex-col items-start gap-0.5 shrink-0">
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
                  "chip min-h-[44px]" + (billable ? " chip-on" : "")
                }
                title="Billable"
                data-timer-billable-toggle="true"
              >
                <IconBillable size={14} aria-hidden />
                <span>Billable</span>
              </button>
              <span className="text-xs text-muted">
                Counts toward client work.
              </span>
            </div>
            <span className="text-xs text-muted hidden md:inline shrink-0">
              {timezone}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
