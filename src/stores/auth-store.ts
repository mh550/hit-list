import { create } from 'zustand';

// The account as the app sees it, mirrored from the Supabase session by useAuthInit.
// 'unconfigured': this build has no Supabase values; 'needs_username': signed in, no @username yet.
export type AuthStatus = 'unconfigured' | 'signed_out' | 'signed_in' | 'needs_username';

export interface AuthSnapshot {
  status: AuthStatus;
  userId: string | null;
  email: string | null;
  username: string | null;
  displayName: string | null;
}

export const SIGNED_OUT: AuthSnapshot = {
  status: 'signed_out',
  userId: null,
  email: null,
  username: null,
  displayName: null,
};

interface AuthState extends AuthSnapshot {
  setAuth: (snapshot: AuthSnapshot) => void;
  setProfile: (username: string, displayName: string | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  ...SIGNED_OUT,

  setAuth: (snapshot) => set(snapshot),

  setProfile: (username, displayName) => set({ status: 'signed_in', username, displayName }),
}));
