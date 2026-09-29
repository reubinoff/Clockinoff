"use client";

import { useEffect, useRef, useState } from "react";
import { onToast, type ToastEvent } from "@/lib/events";

// V2-6 Quiet Pulse: single small toast surface for the whole app. Copy is
// locked to "Logged" / "Saved" / "Discarded" — Toaster only renders what the
// event bus emits, it does not pick copy or fire on its own.
//
// V2-6b Saved-toast fix (Shaul lock): the module bus carries a stable id per
// emit and buffers recent events, so a Toaster that remounts inside the same
// interaction (e.g. sheet close + router.refresh() after an edit) receives
// the emit again on subscribe. We dedupe by id here so real-time delivery
// and replay-on-mount never render the same toast twice, and we track ids
// already rendered so a late replay of an already-dismissed toast doesn't
// pop back onto the screen.
export default function Toaster(): JSX.Element {
  const [toasts, setToasts] = useState<ToastEvent[]>([]);
  const seenRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    return onToast((evt) => {
      if (seenRef.current.has(evt.id)) return;
      seenRef.current.add(evt.id);
      setToasts((cur) => [...cur, evt]);
      // Auto-dismiss after ~2.4s. Under prefers-reduced-motion the CSS zeroes
      // enter/exit transitions but the toast still fades out on this timer.
      setTimeout(() => {
        setToasts((cur) => cur.filter((t) => t.id !== evt.id));
      }, 2400);
    });
  }, []);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed z-40 inset-x-0 flex flex-col items-center gap-2
                 top-[calc(env(safe-area-inset-top)+1rem)]
                 md:top-auto md:bottom-6 md:inset-x-auto md:right-6 md:items-end"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="toast pointer-events-auto rounded-full border border-border bg-surface
                     px-4 py-2 text-body-sm text-ink shadow-card"
        >
          {t.kind}
        </div>
      ))}
    </div>
  );
}
