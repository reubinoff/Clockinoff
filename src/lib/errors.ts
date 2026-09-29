export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "TIMER_ALREADY_RUNNING"
  | "TIMER_NOT_RUNNING"
  | "CONFLICT"
  | "INTERNAL";

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly extra?: Record<string, unknown>;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    opts?: { details?: unknown; extra?: Record<string, unknown> },
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = opts?.details;
    this.extra = opts?.extra;
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
  unauthorized: (message = "Unauthorized") => new ApiError(401, "UNAUTHORIZED", message),
  notFound: (message = "Not found") => new ApiError(404, "NOT_FOUND", message),
  conflict: (message = "Conflict") => new ApiError(409, "CONFLICT", message),
  timerAlreadyRunning: (entryId: string) =>
    new ApiError(409, "TIMER_ALREADY_RUNNING", "A timer is already running", {
      extra: { entry_id: entryId },
    }),
  timerNotRunning: () => new ApiError(404, "TIMER_NOT_RUNNING", "No running timer"),
  internal: (message = "Internal server error") => new ApiError(500, "INTERNAL", message),
};
