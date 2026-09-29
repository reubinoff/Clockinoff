// Node-only Azure Monitor / Application Insights bootstrap. Imported lazily
// from `src/instrumentation.ts` after the connection-string env check so the
// heavy SDK never loads on the edge runtime or when App Insights is disabled.
//
// Security (Ariel):
//   - Strip `Authorization`, `Cookie`, `Set-Cookie`, and any attribute
//     mentioning `timely_session` from span/log telemetry before it is exported.
//   - Never emit the full `DATABASE_URL` or a bare `postgres://` connection
//     string in any log body / span attribute.
//   - Never emit anything under a `password` key.
//   - Post-#12 residual (#37): also match attribute *keys* like
//     `db.connection_string` / `DATABASE_URL` (value may not be URL-shaped),
//     and deep-scrub object args passed to `console.*` (not just strings/Errors).
//
// We do the scrub in two places:
//   1. A span processor that rewrites request/response header attributes on
//      each span before Azure Monitor exports it.
//   2. A `console.*` wrapper installed before `useAzureMonitor()` so the
//      built-in `@opentelemetry/instrumentation-console` sees the already
//      redacted strings (and so do App Service's stdout log stream and local
//      terminals).
import { useAzureMonitor } from "@azure/monitor-opentelemetry";
import type { ReadableSpan, SpanProcessor } from "@opentelemetry/sdk-trace-base";
import { REDACTED, redactDeep, redactString } from "@/lib/scrub";

const SENSITIVE_ATTRIBUTE_MATCHERS: Array<(key: string) => boolean> = [
  (k) => /authorization/i.test(k),
  (k) => /\bcookie\b/i.test(k),
  (k) => /set-cookie/i.test(k),
  (k) => /timely_session/i.test(k),
  (k) => /password/i.test(k),
  // #37: DB DSN attribute keys, incl. values that aren't URL-shaped
  // (e.g. `Server=...;User Id=...;Password=...`).
  (k) => /database.?url/i.test(k),
  (k) => /connection.?string/i.test(k),
];

function isSensitiveAttributeKey(key: string): boolean {
  return SENSITIVE_ATTRIBUTE_MATCHERS.some((match) => match(key));
}

class RedactingSpanProcessor implements SpanProcessor {
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
  onStart(): void {}
  onEnd(span: ReadableSpan): void {
    const attrs = span.attributes as Record<string, unknown> | undefined;
    if (!attrs) return;
    for (const key of Object.keys(attrs)) {
      if (isSensitiveAttributeKey(key)) {
        attrs[key] = REDACTED;
        continue;
      }
      const value = attrs[key];
      if (typeof value === "string" && value.length > 0) {
        const scrubbed = redactString(value);
        if (scrubbed !== value) attrs[key] = scrubbed;
      }
    }
  }
}

function wrapConsole(): void {
  const methods = ["log", "info", "warn", "error", "debug"] as const;
  for (const method of methods) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]): void => {
      const scrubbed = args.map((arg) =>
        redactDeep(arg, { isSensitiveKey: isSensitiveAttributeKey }),
      );
      original(...scrubbed);
    };
  }
}

wrapConsole();

// `useAzureMonitor` is a plain server-side bootstrap function, not a React
// hook. `react-hooks/rules-of-hooks` false-positives on the `use` prefix.
// eslint-disable-next-line react-hooks/rules-of-hooks
useAzureMonitor({
  azureMonitorExporterOptions: {
    connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
  },
  spanProcessors: [new RedactingSpanProcessor()],
});
