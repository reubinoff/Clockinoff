"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ManualEntryForm from "@/components/ManualEntryForm";
import { IconX } from "@/components/icons";

// Phone tab bar is min-h-14 (3.5rem) plus a 1px top border and the home
// indicator. The sheet sits above that stack so Add is on screen without
// a scroll; md+ has no tab bar.
const SHEET_ABOVE_TAB =
  "max-md:mb-[calc(3.5rem+1px+env(safe-area-inset-bottom))] " +
  "max-md:max-h-[calc(100dvh-3.5rem-1px-env(safe-area-inset-bottom))]";

interface Project {
  id: string;
  name: string;
  archivedAt?: string | null;
}

interface Props {
  projects: Project[];
  timezone: string;
  onClose: () => void;
}

// V2-9 motion: mirrors EditEntrySheet — fade/scale on desktop, slide-up on
// mobile, both bounded by the shared motion tokens. Dismiss discards any
// unsaved input because the form state lives inside ManualEntryForm and is
// torn down with the sheet on close.
export default function ManualEntrySheet({
  projects,
  timezone,
  onClose,
}: Props): JSX.Element {
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

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

  // Portaled to body so z-50 is the viewport stacking context. Inside the
  // timer dock the sheet is trapped under the sticky chrome (z-20); the
  // tab bar (z-40) then paints over the bottom of the card, and the title
  // composites with the dock surface instead of an opaque sheet header.
  const sheet = (
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
      aria-labelledby="manual-entry-title"
      data-manual-entry-sheet="true"
    >
      <div
        className={
          "flex w-full md:max-w-md flex-col bg-surface md:rounded-2xl rounded-t-2xl shadow-card-lg " +
          "md:max-h-[92dvh] overflow-hidden " +
          SHEET_ABOVE_TAB +
          " " +
          (closing ? "sheet-panel-exit" : "sheet-panel-enter")
        }
      >
        <div
          className="flex shrink-0 items-center justify-between bg-surface px-5 pt-5 pb-3 border-b border-border rounded-t-2xl"
          data-manual-entry-header="true"
        >
          <h2 id="manual-entry-title" className="text-title-sm text-ink">
            Add manual entry
          </h2>
          <button
            type="button"
            onClick={requestClose}
            className="btn btn-ghost !min-h-[44px] !min-w-[44px] !px-2"
            aria-label="Close"
          >
            <IconX size={18} aria-hidden />
          </button>
        </div>
        <div
          className="overflow-y-auto overflow-x-hidden px-5 py-4"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <ManualEntryForm
            projects={projects}
            timezone={timezone}
            layout="stacked"
            autoFocusDescription
            onCreated={requestClose}
          />
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
