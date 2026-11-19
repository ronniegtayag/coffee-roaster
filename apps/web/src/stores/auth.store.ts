import { create } from 'zustand';

/** Named permissions sent by the API (`UserDto.permissions`). The web never copies the role matrix. */
export type Permission =
  | 'customers:read'
  | 'customers:write'
  | 'customers:edit-terms'
  | 'customers:deactivate'
  | 'branches:write'
  | 'branches:update-contact'
  | 'branches:deactivate'
  | 'products:read'
  | 'products:write'
  | 'orders:read'
  | 'orders:write'
  | 'orders:late-change'
  | 'orders:fulfil'
  | 'orders:short-supply'
  | 'settings:roast-calendar';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'MANAGER' | 'STAFF';
  permissions: Permission[];
}

interface AuthState {
  /** Kept in memory only, never in localStorage (see docs/design/frontend-backend-split.md). */
  accessToken: string | null;
  user: SessionUser | null;
  setSession: (accessToken: string, user: SessionUser) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  accessToken: null,
  user: null,
  setSession: (accessToken, user) => set({ accessToken, user }),
  clear: () => set({ accessToken: null, user: null }),
}));
