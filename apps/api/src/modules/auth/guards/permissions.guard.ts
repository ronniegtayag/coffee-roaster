import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { apiError } from '../../../common/api-error';
import { RequestWithUser } from '../decorators/current-user.decorator';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';
import { hasPermission, Permission } from '../permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user || !required.every((p) => hasPermission(user, p))) {
      throw apiError(403, 'FORBIDDEN', "You don't have permission to do this");
    }
    return true;
  }
}
