"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  hoursFromSeconds,
  niceAxisTopCount,
  niceAxisTopHours,
  type DayBucket,
} from "@/lib/report";

export interface RangeBarChartProps {
  days: readonly DayBucket[];
  timezone: string;
  /** Hours treats `seconds` as a duration. Count treats it as an integer. */
  unit?: "hours" | "count";
  ariaLabel?: string;
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
// every 2 / 3 / 4 / 5 days so a desktop-width chart never crowds.
// Count axes are integers. A 0–1 scale with three evenly spaced ticks
// rounds 0.5 and 1 to the same label, so small ranges list each integer.
function countTicks(top: number): number[] {
  const peak = Math.max(1, Math.round(top));
  if (peak <= 4) return Array.from({ length: peak + 1 }, (_, i) => i);
  const ticks = new Set<number>();
  for (let i = 0; i <= 4; i += 1) ticks.add(Math.round((peak / 4) * i));
  return [...ticks].sort((a, b) => a - b);
}

function tickStride(count: number): number {
  if (count <= 10) return 1;
  if (count <= 16) return 2;
  if (count <= 24) return 3;
  if (count <= 40) return 5;
  return Math.ceil(count / 10);
}

// useLayoutEffect runs before paint, so the first-measure render lands
// in the same frame as the empty placeholder — no visual flash. On the
// server React has no DOM to lay out, so we fall back to useEffect to
// silence the "useLayoutEffect does nothing on the server" warning.
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function RangeBarChart({
  days,
  timezone: _timezone,
  unit = "hours",
  ariaLabel,
}: RangeBarChartProps): JSX.Element {
  // Keep the timezone prop in the signature so the Reports page can pass
  // the user's tz once; day keys arrive pre-zoned from `summarize`, so a
  // UTC-anchored formatter is correct here.
  void _timezone;
  const chartId = useId();
  const figureRef = useRef<HTMLElement | null>(null);
  // null = "not measured yet". We render a reserved-height placeholder
  // in that state so the first paint matches SSR (no hydration mismatch)
  // and the chart drops in without a layout jump once ResizeObserver
  // reports the real pixel width.
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);

  useIsoLayoutEffect(() => {
    const el = figureRef.current;
    if (!el) return;
    const initial = el.clientWidth;
    if (initial > 0) {
      setMeasuredWidth(initial);
    }
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.round(entry.contentRect.width);
        if (w > 0) {
          setMeasuredWidth((prev) => (prev === w ? prev : w));
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
  const axisTop = unit === "count" ? niceAxisTopCount(peakSeconds) : niceAxisTopHours(peakSeconds);
  const describeTotal = data.reduce((s, d) => s + d.seconds, 0);
  const describeHours = (describeTotal / 3600).toFixed(2);
  const describeCount = String(Math.round(describeTotal));
  const descId = `${chartId}-desc`;
  const figureLabel =
    ariaLabel ?? (unit === "count" ? "Count by day" : "Hours by day");

  // Pre-measure render: reserve the chart's height so the surrounding
  // card has the same box both before and after we know the width.
  // Nothing stretches because nothing is drawn yet.
  if (measuredWidth === null) {
    return (
      <figure
        ref={figureRef}
        className="w-full"
        aria-describedby={descId}
        style={{ minHeight: CHART_HEIGHT }}
      >
        <figcaption id={descId} className="sr-only">
          {unit === "count"
            ? `Bar chart of counts per day. Range total: ${describeCount}. Peak day: ${axisTop}.`
            : `Bar chart of hours per day over the selected range. Range total: ${describeHours} hours. Peak day: ${axisTop.toFixed(1)} hours maximum.`}
        </figcaption>
      </figure>
    );
  }

  // viewBox now matches the measured CSS pixel width exactly, so axis
  // text and bar corners render at their intended proportions regardless
  // of the parent card's size. Dropping preserveAspectRatio="none" is the
  // whole point of the fix (issue #100): with the viewBox 1:1 to the
  // CSS size, horizontal and vertical scales stay equal.
  const virtualWidth = measuredWidth;
  const plotLeft = AXIS_PAD_LEFT;
  const plotTop = AXIS_PAD_TOP;
  const plotRight = Math.max(plotLeft + 1, virtualWidth - AXIS_PAD_RIGHT);
  const plotBottom = CHART_HEIGHT - AXIS_PAD_BOTTOM;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;
  const slotCount = Math.max(data.length, 1);
  const slotWidth = plotWidth / slotCount;
  const barWidth = Math.max(
    MIN_BAR_WIDTH,
    Math.min(MAX_BAR_WIDTH, slotWidth - BAR_GAP),
  );
  // Fewer grid lines on short ranges so a 2h-top chart doesn't read as
  // a stack of ladder rungs.
  const gridLines = axisTop <= 2 ? 2 : 4;
  const gridValues =
    unit === "count"
      ? countTicks(axisTop)
      : Array.from({ length: gridLines + 1 }, (_, i) => (axisTop / gridLines) * i);
  const stride = tickStride(data.length);

  return (
    <figure
      ref={figureRef}
      className="w-full"
      aria-describedby={descId}
    >
      <figcaption id={descId} className="sr-only">
        {unit === "count"
          ? `Bar chart of counts per day. Range total: ${describeCount}. Peak day: ${axisTop}.`
          : `Bar chart of hours per day over the selected range. Range total: ${describeHours} hours. Peak day: ${axisTop.toFixed(1)} hours maximum.`}
      </figcaption>
      <svg
        role="img"
        aria-label={figureLabel}
        viewBox={`0 0 ${virtualWidth} ${CHART_HEIGHT}`}
        className="block w-full h-[220px] overflow-visible"
      >
        {/* Grid lines + y-axis hour labels. `stroke` + `fill` resolve to
            the Quiet Pulse border + muted tokens via the Tailwind class, so
            the chart stays readable in both light + dark. */}
        {gridValues.map((hours, i) => {
          const y = plotBottom - (hours / axisTop) * plotHeight;
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
                {unit === "count"
                  ? String(hours)
                  : `${hours.toFixed(hours >= 10 ? 0 : 1)}h`}
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
          const magnitude = unit === "count" ? d.seconds : d.hours;
          const height = (magnitude / axisTop) * plotHeight;
          const drawnHeight = d.seconds > 0 ? Math.max(2, height) : 1;
          const y = plotBottom - drawnHeight;
          const titleId = `${chartId}-bar-${i}`;
          return (
            <g key={d.key}>
              <title id={titleId}>
                {unit === "count"
                  ? `${d.label}: ${Math.round(d.seconds)}`
                  : `${d.label}: ${d.hours.toFixed(2)}h`}
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
