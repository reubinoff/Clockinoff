import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement> & { size?: number | string; title?: string };

// V2-10 Dark #10: fills reference the tokenized accent/accent-fg via CSS
// variables so the mark picks up dark's `#7c3aed` automatically. The white
// glyph stays white because `--color-accent-fg` is `#ffffff` in both themes.
//
// #63 optical centering: the squircle, the ring and the play triangle all
// share one center (32, 32). The triangle base sits at x=26.83 and its tip at
// x=42.33, which puts the triangle's centroid exactly on the squircle center
// instead of letting the right-leaning tip visually pull the mark to the
// right. Same geometry is mirrored in app/icon.svg, app/apple-icon.svg and
// app/opengraph-image.tsx so every rendering of the mark stays identical.
export function Mark({ size = 40, title = "Clockinoff", ...rest }: Props): JSX.Element {
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
      <rect width="64" height="64" rx="15" fill="var(--color-accent)" />
      <circle
        cx="32"
        cy="32"
        r="18"
        fill="none"
        stroke="var(--color-accent-fg)"
        strokeWidth="3"
      />
      <path
        d="M26.83 23.5 L42.33 32 L26.83 40.5 Z"
        fill="var(--color-accent-fg)"
        stroke="var(--color-accent-fg)"
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
      <Mark size={markSize} title="Clockinoff" />
      <span
        style={{
          fontWeight: 600,
          letterSpacing: "-0.01em",
          fontSize: Math.round(Number(markSize) * 0.75),
          color: "var(--color-ink)",
          lineHeight: 1,
        }}
      >
        Clockinoff
      </span>
    </span>
  );
}
