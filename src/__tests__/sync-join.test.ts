jest.mock('@/src/sync/lists', () => ({
  ...jest.requireActual('@/src/sync/lists'),
  respondInvite: jest.fn(),
}));
jest.mock('@/src/sync/engine', () => ({ syncNow: jest.fn() }));

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { useAuthStore } from '@/src/stores/auth-store';
import { useInboxStore, type InboxItem } from '@/src/stores/inbox-store';
import { syncNow } from '@/src/sync/engine';
import { joinList } from '@/src/sync/join';
import { NotAllowedError, respondInvite } from '@/src/sync/lists';

const ME = 'u-me';
const db = {} as SQLiteDatabase;
const client = {} as SupabaseClient;
const INVITE: InboxItem = {
  kind: 'invite',
  id: 'L-1',
  created_at: '2026-10-23T09:00:00.000Z',
  listId: 'L-1',
  listName: 'Downtown',
  listKind: 'manual',
  from: { id: 'u-ana', username: 'ana', display_name: null },
  role: 'add',
  spotCount: 12,
};

let warn: jest.SpyInstance;

beforeEach(() => {
  useAuthStore.setState({ status: 'signed_in', userId: ME });
  useInboxStore.setState({ userId: ME, items: [INVITE], seenAt: null });
  jest.mocked(respondInvite).mockReset().mockResolvedValue(true);
  jest.mocked(syncNow).mockReset().mockResolvedValue(undefined);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  useInboxStore.getState().clearInbox();
});

describe('joinList (S8-06)', () => {
  it('joins, takes the invitation off the Inbox and starts a sync without waiting for it', async () => {
    jest.mocked(syncNow).mockImplementation(() => new Promise(() => {}));

    await expect(joinList(db, client, ME, 'L-1')).resolves.toBe('joined');

    expect(respondInvite).toHaveBeenCalledWith(db, client, ME, 'L-1', 'join');
    expect(syncNow).toHaveBeenCalledWith(db);
    expect(useInboxStore.getState().items).toEqual([]);
  });

  it('a second join of the same list while the first runs (the other tab) shares it; a later one runs again', async () => {
    let finish: (v: boolean) => void = () => {};
    jest.mocked(respondInvite).mockImplementation(() => new Promise((resolve) => (finish = resolve)));

    const first = joinList(db, client, ME, 'L-1');
    const second = joinList(db, client, ME, 'L-1');
    finish(true);

    await expect(Promise.all([first, second])).resolves.toEqual(['joined', 'joined']);
    expect(respondInvite).toHaveBeenCalledTimes(1);
    expect(syncNow).toHaveBeenCalledTimes(1);

    jest.mocked(respondInvite).mockResolvedValue(true);
    await joinList(db, client, ME, 'L-1');
    expect(respondInvite).toHaveBeenCalledTimes(2);
  });

  it("a withdrawn invitation (NotAllowedError) is 'withdrawn', leaves the Inbox and syncs nothing", async () => {
    jest.mocked(respondInvite).mockRejectedValue(new NotAllowedError('This invitation was withdrawn.'));

    await expect(joinList(db, client, ME, 'L-1')).resolves.toBe('withdrawn');

    expect(useInboxStore.getState().items).toEqual([]);
    expect(syncNow).not.toHaveBeenCalled();
  });

  it("a server error or no session is 'failed', keeps the item and warns for the error", async () => {
    jest.mocked(respondInvite).mockRejectedValueOnce(new Error('offline'));
    await expect(joinList(db, client, ME, 'L-1')).resolves.toBe('failed');
    expect(warn).toHaveBeenCalledWith('[lists] joining failed:', 'offline');

    jest.mocked(respondInvite).mockResolvedValueOnce(false);
    await expect(joinList(db, client, ME, 'L-1')).resolves.toBe('failed');

    expect(useInboxStore.getState().items).toEqual([INVITE]);
    expect(syncNow).not.toHaveBeenCalled();
  });

  it('a sync that fails after the join only warns: the join stands', async () => {
    jest.mocked(syncNow).mockRejectedValue(new Error('offline'));

    await expect(joinList(db, client, ME, 'L-1')).resolves.toBe('joined');
    await Promise.resolve();

    expect(warn).toHaveBeenCalledWith('[lists] the sync after joining failed:', 'offline');
  });
});
