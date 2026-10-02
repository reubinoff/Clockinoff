"use client";

import { useId, useMemo } from "react";
import { donutArcs, type ProjectGroup } from "@/lib/report";

export interface ProjectDonutProps {
  projects: readonly ProjectGroup[];
  centerLabel: string;
  centerSublabel: string;
}

const SIZE = 220;
const CENTER = SIZE / 2;
const OUTER_RADIUS = SIZE / 2 - 6;
const INNER_RADIUS = OUTER_RADIUS - 36;

function polar(angleRad: number, radius: number): { x: number; y: number } {
  return {
    x: CENTER + Math.cos(angleRad) * radius,
    y: CENTER + Math.sin(angleRad) * radius,
  };
}

// Build the donut arc path as an outer arc + inner arc (reversed) using
// `A` commands. For a full-circle single segment we split it into two
// semicircles so the SVG `A` arc flag doesn't ambiguously degenerate.
function arcPath(startRad: number, endRad: number): string {
  const sweep = endRad - startRad;
  const nearlyFull = Math.abs(sweep - Math.PI * 2) < 1e-6;
  if (nearlyFull) {
    // Two 180° arcs — outer forward, inner backward.
    const topOuter = polar(startRad, OUTER_RADIUS);
    const bottomOuter = polar(startRad + Math.PI, OUTER_RADIUS);
    const bottomInner = polar(startRad + Math.PI, INNER_RADIUS);
    const topInner = polar(startRad, INNER_RADIUS);
    return [
      `M ${topOuter.x} ${topOuter.y}`,
      `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 1 1 ${bottomOuter.x} ${bottomOuter.y}`,
      `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 1 1 ${topOuter.x} ${topOuter.y}`,
      `M ${topInner.x} ${topInner.y}`,
      `A ${INNER_RADIUS} ${INNER_RADIUS} 0 1 0 ${bottomInner.x} ${bottomInner.y}`,
      `A ${INNER_RADIUS} ${INNER_RADIUS} 0 1 0 ${topInner.x} ${topInner.y}`,
      "Z",
    ].join(" ");
  }
  const largeArc = sweep > Math.PI ? 1 : 0;
  const startOuter = polar(startRad, OUTER_RADIUS);
  const endOuter = polar(endRad, OUTER_RADIUS);
  const endInner = polar(endRad, INNER_RADIUS);
  const startInner = polar(startRad, INNER_RADIUS);
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${largeArc} 0 ${startInner.x} ${startInner.y}`,
    "Z",
  ].join(" ");
}

export default function ProjectDonut({
  projects,
  centerLabel,
  centerSublabel,
}: ProjectDonutProps): JSX.Element {
  const chartId = useId();
  const arcs = useMemo(() => donutArcs(projects), [projects]);
  const descId = `${chartId}-desc`;

  return (
    <figure
      aria-describedby={descId}
      className="flex items-center justify-center w-full"
    >
      <figcaption id={descId} className="sr-only">
        Project breakdown donut. {centerSublabel} total: {centerLabel}.
        {" "}
        {projects.length} project{projects.length === 1 ? "" : "s"} in range.
      </figcaption>
      <svg
        role="img"
        aria-label="Project breakdown"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        className="block max-w-full h-auto"
      >
        {arcs.length === 0 ? (
          <circle
            cx={CENTER}
            cy={CENTER}
            r={(OUTER_RADIUS + INNER_RADIUS) / 2}
            fill="none"
            strokeWidth={OUTER_RADIUS - INNER_RADIUS}
            className="stroke-border"
          />
        ) : (
          arcs.map((a) => (
            <path
              key={a.key}
              d={arcPath(a.startRad, a.endRad)}
              fill={a.color}
            />
          ))
        )}
        <text
          x={CENTER}
          y={CENTER - 4}
          textAnchor="middle"
          className="fill-ink text-[22px] font-semibold tabular-nums"
        >
          {centerLabel}
        </text>
        <text
          x={CENTER}
          y={CENTER + 18}
          textAnchor="middle"
          className="fill-muted text-[11px]"
        >
          {centerSublabel}
        </text>
      </svg>
    </figure>
  );
}
