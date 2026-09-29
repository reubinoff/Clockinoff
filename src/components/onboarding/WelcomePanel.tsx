"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SpotEmptyTimer } from "@/components/illustrations";
import { IconCheck, IconX } from "@/components/icons";

/**
 * V2-8 Quiet Pulse — first-run hero.
 *
 * Architect lock (Shaul): show inline on `/app?welcome=1` only, and only
 * while the account has zero entries. This is the post-registration
 * moment, not a persistent empty-state.
 *
 * Both dismiss paths (X button, "I'll explore") strip `welcome` from the
 * URL, which is the single source of truth for visibility — no
 * localStorage, no cookies. If the same user later lands on `/app` (no
 * query) with zero entries, the hero stays out of their way.
 */
export default function WelcomePanel({
  hasEntries,
}: {
  hasEntries: boolean;
}): JSX.Element | null {
  const router = useRouter();
  const params = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const welcomeParam = params.get("welcome") === "1";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (welcomeParam) setDismissed(false);
  }, [welcomeParam]);

  const shouldShow = useMemo(() => {
    if (!mounted) return false;
    if (hasEntries) return false;
    if (dismissed) return false;
    return welcomeParam;
  }, [mounted, hasEntries, dismissed, welcomeParam]);

  function dismiss(): void {
    setDismissed(true);
    if (typeof window !== "undefined" && welcomeParam) {
      const url = new URL(window.location.href);
      url.searchParams.delete("welcome");
      router.replace(url.pathname + (url.search ? url.search : ""));
    }
  }

  function focusStart(): void {
    const el = document.querySelector<HTMLInputElement>(
      'input[data-timer-description="true"]',
    );
    if (el) {
      el.focus();
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  if (!shouldShow) return null;

  return (
    <section
      aria-labelledby="welcome-title"
      className="rounded-2xl border border-border bg-surface shadow-card-lg p-6 md:p-8"
    >
      <div className="flex flex-col md:flex-row md:items-center gap-6">
        <div className="shrink-0 mx-auto md:mx-0">
          <SpotEmptyTimer width={160} height={120} />
        </div>
        <div className="flex-1 space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <h2 id="welcome-title" className="text-display text-ink">
                Your timer is ready
              </h2>
              <p className="mt-1 text-body-sm text-muted">
                Describe what you&rsquo;re doing and hit Start. One timer at a
                time — keep it simple.
              </p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss welcome"
              className="btn btn-ghost btn-sm shrink-0"
            >
              <IconX size={16} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={focusStart}
              className="btn btn-primary"
            >
              Focus Start
            </button>
            <button type="button" onClick={dismiss} className="btn btn-ghost">
              I&rsquo;ll explore
            </button>
          </div>
          <ul className="pt-2 space-y-1.5 text-sm text-muted">
            <li className="flex items-center gap-2">
              <IconCheck size={16} className="text-accent" aria-hidden />
              Start your first timer
            </li>
            <li className="flex items-center gap-2">
              <IconCheck size={16} className="text-accent/40" aria-hidden />
              Add a project (optional)
            </li>
            <li className="flex items-center gap-2">
              <IconCheck size={16} className="text-accent/40" aria-hidden />
              Export a CSV when you&rsquo;re ready
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
