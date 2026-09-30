import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement> & { title?: string };

// V2-10 Dark #10: empty-state spots use tokenized fills/strokes so the same
// SVG renders correctly on both light canvas and dark canvas — no separate
// dark asset. `accent-soft`, `accent`, and `surface` all flip with the
// theme via CSS variables (see globals.css).
export function SpotEmptyTimer({ title = "Ready to start", ...rest }: Props): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 160 120"
      role="img"
      aria-label={title}
      {...rest}
    >
      <title>{title}</title>
      <ellipse cx="80" cy="98" rx="58" ry="10" fill="var(--color-accent-soft)" opacity="0.7" />
      <circle cx="80" cy="56" r="42" fill="var(--color-accent-soft)" />
      <circle cx="80" cy="56" r="30" fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth="3" />
      <path d="M80 56 V38" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" />
      <path d="M80 56 L94 62" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" />
      <path d="M76 24h8" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function SpotEmptyList({ title = "No entries yet", ...rest }: Props): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 160 120"
      role="img"
      aria-label={title}
      {...rest}
    >
      <title>{title}</title>
      <ellipse cx="80" cy="102" rx="58" ry="8" fill="var(--color-accent-soft)" opacity="0.6" />
      <rect x="34" y="30" width="92" height="66" rx="10" fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth="2.5" />
      <path d="M46 48h68" stroke="var(--color-accent-soft)" strokeWidth="6" strokeLinecap="round" />
      <path d="M46 66h50" stroke="var(--color-accent-soft)" strokeWidth="6" strokeLinecap="round" />
      <path d="M46 84h34" stroke="var(--color-accent-soft)" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

export function SpotExport({ title = "Export", ...rest }: Props): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 160 120"
      role="img"
      aria-label={title}
      {...rest}
    >
      <title>{title}</title>
      <ellipse cx="80" cy="102" rx="58" ry="8" fill="var(--color-accent-soft)" opacity="0.6" />
      <rect x="46" y="24" width="68" height="70" rx="8" fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth="2.5" />
      <path d="M60 44h40M60 58h40M60 72h24" stroke="var(--color-accent-soft)" strokeWidth="4" strokeLinecap="round" />
      <path d="M80 82v18" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" />
      <path d="M72 94l8 8 8-8" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}
