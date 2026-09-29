import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement> & { title?: string };

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
      <ellipse cx="80" cy="98" rx="58" ry="10" fill="#ede9fe" opacity="0.7" />
      <circle cx="80" cy="56" r="42" fill="#ede9fe" />
      <circle cx="80" cy="56" r="30" fill="#ffffff" stroke="#6d28d9" strokeWidth="3" />
      <path d="M80 56 V38" stroke="#6d28d9" strokeWidth="3" strokeLinecap="round" />
      <path d="M80 56 L94 62" stroke="#6d28d9" strokeWidth="3" strokeLinecap="round" />
      <path d="M76 24h8" stroke="#6d28d9" strokeWidth="3" strokeLinecap="round" />
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
      <ellipse cx="80" cy="102" rx="58" ry="8" fill="#ede9fe" opacity="0.6" />
      <rect x="34" y="30" width="92" height="66" rx="10" fill="#ffffff" stroke="#6d28d9" strokeWidth="2.5" />
      <path d="M46 48h68" stroke="#ede9fe" strokeWidth="6" strokeLinecap="round" />
      <path d="M46 66h50" stroke="#ede9fe" strokeWidth="6" strokeLinecap="round" />
      <path d="M46 84h34" stroke="#ede9fe" strokeWidth="6" strokeLinecap="round" />
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
      <ellipse cx="80" cy="102" rx="58" ry="8" fill="#ede9fe" opacity="0.6" />
      <rect x="46" y="24" width="68" height="70" rx="8" fill="#ffffff" stroke="#6d28d9" strokeWidth="2.5" />
      <path d="M60 44h40M60 58h40M60 72h24" stroke="#ede9fe" strokeWidth="4" strokeLinecap="round" />
      <path d="M80 82v18" stroke="#6d28d9" strokeWidth="3" strokeLinecap="round" />
      <path d="M72 94l8 8 8-8" stroke="#6d28d9" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}
