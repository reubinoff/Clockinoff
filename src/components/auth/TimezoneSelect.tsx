"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { listTimezones } from "@/lib/timezones";
import { IconChevronDown, IconSearch, IconX } from "@/components/icons";

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
};

export function TimezoneSelect({
  id,
  label,
  value,
  onChange,
  required,
}: Props): JSX.Element {
  const zones = useMemo(() => listTimezones(), []);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return zones;
    return zones.filter((z) => z.toLowerCase().includes(q));
  }, [zones, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent): void {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchRef.current?.focus());
    } else {
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLLIElement>(
      `[data-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function pick(v: string): void {
    onChange(v);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const v = filtered[activeIndex];
      if (v) pick(v);
    }
  }

  const listboxId = `${id}-listbox`;

  return (
    <div className="space-y-1" ref={containerRef}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((v) => !v)}
        className="input flex items-center justify-between gap-2 text-left"
      >
        <span className="truncate">{value || "Select timezone"}</span>
        <IconChevronDown size={16} className="text-muted shrink-0" />
      </button>
      {required ? (
        <input type="hidden" name={id} value={value} required />
      ) : null}

      {open ? (
        <div className="relative">
          <div className="absolute z-30 mt-1 w-full rounded-xl border border-border bg-surface shadow-card-lg overflow-hidden">
            <div className="p-2 border-b border-border">
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-muted">
                  <IconSearch size={16} />
                </span>
                <input
                  ref={searchRef}
                  type="text"
                  role="combobox"
                  aria-controls={listboxId}
                  aria-expanded={open}
                  aria-activedescendant={
                    filtered[activeIndex] ? `${id}-opt-${activeIndex}` : undefined
                  }
                  className="input pl-8 pr-8"
                  placeholder="Search timezones…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className="absolute inset-y-0 right-0 flex items-center pr-2 text-muted hover:text-ink"
                  >
                    <IconX size={14} />
                  </button>
                ) : null}
              </div>
            </div>
            <ul
              ref={listRef}
              role="listbox"
              id={listboxId}
              className="max-h-64 overflow-y-auto py-1"
            >
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted">No matches</li>
              ) : (
                filtered.map((z, i) => {
                  const selected = z === value;
                  const active = i === activeIndex;
                  return (
                    <li
                      key={z}
                      data-index={i}
                      id={`${id}-opt-${i}`}
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setActiveIndex(i)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pick(z);
                      }}
                      className={
                        "px-3 py-2 text-sm cursor-pointer flex items-center justify-between " +
                        (active
                          ? "bg-accent-soft text-ink"
                          : selected
                            ? "bg-canvas-2 text-ink"
                            : "text-ink hover:bg-canvas-2")
                      }
                    >
                      <span className="truncate">{z}</span>
                      {selected ? (
                        <span className="text-xs text-accent">selected</span>
                      ) : null}
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
