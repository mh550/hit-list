import { create } from 'zustand';

import type { FriendProfile, FriendsData } from '@/src/sync/friends';
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
  // After an action went through, so the row leaves at once: the load that confirms it waits its turn on the sync
  // queue, maybe behind a backup. Each ignores a rider who is not the one shown.
  /** A friendship removed, a sent request cancelled. */
  dropFriendship: (uid: string, friendshipId: string) => void;
  /** `profile` blocked: every row with them leaves (the server ends the friendship) and they are listed as blocked. */
  noteBlocked: (uid: string, profile: FriendProfile) => void;
  noteUnblocked: (uid: string, userId: string) => void;
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

/** By username, riders whose name is unknown last (by id, so the order is stable). */
export const byName = (a: FriendProfile, b: FriendProfile) =>
  (a.username ?? '\uffff').localeCompare(b.username ?? '\uffff') || a.id.localeCompare(b.id);

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

  dropFriendship: (uid, friendshipId) => {
    if (!isShown(uid)) return;
    const keep = (rows: FriendsData['friends']) => rows.filter((f) => f.friendshipId !== friendshipId);
    set((s) => ({ friends: keep(s.friends), incoming: keep(s.incoming), outgoing: keep(s.outgoing) }));
  },

  noteBlocked: (uid, profile) => {
    if (!isShown(uid)) return;
    const keep = (rows: FriendsData['friends']) => rows.filter((f) => f.profile.id !== profile.id);
    set((s) => ({
      friends: keep(s.friends),
      incoming: keep(s.incoming),
      outgoing: keep(s.outgoing),
      blocked: s.blocked.some((p) => p.id === profile.id) ? s.blocked : [...s.blocked, profile].sort(byName),
    }));
  },

  noteUnblocked: (uid, userId) => {
    if (isShown(uid)) set((s) => ({ blocked: s.blocked.filter((p) => p.id !== userId) }));
  },

  clearFriends: () => set(CLEARED),
}));

// One account's friends never show under another: every change of the signed-in rider (sign-out, an account switch,
// a session that fell back to signed out) empties the store, whichever path changed it.
useAuthStore.subscribe((state, prev) => {
  if (state.userId !== prev.userId) useFriendsStore.getState().clearFriends();
});
