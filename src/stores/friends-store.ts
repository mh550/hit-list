import { create } from 'zustand';

import type { FriendsData } from '@/src/sync/friends';
import { useAuthStore } from './auth-store';

// The signed-in rider's friends, requests and blocks as the last friends load left them (src/sync/friends.ts
// refreshFriends, the sync engine). Not persisted: names survive offline in the local profiles mirror instead (D72).
export interface FriendsState extends FriendsData {
  /** The rider these rows belong to; null until a load applied. */
  userId: string | null;
  /** When the last load applied (ISO), null before the first. */
  loadedAt: string | null;
  /** The last load's error message, null after one that went through. */
  loadError: string | null;
  /** Sets `uid`'s rows, unless `uid` is not the rider signed in now (a load that outlived a sign-out or switch). */
  applyFriends: (uid: string, data: FriendsData) => void;
  setLoadError: (uid: string, message: string) => void;
  clearFriends: () => void;
}

export const EMPTY_FRIENDS: FriendsData = {
  friends: [],
  incoming: [],
  outgoing: [],
  blocked: [],
};

const CLEARED = {
  ...EMPTY_FRIENDS,
  userId: null,
  loadedAt: null,
  loadError: null,
};

const isShown = (uid: string) => useAuthStore.getState().userId === uid;

export const useFriendsStore = create<FriendsState>((set) => ({
  ...CLEARED,

  applyFriends: (uid, data) => {
    if (!isShown(uid)) return;
    set({
      ...data,
      userId: uid,
      loadedAt: new Date().toISOString(),
      loadError: null,
    });
  },

  setLoadError: (uid, message) => {
    if (isShown(uid)) set({ loadError: message });
  },

  clearFriends: () => set(CLEARED),
}));

// One account's friends never show under another: every change of the signed-in rider (sign-out, an account switch,
// a session that fell back to signed out) empties the store, whichever path changed it.
useAuthStore.subscribe((state, prev) => {
  if (state.userId !== prev.userId) useFriendsStore.getState().clearFriends();
});
