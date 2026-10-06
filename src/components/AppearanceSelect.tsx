"use client";

import { useEffect, useId, useState } from "react";
import {
  APPEARANCE_STORAGE_KEY,
  APPEARANCES,
  type Appearance,
  applyTheme,
  commitAppearance,
  readAppearance,
  resolveTheme,
  subscribeAppearance,
} from "@/lib/appearance";

/**
 * V2-10 Dark #10 — Appearance control.
 *
 * Rendered twice per page (desktop cluster + mobile overflow) and both
 * instances read/write the same locked `localStorage['timely.appearance']`
 * key. `variant="menu"` renders a full-width menu row (used inside the
 * mobile HeaderUserMenu popover); `variant="inline"` renders a compact
 * label + select pair for the desktop account cluster.
 */
export default function AppearanceSelect({
  variant = "inline",
}: {
  variant?: "inline" | "menu";
}): JSX.Element {
  const [value, setValue] = useState<Appearance>("system");
  const [ready, setReady] = useState(false);
  const selectId = useId();
  const helperId = useId();

  useEffect(() => {
    // Hydrate from the stored pref on mount so SSR markup (which cannot
    // read localStorage) still matches. Re-apply the theme here too: React
    // hydration can drop the boot-script `data-theme` before this effect,
    // which left the select on Dark while the timer stayed on the light
    // tokens until a full reload (#140).
    const stored = readAppearance(window.localStorage);
    setValue(stored);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(document.documentElement, resolveTheme(stored, prefersDark));
    setReady(true);

    const off = subscribeAppearance((next) => {
      setValue(next);
    });
    const onStorage = (event: StorageEvent): void => {
      // `storage` fires in other tabs only. null key is a clear().
      if (event.key !== null && event.key !== APPEARANCE_STORAGE_KEY) return;
      const next = readAppearance(window.localStorage);
      setValue(next);
      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      applyTheme(document.documentElement, resolveTheme(next, dark));
    };
    window.addEventListener("storage", onStorage);
    return () => {
      off();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (): void => {
      // Only respond to OS changes while the user is on System — an
      // explicit light/dark pref must not be overridden by the OS.
      if (readAppearance(window.localStorage) !== "system") return;
      applyTheme(document.documentElement, resolveTheme("system", mql.matches));
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  function onSelect(next: Appearance): void {
    setValue(next);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    commitAppearance(
      window.localStorage,
      document.documentElement,
      next,
      prefersDark,
    );
  }

  const label = (
    <label
      htmlFor={selectId}
      className={
        variant === "menu"
          ? "block text-xs text-muted px-2 pt-1"
          : "text-muted text-xs"
      }
    >
      Appearance
    </label>
  );

  const select = (
    <select
      id={selectId}
      value={value}
      onChange={(e) => onSelect(e.target.value as Appearance)}
      aria-describedby={value === "system" ? helperId : undefined}
      disabled={!ready}
      className={
        variant === "menu"
          ? "w-full min-h-[44px] rounded-lg border border-border bg-surface px-2 text-body-sm text-ink " +
            "focus:outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-ring"
          : "min-h-[32px] rounded-lg border border-border bg-surface px-2 text-body-sm text-ink " +
            "focus:outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-ring"
      }
    >
      {APPEARANCES.map((opt) => (
        <option key={opt} value={opt}>
          {LABELS[opt]}
        </option>
      ))}
    </select>
  );

  if (variant === "menu") {
    return (
      <div className="px-1 py-1" role="none">
        {label}
        <div className="px-2 pt-1 pb-1">{select}</div>
        {value === "system" ? (
          <p
            id={helperId}
            className="px-2 pb-1 text-xs text-muted"
          >
            Matches your device.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2">
      {label}
      {select}
      {value === "system" ? (
        <span id={helperId} className="sr-only">
          Matches your device.
        </span>
      ) : null}
    </div>
  );
}

const LABELS: Record<Appearance, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};
