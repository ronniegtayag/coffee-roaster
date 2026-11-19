import { isAxiosError } from 'axios';

export interface FieldError {
  /** DTO property, e.g. "abn"; nested as "a.b". */
  field: string;
  code: string;
  /** User-facing, shown next to the field. */
  message: string;
}

interface ApiErrorExtra {
  /** Machine code from the API, e.g. "ABN_TAKEN". */
  code?: string;
  fieldErrors?: FieldError[];
  meta?: Record<string, unknown>;
  /** Seconds from the Retry-After header (429). */
  retryAfterSeconds?: number;
}

/** Error shape every API call rejects with, whatever went wrong. */
export class ApiError extends Error {
  /** HTTP status, or 0 for network errors and timeouts. */
  readonly status: number;
  /** Individual messages, e.g. one per failed field from the ValidationPipe. */
  readonly details: string[];
  readonly code: string | undefined;
  readonly fieldErrors: FieldError[];
  readonly meta: Record<string, unknown>;
  readonly retryAfterSeconds: number | undefined;

  constructor(status: number, message: string, details: string[] = [], extra: ApiErrorExtra = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.code = extra.code;
    this.fieldErrors = extra.fieldErrors ?? [];
    this.meta = extra.meta ?? {};
    this.retryAfterSeconds = extra.retryAfterSeconds;
  }
}

/** The API's error body: Nest's `{ statusCode, message, error }` plus `code`, `fieldErrors` and `meta`. */
export interface ApiErrorBody {
  statusCode?: number;
  message?: string | string[];
  error?: string;
  code?: string;
  fieldErrors?: FieldError[];
  meta?: Record<string, unknown>;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (!isAxiosError<ApiErrorBody>(error)) {
    return new ApiError(0, error instanceof Error ? error.message : 'Unexpected error');
  }
  if (!error.response) {
    const timedOut = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
    return new ApiError(
      0,
      timedOut ? 'The server took too long to respond' : 'Cannot reach the server',
    );
  }

  const { status, data, headers } = error.response;
  // A gateway (the Vite dev proxy, a load balancer) answers for an API that is down, with no Nest body.
  if (status >= 502 && status <= 504 && !data?.message) {
    return new ApiError(status, 'Cannot reach the server');
  }
  const fieldErrors = Array.isArray(data?.fieldErrors) ? data.fieldErrors : [];
  const details = Array.isArray(data?.message)
    ? data.message
    : fieldErrors.map((fieldError) => fieldError.message);
  const message =
    (typeof data?.message === 'string' && data.message) ||
    details[0] ||
    data?.error ||
    error.message;
  const retryAfter = Number(headers?.['retry-after']);
  return new ApiError(status, message, details, {
    code: data?.code,
    fieldErrors,
    meta: data?.meta,
    retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  });
}
