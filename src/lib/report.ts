// Quiet Pulse Summary (#56) — client-side aggregation of a flat entry list
// into the three readouts the Reports page needs: a total, a per-day bar
// series over the selected range (empty days = zero baseline, not gaps),
// and a Group-by-Project breakdown ready for both the left list and the
// matching donut.
//
// All pure. The Reports client fetches /api/entries for the range (same
// idea as #81 week/day totals) and feeds the typed `ReportEntry`s to the
// functions here. No DB / no network, so the whole module is unit-testable
// without touching Postgres.
//
// Scope lock: Summary v1 only (per the attached brief). No Detailed /
// Weekly / Shared / Team / Rounding / invoice. The donut and list share
// one grouping — Group by Project — with a stable "No project" bucket for
// entries that have no project attached.

import { formatDate } from "@/lib/tz";
import { projectColor } from "@/lib/project-color";

export interface ReportEntry {
  id: string;
  project_id: string | null;
  project_name: string | null;
  start_at: string;
  duration_seconds: number;
}

export interface DayBucket {
  key: string; // YYYY-MM-DD in the user's timezone
  seconds: number;
}

export interface ProjectGroup {
  key: string; // project_id, or "" when ungrouped
  name: string;
  color: string;
  seconds: number;
  share: number; // 0..1 of range total
  entries: number;
}

export interface ReportSummary {
  totalSeconds: number;
  days: DayBucket[];
  projects: ProjectGroup[];
}

const NO_PROJECT_KEY = "";
const NO_PROJECT_LABEL = "No project";
// Keep the ungrouped bucket a neutral muted swatch so it never looks like
// a first-class purple project; `project-color.ts` only hashes real keys.
const NO_PROJECT_COLOR = "#94a3b8";

export function enumerateDayKeys(from: string, to: string): string[] {
  // Inclusive both ends. `from`/`to` are expected to be YYYY-MM-DD day keys
  // in the user's timezone (what the range picker emits). We iterate using
  // UTC date math so DST transitions in the user's zone never miscount a
  // day (same trick #81 uses for ISO week keys).
  const start = parseDayKey(from);
  const end = parseDayKey(to);
  if (!start || !end || end < start) return [];
  const out: string[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(dayKey(cur));
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
  }
  return out;
}

function parseDayKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.slice(0, 10));
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return isNaN(date.getTime()) ? null : date;
}

function dayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function summarize(
  entries: readonly ReportEntry[],
  range: { from: string; to: string },
  timezone: string,
): ReportSummary {
  const dayKeys = enumerateDayKeys(range.from, range.to);
  const dayMap = new Map<string, DayBucket>();
  for (const key of dayKeys) {
    dayMap.set(key, { key, seconds: 0 });
  }
  const projectMap = new Map<string, ProjectGroup>();
  let totalSeconds = 0;
  for (const e of entries) {
    if (e.duration_seconds <= 0) continue;
    const startedAt = new Date(e.start_at);
    if (isNaN(startedAt.getTime())) continue;
    const key = formatDate(startedAt, timezone);
    // Entries whose start day falls outside the enumerated range are
    // ignored — the API might return a row that straddled a boundary;
    // the user asked for the window they picked, not a 24-hour tail.
    const bucket = dayMap.get(key);
    if (bucket) {
      bucket.seconds += e.duration_seconds;
    } else {
      continue;
    }
    totalSeconds += e.duration_seconds;
    const projectKey = e.project_id ?? NO_PROJECT_KEY;
    const name = e.project_name ?? NO_PROJECT_LABEL;
    const color =
      projectKey === NO_PROJECT_KEY
        ? NO_PROJECT_COLOR
        : projectColor(projectKey) ?? NO_PROJECT_COLOR;
    let g = projectMap.get(projectKey);
    if (!g) {
      g = {
        key: projectKey,
        name,
        color,
        seconds: 0,
        share: 0,
        entries: 0,
      };
      projectMap.set(projectKey, g);
    }
    g.seconds += e.duration_seconds;
    g.entries += 1;
  }
  const projects = Array.from(projectMap.values()).sort((a, b) => {
    if (b.seconds !== a.seconds) return b.seconds - a.seconds;
    return a.name.localeCompare(b.name);
  });
  for (const g of projects) {
    g.share = totalSeconds > 0 ? g.seconds / totalSeconds : 0;
  }
  return {
    totalSeconds,
    days: Array.from(dayMap.values()),
    projects,
  };
}

export function hoursFromSeconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return seconds / 3600;
}

// Chart helpers: the bar chart needs a stable y-axis top (nice round hours)
// so an empty-day baseline doesn't visually dominate when any single day
// is above zero. 1h minimum keeps the baseline readable at the start of a
// range when no entries exist yet.
// Integer axis for admin count charts (signups, active users). Same
// "never a zero-height scale" idea as the hours axis: an empty range
// still has a readable top of 1.
export function niceAxisTopCount(peak: number): number {
  const n = Number.isFinite(peak) && peak > 0 ? peak : 0;
  if (n <= 1) return 1;
  const steps = [2, 4, 5, 10, 20, 50, 100, 200, 500, 1000];
  for (const s of steps) {
    if (n <= s) return s;
  }
  return Math.ceil(n / 100) * 100;
}

export function niceAxisTopHours(peakSeconds: number): number {
  const peakHours = hoursFromSeconds(peakSeconds);
  if (peakHours <= 1) return 1;
  const steps = [1, 1.5, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24];
  for (const s of steps) {
    if (peakHours <= s) return s;
  }
  // > 24h/day shouldn't happen in a tracker but still round up cleanly.
  return Math.ceil(peakHours / 4) * 4;
}

// Donut uses a single-segment ring when there is exactly one project with
// time, so SVG arcs don't degenerate. Returns the cumulative start/end
// angles in radians starting at 12 o'clock, clockwise.
export interface DonutArc {
  key: string;
  color: string;
  startRad: number;
  endRad: number;
}

export function donutArcs(projects: readonly ProjectGroup[]): DonutArc[] {
  const nonZero = projects.filter((p) => p.seconds > 0);
  if (nonZero.length === 0) return [];
  const total = nonZero.reduce((s, p) => s + p.seconds, 0);
  const arcs: DonutArc[] = [];
  let cursor = -Math.PI / 2; // 12 o'clock
  for (const p of nonZero) {
    const sweep = (p.seconds / total) * Math.PI * 2;
    arcs.push({
      key: p.key,
      color: p.color,
      startRad: cursor,
      endRad: cursor + sweep,
    });
    cursor += sweep;
  }
  return arcs;
}

export const _internal = {
  NO_PROJECT_KEY,
  NO_PROJECT_LABEL,
  NO_PROJECT_COLOR,
};
