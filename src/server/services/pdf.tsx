import path from "node:path";
import React from "react";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToStream,
} from "@react-pdf/renderer";
import type { EntryView } from "./entries";
import { DEFAULT_TZ, formatDate, formatDurationHours, formatTime } from "@/lib/tz";

// ---------------------------------------------------------------------------
// Fonts: Noto Sans (Latin) as the primary family, Noto Sans Hebrew registered
// as a fallback family so descriptions like "סקיצה לדשבורד" render as real
// glyphs instead of Helvetica mojibake. Both families ship as static TTFs
// under `src/server/assets/fonts/` and are copied into the standalone build
// via `outputFileTracingIncludes` in `next.config.mjs`.
//
// `Font.register` is called at module load; @react-pdf caches registrations,
// so re-imports on subsequent requests are no-ops.
// ---------------------------------------------------------------------------
const FONT_FAMILY_LATIN = "Noto Sans";
const FONT_FAMILY_HEBREW = "Noto Sans Hebrew";
// react-pdf builds a font stack from array-valued `fontFamily` and falls back
// per-codepoint through the stack when the primary font has no glyph — so
// listing the Hebrew family after the Latin one covers Hebrew descriptions
// without switching families per Text element.
const FONT_STACK: [string, string] = [FONT_FAMILY_LATIN, FONT_FAMILY_HEBREW];

function fontPath(file: string): string {
  return path.join(process.cwd(), "src", "server", "assets", "fonts", file);
}

let fontsRegistered = false;
function ensureFontsRegistered(): void {
  if (fontsRegistered) return;
  Font.register({
    family: FONT_FAMILY_LATIN,
    fonts: [
      { src: fontPath("NotoSans-Regular.ttf") },
      { src: fontPath("NotoSans-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: FONT_FAMILY_HEBREW,
    fonts: [
      { src: fontPath("NotoSansHebrew-Regular.ttf") },
      { src: fontPath("NotoSansHebrew-Bold.ttf"), fontWeight: 700 },
    ],
  });
  // Hebrew glyphs are missing from Noto Sans (Latin); mark the Hebrew family
  // as fallback so react-pdf reaches for it whenever a code point is not
  // available in the primary family.
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

// ---------------------------------------------------------------------------
// Quiet Pulse light-theme tokens (print-first — the PDF is always light).
// Kept in one map so a future dark-print variant can swap this constant.
// ---------------------------------------------------------------------------
const T = {
  ink: "#0f172a",
  muted: "#64748b",
  border: "#e7e5e4",
  canvas: "#f7f6f3",
  mark: "#6d28d9",
  markRing: "#ede9fe",
  billed: { fg: "#15803d", bg: "#f0fdf4" },
  billable: { fg: "#334155", bg: "#efeee9" },
  notBillable: { fg: "#64748b", bg: "#f7f6f3" },
} as const;

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 44,
    fontSize: 10,
    fontFamily: FONT_STACK,
    color: T.ink,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  mark: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: T.mark,
    marginRight: 10,
  },
  h1: {
    fontSize: 18,
    fontWeight: 700,
    color: T.ink,
    letterSpacing: -0.2,
  },
  meta: {
    fontSize: 10,
    color: T.muted,
    marginBottom: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    borderBottomStyle: "solid",
  },
  dayHeader: {
    marginTop: 14,
    marginBottom: 2,
    backgroundColor: T.canvas,
    color: T.muted,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 4,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  entry: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    borderBottomStyle: "solid",
  },
  entryPrimary: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  desc: {
    flexGrow: 1,
    flexShrink: 1,
    fontSize: 11.5,
    fontWeight: 500,
    color: T.ink,
    paddingRight: 12,
  },
  hours: {
    fontSize: 11.5,
    fontWeight: 700,
    color: T.ink,
    minWidth: 48,
    textAlign: "right",
  },
  sub: {
    fontSize: 9.5,
    color: T.muted,
    lineHeight: 1.4,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  subText: {
    color: T.muted,
    fontSize: 9.5,
  },
  subSep: {
    color: "#cbd5e1",
    fontSize: 9.5,
    marginHorizontal: 4,
  },
  pill: {
    fontSize: 8.5,
    fontWeight: 700,
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
  totals: {
    marginTop: 22,
    paddingTop: 10,
    borderTopWidth: 1.5,
    borderTopColor: T.ink,
    borderTopStyle: "solid",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  totalsLabel: {
    fontSize: 10,
    color: T.muted,
  },
  totalsValue: {
    fontSize: 12,
    fontWeight: 700,
    color: T.ink,
    textAlign: "right",
  },
  empty: {
    marginTop: 120,
    textAlign: "center",
    color: T.muted,
    fontSize: 11,
  },
  footer: {
    position: "absolute",
    left: 44,
    right: 44,
    bottom: 24,
    fontSize: 8.5,
    color: "#94a3b8",
    textAlign: "center",
  },
});

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseIsoDate(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map((n) => Number(n));
  return { y, m, d };
}

// `d Mon yyyy` in a given zone, using the shared tz helpers so the meta line
// stays consistent with `formatDate` (used for grouping) instead of relying
// on `Intl.DateTimeFormat` and getting locale-specific punctuation.
function formatHumanDate(d: Date, tz: string): string {
  const iso = formatDate(d, tz);
  const { y, m, d: day } = parseIsoDate(iso);
  return `${day} ${MONTHS_SHORT[m - 1]} ${y}`;
}

function weekdayShortInZone(d: Date, tz: string): string {
  // Anchor a UTC midnight on the same date in the target zone so `getUTCDay`
  // reflects the local weekday (avoids day-of-week drift across TZ borders).
  const iso = formatDate(d, tz);
  const { y, m, d: day } = parseIsoDate(iso);
  const anchor = new Date(Date.UTC(y, m - 1, day));
  return WEEKDAYS_SHORT[anchor.getUTCDay()];
}

function formatDayHeader(dateIso: string, tz: string): string {
  const { y, m, d } = parseIsoDate(dateIso);
  const anchor = new Date(Date.UTC(y, m - 1, d));
  const wd = weekdayShortInZone(anchor, "UTC");
  return `${wd} ${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

// ---------------------------------------------------------------------------
// Range formatting: the API's `to` is exclusive end-of-day-in-zone, so we
// display the last inclusive day (`to - 1s`) to match user expectations —
// requesting `from=2026-09-01&to=2026-09-30` should read as
// `1 Sep 2026 – 30 Sep 2026`, not `1 Sep 2026 – 1 Oct 2026`.
// ---------------------------------------------------------------------------
function formatRange(from: Date, to: Date, tz: string): string {
  const fromLabel = formatHumanDate(from, tz);
  const toInclusive = new Date(to.getTime() - 1000);
  const toLabel = formatHumanDate(toInclusive, tz);
  if (fromLabel === toLabel) return fromLabel;
  return `${fromLabel} – ${toLabel}`;
}

interface BillablePill {
  label: "Billed" | "Billable" | "Not billable";
  variant: "billed" | "billable" | "off";
}

function billablePill(e: Pick<EntryView, "billable" | "billed">): BillablePill {
  if (e.billable && e.billed) return { label: "Billed", variant: "billed" };
  if (e.billable) return { label: "Billable", variant: "billable" };
  return { label: "Not billable", variant: "off" };
}

function pillStyle(variant: BillablePill["variant"]) {
  if (variant === "billed") {
    return { color: T.billed.fg, backgroundColor: T.billed.bg };
  }
  if (variant === "billable") {
    return { color: T.billable.fg, backgroundColor: T.billable.bg };
  }
  return { color: T.notBillable.fg, backgroundColor: T.notBillable.bg };
}

// Format the `rate · amount` fragment for the meta row.
// Never invents a currency symbol (brief §Font/i18n): plain decimals only.
// Emits nothing when neither field carries a value.
function formatRateAmount(entry: EntryView): string | null {
  const parts: string[] = [];
  if (entry.effective_rate != null) parts.push(`${entry.effective_rate.toFixed(2)}/h`);
  if (entry.amount != null) parts.push(entry.amount.toFixed(2));
  return parts.length ? parts.join(" · ") : null;
}

interface DayGroup {
  dateIso: string;
  header: string;
  entries: EntryView[];
}

function groupEntriesByDay(entries: readonly EntryView[], tz: string): DayGroup[] {
  const map = new Map<string, EntryView[]>();
  for (const e of entries) {
    const iso = formatDate(new Date(e.start_at), tz);
    const arr = map.get(iso);
    if (arr) arr.push(e);
    else map.set(iso, [e]);
  }
  // Sort day keys descending (newest first) — mirrors listEntries' default
  // order so the export reads in the same direction as the app list.
  const sortedKeys = Array.from(map.keys()).sort((a, b) => (a < b ? 1 : -1));
  return sortedKeys.map((iso) => ({
    dateIso: iso,
    header: formatDayHeader(iso, tz),
    entries: (map.get(iso) ?? []).slice().sort((a, b) => {
      // Newest first within a day. Falls back to id-desc if timestamps tie.
      const at = new Date(a.start_at).getTime();
      const bt = new Date(b.start_at).getTime();
      if (at !== bt) return bt - at;
      return a.id < b.id ? 1 : -1;
    }),
  }));
}

export interface ReportProps {
  entries: readonly EntryView[];
  from: Date;
  to: Date;
  timezone?: string;
  totalSeconds: number;
  totalAmount: number;
}

function EntryBlock({ entry, tz }: { entry: EntryView; tz: string }): React.ReactElement {
  const start = new Date(entry.start_at);
  const end = entry.end_at ? new Date(entry.end_at) : null;
  const timeRange = `${formatTime(start, tz)}–${end ? formatTime(end, tz) : ""}`;
  const description = entry.description.trim().length > 0 ? entry.description : "Untitled";
  const hours = `${formatDurationHours(entry.duration_seconds)}h`;

  const metaParts: React.ReactNode[] = [];
  const pushText = (text: string): void => {
    metaParts.push(<Text key={`t${metaParts.length}`} style={styles.subText}>{text}</Text>);
  };

  pushText(timeRange);
  if (entry.project_name) pushText(entry.project_name);
  if (entry.client_name) pushText(entry.client_name);
  if (entry.tag_names.length > 0) pushText(entry.tag_names.join(", "));

  const pill = billablePill(entry);
  metaParts.push(
    <Text key={`p${metaParts.length}`} style={[styles.pill, pillStyle(pill.variant)]}>
      {pill.label}
    </Text>,
  );

  const rateAmount = formatRateAmount(entry);
  if (rateAmount) pushText(rateAmount);

  // Interleave a subtle `·` separator between the meta chips. Rendered as
  // inline Text so it wraps with the fragments instead of forming its own
  // flex column.
  const meta: React.ReactNode[] = [];
  metaParts.forEach((node, idx) => {
    if (idx > 0) {
      meta.push(
        <Text key={`sep${idx}`} style={styles.subSep}>·</Text>,
      );
    }
    meta.push(node);
  });

  return (
    <View style={styles.entry} wrap={false}>
      <View style={styles.entryPrimary}>
        <Text style={styles.desc}>{description}</Text>
        <Text style={styles.hours}>{hours}</Text>
      </View>
      <View style={styles.sub}>{meta}</View>
    </View>
  );
}

export function Report(props: ReportProps): React.ReactElement {
  ensureFontsRegistered();
  const tz = props.timezone ?? DEFAULT_TZ;
  const empty = props.entries.length === 0;
  const rangeLabel = formatRange(props.from, props.to, tz);
  const entryCount = props.entries.length;
  const metaLine = empty
    ? `${rangeLabel} · ${tz}`
    : `${rangeLabel} · ${tz} · ${entryCount} ${entryCount === 1 ? "entry" : "entries"}`;
  const groups = empty ? [] : groupEntriesByDay(props.entries, tz);

  return (
    <Document>
      <Page size="A4" orientation="portrait" style={styles.page}>
        <View style={styles.brandRow} fixed>
          <View style={styles.mark} />
          <Text style={styles.h1}>Clockinoff — Entries</Text>
        </View>
        <Text style={styles.meta} fixed>{metaLine}</Text>

        {empty ? (
          <Text style={styles.empty}>No entries in this range.</Text>
        ) : (
          <>
            {groups.map((g) => (
              <View key={g.dateIso}>
                <Text style={styles.dayHeader}>{g.header}</Text>
                {g.entries.map((e) => (
                  <EntryBlock key={e.id} entry={e} tz={tz} />
                ))}
              </View>
            ))}
            <View style={styles.totals}>
              <Text style={styles.totalsLabel}>Totals for range</Text>
              <Text style={styles.totalsValue}>
                {formatDurationHours(props.totalSeconds)} hours · {props.totalAmount.toFixed(2)}
              </Text>
            </View>
          </>
        )}

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            totalPages > 1
              ? `Generated by Clockinoff  ·  ${pageNumber} / ${totalPages}`
              : "Generated by Clockinoff"
          }
        />
      </Page>
    </Document>
  );
}

export async function renderReportPdf(props: ReportProps): Promise<Buffer> {
  const stream = await renderToStream(<Report {...props} />);
  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    stream.on("data", (c: Buffer | string) =>
      chunks.push(typeof c === "string" ? Buffer.from(c) : c),
    );
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

export const _internal = {
  billablePill,
  formatRange,
  formatDayHeader,
  formatRateAmount,
  groupEntriesByDay,
};
