import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { Response } from 'express';
import { ApiException } from './api-error';

const DEFAULT_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'TOO_MANY_REQUESTS',
};

/**
 * Applies ApiException headers and adds a default `code` to any other HttpException
 * (e.g. Nest's unknown-route 404) so every 4xx body has one.
 */
@Catch(HttpException)
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    if (exception instanceof ApiException && exception.headers) {
      res.set(exception.headers);
    }
    const body = exception.getResponse();
    if (typeof body === 'object' && body !== null && 'code' in body) {
      res.status(status).json(body);
      return;
    }
    const base = typeof body === 'string' ? { message: body } : (body as Record<string, unknown>);
    res.status(status).json({
      ...base,
      statusCode: status,
      code: DEFAULT_CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'ERROR'),
    });
  }
}
