import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../permissions';

export const PERMISSIONS_KEY = 'auth:permissions';

/** The caller must hold every listed permission. Without it, any logged-in user may call. */
export const RequirePermission = (...permissions: Permission[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);
