import type { CSSProperties } from "react";

/**
 * Quiet Pulse — the Clockinoff mascot (#60, v1).
 *
 * Security constraint (architect lock): Pulse SVGs are served ONLY as
 * static files under `/public/mascot/*` via plain `<img>` — never
 * inlined into the DOM with `dangerouslySetInnerHTML`. The optional
 * ring opacity pulse lives inside each SVG's own `<style>` block so
 * motion works when loaded via `<img>` and still turns off under
 * `prefers-reduced-motion: reduce` (handled inside the SVG itself).
 *
 * Where yes: empty entries list, 404, optional auth flourish.
 * Where no: nav, footer, toasts, entry cards, timer dock, favicon/mark
 * (see #62). Do not invert fills for dark mode.
 */

type PulseVariant = "empty" | "not-found" | "auth";

const SRC: Record<PulseVariant, string> = {
  empty: "/mascot/pulse-empty.svg",
  "not-found": "/mascot/pulse-404.svg",
  auth: "/mascot/pulse-auth.svg",
};

// Dana handoff sizes (README): empty 120–144px, 404 160–180px, auth 64–80px.
const SIZE: Record<PulseVariant, { width: number; height: number }> = {
  empty: { width: 132, height: 132 },
  "not-found": { width: 168, height: 168 },
  auth: { width: 72, height: 72 },
};

interface PulseProps {
  variant: PulseVariant;
  /**
   * Accessible alternative text. Pass an empty string when adjacent copy
   * already explains the state (decorative). Pass a sentence like
   * "Quiet Pulse character resting" when the mascot stands alone.
   */
  alt: string;
  className?: string;
  style?: CSSProperties;
}

export function Pulse({ variant, alt, className, style }: PulseProps): JSX.Element {
  const { width, height } = SIZE[variant];
  const decorative = alt === "";
  return (
    // Next's `no-img-element` nudges toward next/image. Pulse is a static,
    // known-size SVG that must not be optimized or inlined — serving it as
    // a plain <img> is intentional per the architect's security note.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SRC[variant]}
      alt={alt}
      width={width}
      height={height}
      aria-hidden={decorative ? true : undefined}
      role={decorative ? "presentation" : undefined}
      draggable={false}
      className={className}
      style={style}
      // React 19 preloads every SSR <img> (`rel=preload`). pulse-404 is
      // only painted on the not-found page; the preload still lands on
      // other responses and Chrome warns that it was unused (#141).
      // `fetchPriority="low"` is the opt-out in the React preload check.
      fetchPriority={variant === "not-found" ? "low" : undefined}
    />
  );
}

export default Pulse;
