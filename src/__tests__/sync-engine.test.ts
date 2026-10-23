import type { SQLiteDatabase } from 'expo-sqlite';
import { createMigratedTestDb } from './helpers/node-sqlite-db';
import { createFakeSupabase, fakeSession, type FakeSupabase } from './helpers/fake-supabase';
import { ME, adoptPhoneFor } from './helpers/outbox';
import { createTestHitList, createTestMedia, createTestSpot } from './factories';

let mockFake: FakeSupabase | null = null;
jest.mock('@/src/sync/client', () => ({
  getSupabase: () => mockFake,
  isConfigured: () => mockFake !== null,
}));
jest.mock('@/src/sync/push', () => ({ push: jest.fn() }));
jest.mock('@/src/sync/pull', () => ({ pull: jest.fn() }));
jest.mock('@/src/sync/photos', () => ({ ...jest.requireActual('@/src/sync/photos'), downloadMissingPhotos: jest.fn() }));

import * as dbModule from '@/src/db';
import { addSpotsToList, insertHitList, insertMedia, insertSpot } from '@/src/db';
import { enqueue, getSyncState, setSyncState } from '@/src/db/sync';
import { push } from '@/src/sync/push';
import { pull } from '@/src/sync/pull';
import { downloadMissingPhotos } from '@/src/sync/photos';
import { runExclusive, syncNow } from '@/src/sync/engine';
import { INITIAL_SYNC, useSyncStore } from '@/src/stores/sync-store';
import { useHitListsStore, useMediaStore, useSpotsStore } from '@/src/stores';

const mockPush = jest.mocked(push);
const mockPull = jest.mocked(pull);
const mockDownload = jest.mocked(downloadMissingPhotos);

let db: SQLiteDatabase;

beforeEach(async () => {
  db = await createMigratedTestDb();
  await adoptPhoneFor(db, ME);
  mockFake = createFakeSupabase({ session: fakeSession({ userId: ME }) });
  mockPush.mockReset().mockResolvedValue({ pushed: 0, failed: 0 });
  mockPull.mockReset().mockResolvedValue({ changed: false });
  mockDownload.mockReset().mockResolvedValue(0);
  useSyncStore.setState(INITIAL_SYNC);
  useSpotsStore.setState({ spots: [] });
  useMediaStore.setState({ mediaBySpot: {} });
  useHitListsStore.setState({ lists: [], membershipBySpot: {} });
});

describe('syncNow', () => {
  it('runs push, then pull, then the photo downloads, as the session rider', async () => {
    await syncNow(db);

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(db, mockFake, ME);
    expect(mockPull).toHaveBeenCalledWith(db, mockFake, ME);
    expect(mockDownload).toHaveBeenCalledWith(db, mockFake, ME);
    const [pushOrder] = mockPush.mock.invocationCallOrder;
    const [pullOrder] = mockPull.mock.invocationCallOrder;
    const [downloadOrder] = mockDownload.mock.invocationCallOrder;
    expect(pushOrder).toBeLessThan(pullOrder);
    expect(pullOrder).toBeLessThan(downloadOrder);
  });

  it('is single-flight: a second call while one runs awaits the same sync', async () => {
    let releasePush!: () => void;
    mockPush.mockImplementationOnce(
      () => new Promise((resolve) => (releasePush = () => resolve({ pushed: 1, failed: 0 }))),
    );

    const first = syncNow(db);
    const second = syncNow(db);
    await new Promise((r) => setImmediate(r));
    expect(useSyncStore.getState().syncing).toBe(true);
    releasePush();
    await Promise.all([first, second]);

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPull).toHaveBeenCalledTimes(1);
    expect(useSyncStore.getState().syncing).toBe(false);

    // finished: the next call is a new sync
    await syncNow(db);
    expect(mockPush).toHaveBeenCalledTimes(2);
  });

  it('reloads the spots, media and hit-lists stores after a pull that changed rows', async () => {
    const spot = createTestSpot({ id: 'spot-1', name: 'Courthouse rail' });
    await insertSpot(db, spot);
    await insertMedia(db, createTestMedia({ id: 'media-1', spot_id: 'spot-1' }));
    await insertHitList(db, createTestHitList({ id: 'list-1', name: 'Downtown' }));
    await addSpotsToList(db, 'list-1', ['spot-1']);
    mockPull.mockResolvedValueOnce({ changed: true });

    await syncNow(db);

    expect(useSpotsStore.getState().spots.map((s) => s.name)).toEqual(['Courthouse rail']);
    expect(useMediaStore.getState().mediaBySpot['spot-1']?.map((m) => m.id)).toEqual(['media-1']);
    expect(useHitListsStore.getState().lists.map((l) => l.name)).toEqual(['Downtown']);
    expect(useHitListsStore.getState().membershipBySpot).toEqual({ 'spot-1': ['list-1'] });
  });

  it('leaves the stores alone when the pull changed nothing', async () => {
    await insertSpot(db, createTestSpot({ id: 'spot-1' }));

    await syncNow(db);

    expect(useSpotsStore.getState().spots).toEqual([]);
  });

  it('records lastSyncAt (kept per rider in sync_state), the rider and no error after a sync that went through', async () => {
    const before = Date.now();

    await syncNow(db);

    const state = useSyncStore.getState();
    expect(state.userId).toBe(ME);
    expect(state.syncing).toBe(false);
    expect(state.failedCount).toBe(0);
    expect(state.lastError).toBeNull();
    expect(Date.parse(state.lastSyncAt ?? '')).toBeGreaterThanOrEqual(before);
    // kept on the phone, so a relaunch still knows when it last backed up
    expect(await getSyncState(db, `last_sync_at:${ME}`)).toBe(state.lastSyncAt);
  });

  it('records failedCount from countFailed; rows still waiting mean not backed up', async () => {
    for (const id of ['a', 'b', 'c']) await enqueue(db, 'spot', id, 'upsert');
    await db.runAsync("UPDATE sync_outbox SET attempts = 10 WHERE entity_id IN ('a', 'b')");

    await syncNow(db);

    const state = useSyncStore.getState();
    expect(state.failedCount).toBe(2);
    expect(state.lastSyncAt).toBeNull();
    expect(state.lastError).not.toBeNull();
  });

  it('a change saved while the sync runs does not stop it counting as a backup', async () => {
    mockPull.mockImplementationOnce(async () => {
      await enqueue(db, 'spot', 'saved-meanwhile', 'upsert');
      return { changed: false };
    });

    await syncNow(db);

    expect(useSyncStore.getState().lastSyncAt).not.toBeNull();
  });

  it('a session that ended during the sync is not a backup (push and pull quietly did nothing)', async () => {
    mockPush.mockImplementationOnce(async () => {
      await mockFake!.auth.signOut();
      return { pushed: 0, failed: 0 };
    });

    await syncNow(db);

    expect(useSyncStore.getState().lastSyncAt).toBeNull();
    expect(await getSyncState(db, `last_sync_at:${ME}`)).toBeUndefined();
  });

  it('a reload never overwrites a local change made while it read the DB: it reads again', async () => {
    await insertSpot(db, createTestSpot({ id: 'spot-1', name: 'Courthouse rail' }));
    mockPull.mockResolvedValueOnce({ changed: true });
    const realGetSpots = dbModule.getSpots;
    const getSpotsSpy = jest.spyOn(dbModule, 'getSpots').mockImplementationOnce(async (d) => {
      const stale = await realGetSpots(d);
      // the rider saves a spot now: the action hook puts it in the store, then in the DB
      const added = createTestSpot({ id: 'spot-2', name: 'Saved meanwhile' });
      useSpotsStore.getState().addSpot(added);
      await insertSpot(db, added);
      return stale;
    });

    await syncNow(db);

    expect(getSpotsSpy).toHaveBeenCalledTimes(2);
    expect(useSpotsStore.getState().spots.map((s) => s.id).sort()).toEqual(['spot-1', 'spot-2']);
  });

  it('shows the stored lastSyncAt of this rider before a sync that fails', async () => {
    await setSyncState(db, `last_sync_at:${ME}`, '2026-10-22T12:00:00.000Z');
    await setSyncState(db, 'last_sync_at:rider-other', '2026-10-23T12:00:00.000Z');
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockPull.mockRejectedValueOnce(new Error('offline'));

    await syncNow(db);

    expect(useSyncStore.getState().lastSyncAt).toBe('2026-10-22T12:00:00.000Z');
    expect(useSyncStore.getState().lastError).toBe('offline');
  });

  it('with no session resolves without push or pull', async () => {
    mockFake = createFakeSupabase({ session: null });

    await syncNow(db);

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockPull).not.toHaveBeenCalled();
    expect(mockDownload).not.toHaveBeenCalled();
    expect(useSyncStore.getState().syncing).toBe(false);
  });

  it('with no Supabase in this build resolves without push or pull', async () => {
    mockFake = null;

    await syncNow(db);

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockPull).not.toHaveBeenCalled();
  });

  it("does nothing while the phone's rows are not this rider's (sync_state.user_id ≠ session uid)", async () => {
    await setSyncState(db, 'user_id', 'rider-other');

    await syncNow(db);
    await setSyncState(db, 'user_id', null);
    await syncNow(db);

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockPull).not.toHaveBeenCalled();
  });

  it('catches an exception inside push with console.warn, still pulls, and records lastError', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error');
    mockPush.mockRejectedValueOnce(new Error('network down'));

    await expect(syncNow(db)).resolves.toBeUndefined();

    expect(mockPull).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    const state = useSyncStore.getState();
    expect(state.lastError).toBe('network down');
    expect(state.lastSyncAt).toBeNull(); // not backed up: the push did not finish
    expect(state.syncing).toBe(false);
  });

  it('a pull that could not read a table (offline) is not a backup: lastSyncAt stays', async () => {
    mockPull.mockResolvedValueOnce({ changed: false, failed: true });

    await syncNow(db);

    expect(useSyncStore.getState().lastSyncAt).toBeNull();
    expect(useSyncStore.getState().lastError).not.toBeNull();
    expect(await getSyncState(db, `last_sync_at:${ME}`)).toBeUndefined();
  });

  it('a push with rows that failed is not a backup either', async () => {
    mockPush.mockResolvedValueOnce({ pushed: 1, failed: 2 });

    await syncNow(db);

    expect(useSyncStore.getState().lastSyncAt).toBeNull();
    expect(useSyncStore.getState().lastError).not.toBeNull();
  });

  it('a later sync that goes through clears lastError', async () => {
    mockPush.mockResolvedValueOnce({ pushed: 0, failed: 1 });
    await syncNow(db);

    await syncNow(db);

    expect(useSyncStore.getState().lastError).toBeNull();
    expect(useSyncStore.getState().lastSyncAt).not.toBeNull();
  });

  it('a failed photo download warns and still finishes the sync', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockDownload.mockRejectedValueOnce(new Error('storage down'));

    await syncNow(db);

    expect(warn).toHaveBeenCalled();
    expect(useSyncStore.getState().syncing).toBe(false);
  });
});

describe('syncNow while a sync runs', () => {
  it('a call after the running sync has started gets one more sync after it (Retry, pull-to-refresh)', async () => {
    let releasePush!: () => void;
    mockPush.mockImplementationOnce(
      () => new Promise((resolve) => (releasePush = () => resolve({ pushed: 0, failed: 0 }))),
    );

    const first = syncNow(db);
    await new Promise((r) => setImmediate(r));
    expect(mockPush).toHaveBeenCalledTimes(1);
    const second = syncNow(db);
    const third = syncNow(db);
    releasePush();
    await Promise.all([first, second, third]);

    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPull).toHaveBeenCalledTimes(2);
    expect(useSyncStore.getState().syncing).toBe(false);
  });
});

describe('runExclusive', () => {
  it('a task may ask for a sync without awaiting it: the sync runs after the task', async () => {
    const order: string[] = [];
    mockPush.mockImplementation(async () => {
      order.push('push');
      return { pushed: 0, failed: 0 };
    });

    let asked!: Promise<void>;
    await runExclusive(async () => {
      asked = syncNow(db);
      order.push('task');
    });
    await asked;

    expect(order).toEqual(['task', 'push']);
  });

  it('never overlaps a sync: a task queued while one runs starts after it, and a sync asked during the task waits', async () => {
    const order: string[] = [];
    let releasePush!: () => void;
    mockPush.mockImplementationOnce(async () => {
      order.push('push');
      await new Promise<void>((resolve) => (releasePush = resolve));
      return { pushed: 0, failed: 0 };
    });
    mockPull.mockImplementation(async () => {
      order.push('pull');
      return { changed: false };
    });

    const sync = syncNow(db);
    const task = runExclusive(async () => {
      order.push('task');
      return 7;
    });
    await new Promise((r) => setImmediate(r));
    releasePush();

    await expect(task).resolves.toBe(7);
    await sync;
    expect(order).toEqual(['push', 'pull', 'task']);
  });

  it('a failing task rejects its caller and does not block the next sync', async () => {
    await expect(runExclusive(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');

    await syncNow(db);

    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});
