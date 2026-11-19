// Public API of the auth module. Other modules must import from here, not from internals.
export { AuthModule } from './auth.module';
export { Public } from './decorators/public.decorator';
export { RequirePermission } from './decorators/require-permission.decorator';
export { CurrentUser } from './decorators/current-user.decorator';
export { Permission, hasPermission } from './permissions';
export type { AuthUser } from './auth-user';
