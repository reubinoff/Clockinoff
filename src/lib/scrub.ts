// Shared secret-scrubbing helpers used by the structured logger
// (`src/lib/logger.ts`) and the Node-only Application Insights bootstrap
// (`src/instrumentation.node.ts`).
//
// Two operations live here:
//   1. `redactString` — rewrites known secret shapes inside a plain string
//      (postgres URLs, inline password JSON, Bearer tokens, timely_session
//      cookie values). Cheap; safe to call on every log line.
//   2. `redactDeep` — walks arbitrary values (objects, arrays, primitives)
//      and returns a copy with sensitive keys wholesale-replaced and every
//      string leaf run through `redactString`. Caller provides the
//      `isSensitiveKey` predicate and (optionally) a custom `Error`
//      handler, since the logger wants a JSON-serialisable plain object
//      while the console wrapper wants to preserve `Error` instances.
//
// Post-#12 residuals (#37) fixed here:
//   - `redactDeep` recurses into plain objects/arrays so
//     `console.log({ password, cookie })` no longer forwards raw values.
//   - Callers now match `database.?url` / `connection.?string` attribute
//     *keys*, not just URL-shaped values.

export const REDACTED = "[REDACTED]";

export function redactString(input: string): string {
  let s = input;
  s = s.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[REDACTED_DATABASE_URL]");
  s = s.replace(/(["']?password["']?\s*[:=]\s*["'])([^"']*)(["'])/gi, `$1${REDACTED}$3`);
  s = s.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`);
  s = s.replace(/timely_session=[^;\s"']+/gi, `timely_session=${REDACTED}`);
  return s;
}

export interface DeepRedactOptions {
  isSensitiveKey: (key: string) => boolean;
  maxDepth?: number;
  onError?: (err: Error) => unknown;
  // Called for values we don't otherwise recognise (symbol, function,
  // class instance…). The logger uses this to coerce to `String(value)`
  // so JSON.stringify never chokes; the instrumentation console wrapper
  // leaves them untouched (default) so `Buffer` / `Date` reach `console.*`
  // intact.
  onOther?: (value: unknown) => unknown;
}

const DEFAULT_MAX_DEPTH = 6;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function defaultOnError(err: Error): Error {
  const clone = new Error(redactString(err.message));
  clone.name = err.name;
  clone.stack = err.stack ? redactString(err.stack) : undefined;
  return clone;
}

interface ResolvedOptions {
  isSensitiveKey: (key: string) => boolean;
  maxDepth: number;
  onError: (err: Error) => unknown;
  onOther: (value: unknown) => unknown;
}

function walk(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
  opts: ResolvedOptions,
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return value;
  }
  if (value instanceof Error) return opts.onError(value);
  if (depth >= opts.maxDepth) return "[TRUNCATED]";
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    return value.map((v) => walk(v, depth + 1, seen, opts));
  }
  if (isPlainObject(value)) {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = opts.isSensitiveKey(k) ? REDACTED : walk(v, depth + 1, seen, opts);
    }
    return out;
  }
  return opts.onOther(value);
}

const passthrough = (value: unknown): unknown => value;

export function redactDeep(value: unknown, opts: DeepRedactOptions): unknown {
  return walk(value, 0, new WeakSet<object>(), {
    isSensitiveKey: opts.isSensitiveKey,
    maxDepth: opts.maxDepth ?? DEFAULT_MAX_DEPTH,
    onError: opts.onError ?? defaultOnError,
    onOther: opts.onOther ?? passthrough,
  });
}
