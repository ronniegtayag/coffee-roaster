import { HttpException } from '@nestjs/common';

export interface FieldError {
  field: string;
  code: string;
  message: string;
}

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  code: string;
  message: string;
  fieldErrors?: FieldError[];
  meta?: Record<string, unknown>;
}

const REASON_PHRASES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  429: 'Too Many Requests',
};

export interface ApiErrorExtras {
  fieldErrors?: FieldError[];
  meta?: Record<string, unknown>;
  headers?: Record<string, string>;
}

/** Thrown for every handled 4xx so the body always has `code` (see docs/design/auth-and-customers.md §3). */
export class ApiException extends HttpException {
  /** Response headers to set (e.g. Retry-After); applied by ApiExceptionFilter. */
  readonly headers?: Record<string, string>;

  constructor(status: number, code: string, message: string, extras: ApiErrorExtras = {}) {
    const body: ApiErrorBody = {
      statusCode: status,
      error: REASON_PHRASES[status] ?? 'Error',
      code,
      message,
      ...(extras.fieldErrors ? { fieldErrors: extras.fieldErrors } : {}),
      ...(extras.meta ? { meta: extras.meta } : {}),
    };
    super(body, status);
    this.headers = extras.headers;
  }
}

export function apiError(
  status: number,
  code: string,
  message: string,
  extras?: ApiErrorExtras,
): ApiException {
  return new ApiException(status, code, message, extras);
}
