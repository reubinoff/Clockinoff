"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconChevronDown } from "@/components/icons";
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
 * label + control pair for the desktop account cluster.
 *
 * The choices are an in-page listbox, not a native `<select>`. The account
 * menu closes on an outside mousedown, and a native popup is outside that
 * menu, so picking Dark/Light there was a race (the menu unmounted the
 * control before `change` fired). Options in the DOM keep a stable
 * button + listbox + option name for keyboard and automation.
 */
export default function AppearanceSelect({
  variant = "inline",
}: {
  variant?: "inline" | "menu";
}): JSX.Element {
  const [value, setValue] = useState<Appearance>("system");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<Appearance>("system");
  const pickedRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef(new Map<Appearance, HTMLDivElement>());
  const highlightRef = useRef<Appearance>("system");
  const labelId = useId();
  const listId = useId();
  const helperId = useId();

  useEffect(() => {
    // Hydrate from the stored pref on mount so SSR markup (which cannot
    // read localStorage) still matches. Re-apply the theme here too: React
    // hydration can drop the boot-script `data-theme` before this effect,
    // which left the control on Dark while the timer stayed on the light
    // tokens until a full reload (#140). A choice made before this effect
    // runs must not be overwritten by the stored value.
    const stored = readAppearance(window.localStorage);
    if (!pickedRef.current) {
      setValue(stored);
      setHighlight(stored);
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      applyTheme(document.documentElement, resolveTheme(stored, prefersDark));
    }

    const off = subscribeAppearance((next) => {
      setValue(next);
      setHighlight(next);
    });
    const onStorage = (event: StorageEvent): void => {
      // `storage` fires in other tabs only. null key is a clear().
      if (event.key !== null && event.key !== APPEARANCE_STORAGE_KEY) return;
      const next = readAppearance(window.localStorage);
      setValue(next);
      setHighlight(next);
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

  useEffect(() => {
    if (!open) return;
    optionRefs.current.get(highlightRef.current)?.focus();
    function onPointer(event: MouseEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    // Capture so Escape closes this list before the account menu's
    // document listener treats it as "close the whole menu".
    function onKey(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  function onSelect(next: Appearance): void {
    pickedRef.current = true;
    setValue(next);
    setHighlight(next);
    setOpen(false);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    commitAppearance(
      window.localStorage,
      document.documentElement,
      next,
      prefersDark,
    );
    buttonRef.current?.focus();
  }

  function openList(): void {
    highlightRef.current = value;
    setHighlight(value);
    setOpen(true);
  }

  function moveHighlight(from: Appearance, delta: number): void {
    const index = APPEARANCES.indexOf(from);
    const next = APPEARANCES[(index + delta + APPEARANCES.length) % APPEARANCES.length];
    setHighlight(next);
    optionRefs.current.get(next)?.focus();
  }

  function onTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openList();
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  }

  function onOptionKeyDown(
    event: React.KeyboardEvent<HTMLDivElement>,
    opt: Appearance,
  ): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(opt, event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setHighlight(APPEARANCES[0]);
      optionRefs.current.get(APPEARANCES[0])?.focus();
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      const last = APPEARANCES[APPEARANCES.length - 1];
      setHighlight(last);
      optionRefs.current.get(last)?.focus();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(opt);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    }
  }

  const label = (
    <span
      id={labelId}
      className={
        variant === "menu"
          ? "block text-xs text-muted px-2 pt-1"
          : "text-muted text-xs"
      }
    >
      Appearance
    </span>
  );

  const trigger = (
    <button
      ref={buttonRef}
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      aria-labelledby={labelId}
      aria-describedby={value === "system" ? helperId : undefined}
      data-appearance-value={value}
      onClick={() => {
        if (open) setOpen(false);
        else openList();
      }}
      onKeyDown={onTriggerKeyDown}
      className={
        variant === "menu"
          ? "flex w-full min-h-[44px] items-center justify-between rounded-lg border border-border bg-surface px-2 text-body-sm text-ink " +
            "focus:outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-ring"
          : "inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-border bg-surface px-2 text-body-sm text-ink " +
            "focus:outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-ring"
      }
    >
      <span>{LABELS[value]}</span>
      <IconChevronDown
        size={14}
        aria-hidden
        className={"shrink-0 transition-transform" + (open ? " rotate-180" : "")}
      />
    </button>
  );

  const list = open ? (
    <div
      id={listId}
      role="listbox"
      aria-labelledby={labelId}
      className={
        "rounded-lg border border-border bg-surface p-1 shadow-card-lg " +
        (variant === "menu"
          ? "mt-1"
          : "absolute right-0 top-full z-30 mt-1 min-w-[9.5rem]")
      }
    >
      {APPEARANCES.map((opt) => {
        const selected = value === opt;
        return (
          <div
            key={opt}
            role="option"
            aria-selected={selected}
            tabIndex={highlight === opt ? 0 : -1}
            ref={(node) => {
              if (node) optionRefs.current.set(opt, node);
              else optionRefs.current.delete(opt);
            }}
            onClick={() => onSelect(opt)}
            onKeyDown={(event) => onOptionKeyDown(event, opt)}
            className={
              "flex min-h-[36px] cursor-pointer items-center rounded-md px-2 text-body-sm text-ink " +
              "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-ring " +
              (selected ? "bg-accent-soft" : "hover:bg-canvas-2")
            }
          >
            {LABELS[opt]}
          </div>
        );
      })}
    </div>
  ) : null;

  const helper =
    value === "system" ? (
      <span
        id={helperId}
        className={
          variant === "menu" ? "block px-2 pt-1 text-xs text-muted" : "sr-only"
        }
      >
        Matches your device.
      </span>
    ) : null;

  if (variant === "menu") {
    return (
      <div ref={rootRef} className="px-1 py-1" data-appearance-control="menu">
        {label}
        <div className="px-2 pt-1">{trigger}</div>
        <div className="px-2">{list}</div>
        {helper}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="relative inline-flex items-center gap-2"
      data-appearance-control="inline"
    >
      {label}
      {trigger}
      {helper}
      {list}
    </div>
  );
}

const LABELS: Record<Appearance, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};
