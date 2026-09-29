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

const REDACTED = "[REDACTED]";

const SENSITIVE_KEY = /password|authorization|cookie|session|secret|token|database_url/i;

function redactString(input: string): string {
  let s = input;
  s = s.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[REDACTED_DATABASE_URL]");
  s = s.replace(/(["']?password["']?\s*[:=]\s*["'])([^"']*)(["'])/gi, `$1${REDACTED}$3`);
  s = s.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`);
  s = s.replace(/timely_session=[^;\s"']+/gi, `timely_session=${REDACTED}`);
  return s;
}

function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[TRUNCATED]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
    };
  }
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? REDACTED : redactValue(v, depth + 1);
    }
    return out;
  }
  return String(value);
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

export const __testing = { redactString, redactValue };
