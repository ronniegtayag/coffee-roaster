import type { UserRole } from '../../generated/prisma/client';
import type { Permission } from './permissions';

/** The authenticated user attached to the request by JwtAuthGuard. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  permissions: Permission[];
}
