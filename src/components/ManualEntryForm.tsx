"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDate, formatTime, zonedIsoToUtc } from "@/lib/tz";
import { formatHm, splitHm } from "@/lib/duration";
import { emitEntryAdded, emitToast } from "@/lib/events";
import { handleAuthFailure, isAuthFailure } from "@/lib/auth-ui";
import { IconBillable, IconPlus } from "@/components/icons";

interface Project {
  id: string;
  name: string;
  archivedAt?: string | null;
}

export interface ManualEntryFormProps {
  projects: Project[];
  timezone: string;
  // Called after a successful Add — e.g. to close a mobile sheet.
  // The form always resets its own fields to defaults on success; this
  // callback runs after that reset so the sheet dismiss is the last thing.
  onCreated?: () => void;
  // "inline" lays the row out horizontally for the md+ dock; "stacked"
  // stacks fields vertically for the mobile sheet.
  layout?: "inline" | "stacked";
  // Autofocus the description on mount — only wanted inside the sheet.
  autoFocusDescription?: boolean;
}

function todayDateInZone(tz: string): string {
  return formatDate(new Date(), tz);
}

function nowTimeInZone(tz: string): string {
  return formatTime(new Date(), tz);
}

// Combine a yyyy-mm-dd date string + HH:MM time string in the user tz into
// a UTC Date. zonedIsoToUtc throws on garbage inputs; callers above catch
// and fall through to a 0 duration so the readback never blows up.
function combineDateTime(date: string, time: string, tz: string): Date {
  return zonedIsoToUtc(`${date}T${time}:00`, tz);
}

export default function ManualEntryForm({
  projects,
  timezone,
  onCreated,
  layout = "stacked",
  autoFocusDescription = false,
}: ManualEntryFormProps): JSX.Element {
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [billable, setBillable] = useState(true);
  const [date, setDate] = useState(() => todayDateInZone(timezone));
  const [startTime, setStartTime] = useState(() => nowTimeInZone(timezone));
  const [endTime, setEndTime] = useState(() => nowTimeInZone(timezone));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const descRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (autoFocusDescription) {
      descRef.current?.focus();
    }
  }, [autoFocusDescription]);

  const { durationSeconds, rangeError } = useMemo(() => {
    try {
      const s = combineDateTime(date, startTime, timezone);
      const e = combineDateTime(date, endTime, timezone);
      const diff = Math.floor((e.getTime() - s.getTime()) / 1000);
      return {
        durationSeconds: Math.max(0, diff),
        rangeError: diff < 0 ? "End must be after start" : null,
      };
    } catch {
      return { durationSeconds: 0, rangeError: null };
    }
  }, [date, startTime, timezone, endTime]);

  const resetDefaults = useCallback((): void => {
    const now = new Date();
    const t = formatTime(now, timezone);
    setDescription("");
    setProjectId("");
    setBillable(true);
    setDate(formatDate(now, timezone));
    setStartTime(t);
    setEndTime(t);
    setError(null);
  }, [timezone]);

  const canSubmit = !pending && !rangeError && durationSeconds > 0;

  async function submit(): Promise<void> {
    if (pending) return;
    let startAt: Date;
    let endAt: Date;
    try {
      startAt = combineDateTime(date, startTime, timezone);
      endAt = combineDateTime(date, endTime, timezone);
    } catch {
      setError("Invalid date or time");
      return;
    }
    if (endAt.getTime() <= startAt.getTime()) {
      setError("End must be after start");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description,
          project_id: projectId || null,
          billable,
          start_at: startAt.toISOString(),
          end_at: endAt.toISOString(),
        }),
      });
      if (res.ok) {
        const created = (await res.json()) as { id: string };
        emitEntryAdded(created);
        emitToast("Logged");
        resetDefaults();
        onCreated?.();
        return;
      }
      if (isAuthFailure(res.status)) {
        handleAuthFailure();
        return;
      }
      let msg = "Couldn't add entry. Try again.";
      try {
        const data = (await res.json()) as {
          error?: { message?: string };
        };
        if (data?.error?.message) msg = data.error.message;
      } catch {
        /* ignore */
      }
      setError(msg);
    } catch {
      setError("Couldn't add entry. Try again.");
    } finally {
      setPending(false);
    }
  }

  const { hours, minutes } = splitHm(durationSeconds);
  const durationLabel = formatHm({ hours, minutes });

  const inline = layout === "inline";

  // Shared field markup. Layout is driven by the parent container classes;
  // "inline" is a wrap-friendly flex row (dock), "stacked" is a column (sheet).
  const descriptionInput = (
    <input
      ref={descRef}
      className={
        inline
          ? "input w-full md:flex-1 md:min-w-[220px]"
          : "input w-full"
      }
      placeholder="What have you worked on?"
      value={description}
      onChange={(e) => setDescription(e.target.value)}
      maxLength={2000}
      aria-label="Manual entry description"
      data-manual-description="true"
    />
  );

  const projectSelect = (
    <select
      className={
        inline
          ? "input flex-1 md:flex-none md:w-auto md:max-w-[180px]"
          : "input w-full"
      }
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
  );

  const billableChip = (
    <button
      type="button"
      role="switch"
      aria-checked={billable}
      aria-label="Billable"
      onClick={() => setBillable((b) => !b)}
      className={"chip min-h-[44px] shrink-0" + (billable ? " chip-on" : "")}
      title="Billable — counts toward client work"
      data-manual-billable-toggle="true"
    >
      <IconBillable size={14} aria-hidden />
      <span>Billable</span>
    </button>
  );

  const timeFields = (
    <>
      <label className={inline ? "sr-only" : "label"} htmlFor="manual-start">
        Start
      </label>
      <input
        id="manual-start"
        type="time"
        className={
          inline
            ? "input input-time !min-h-[44px] w-[11.5rem] min-w-[11.5rem] shrink-0 tabular-nums"
            : "input input-time tabular-nums"
        }
        value={startTime}
        onChange={(e) => setStartTime(e.target.value)}
        aria-label="Start time"
        data-manual-start="true"
      />
      {inline && (
        <span aria-hidden className="text-muted text-sm">
          –
        </span>
      )}
      <label className={inline ? "sr-only" : "label"} htmlFor="manual-end">
        End
      </label>
      <input
        id="manual-end"
        type="time"
        className={
          inline
            ? "input input-time !min-h-[44px] w-[11.5rem] min-w-[11.5rem] shrink-0 tabular-nums"
            : "input input-time tabular-nums"
        }
        value={endTime}
        onChange={(e) => setEndTime(e.target.value)}
        aria-label="End time"
        data-manual-end="true"
      />
    </>
  );

  const dateField = (
    <>
      <label className={inline ? "sr-only" : "label"} htmlFor="manual-date">
        Date
      </label>
      <input
        id="manual-date"
        type="date"
        className={
          inline
            ? "input !min-h-[44px] w-[9.5rem] shrink-0 tabular-nums"
            : "input tabular-nums"
        }
        value={date}
        onChange={(e) => setDate(e.target.value)}
        aria-label="Date"
        data-manual-date="true"
      />
    </>
  );

  const durationReadback = (
    <span
      className={
        (inline ? "timer-digits text-timer-md w-[72px] text-right text-ink shrink-0" : "timer-digits text-ink text-timer-md ml-auto")
      }
      aria-live="polite"
      aria-label="Duration"
      data-manual-duration-readback="true"
    >
      {durationLabel}
    </span>
  );

  const addButton = (
    <button
      type="button"
      className={
        inline
          ? "btn btn-primary press-scale shrink-0"
          : "btn btn-primary press-scale w-full"
      }
      onClick={submit}
      disabled={!canSubmit}
      aria-busy={pending || undefined}
      data-manual-add-btn="true"
    >
      <IconPlus size={16} aria-hidden />
      <span>{pending ? "Adding…" : "Add"}</span>
    </button>
  );

  if (inline) {
    // Desktop dock row — wrap-friendly single band. Project + billable sit
    // between the description and the time cluster so the Add button lives
    // at the far right of the row, matching the locked #65 layout.
    return (
      <div
        className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-3"
        data-manual-form="inline"
      >
        {descriptionInput}
        <div className="flex items-center gap-2 md:contents">
          {projectSelect}
          {billableChip}
          {timeFields}
          {dateField}
          {durationReadback}
          {addButton}
        </div>
        {(rangeError || error) && (
          <p className="text-sm text-danger md:basis-full" role="alert">
            {rangeError ?? error}
          </p>
        )}
      </div>
    );
  }

  // Mobile sheet layout — calm vertical stack.
  return (
    <div className="space-y-4" data-manual-form="stacked">
      <div>
        <label className="label" htmlFor="manual-description">
          Description
        </label>
        <input
          id="manual-description"
          ref={descRef}
          className="input"
          placeholder="What have you worked on?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          data-manual-description="true"
        />
      </div>
      <div>
        <label className="label" htmlFor="manual-project">
          Project
        </label>
        <select
          id="manual-project"
          className="input"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <span className="label">Billable</span>
        {billableChip}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="manual-start">
            Start
          </label>
          <input
            id="manual-start"
            type="time"
            className="input input-time tabular-nums"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            data-manual-start="true"
          />
        </div>
        <div>
          <label className="label" htmlFor="manual-end">
            End
          </label>
          <input
            id="manual-end"
            type="time"
            className="input input-time tabular-nums"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            data-manual-end="true"
          />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="manual-date">
          Date
        </label>
        <input
          id="manual-date"
          type="date"
          className="input tabular-nums"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          data-manual-date="true"
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="label mb-0">Duration</span>
        <span
          className="timer-digits text-timer-md text-ink"
          aria-live="polite"
          aria-label="Duration"
          data-manual-duration-readback="true"
        >
          {durationLabel}
        </span>
      </div>
      {(rangeError || error) && (
        <p className="text-sm text-danger" role="alert">
          {rangeError ?? error}
        </p>
      )}
      {addButton}
    </div>
  );
}
