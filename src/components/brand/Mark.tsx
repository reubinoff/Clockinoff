import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement> & { size?: number | string; title?: string };

export function Mark({ size = 40, title = "Timely", ...rest }: Props): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      {...rest}
    >
      <title>{title}</title>
      <rect width="64" height="64" rx="15" fill="#6d28d9" />
      <circle cx="32" cy="32" r="18" fill="none" stroke="#ffffff" strokeWidth="3" />
      <path
        d="M28.5 23.5 L44 32 L28.5 40.5 Z"
        fill="#ffffff"
        stroke="#ffffff"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({
  markSize = 28,
  className,
}: {
  markSize?: number;
  className?: string;
}): JSX.Element {
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <Mark size={markSize} title="Timely" />
      <span
        style={{
          fontWeight: 600,
          letterSpacing: "-0.01em",
          fontSize: Math.round(Number(markSize) * 0.75),
          color: "#111827",
          lineHeight: 1,
        }}
      >
        Timely
      </span>
    </span>
  );
}
