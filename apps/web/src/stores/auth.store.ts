import { create } from 'zustand';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'MANAGER' | 'STAFF';
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
