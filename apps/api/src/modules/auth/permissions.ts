import { UserRole } from '../../generated/prisma/client';

/** Named permissions. The role matrix below is the only place roles are mapped (D-AR-4). */
export enum Permission {
  CustomersRead = 'customers:read',
  CustomersWrite = 'customers:write',
  CustomersEditTerms = 'customers:edit-terms',
  CustomersDeactivate = 'customers:deactivate',
  BranchesWrite = 'branches:write',
  BranchesUpdateContact = 'branches:update-contact',
  BranchesDeactivate = 'branches:deactivate',
}

const ALL: Permission[] = Object.values(Permission);

/** Working default (D-PO-7, OQ-PO-1): change roles here only. */
const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  ADMIN: ALL,
  MANAGER: ALL,
  STAFF: [Permission.CustomersRead, Permission.BranchesUpdateContact],
};

export function permissionsForRole(role: UserRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function hasPermission(
  user: { permissions: readonly Permission[] },
  p: Permission,
): boolean {
  return user.permissions.includes(p);
}
