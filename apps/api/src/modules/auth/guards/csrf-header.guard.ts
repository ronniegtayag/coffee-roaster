import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { apiError } from '../../../common/api-error';

/** Requires `X-Requested-With: XMLHttpRequest`; forces a CORS preflight for cross-site callers. */
@Injectable()
export class CsrfHeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
      throw apiError(403, 'CSRF_HEADER_MISSING', 'Missing X-Requested-With header');
    }
    return true;
  }
}
