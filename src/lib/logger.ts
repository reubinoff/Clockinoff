// Minimal structured logger for server-side code. Writes to the console; when
// Azure Monitor is initialised (see `src/instrumentation.node.ts`) the
// `@opentelemetry/instrumentation-console` bridge forwards each call to
// Application Insights as a log record, correlated with the active request
// span.
//
// The redaction here mirrors the span/console scrub in the instrumentation
// bootstrap: it is a belt-and-suspenders defence so that anything routed
// through this logger never carries `Authorization` / `Cookie` /
// `timely_session` / `password` / a full `postgres://` URL, even when
// instrumentation is disabled (local dev, CI, or before it has loaded).
//
// Post-#12 residual (#37): also match keys like `db.connection_string` /
// `DATABASE_URL` where the value isn't a full URL (e.g. ODBC-style DSN).

import { REDACTED, redactDeep, redactString } from "@/lib/scrub";

const SENSITIVE_KEY =
  /password|authorization|cookie|session|secret|token|database.?url|connection.?string/i;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

function errorToPlainObject(err: Error): Record<string, unknown> {
  return {
    name: err.name,
    message: redactString(err.message),
    stack: err.stack ? redactString(err.stack) : undefined,
  };
}

function redactValue(value: unknown): unknown {
  return redactDeep(value, {
    isSensitiveKey,
    maxDepth: 5,
    onError: errorToPlainObject,
    onOther: (v) => String(v),
  });
}

type Extra = Record<string, unknown> | undefined;

function emit(level: "info" | "warn" | "error", msg: string, extra?: Extra): void {
  const safeMsg = redactString(msg);
  const safeExtra = extra ? (redactValue(extra) as Record<string, unknown>) : undefined;
  const line = safeExtra ? `${safeMsg} ${JSON.stringify(safeExtra)}` : safeMsg;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info(msg: string, extra?: Extra): void {
    emit("info", msg, extra);
  },
  warn(msg: string, extra?: Extra): void {
    emit("warn", msg, extra);
  },
  error(msg: string, extra?: Extra): void {
    emit("error", msg, extra);
  },
  exception(msg: string, err: unknown, extra?: Extra): void {
    emit("error", msg, { ...(extra ?? {}), error: err });
  },
};

export const __testing = { redactString, redactValue, isSensitiveKey, REDACTED };
