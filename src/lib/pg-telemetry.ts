// pg dependency spans for Application Insights.
// `@azure/monitor-opentelemetry` already enables PgInstrumentation.
// Keep query parameter values off the span: enhanced reporting is
// disabled, and any parameter attribute that still arrives is redacted.
// Statement text keeps placeholders ($1) and drops quoted literals so an
// inlined email or token cannot leave the process.

import { REDACTED, redactString } from "@/lib/scrub";

const SQL_LITERAL = /'(?:''|[^'])*'/g;

export function scrubSqlLiterals(sql: string): string {
  return sql.replace(SQL_LITERAL, `'${REDACTED}'`);
}

export function isPgTelemetrySensitiveKey(key: string): boolean {
  return (
    key === "db.postgresql.values" ||
    key === "db.query.parameters" ||
    key === "db.statement.parameters" ||
    key.startsWith("db.query.parameter")
  );
}

/** Replacement for a pg span attribute, or undefined when this key is unrelated. */
export function redactPgSpanAttribute(key: string, value: unknown): string | undefined {
  if (isPgTelemetrySensitiveKey(key)) return REDACTED;
  if ((key === "db.query.text" || key === "db.statement") && typeof value === "string") {
    return redactString(scrubSqlLiterals(value));
  }
  return undefined;
}

type PgSpan = { setAttribute(key: string, value: string): void };

export const pgInstrumentationOptions = {
  enabled: true as const,
  // Attaches `db.postgresql.values` (bound parameters). Leave this off.
  enhancedDatabaseReporting: false as const,
  requestHook(span: PgSpan, info: { query: { text?: string } }): void {
    if (typeof info.query.text === "string") {
      span.setAttribute("db.query.text", scrubSqlLiterals(info.query.text));
    }
  },
};
