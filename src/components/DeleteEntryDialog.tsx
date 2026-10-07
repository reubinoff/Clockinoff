"use client";

import { useEffect, useRef } from "react";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import { formatDate, formatDurationHours, formatTime } from "@/lib/tz";

export interface DeleteEntryPreview {
  projectName: string | null;
  description: string;
  startAt: string;
  endAt: string | null;
  durationSeconds: number;
}

export function deleteEntryProjectLabel(name: string | null): string {
  const trimmed = name?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : "No project";
}

export function deleteEntryDescriptionLabel(description: string): string {
  const trimmed = description.trim();
  return trimmed.length > 0 ? trimmed : "No description";
}

// Same clock style as the entries list. A range that crosses midnight in
// the user's zone includes the dates so the preview is unambiguous
// without the day header that sits above the row.
export function deleteEntryTimeRange(
  startAt: string,
  endAt: string | null,
  timezone: string,
): string {
  const start = new Date(startAt);
  const startTime = formatTime(start, timezone);
  if (!endAt) return `${startTime}–…`;
  const end = new Date(endAt);
  const endTime = formatTime(end, timezone);
  if (formatDate(start, timezone) !== formatDate(end, timezone)) {
    return `${formatDate(start, timezone)} ${startTime}–${formatDate(end, timezone)} ${endTime}`;
  }
  return `${startTime}–${endTime}`;
}

export function deleteEntryDurationLabel(seconds: number): string {
  return `${formatDurationHours(seconds)}h`;
}

interface Props {
  entry: DeleteEntryPreview;
  timezone: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function DeleteEntryDialog({
  entry,
  timezone,
  onCancel,
  onConfirm,
}: Props): JSX.Element {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);
  const projectLabel = deleteEntryProjectLabel(entry.projectName);
  const descriptionLabel = deleteEntryDescriptionLabel(entry.description);
  const timeRange = deleteEntryTimeRange(entry.startAt, entry.endAt, timezone);
  const durationLabel = deleteEntryDurationLabel(entry.durationSeconds);

  useEffect(() => {
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent): void {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onCancelRef.current();
    }
    document.addEventListener("keydown", onKey);
    const unlock = lockBodyScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlock();
    };
  }, []);

  function onPanelKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key !== "Tab" || !panelRef.current) return;
    const nodes = [
      ...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled])"),
    ];
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="dialog-scrim fixed inset-0 z-50 flex items-center justify-center p-4 sheet-backdrop-enter"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-entry-title"
        className="w-full max-w-md rounded-2xl bg-surface shadow-card-lg sheet-panel-enter"
        onKeyDown={onPanelKeyDown}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4">
          <h2 id="delete-entry-title" className="text-title-sm text-ink">
            Delete this entry?
          </h2>
          <dl className="mt-4 space-y-3">
            <PreviewRow
              label="Project"
              value={projectLabel}
              muted={projectLabel === "No project"}
            />
            <PreviewRow
              label="Description"
              value={descriptionLabel}
              muted={descriptionLabel === "No description"}
              clamp
            />
            <PreviewRow label="Time" value={timeRange} />
            <PreviewRow label="Duration" value={durationLabel} />
          </dl>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button
            ref={cancelRef}
            type="button"
            className="btn"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button type="button" className="btn btn-danger-fill" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewRow({
  label,
  value,
  muted,
  clamp,
}: {
  label: string;
  value: string;
  muted?: boolean;
  clamp?: boolean;
}): JSX.Element {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-body-sm">
      <dt className="text-muted">{label}</dt>
      <dd
        className={
          (muted ? "text-muted " : "text-ink ") +
          (clamp ? "line-clamp-4 " : "") +
          "break-words"
        }
      >
        {value}
      </dd>
    </div>
  );
}
