import { type Permission, useAuthStore } from '@/stores/auth.store';

/** Whether the logged-in user holds a permission. Hiding controls is a convenience; the API enforces. */
export function useCan(permission: Permission): boolean {
  return useAuthStore((s) => s.user?.permissions.includes(permission) ?? false);
}
