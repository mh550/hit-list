import type { SQLiteDatabase } from 'expo-sqlite';
import { create } from 'zustand';

import { getSyncState, inboxSeenKey, setSyncState } from '@/src/db/sync';
import type { FriendProfile } from '@/src/types';
import type { SendPayload, SendSender } from '@/src/utils/send-payload';
import { useAuthStore } from './auth-store';

// The Inbox tab's items and the badge (S6-04, docs/plans/2026-10-22-s6-friends.md "Inbox tab"): only items addressed
// to the rider, tagged by kind, so S7 (sends) and S8 (invitations) add kinds without touching the badge. Not persisted
// except the seen mark: the newest server created_at the rider has seen, per rider in sync_state (D75).

/** Every kind in the order the Inbox shows its sections. */
export const INBOX_KINDS = ['friend_request', 'send', 'invite'] as const;
export type InboxKind = (typeof INBOX_KINDS)[number];

interface InboxItemBase {
  id: string;
  /** server time, through toIso */
  created_at: string;
}

export interface FriendRequestItem extends InboxItemBase {
  kind: 'friend_request';
  friendshipId: string;
  /** the rider who asked */
  from: FriendProfile;
}

/** Spots a friend sent the rider (S7): the frozen copy, until they Save or Dismiss it. `id` is the send's id. */
export interface SendItem extends InboxItemBase {
  kind: 'send';
  sendId: string;
  /** the payload's sender, written by the server (D80) */
  from: SendSender;
  payload: SendPayload;
}

// S8 adds `| InviteItem` (kind 'invite').
export type InboxItem = FriendRequestItem | SendItem;

type ItemsOf<K extends InboxKind> = Extract<InboxItem, { kind: K }>[];

export interface InboxState {
  /** The rider these items belong to; null until something applied. */
  userId: string | null;
  items: InboxItem[];
  /** The seen mark: undefined until loaded (badge 0), null when loaded and never set. */
  seenAt: string | null | undefined;
  /** Replaces the items of `kind` only, unless `uid` is not the rider signed in now. */
  setItems: <K extends InboxKind>(uid: string, kind: K, items: ItemsOf<K>) => void;
  /** Drops one item at once (answered, blocked), before the next load replaces the kind. */
  removeItem: (uid: string, kind: InboxKind, id: string) => void;
  /** Reads `uid`'s stored seen mark (never moves the one in memory back). */
  loadSeen: (db: SQLiteDatabase, uid: string) => Promise<void>;
  /** Marks every item seen: stores max(stored, shown, newest item) under `uid`'s key. */
  markSeen: (db: SQLiteDatabase, uid: string) => Promise<void>;
  clearInbox: () => void;
}

const CLEARED = { userId: null, items: [], seenAt: undefined };

const isShown = (uid: string) => useAuthStore.getState().userId === uid;

/** The later of ISO timestamps (one shape, so they compare as strings); null when none is set. */
function latest(...times: (string | null | undefined)[]): string | null {
  return times.reduce<string | null>((max, t) => (t && (max === null || t > max) ? t : max), null);
}

export const useInboxStore = create<InboxState>((set, get) => ({
  ...CLEARED,

  setItems: (uid, kind, items) => {
    if (!isShown(uid)) return;
    const s = get();
    if (s.userId !== uid) {
      set({ userId: uid, items, seenAt: undefined });
      return;
    }
    set({ items: [...s.items.filter((i) => i.kind !== kind), ...items] });
  },

  removeItem: (uid, kind, id) => {
    const s = get();
    if (s.userId !== uid || !isShown(uid)) return;
    set({ items: s.items.filter((i) => i.kind !== kind || i.id !== id) });
  },

  loadSeen: async (db, uid) => {
    const stored = (await getSyncState(db, inboxSeenKey(uid))) ?? null;
    if (!isShown(uid)) return;
    const s = get();
    if (s.userId !== uid) set({ userId: uid, items: [], seenAt: stored });
    else set({ seenAt: latest(s.seenAt, stored) });
  },

  markSeen: async (db, uid) => {
    const s = get();
    if (s.userId !== uid || !isShown(uid)) return;
    const newest = latest(...s.items.map((i) => i.created_at));
    if (newest === null || (s.seenAt != null && s.seenAt >= newest)) return;
    const stored = (await getSyncState(db, inboxSeenKey(uid))) ?? null;
    const next = latest(stored, get().seenAt, newest);
    if (get().userId !== uid || !isShown(uid) || next === null) return;
    if (next !== stored) await setSyncState(db, inboxSeenKey(uid), next);
    if (get().userId === uid) set({ seenAt: latest(get().seenAt, next) });
  },

  clearInbox: () => set(CLEARED),
}));

/** The badge: items newer than the seen mark; 0 until the mark is loaded. */
export function selectUnseenCount(s: Pick<InboxState, 'items' | 'seenAt'>): number {
  const { seenAt } = s;
  if (seenAt === undefined) return 0;
  return s.items.filter((i) => seenAt === null || i.created_at > seenAt).length;
}

// One account's Inbox never shows under another: every change of the signed-in rider empties it.
useAuthStore.subscribe((state, prev) => {
  if (state.userId !== prev.userId) useInboxStore.getState().clearInbox();
});
