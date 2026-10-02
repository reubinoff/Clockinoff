"use client";

import { useId, useMemo } from "react";
import {
  hoursFromSeconds,
  niceAxisTopHours,
  type DayBucket,
} from "@/lib/report";

export interface RangeBarChartProps {
  days: readonly DayBucket[];
  timezone: string;
}

const CHART_HEIGHT = 220;
const AXIS_PAD_LEFT = 44;
const AXIS_PAD_RIGHT = 8;
const AXIS_PAD_TOP = 16;
const AXIS_PAD_BOTTOM = 36;
const MIN_BAR_WIDTH = 6;
const MAX_BAR_WIDTH = 36;
const BAR_GAP = 4;

interface BarDatum {
  key: string;
  seconds: number;
  hours: number;
  label: string;
  short: string;
}

function monthDay(d: Date): { label: string; short: string } {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(d);
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(d);
  return { label, short };
}

function keyToUtc(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// Pick a tick cadence that keeps labels readable at any range length
// without overlapping. Weekly ranges show every day; monthly ranges thin to
// every 2 / 3 / 4 / 5 days so the ~900px chart never crowds.
function tickStride(count: number): number {
  if (count <= 10) return 1;
  if (count <= 16) return 2;
  if (count <= 24) return 3;
  if (count <= 40) return 5;
  return Math.ceil(count / 10);
}

export default function RangeBarChart({
  days,
  timezone: _timezone,
}: RangeBarChartProps): JSX.Element {
  // Keep the timezone prop in the signature so the Reports page can pass
  // the user's tz once; we currently only use it in labels for custom
  // ranges that span a month boundary, and the day keys arrive pre-zoned
  // from `summarize`, so a UTC-anchored formatter is correct here.
  void _timezone;
  const chartId = useId();
  const data = useMemo<BarDatum[]>(() => {
    return days.map((d) => {
      const parts = monthDay(keyToUtc(d.key));
      return {
        key: d.key,
        seconds: d.seconds,
        hours: hoursFromSeconds(d.seconds),
        label: parts.label,
        short: parts.short,
      };
    });
  }, [days]);

  const peakSeconds = data.reduce((m, d) => (d.seconds > m ? d.seconds : m), 0);
  const axisTopHours = niceAxisTopHours(peakSeconds);
  // Width is responsive via SVG viewBox + preserveAspectRatio="none". We
  // pick a virtual width that scales each bar to a reasonable slot — a
  // ~900 virtual width lands close to a 1-to-3 bar-to-gap ratio on both a
  // 400px mobile viewport and a desktop panel.
  const slotCount = Math.max(data.length, 1);
  const virtualWidth = Math.max(360, slotCount * 32 + AXIS_PAD_LEFT + AXIS_PAD_RIGHT);
  const plotLeft = AXIS_PAD_LEFT;
  const plotTop = AXIS_PAD_TOP;
  const plotRight = virtualWidth - AXIS_PAD_RIGHT;
  const plotBottom = CHART_HEIGHT - AXIS_PAD_BOTTOM;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;
  const slotWidth = plotWidth / slotCount;
  const barWidth = Math.max(
    MIN_BAR_WIDTH,
    Math.min(MAX_BAR_WIDTH, slotWidth - BAR_GAP),
  );
  // Fewer grid lines on short ranges so a 2h-top chart doesn't read as
  // a stack of ladder rungs.
  const gridLines = axisTopHours <= 2 ? 2 : 4;
  const gridValues = Array.from({ length: gridLines + 1 }, (_, i) => (axisTopHours / gridLines) * i);
  const stride = tickStride(data.length);

  const descId = `${chartId}-desc`;
  const describeTotal = data.reduce((s, d) => s + d.seconds, 0);
  const describeHours = (describeTotal / 3600).toFixed(2);

  return (
    <figure className="w-full" aria-describedby={descId}>
      <figcaption id={descId} className="sr-only">
        Bar chart of hours per day over the selected range. Range total:
        {" "}
        {describeHours} hours. Peak day: {axisTopHours.toFixed(1)} hours maximum.
      </figcaption>
      <svg
        role="img"
        aria-label="Hours by day"
        viewBox={`0 0 ${virtualWidth} ${CHART_HEIGHT}`}
        className="block w-full h-[220px] overflow-visible"
        preserveAspectRatio="none"
      >
        {/* Grid lines + y-axis hour labels. `stroke` + `fill` resolve to
            the Quiet Pulse border + muted tokens via the Tailwind class, so
            the chart stays readable in both light + dark. */}
        {gridValues.map((hours, i) => {
          const y = plotBottom - (hours / axisTopHours) * plotHeight;
          return (
            <g key={`grid-${i}`}>
              <line
                x1={plotLeft}
                x2={plotRight}
                y1={y}
                y2={y}
                className="stroke-border"
                strokeWidth={1}
                strokeDasharray={i === 0 ? "0" : "2 3"}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={plotLeft - 8}
                y={y + 3}
                textAnchor="end"
                className="fill-muted text-[10px] tabular-nums"
              >
                {hours.toFixed(hours >= 10 ? 0 : 1)}h
              </text>
            </g>
          );
        })}
        {/* Bars. A zero-second day still renders a 1px baseline tick so the
            series reads as "a day existed, with zero" rather than a visual
            gap — this is the Dana lock from the brief. */}
        {data.map((d, i) => {
          const slotX = plotLeft + i * slotWidth;
          const centerX = slotX + slotWidth / 2;
          const x = centerX - barWidth / 2;
          const height = (d.hours / axisTopHours) * plotHeight;
          const drawnHeight = d.seconds > 0 ? Math.max(2, height) : 1;
          const y = plotBottom - drawnHeight;
          const titleId = `${chartId}-bar-${i}`;
          return (
            <g key={d.key}>
              <title id={titleId}>
                {d.label}: {d.hours.toFixed(2)}h
              </title>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={drawnHeight}
                rx={2}
                className={
                  d.seconds > 0
                    ? "fill-accent"
                    : "fill-border"
                }
              />
            </g>
          );
        })}
        {/* X-axis labels. Thinned to `stride` so the longest range still
            lays out cleanly. The last label is always drawn so the chart
            reads as "range ends here". */}
        {data.map((d, i) => {
          if (i % stride !== 0 && i !== data.length - 1) return null;
          const slotX = plotLeft + i * slotWidth;
          const centerX = slotX + slotWidth / 2;
          return (
            <text
              key={`xlabel-${d.key}`}
              x={centerX}
              y={plotBottom + 18}
              textAnchor="middle"
              className="fill-muted text-[10px]"
            >
              {d.short}
            </text>
          );
        })}
        {/* Axis baseline on top of the bars so a zero day's 1px tick never
            swallows the baseline underneath. */}
        <line
          x1={plotLeft}
          x2={plotRight}
          y1={plotBottom}
          y2={plotBottom}
          className="stroke-border-strong"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </figure>
  );
}
