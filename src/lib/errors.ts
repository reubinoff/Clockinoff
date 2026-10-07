export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "TIMER_ALREADY_RUNNING"
  | "TIMER_NOT_RUNNING"
  | "CONFLICT"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "INTERNAL";

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly extra?: Record<string, unknown>;
  // Optional extra response headers (currently used by RATE_LIMITED to emit
  // `Retry-After`). Not part of the JSON body — the route-level `jsonError`
  // helper lifts them onto the Response.
  readonly headers?: Record<string, string>;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    opts?: {
      details?: unknown;
      extra?: Record<string, unknown>;
      headers?: Record<string, string>;
    },
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = opts?.details;
    this.extra = opts?.extra;
    this.headers = opts?.headers;
  }
}

export function toErrorBody(err: ApiError): ErrorBody & Record<string, unknown> {
  const body: ErrorBody & Record<string, unknown> = {
    error: { code: err.code, message: err.message },
  };
  if (err.details !== undefined) body.error.details = err.details;
  if (err.extra) Object.assign(body, err.extra);
  return body;
}

export const errors = {
  validation: (message = "Validation failed", details?: unknown) =>
    new ApiError(400, "VALIDATION", message, { details }),
  payloadTooLarge: (message = "Request body too large") =>
    new ApiError(413, "VALIDATION", message),
  unauthorized: (message = "Unauthorized") => new ApiError(401, "UNAUTHORIZED", message),
  forbidden: (message = "Forbidden") => new ApiError(403, "FORBIDDEN", message),
  notFound: (message = "Not found") => new ApiError(404, "NOT_FOUND", message),
  conflict: (message = "Conflict") => new ApiError(409, "CONFLICT", message),
  timerAlreadyRunning: (entryId: string) =>
    new ApiError(409, "TIMER_ALREADY_RUNNING", "A timer is already running", {
      extra: { entry_id: entryId },
    }),
  timerNotRunning: () => new ApiError(404, "TIMER_NOT_RUNNING", "No running timer"),
  rateLimited: (
    message = "Too many login attempts. Please try again later.",
    retryAfterSeconds?: number,
  ) =>
    new ApiError(429, "RATE_LIMITED", message, {
      headers:
        typeof retryAfterSeconds === "number" && retryAfterSeconds > 0
          ? { "Retry-After": String(Math.ceil(retryAfterSeconds)) }
          : undefined,
    }),
  internal: (message = "Internal server error") => new ApiError(500, "INTERNAL", message),
};
