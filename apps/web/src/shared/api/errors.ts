import { isAxiosError } from 'axios';

/** Error shape every API call rejects with, whatever went wrong. */
export class ApiError extends Error {
  /** HTTP status, or 0 for network errors and timeouts. */
  readonly status: number;
  /** Individual messages, e.g. one per failed field from the ValidationPipe. */
  readonly details: string[];

  constructor(status: number, message: string, details: string[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/** Nest's default error body: `{ statusCode, message, error }`, where message may be a list. */
interface NestErrorBody {
  statusCode?: number;
  message?: string | string[];
  error?: string;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (!isAxiosError<NestErrorBody>(error)) {
    return new ApiError(0, error instanceof Error ? error.message : 'Unexpected error');
  }
  if (!error.response) {
    const timedOut = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
    return new ApiError(
      0,
      timedOut ? 'The server took too long to respond' : 'Cannot reach the server',
    );
  }

  const { status, data } = error.response;
  // A gateway (the Vite dev proxy, a load balancer) answers for an API that is down, with no Nest body.
  if (status >= 502 && status <= 504 && !data?.message) {
    return new ApiError(status, 'Cannot reach the server');
  }
  const details = Array.isArray(data?.message) ? data.message : [];
  const message =
    (typeof data?.message === 'string' && data.message) ||
    details[0] ||
    data?.error ||
    error.message;
  return new ApiError(status, message, details);
}
