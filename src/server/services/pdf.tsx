import React from "react";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToStream,
} from "@react-pdf/renderer";
import type { ExportRow } from "./export";
import { formatDurationHours } from "@/lib/tz";

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#0f172a",
  },
  h1: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  meta: { color: "#64748b", marginBottom: 12 },
  table: { borderTop: 1, borderColor: "#e7e5e4" },
  row: {
    flexDirection: "row",
    borderBottom: 1,
    borderColor: "#e7e5e4",
    paddingVertical: 4,
  },
  header: { fontWeight: 700, backgroundColor: "#efeee9" },
  cell: { paddingHorizontal: 4 },
  totals: { marginTop: 12, textAlign: "right", fontWeight: 700 },
  empty: {
    marginTop: 40,
    textAlign: "center",
    color: "#64748b",
    fontSize: 12,
  },
});

const COLS: { key: keyof ExportRow; label: string; width: number }[] = [
  { key: "date", label: "Date", width: 55 },
  { key: "start", label: "Start", width: 40 },
  { key: "end", label: "End", width: 40 },
  { key: "duration", label: "Hours", width: 40 },
  { key: "description", label: "Description", width: 130 },
  { key: "project", label: "Project", width: 70 },
  { key: "client", label: "Client", width: 60 },
  { key: "tags", label: "Tags", width: 60 },
  { key: "billable", label: "Bill", width: 30 },
  { key: "rate", label: "Rate", width: 40 },
  { key: "amount", label: "Amount", width: 50 },
];

export interface ReportProps {
  rows: readonly ExportRow[];
  from: string;
  to: string;
  timezone: string;
  totalSeconds: number;
  totalAmount: number;
}

export function Report(props: ReportProps): React.ReactElement {
  const { rows, from, to, timezone, totalSeconds, totalAmount } = props;
  const empty = rows.length === 0;
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.h1}>Timely — Entries</Text>
        <Text style={styles.meta}>
          Range: {from} to {to} ({timezone})
        </Text>
        {empty ? (
          <Text style={styles.empty}>No entries</Text>
        ) : (
          <View style={styles.table}>
            <View style={[styles.row, styles.header]}>
              {COLS.map((c) => (
                <Text key={c.key} style={[styles.cell, { width: c.width }]}>
                  {c.label}
                </Text>
              ))}
            </View>
            {rows.map((r, i) => (
              <View key={i} style={styles.row} wrap={false}>
                {COLS.map((c) => (
                  <Text key={c.key} style={[styles.cell, { width: c.width }]}>
                    {r[c.key]}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        )}
        {!empty && (
          <Text style={styles.totals}>
            Total hours: {formatDurationHours(totalSeconds)} · Total amount:{" "}
            {totalAmount.toFixed(2)}
          </Text>
        )}
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
