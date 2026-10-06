"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { onTimerChanged } from "@/lib/events";
import { isConfigRoute } from "@/lib/shell-routes";
import { formatDurationHms } from "@/lib/tz";

interface RunningEntry {
  start_at: string;
}

export interface RunningTimerState {
  /** Configuration route: the full dock is hidden, so the counter may show. */
  config: boolean;
  running: boolean;
  label: string;
}

const RunningTimerContext = createContext<RunningTimerState | null>(null);

export function useRunningTimer(): RunningTimerState | null {
  return useContext(RunningTimerContext);
}

function elapsedSeconds(startAt: string, now: number): number {
  const start = new Date(startAt).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((now - start) / 1000));
}

export function RunningTimerProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const pathname = usePathname() ?? "/app";
  const config = isConfigRoute(pathname);
  const [entry, setEntry] = useState<RunningEntry | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Drop a stale running entry when leaving a config page so the header
  // chip does not flash the old counter on the next config visit. Adjusting
  // state during render (instead of in an effect) is the supported pattern
  // for "reset when this value changes".
  const [trackedConfig, setTrackedConfig] = useState(config);
  if (config !== trackedConfig) {
    setTrackedConfig(config);
    if (!config) setEntry(null);
  }

  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const res = await fetch("/api/timer", { cache: "no-store" });
        if (cancelled || !res.ok) return;
        const data = (await res.json()) as RunningEntry | null;
        setEntry(data && data.start_at ? data : null);
      } catch {
        if (!cancelled) setEntry(null);
      }
    }
    void load();
    const unsubscribe = onTimerChanged(() => {
      void load();
    });
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [config]);

  const running = entry !== null;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const label = entry ? formatDurationHms(elapsedSeconds(entry.start_at, now)) : "00:00:00";
  const value: RunningTimerState = { config, running, label };

  return (
    <RunningTimerContext.Provider value={value}>
      {children}
    </RunningTimerContext.Provider>
  );
}

/** Desktop header pill. Hidden on phones — the Timer tab carries the counter. */
export function RunningTimerChip(): JSX.Element | null {
  const state = useRunningTimer();
  if (!state || !state.config || !state.running) return null;
  return (
    <Link
      href="/app"
      className="chip hidden md:inline-flex min-h-8 shrink-0 gap-1.5 px-2.5 py-1"
      aria-label={`Timer running ${state.label}. Open timer`}
      title="Timer running — open the timer page"
      data-running-timer-chip="true"
    >
      <span className="timer-running-dot h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden />
      <span className="timer-digits text-ink">{state.label}</span>
    </Link>
  );
}
