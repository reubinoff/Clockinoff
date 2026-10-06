"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconBillable,
  IconCheck,
  IconChevronDown,
  IconMinus,
  IconPlus,
  IconX,
} from "@/components/icons";
import {
  clampHours,
  clampMinutes,
  combineHm,
  formatHm,
  splitHm,
  stepHours,
  stepMinutes,
} from "@/lib/duration";
import { formatDate, formatTime, zonedIsoToUtc } from "@/lib/tz";
import { handleAuthFailure, isAuthFailure } from "@/lib/auth-ui";

export interface EditableEntry {
  id: string;
  description: string;
  project_id: string | null;
  project_name: string | null;
  start_at: string;
  end_at: string | null;
  billable: boolean;
  billed: boolean;
  tag_ids: string[];
  running: boolean;
}

interface Option {
  id: string;
  name: string;
}

interface Props {
  entry: EditableEntry;
  projects: Option[];
  tags: Option[];
  timezone: string;
  onClose: () => void;
  onSaved: (updated: EditableEntry) => void;
}

function toLocalInput(d: Date, tz: string): string {
  return `${formatDate(d, tz)}T${formatTime(d, tz)}`;
}

function safeParseLocal(value: string, tz: string): Date | null {
  if (!value) return null;
  try {
    const d = zonedIsoToUtc(value, tz);
    if (isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const bs = new Set(b);
  for (const x of a) if (!bs.has(x)) return false;
  return true;
}

export default function EditEntrySheet({
  entry,
  projects,
  tags,
  timezone,
  onClose,
  onSaved,
}: Props): JSX.Element | null {
  const originalStart = useMemo(() => new Date(entry.start_at), [entry.start_at]);
  const originalEnd = useMemo(
    () => (entry.end_at ? new Date(entry.end_at) : null),
    [entry.end_at],
  );

  const [description, setDescription] = useState(entry.description);
  const [projectId, setProjectId] = useState<string>(entry.project_id ?? "");
  const [billable, setBillable] = useState(entry.billable);
  // Product-locked invariant: turning billable off must clear/hide Already
  // billed. When billable flips off the sheet snaps `billed` to false in
  // local state too, and the "Already billed" chip goes away entirely.
  const [billed, setBilled] = useState(entry.billable && entry.billed);
  const [tagIds, setTagIds] = useState<string[]>(entry.tag_ids);

  const [startAt, setStartAt] = useState<Date>(originalStart);
  const [endAt, setEndAt] = useState<Date>(
    originalEnd ?? new Date(originalStart.getTime() + 3600_000),
  );

  const initialDuration = useMemo(() => {
    const s = originalStart.getTime();
    const e = (originalEnd ?? originalStart).getTime();
    return Math.max(0, Math.floor((e - s) / 1000));
  }, [originalStart, originalEnd]);
  const [durationSeconds, setDurationSeconds] = useState<number>(initialDuration);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [closing, setClosing] = useState(false);

  const [startInput, setStartInput] = useState<string>(() =>
    toLocalInput(originalStart, timezone),
  );
  const [endInput, setEndInput] = useState<string>(() =>
    toLocalInput(originalEnd ?? new Date(originalStart.getTime() + 3600_000), timezone),
  );

  const descRef = useRef<HTMLInputElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    descRef.current?.focus();
    descRef.current?.select();
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

  // V2-9: play the reverse motion (faster than open) before unmounting.
  // Under prefers-reduced-motion: reduce we skip the timeout so the sheet
  // just closes; keyframes are neutered to `animation: none` in globals.css
  // so there is no mid-frame paint either way.
  const dismiss = useCallback(
    (after: () => void) => {
      if (closing) return;
      const reduceMotion =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) {
        after();
        return;
      }
      setClosing(true);
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        after();
      }, 180);
    },
    [closing],
  );

  const requestClose = useCallback(() => {
    dismiss(onClose);
  }, [dismiss, onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
      }
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [requestClose]);

  const applyDuration = useCallback(
    (nextSeconds: number) => {
      const next = Math.max(0, Math.floor(nextSeconds));
      setDurationSeconds(next);
      const newEnd = new Date(startAt.getTime() + next * 1000);
      setEndAt(newEnd);
      setEndInput(toLocalInput(newEnd, timezone));
      setRangeError(next <= 0 ? "End needs to be after start" : null);
    },
    [startAt, timezone],
  );

  const { hours: hh, minutes: mm } = splitHm(durationSeconds);

  const onHoursChange = (raw: string): void => {
    const n = clampHours(Number(raw));
    applyDuration(combineHm(n, mm));
  };
  const onMinutesChange = (raw: string): void => {
    const n = clampMinutes(Number(raw));
    applyDuration(combineHm(hh, n));
  };

  const bumpHours = (delta: number): void => {
    applyDuration(combineHm(stepHours(hh, delta), mm));
  };
  const bumpMinutes = (delta: number): void => {
    applyDuration(combineHm(hh, stepMinutes(mm, delta)));
  };

  const onStartInputChange = (v: string): void => {
    setStartInput(v);
    const parsed = safeParseLocal(v, timezone);
    if (!parsed) return;
    setStartAt(parsed);
    const nextDur = Math.floor((endAt.getTime() - parsed.getTime()) / 1000);
    setDurationSeconds(Math.max(0, nextDur));
    setRangeError(nextDur <= 0 ? "End needs to be after start" : null);
  };

  const onEndInputChange = (v: string): void => {
    setEndInput(v);
    const parsed = safeParseLocal(v, timezone);
    if (!parsed) return;
    setEndAt(parsed);
    const nextDur = Math.floor((parsed.getTime() - startAt.getTime()) / 1000);
    setDurationSeconds(Math.max(0, nextDur));
    setRangeError(nextDur <= 0 ? "End needs to be after start" : null);
  };

  const toggleTag = (id: string): void => {
    setTagIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const projectOptions = useMemo<Option[]>(() => {
    const list = [...projects];
    if (entry.project_id && !projects.some((p) => p.id === entry.project_id)) {
      list.unshift({
        id: entry.project_id,
        name: entry.project_name ?? "Current project",
      });
    }
    return list;
  }, [projects, entry.project_id, entry.project_name]);

  const hasChanges = useMemo(() => {
    if (description !== entry.description) return true;
    if ((projectId || null) !== (entry.project_id ?? null)) return true;
    if (billable !== entry.billable) return true;
    if (billed !== entry.billed) return true;
    if (!sameSet(tagIds, entry.tag_ids)) return true;
    if (startAt.getTime() !== originalStart.getTime()) return true;
    if (!originalEnd || endAt.getTime() !== originalEnd.getTime()) return true;
    return false;
  }, [
    description,
    projectId,
    billable,
    billed,
    tagIds,
    startAt,
    endAt,
    entry.description,
    entry.project_id,
    entry.billable,
    entry.billed,
    entry.tag_ids,
    originalStart,
    originalEnd,
  ]);

  const canSave = !pending && !rangeError && durationSeconds > 0 && hasChanges;

  async function save(): Promise<void> {
    if (!canSave) return;
    setPending(true);
    setApiError(null);
    try {
      const body: Record<string, unknown> = {};
      if (description !== entry.description) body.description = description;
      if ((projectId || null) !== (entry.project_id ?? null)) {
        body.project_id = projectId || null;
      }
      if (billable !== entry.billable) body.billable = billable;
      if (billed !== entry.billed) body.billed = billed;
      if (!sameSet(tagIds, entry.tag_ids)) body.tag_ids = tagIds;
      if (startAt.getTime() !== originalStart.getTime()) {
        body.start_at = startAt.toISOString();
      }
      if (!originalEnd || endAt.getTime() !== originalEnd.getTime()) {
        body.end_at = endAt.toISOString();
      }
      const res = await fetch(`/api/entries/${entry.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        if (isAuthFailure(res.status)) {
          // Ariel's rule (#54): never show a "Saved" chrome after an auth
          // failure. Bail out of the sheet before setting the saved flash
          // and send the user to re-auth; the list stays on the pre-save
          // snapshot because onSaved was never called.
          handleAuthFailure();
          return;
        }
        let message = "Something went wrong. Try again.";
        try {
          const data = (await res.json()) as {
            error?: { message?: string; code?: string };
          };
          if (data?.error?.message) message = data.error.message;
        } catch {
          /* ignore parse */
        }
        setApiError(message);
        return;
      }
      const updated = (await res.json()) as EditableEntry;
      setSavedFlash(true);
      window.setTimeout(() => {
        dismiss(() => onSaved(updated));
      }, 250);
    } catch {
      setApiError("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (entry.running) return null;

  return (
    <div
      className={
        "fixed inset-0 z-50 flex items-end md:items-center justify-center bg-ink/40 " +
        (closing ? "sheet-backdrop-exit" : "sheet-backdrop-enter")
      }
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-entry-title"
    >
      <div
        className={
          "w-full md:max-w-md bg-surface md:rounded-2xl rounded-t-2xl shadow-card-lg " +
          "max-h-[92dvh] overflow-y-auto overflow-x-hidden " +
          (closing ? "sheet-panel-exit" : "sheet-panel-enter")
        }
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
          <h2 id="edit-entry-title" className="text-title-sm text-ink">
            Edit entry
          </h2>
          <button
            type="button"
            onClick={requestClose}
            className="btn btn-ghost min-h-[44px]! min-w-[44px]! px-2!"
            aria-label="Close"
          >
            <IconX size={18} aria-hidden />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label htmlFor="edit-description" className="label">
              Description
            </label>
            <input
              id="edit-description"
              ref={descRef}
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What were you working on?"
              maxLength={2000}
            />
          </div>

          <div>
            <label htmlFor="edit-project" className="label">
              Project
            </label>
            <select
              id="edit-project"
              className="input"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">No project</option>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {tags.length > 0 && (
            <div>
              <span className="label">Tags</span>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => {
                  const on = tagIds.includes(t.id);
                  return (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => toggleTag(t.id)}
                      className={"chip" + (on ? " chip-on" : "")}
                      aria-pressed={on}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <span className="label">Billable</span>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                role="switch"
                aria-checked={billable}
                aria-label="Billable"
                onClick={() =>
                  setBillable((b) => {
                    const next = !b;
                    // Turning billable off must clear billed (Shaul lock).
                    if (!next) setBilled(false);
                    return next;
                  })
                }
                className={"chip self-start" + (billable ? " chip-on" : "")}
              >
                <IconBillable size={14} aria-hidden />
                <span>Billable</span>
              </button>
              <span className="text-xs text-muted">
                Counts toward client work.
              </span>
            </div>
            {billable && (
              <div className="mt-3 pl-1 border-l-2 border-border">
                <div className="pl-3 flex flex-col gap-1">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={billed}
                    aria-label="Already billed"
                    onClick={() => setBilled((v) => !v)}
                    className={"chip self-start" + (billed ? " chip-on" : "")}
                  >
                    <IconCheck size={14} aria-hidden />
                    <span>Already billed</span>
                  </button>
                  <span className="text-xs text-muted">
                    Mark this entry as invoiced or already paid.
                  </span>
                </div>
              </div>
            )}
          </div>

          <div>
            <span className="label">Duration</span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => bumpHours(-1)}
                  className="btn btn-sm min-h-[44px]! w-11! min-w-[44px]! px-0!"
                  aria-label="Decrease hours"
                >
                  <IconMinus size={14} aria-hidden />
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={999}
                  className="input min-h-[44px]! w-16 text-center tabular-nums"
                  value={hh}
                  onChange={(e) => onHoursChange(e.target.value)}
                  aria-label="Hours"
                />
                <button
                  type="button"
                  onClick={() => bumpHours(1)}
                  className="btn btn-sm min-h-[44px]! w-11! min-w-[44px]! px-0!"
                  aria-label="Increase hours"
                >
                  <IconPlus size={14} aria-hidden />
                </button>
              </div>
              <span className="text-muted text-sm">h</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => bumpMinutes(-5)}
                  className="btn btn-sm min-h-[44px]! w-11! min-w-[44px]! px-0!"
                  aria-label="Decrease minutes"
                >
                  <IconMinus size={14} aria-hidden />
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={59}
                  className="input min-h-[44px]! w-16 text-center tabular-nums"
                  value={mm}
                  onChange={(e) => onMinutesChange(e.target.value)}
                  aria-label="Minutes"
                />
                <button
                  type="button"
                  onClick={() => bumpMinutes(5)}
                  className="btn btn-sm min-h-[44px]! w-11! min-w-[44px]! px-0!"
                  aria-label="Increase minutes"
                >
                  <IconPlus size={14} aria-hidden />
                </button>
              </div>
              <span className="text-muted text-sm">m</span>
              <span
                className="ml-auto timer-digits text-timer-md text-ink"
                aria-live="polite"
              >
                {formatHm({ hours: hh, minutes: mm })}
              </span>
            </div>
          </div>

          <details
            open={advancedOpen}
            onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
            className="rounded-xl border border-border bg-canvas-2/50"
          >
            <summary className="flex items-center gap-2 cursor-pointer select-none px-3 py-2 text-sm text-ink">
              <IconChevronDown
                size={16}
                aria-hidden
                className={
                  "transition-transform " + (advancedOpen ? "rotate-180" : "")
                }
              />
              Adjust start &amp; end
              <span className="ml-auto text-xs text-muted">{timezone}</span>
            </summary>
            <div className="px-3 pb-3 pt-1 space-y-3">
              <div>
                <label htmlFor="edit-start" className="label">
                  Start
                </label>
                <input
                  id="edit-start"
                  type="datetime-local"
                  className="input"
                  value={startInput}
                  onChange={(e) => onStartInputChange(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="edit-end" className="label">
                  End
                </label>
                <input
                  id="edit-end"
                  type="datetime-local"
                  className="input"
                  value={endInput}
                  onChange={(e) => onEndInputChange(e.target.value)}
                />
              </div>
            </div>
          </details>

          {rangeError && (
            <p className="text-sm text-danger" role="alert">
              {rangeError}
            </p>
          )}
          {apiError && (
            <p className="text-sm text-danger" role="alert">
              {apiError}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-border">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={requestClose}
            disabled={pending}
          >
            Cancel
          </button>
          <div className="flex-1" />
          {savedFlash && (
            <span
              className="inline-flex items-center gap-1 text-sm text-accent"
              aria-live="polite"
            >
              <IconCheck size={16} aria-hidden />
              Saved
            </span>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={save}
            disabled={!canSave}
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
