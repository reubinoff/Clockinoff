"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDurationHms } from "@/lib/tz";
import { onProjectsChanged } from "@/lib/events";
import {
  IconPlay,
  IconStop,
  IconDiscard,
  IconBillable,
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
  const router = useRouter();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [billable, setBillable] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState(false);
  const patchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProjects = useCallback(async () => {
    const res = await fetch("/api/projects", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { projects: Project[] };
      setProjects(data.projects);
    }
  }, []);

  const load = useCallback(async () => {
    const [tRes, pRes] = await Promise.all([
      fetch("/api/timer", { cache: "no-store" }),
      fetch("/api/projects", { cache: "no-store" }),
    ]);
    if (tRes.ok) {
      const data = (await tRes.json()) as Entry | null;
      setEntry(data);
      if (data) {
        setDescription(data.description);
        setProjectId(data.project_id ?? "");
        setBillable(data.billable);
      } else {
        setDescription("");
        setProjectId("");
        setBillable(false);
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
        await load();
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  async function stop(): Promise<void> {
    setPending(true);
    try {
      const res = await fetch("/api/timer/stop", { method: "POST" });
      if (res.ok) {
        setEntry(null);
        setDescription("");
        setProjectId("");
        setBillable(false);
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  async function discard(): Promise<void> {
    if (!confirm("Discard this running timer? This can’t be undone.")) return;
    setPending(true);
    try {
      await fetch("/api/timer", { method: "DELETE" });
      setEntry(null);
      setDescription("");
      setProjectId("");
      setBillable(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const seconds = entry
    ? Math.max(0, Math.floor((now - new Date(entry.start_at).getTime()) / 1000))
    : 0;
  const running = entry !== null;

  return (
    <div className="border-t border-border bg-canvas-2">
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
        {/* Row 2 (base): project select + billable chip */}
        <div className="flex items-center gap-2 md:contents">
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
          <button
            type="button"
            role="switch"
            aria-checked={billable}
            onClick={() => setBillable((b) => !b)}
            className={
              "chip min-h-[44px] shrink-0" + (billable ? " chip-on" : "")
            }
            title={billable ? "Billable" : "Not billable"}
          >
            <IconBillable size={14} aria-hidden />
            <span>Billable</span>
          </button>
        </div>
        {/* Row 3 (base): duration + Start/Stop (+ Discard when running) */}
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
                className="btn btn-danger shrink-0"
                disabled={pending}
                onClick={discard}
                aria-label="Discard running timer"
              >
                <IconDiscard size={16} aria-hidden />
                <span className="hidden sm:inline">Discard</span>
              </button>
              <button
                className="btn btn-primary flex-1 md:flex-none"
                disabled={pending}
                onClick={stop}
                aria-label="Stop timer"
              >
                <IconStop size={16} aria-hidden />
                <span>Stop</span>
              </button>
            </>
          ) : (
            <button
              className="btn btn-primary timer-start-idle flex-1 md:flex-none"
              disabled={pending}
              onClick={start}
              aria-label="Start timer"
            >
              <IconPlay size={16} aria-hidden />
              <span>Start</span>
            </button>
          )}
        </div>
        <span className="text-xs text-muted hidden md:inline shrink-0">
          {timezone}
        </span>
      </div>
    </div>
  );
}
