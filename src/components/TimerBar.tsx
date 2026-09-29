"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDurationHms } from "@/lib/tz";

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
    if (!confirm("Discard the running timer?")) return;
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

  return (
    <div className="border-t border-border bg-canvas-2">
      <div className="mx-auto max-w-6xl px-4 py-2 flex items-center gap-3">
        <input
          className="input flex-1"
          placeholder={entry ? "What are you working on?" : "Start a new timer…"}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <select
          className="input max-w-[180px]"
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
        <label className="text-sm flex items-center gap-1 text-muted">
          <input
            type="checkbox"
            checked={billable}
            onChange={(e) => setBillable(e.target.checked)}
          />
          $
        </label>
        <span className="tabular-nums font-mono text-sm w-24 text-right">
          {entry ? formatDurationHms(seconds) : "00:00:00"}
        </span>
        {entry ? (
          <>
            <button className="btn btn-danger" disabled={pending} onClick={discard}>
              Discard
            </button>
            <button className="btn btn-primary" disabled={pending} onClick={stop}>
              Stop
            </button>
          </>
        ) : (
          <button className="btn btn-primary" disabled={pending} onClick={start}>
            Start
          </button>
        )}
        <span className="text-xs text-muted hidden md:inline">TZ: {timezone}</span>
      </div>
    </div>
  );
}
