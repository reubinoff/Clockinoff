"use client";

import { useEffect, useState } from "react";
import { onToast, type ToastKind } from "@/lib/events";

interface Toast {
  id: number;
  kind: ToastKind;
}

// V2-6 Quiet Pulse: single small toast surface for the whole app. Copy is
// locked to "Logged" / "Saved" / "Discarded" — Toaster only renders what the
// event bus emits, it does not pick copy or fire on its own.
export default function Toaster(): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    return onToast((kind) => {
      const id = Date.now() + Math.random();
      setToasts((cur) => [...cur, { id, kind }]);
      // Auto-dismiss after ~2.4s. Under prefers-reduced-motion the CSS zeroes
      // enter/exit transitions but the toast still fades out on this timer.
      setTimeout(() => {
        setToasts((cur) => cur.filter((t) => t.id !== id));
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
