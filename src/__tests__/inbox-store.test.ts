// The Inbox store (S6-04, docs/plans/2026-10-22-s6-friends.md "Inbox tab"): kind-tagged items, the per-rider seen
// mark in sync_state (real SQLite) and the badge count.
import type { SQLiteDatabase } from 'expo-sqlite';
import { createMigratedTestDb } from './helpers/node-sqlite-db';

import { getSyncState, setSyncState } from '@/src/db/sync';
import { SIGNED_OUT, useAuthStore } from '@/src/stores/auth-store';
import {
  inviteLine,
  selectUnseenCount,
  useInboxStore,
  type InboxItem,
  type InboxState,
  type InviteItem,
} from '@/src/stores/inbox-store';

const ME = 'rider-me';
const KEY = `inbox_seen_at:${ME}`;

const request = (id: string, created_at: string, username = id): InboxItem => ({
  kind: 'friend_request',
  id,
  created_at,
  friendshipId: id,
  from: { id: `rider-${id}`, username, display_name: null },
});

const T1 = '2026-10-20T10:00:00.000Z';
const T2 = '2026-10-21T10:00:00.000Z';
const T3 = '2026-10-22T10:00:00.000Z';

const state = (patch: Partial<InboxState>): InboxState => ({ ...useInboxStore.getState(), ...patch });
const signIn = (userId: string) => useAuthStore.setState({ ...SIGNED_OUT, status: 'signed_in', userId });

let db: SQLiteDatabase;

beforeEach(async () => {
  db = await createMigratedTestDb();
  signIn(ME);
  useInboxStore.getState().clearInbox();
});

describe('selectUnseenCount', () => {
  const items = [request('a', T1), request('b', T2), request('c', T3)];

  it('is 0 while the seen mark is not loaded (never everything on launch)', () => {
    expect(selectUnseenCount(state({ userId: ME, items, seenAt: undefined }))).toBe(0);
  });

  it('counts every item when the mark is loaded and was never set', () => {
    expect(selectUnseenCount(state({ userId: ME, items, seenAt: null }))).toBe(3);
  });

  it('counts the items created after the mark; one created exactly at it is seen', () => {
    expect(selectUnseenCount(state({ userId: ME, items, seenAt: T2 }))).toBe(1);
    expect(selectUnseenCount(state({ userId: ME, items, seenAt: T3 }))).toBe(0);
  });

  it('counts unseen sends with the friend requests (S7-05)', () => {
    const send = { ...request('s', T3), kind: 'send', sendId: 's' } as unknown as InboxItem;
    expect(selectUnseenCount(state({ userId: ME, items: [request('a', T1), send], seenAt: T2 }))).toBe(1);
    expect(selectUnseenCount(state({ userId: ME, items: [request('a', T1), send], seenAt: null }))).toBe(2);
  });

  it('counts unseen invitations with the rest (S8)', () => {
    const invite: InboxItem = {
      kind: 'invite',
      id: 'list-1',
      created_at: T3,
      listId: 'list-1',
      listName: 'Downtown',
      listKind: 'manual',
      from: { id: 'rider-ana', username: 'ana', display_name: null },
      role: 'add',
      spotCount: 12,
    };
    expect(selectUnseenCount(state({ userId: ME, items: [request('a', T1), invite], seenAt: T2 }))).toBe(1);
  });

  it('is 0 with no items', () => {
    expect(selectUnseenCount(state({ userId: ME, items: [], seenAt: null }))).toBe(0);
  });
});

describe('setItems', () => {
  it("replaces that kind's items only", () => {
    const other = { ...request('x', T1), kind: 'send' } as unknown as InboxItem;
    useInboxStore.setState({ userId: ME, items: [other, request('a', T1)], seenAt: null });

    useInboxStore.getState().setItems(ME, 'friend_request', [request('b', T2)]);

    expect(useInboxStore.getState().items).toEqual([other, request('b', T2)]);
  });

  it("keeps the other kinds when the invitations are replaced, and reads '@ana invited you to Downtown (12 spots)'", () => {
    const invite = (spotCount: number, username: string | null = 'ana'): InviteItem => ({
      kind: 'invite',
      id: `list-${spotCount}`,
      created_at: T2,
      listId: `list-${spotCount}`,
      listName: 'Downtown',
      listKind: 'manual',
      from: { id: 'rider-ana', username, display_name: null },
      role: 'view',
      spotCount,
    });
    useInboxStore.getState().setItems(ME, 'friend_request', [request('a', T1)]);
    useInboxStore.getState().setItems(ME, 'invite', [invite(12)]);

    expect(useInboxStore.getState().items.map((i) => i.kind)).toEqual(['friend_request', 'invite']);
    const lines = [invite(12), invite(1), invite(0), invite(2, null)].map((i) => inviteLine(i));
    expect(lines).toEqual([
      '@ana invited you to Downtown (12 spots)',
      '@ana invited you to Downtown (1 spot)',
      '@ana invited you to Downtown (no spots yet)',
      'A friend invited you to Downtown (2 spots)',
    ]);
  });

  it('ignores a rider who is not the one signed in', () => {
    useInboxStore.getState().setItems('someone-else', 'friend_request', [request('a', T1)]);

    expect(useInboxStore.getState()).toMatchObject({ userId: null, items: [] });
  });

  it("a first setItems for the rider starts from no items and an unloaded mark", () => {
    useInboxStore.setState({ userId: 'rider-before', items: [request('z', T3)], seenAt: T3 });

    useInboxStore.getState().setItems(ME, 'friend_request', [request('a', T1)]);

    expect(useInboxStore.getState()).toMatchObject({ userId: ME, items: [request('a', T1)], seenAt: undefined });
  });
});

describe('removeItem', () => {
  it('drops one answered item of that kind', () => {
    useInboxStore.setState({ userId: ME, items: [request('a', T1), request('b', T2)], seenAt: null });

    useInboxStore.getState().removeItem(ME, 'friend_request', 'a');

    expect(useInboxStore.getState().items).toEqual([request('b', T2)]);
  });

  it("ignores another rider's call", () => {
    useInboxStore.setState({ userId: ME, items: [request('a', T1)], seenAt: null });

    useInboxStore.getState().removeItem('rider-other', 'friend_request', 'a');

    expect(useInboxStore.getState().items).toEqual([request('a', T1)]);
  });
});

describe('loadSeen', () => {
  it("reads the rider's own key; null when never set", async () => {
    await useInboxStore.getState().loadSeen(db, ME);
    expect(useInboxStore.getState()).toMatchObject({ userId: ME, seenAt: null });

    await setSyncState(db, KEY, T2);
    await setSyncState(db, 'inbox_seen_at:rider-other', T3);
    await useInboxStore.getState().loadSeen(db, ME);
    expect(useInboxStore.getState().seenAt).toBe(T2);
  });

  it('keeps the items already set for the rider and never moves the mark back', async () => {
    useInboxStore.setState({ userId: ME, items: [request('a', T1)], seenAt: T3 });
    await setSyncState(db, KEY, T1);

    await useInboxStore.getState().loadSeen(db, ME);

    expect(useInboxStore.getState()).toMatchObject({ userId: ME, items: [request('a', T1)], seenAt: T3 });
  });

  it('does nothing for a rider who is not signed in', async () => {
    await setSyncState(db, 'inbox_seen_at:rider-other', T2);

    await useInboxStore.getState().loadSeen(db, 'rider-other');

    expect(useInboxStore.getState()).toMatchObject({ userId: null, seenAt: undefined });
  });
});

describe('markSeen', () => {
  it("stores the newest item's server time under the rider's key, so the badge drops to 0", async () => {
    useInboxStore.setState({ userId: ME, items: [request('b', T2), request('a', T1)], seenAt: null });
    expect(selectUnseenCount(useInboxStore.getState())).toBe(2);

    await useInboxStore.getState().markSeen(db, ME);

    expect(await getSyncState(db, KEY)).toBe(T2);
    expect(useInboxStore.getState().seenAt).toBe(T2);
    expect(selectUnseenCount(useInboxStore.getState())).toBe(0);
  });

  it('never moves the mark back (a stored mark newer than every item stays)', async () => {
    await setSyncState(db, KEY, T3);
    useInboxStore.setState({ userId: ME, items: [request('a', T1)], seenAt: undefined });

    await useInboxStore.getState().markSeen(db, ME);

    expect(await getSyncState(db, KEY)).toBe(T3);
    expect(useInboxStore.getState().seenAt).toBe(T3);
  });

  it('writes nothing with no items', async () => {
    useInboxStore.setState({ userId: ME, items: [], seenAt: null });

    await useInboxStore.getState().markSeen(db, ME);

    expect(await getSyncState(db, KEY)).toBeUndefined();
  });

  it('writes nothing when the rider changes while the stored mark is read', async () => {
    useInboxStore.setState({ userId: ME, items: [request('a', T1)], seenAt: null });

    const marking = useInboxStore.getState().markSeen(db, ME);
    signIn('rider-other');
    await marking;

    expect(await getSyncState(db, KEY)).toBeUndefined();
    expect(useInboxStore.getState()).toMatchObject({ userId: null, items: [], seenAt: undefined });
  });

  it('writes nothing for a rider who is not the one shown', async () => {
    useInboxStore.setState({ userId: ME, items: [request('a', T1)], seenAt: null });

    await useInboxStore.getState().markSeen(db, 'rider-other');

    expect(await getSyncState(db, 'inbox_seen_at:rider-other')).toBeUndefined();
    expect(await getSyncState(db, KEY)).toBeUndefined();
  });
});

describe('the rider changes', () => {
  it('empties the store on sign-out and on another account', () => {
    useInboxStore.setState({ userId: ME, items: [request('a', T1)], seenAt: T1 });

    signIn('rider-other');
    expect(useInboxStore.getState()).toMatchObject({ userId: null, items: [], seenAt: undefined });

    useInboxStore.setState({ userId: 'rider-other', items: [request('a', T1)], seenAt: T1 });
    useAuthStore.setState({ ...SIGNED_OUT });
    expect(useInboxStore.getState()).toMatchObject({ userId: null, items: [], seenAt: undefined });
  });
});
