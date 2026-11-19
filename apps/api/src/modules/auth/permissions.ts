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
  ProductsRead = 'products:read',
  ProductsWrite = 'products:write',
  OrdersRead = 'orders:read',
  OrdersWrite = 'orders:write',
  OrdersLateChange = 'orders:late-change',
  OrdersFulfil = 'orders:fulfil',
  OrdersShortSupply = 'orders:short-supply',
  SettingsRoastCalendar = 'settings:roast-calendar',
}

/** Spelled out per role (not filtered from ALL) so a new ADMIN-only permission is never granted by accident. */
const ADMIN_PERMISSIONS: readonly Permission[] = Object.values(Permission);

const MANAGER_PERMISSIONS: readonly Permission[] = [
  Permission.CustomersRead,
  Permission.CustomersWrite,
  Permission.CustomersEditTerms,
  Permission.CustomersDeactivate,
  Permission.BranchesWrite,
  Permission.BranchesUpdateContact,
  Permission.BranchesDeactivate,
  Permission.ProductsRead,
  Permission.ProductsWrite,
  Permission.OrdersRead,
  Permission.OrdersWrite,
  Permission.OrdersLateChange,
  Permission.OrdersFulfil,
  Permission.OrdersShortSupply,
];

const STAFF_PERMISSIONS: readonly Permission[] = [
  Permission.CustomersRead,
  Permission.BranchesUpdateContact,
  Permission.ProductsRead,
  Permission.OrdersRead,
  Permission.OrdersWrite,
  Permission.OrdersFulfil,
];

/** Working default (D-PO-7, OQ-PO-1): change roles here only. */
const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  ADMIN: ADMIN_PERMISSIONS,
  MANAGER: MANAGER_PERMISSIONS,
  STAFF: STAFF_PERMISSIONS,
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
