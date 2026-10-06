/**
 * Quiet Pulse Dark #10 — appearance resolver.
 *
 * The tokens for `light` vs `dark` live entirely in `globals.css` as CSS
 * variables scoped to `html[data-theme="light"]` / `html[data-theme="dark"]`.
 * This module owns the *pref* layer above that: the enum stored in
 * `localStorage`, the media-query fallback, and the DOM signal that flips
 * every token in one shot.
 *
 * Framework-free on purpose so it can be reused from the boot script (which
 * runs before React hydrates) and from unit tests.
 */

export const APPEARANCE_STORAGE_KEY = "timely.appearance";

export const APPEARANCES = ["system", "light", "dark"] as const;
export type Appearance = (typeof APPEARANCES)[number];

export type Theme = "light" | "dark";

export const DEFAULT_APPEARANCE: Appearance = "system";

export function isAppearance(value: unknown): value is Appearance {
  return (
    typeof value === "string" &&
    (APPEARANCES as readonly string[]).includes(value)
  );
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Read the stored appearance. Anything not in the locked enum is treated as
 * `system` — we never inject the raw stored string back onto the DOM.
 */
export function readAppearance(storage: StorageLike | null | undefined): Appearance {
  if (!storage) return DEFAULT_APPEARANCE;
  let raw: string | null = null;
  try {
    raw = storage.getItem(APPEARANCE_STORAGE_KEY);
  } catch {
    return DEFAULT_APPEARANCE;
  }
  return isAppearance(raw) ? raw : DEFAULT_APPEARANCE;
}

export function writeAppearance(
  storage: StorageLike | null | undefined,
  value: Appearance,
): void {
  if (!storage) return;
  try {
    if (value === DEFAULT_APPEARANCE) {
      storage.removeItem(APPEARANCE_STORAGE_KEY);
    } else {
      storage.setItem(APPEARANCE_STORAGE_KEY, value);
    }
  } catch {
    /* storage may be blocked (Safari private mode); pref is best-effort */
  }
}

export function resolveTheme(
  appearance: Appearance,
  prefersDark: boolean,
): Theme {
  if (appearance === "dark") return "dark";
  if (appearance === "light") return "light";
  return prefersDark ? "dark" : "light";
}

interface ThemeTarget {
  getAttribute?(name: string): string | null;
  setAttribute(name: string, value: string): void;
  style: { colorScheme: string };
}

/**
 * Set the single root signal (`data-theme` + `color-scheme`) that flips the
 * whole token palette. Called from the pre-paint boot script *and* from the
 * Appearance select on change.
 */
export function applyTheme(root: ThemeTarget | null | undefined, theme: Theme): void {
  if (!root) return;
  // Skip the write when the signal is already correct. A same-value
  // setAttribute still notifies observers and would loop a theme watcher.
  if (root.getAttribute?.("data-theme") !== theme) {
    root.setAttribute("data-theme", theme);
  }
  if (root.style.colorScheme !== theme) {
    root.style.colorScheme = theme;
  }
}

type AppearanceListener = (value: Appearance) => void;
const appearanceListeners = new Set<AppearanceListener>();

/**
 * Same-tab fan-out for the locked pref. `storage` events do not fire in the
 * document that wrote the key, so the desktop and menu selects would
 * otherwise keep independent React state (#140).
 */
export function subscribeAppearance(listener: AppearanceListener): () => void {
  appearanceListeners.add(listener);
  return () => {
    appearanceListeners.delete(listener);
  };
}

export function emitAppearance(value: Appearance): void {
  for (const listener of appearanceListeners) {
    try {
      listener(value);
    } catch {
      // One broken subscriber must not block the other select.
    }
  }
}

/**
 * Write the locked key, flip `data-theme`, and tell every mounted select.
 * Callers pass the OS preference so System resolves the same way as the
 * pre-paint boot script.
 */
export function commitAppearance(
  storage: StorageLike | null | undefined,
  root: ThemeTarget | null | undefined,
  value: Appearance,
  prefersDark: boolean,
): void {
  writeAppearance(storage, value);
  applyTheme(root, resolveTheme(value, prefersDark));
  emitAppearance(value);
}

export function _resetAppearanceListenersForTests(): void {
  appearanceListeners.clear();
}

/**
 * Inline pre-paint script that runs before React hydrates so the resolved
 * theme is on `<html>` before first paint (no flash). Kept as a static string
 * literal so `next/script` isn't required and no hydration is involved.
 *
 * The script is defensive: any exception falls back to `light`, and the
 * stored value is validated against the locked enum before it is applied.
 */
export function appearanceBootScript(): string {
  return `(function(){try{var k=${JSON.stringify(APPEARANCE_STORAGE_KEY)};var a="system";try{var s=window.localStorage.getItem(k);if(s==="light"||s==="dark"||s==="system"){a=s;}}catch(e){}var t;if(a==="dark"){t="dark";}else if(a==="light"){t="light";}else{t=(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light";}var h=document.documentElement;h.setAttribute("data-theme",t);h.style.colorScheme=t;}catch(e){try{document.documentElement.setAttribute("data-theme","light");document.documentElement.style.colorScheme="light";}catch(_){}}})();`;
}
