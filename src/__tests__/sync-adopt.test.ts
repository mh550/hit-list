// Adoption (S5-06): the first sign-in makes the phone's rows the account's and queues them; another account signing
// in removes the last one's rows first; Remove from this phone and Keep after Delete account (D38, D51, D66, D67).
import type { SQLiteDatabase } from 'expo-sqlite';
import { Directory, Paths } from 'expo-file-system';
import { createMigratedTestDb } from './helpers/node-sqlite-db';
import { fakeFs } from './helpers/fake-fs';
import { outboxOps } from './helpers/outbox';
import { createTestHitList, createTestMedia, createTestSpot } from './factories';
import {
  addSpotsToList,
  getAllMedia,
  getHitLists,
  getListMemberships,
  getSpots,
  insertHitList,
  insertMedia,
  insertSpot,
  softDeleteHitList,
} from '@/src/db';
import {
  countPending,
  enqueue,
  getCursor,
  getSyncState,
  markFailed,
  setCursor,
  setSyncState,
} from '@/src/db/sync';
import {
  adopt,
  deleteAccountAndRelease,
  releaseAccountData,
  removeLocalAccountData,
  removeReleasedRows,
} from '@/src/sync/adopt';
import { INITIAL_SYNC, useSyncStore } from '@/src/stores/sync-store';
import * as engine from '@/src/sync/engine';
import { useHitListsStore, useMediaStore, useSpotsStore } from '@/src/stores';

const A = 'rider-a';
const B = 'rider-b';

let db: SQLiteDatabase;

const photoPath = (spotId: string, mediaId: string) => `photos/${spotId}/${mediaId}.jpg`;
const photoUri = (spotId: string, mediaId: string) => `${Paths.document.uri}${photoPath(spotId, mediaId)}`;

/** A photo file on the fake phone, the way persistPhoto leaves it (its folder made, the bytes in it). */
function putPhoto(spotId: string, mediaId: string) {
  new Directory(Paths.document, 'photos', spotId).create({ intermediates: true, idempotent: true });
  fakeFs.__putFile(photoUri(spotId, mediaId), new Uint8Array([1, 2, 3]));
}

async function ownersOf(table: 'spots' | 'media' | 'hit_lists'): Promise<(string | null)[]> {
  const rows = await db.getAllAsync<{ owner_id: string | null }>(`SELECT owner_id FROM ${table} ORDER BY id`);
  return rows.map((r) => r.owner_id);
}

const count = async (table: string) =>
  (await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))!.n;

/** 3 spots, 4 photos, 2 lists, 3 memberships, none owned: a phone used before any sign-in. */
async function seedPhoneOnly() {
  for (const id of ['s1', 's2', 's3']) await insertSpot(db, createTestSpot({ id }));
  for (const [id, spot] of [['m1', 's1'], ['m2', 's1'], ['m3', 's2'], ['m4', 's3']]) {
    putPhoto(spot, id);
    await insertMedia(db, createTestMedia({ id, spot_id: spot, file_path: photoPath(spot, id) }));
  }
  await insertHitList(db, createTestHitList({ id: 'l1' }));
  await insertHitList(db, createTestHitList({ id: 'l2', name: 'Night' }));
  await addSpotsToList(db, 'l1', ['s1', 's2']);
  await addSpotsToList(db, 'l2', ['s3']);
}

/** Rows that came with account `uid` (pulled: owner and rev set, so nothing queues), with their photo files. */
async function seedOwnedBy(uid: string, prefix: string) {
  await insertSpot(db, createTestSpot({ id: `${prefix}-s1`, owner_id: uid }));
  await insertSpot(db, createTestSpot({ id: `${prefix}-s2`, owner_id: uid }));
  putPhoto(`${prefix}-s1`, `${prefix}-m1`);
  await insertMedia(
    db,
    createTestMedia({ id: `${prefix}-m1`, spot_id: `${prefix}-s1`, file_path: photoPath(`${prefix}-s1`, `${prefix}-m1`) }),
  );
  await insertHitList(db, createTestHitList({ id: `${prefix}-l1`, owner_id: uid }));
  await addSpotsToList(db, `${prefix}-l1`, [`${prefix}-s1`]);
  await db.runAsync('UPDATE spots SET rev = 1 WHERE owner_id = ?', uid);
  await db.runAsync('UPDATE media SET rev = 1 WHERE owner_id = ?', uid);
  await db.runAsync('UPDATE hit_lists SET rev = 1 WHERE owner_id = ?', uid);
  await db.runAsync('DELETE FROM sync_outbox'); // all of it reached the server
}

beforeEach(async () => {
  fakeFs.__resetFs();
  db = await createMigratedTestDb();
  useSpotsStore.setState({ spots: [] });
  useMediaStore.setState({ mediaBySpot: {} });
  useHitListsStore.setState({ lists: [], membershipBySpot: {} });
});

describe('adopt: the first sign-in', () => {
  it("makes every phone-only spot, photo and list the rider's and queues one upsert each, then the memberships", async () => {
    await seedPhoneOnly();

    await expect(adopt(db, A)).resolves.toBe('done');

    expect(await ownersOf('spots')).toEqual([A, A, A]);
    expect(await ownersOf('media')).toEqual([A, A, A, A]);
    expect(await ownersOf('hit_lists')).toEqual([A, A]);
    expect(await getSyncState(db, 'user_id')).toBe(A);
    const ops = await outboxOps(db);
    expect(ops).toHaveLength(9 + 3);
    expect(ops.every(([, , op]) => op === 'upsert')).toBe(true);
    expect(ops.slice(0, 3).map(([entity]) => entity)).toEqual(['spot', 'spot', 'spot']);
    expect(ops.slice(3, 7).map(([entity]) => entity)).toEqual(['media', 'media', 'media', 'media']);
    expect(ops.slice(7, 9).map(([entity]) => entity)).toEqual(['hit_list', 'hit_list']);
    expect(ops.slice(9).map(([, id]) => id).sort()).toEqual(['l1/s1', 'l1/s2', 'l2/s3']);
  });

  it('is idempotent: a second run queues nothing and changes nothing', async () => {
    await seedPhoneOnly();
    await adopt(db, A);
    const before = await outboxOps(db);

    await expect(adopt(db, A)).resolves.toBe('done');

    expect(await outboxOps(db)).toEqual(before);
    expect(await ownersOf('spots')).toEqual([A, A, A]);
  });

  it('adopts only the rows made since: a spot added while signed out after Keep', async () => {
    await seedPhoneOnly();
    await adopt(db, A);
    await db.runAsync('DELETE FROM sync_outbox');
    await insertSpot(db, createTestSpot({ id: 's4' }));

    await adopt(db, A);

    expect(await outboxOps(db)).toEqual([['spot', 's4', 'upsert']]);
  });

  it('leaves a deleted phone-only list alone (it never reaches the server)', async () => {
    await insertHitList(db, createTestHitList({ id: 'gone' }));
    await softDeleteHitList(db, 'gone', '2026-10-02T00:00:00.000Z');

    await adopt(db, A);

    expect(await ownersOf('hit_lists')).toEqual([null]);
    expect(await outboxOps(db)).toEqual([]);
  });

  it('is one transaction: a failure part way leaves every owner NULL, the outbox empty and no user_id', async () => {
    await seedPhoneOnly();
    // The lists' update fails after the spots and media were already updated.
    await db.runAsync(
      "CREATE TEMP TRIGGER fail_adopt BEFORE UPDATE OF owner_id ON hit_lists BEGIN SELECT RAISE(ABORT, 'disk full'); END",
    );

    await expect(adopt(db, A)).rejects.toThrow('disk full');

    expect(await ownersOf('spots')).toEqual([null, null, null]);
    expect(await ownersOf('media')).toEqual([null, null, null, null]);
    expect(await ownersOf('hit_lists')).toEqual([null, null]);
    expect(await count('sync_outbox')).toBe(0);
    expect(await getSyncState(db, 'user_id')).toBeUndefined();
  });

  it("leaves a spot deleted before sign-in phone-only: its photos never upload, its memberships never queue", async () => {
    await insertSpot(db, createTestSpot({ id: 'live' }));
    await insertSpot(db, createTestSpot({ id: 'gone', deleted_at: '2026-10-02T00:00:00.000Z' }));
    putPhoto('gone', 'gm');
    await insertMedia(db, createTestMedia({ id: 'gm', spot_id: 'gone', file_path: photoPath('gone', 'gm') }));
    await insertHitList(db, createTestHitList({ id: 'l1' }));
    await addSpotsToList(db, 'l1', ['live', 'gone']);

    await adopt(db, A);

    expect(await db.getAllAsync('SELECT id, owner_id FROM spots ORDER BY id')).toEqual([
      { id: 'gone', owner_id: null },
      { id: 'live', owner_id: A },
    ]);
    expect(await ownersOf('media')).toEqual([null]);
    expect(await outboxOps(db)).toEqual([
      ['spot', 'live', 'upsert'],
      ['hit_list', 'l1', 'upsert'],
      ['hit_list_spot', 'l1/live', 'upsert'],
    ]);
    // and nothing left to adopt: a second run writes nothing
    await db.runAsync('DELETE FROM sync_outbox');
    await adopt(db, A);
    expect(await outboxOps(db)).toEqual([]);
  });

  it('leaves a deleted photo of a live spot phone-only', async () => {
    await insertSpot(db, createTestSpot({ id: 's1' }));
    await insertMedia(db, createTestMedia({ id: 'm1', spot_id: 's1', file_path: photoPath('s1', 'm1') }));
    await db.runAsync("UPDATE media SET deleted_at = '2026-10-02T00:00:00.000Z' WHERE id = 'm1'");

    await adopt(db, A);

    expect(await ownersOf('media')).toEqual([null]);
    expect(await outboxOps(db)).toEqual([['spot', 's1', 'upsert']]);
  });

  it('a store reload that fails after the commit still resolves done (the phone is adopted)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const reload = jest.spyOn(engine, 'reloadStores').mockRejectedValueOnce(new Error('locked'));
    await seedPhoneOnly();

    await expect(adopt(db, A)).resolves.toBe('done');

    expect(await getSyncState(db, 'user_id')).toBe(A);
    expect(warn).toHaveBeenCalled();
    reload.mockRestore();
    warn.mockRestore();
  });

  it('reloads the stores, so the screens carry the owner', async () => {
    await seedPhoneOnly();

    await adopt(db, A);

    expect(useSpotsStore.getState().spots.map((s) => s.owner_id)).toEqual([A, A, A]);
    expect(useHitListsStore.getState().lists).toHaveLength(2);
    expect(Object.values(useMediaStore.getState().mediaBySpot).flat()).toHaveLength(4);
  });
});

describe('adopt: another account signs in', () => {
  it("removes the last account's spots, photos (and their files), lists and memberships, resets the cursors, then adopts", async () => {
    await setSyncState(db, 'user_id', A);
    await seedOwnedBy(A, 'a');
    await setCursor(db, 'spots', 40);
    await setCursor(db, 'hit_list_spots', 7);
    await insertSpot(db, createTestSpot({ id: 'mine' })); // phone-only: stays, adopted by B
    expect(fakeFs.__fileExists(photoUri('a-s1', 'a-m1'))).toBe(true);

    await expect(adopt(db, B)).resolves.toBe('done');

    expect((await getSpots(db)).map((s) => [s.id, s.owner_id])).toEqual([['mine', B]]);
    expect(await getAllMedia(db)).toEqual([]);
    expect(await getHitLists(db)).toEqual([]);
    expect(await getListMemberships(db)).toEqual({});
    expect(await count('hit_list_spots')).toBe(0);
    expect(fakeFs.__fileExists(photoUri('a-s1', 'a-m1'))).toBe(false);
    expect(await getCursor(db, 'spots')).toBe(0);
    expect(await getCursor(db, 'hit_list_spots')).toBe(0);
    expect(await getSyncState(db, 'user_id')).toBe(B);
    // Nothing of A's was queued as a delete (that would remove A's data on the server): only B's adoption.
    expect(await outboxOps(db)).toEqual([['spot', 'mine', 'upsert']]);
    expect(useSpotsStore.getState().spots.map((s) => s.id)).toEqual(['mine']);
  });

  it('keeps a phone-only list that held one of the last account\'s spots, without that membership', async () => {
    await setSyncState(db, 'user_id', A);
    await seedOwnedBy(A, 'a');
    await insertHitList(db, createTestHitList({ id: 'phone-list' }));
    await addSpotsToList(db, 'phone-list', ['a-s2']);

    await adopt(db, B);

    expect((await getHitLists(db)).map((l) => [l.id, l.owner_id])).toEqual([['phone-list', B]]);
    expect(await count('hit_list_spots')).toBe(0);
  });

  it("with the last account's changes still waiting, asks first and changes nothing", async () => {
    await setSyncState(db, 'user_id', A);
    await seedOwnedBy(A, 'a');
    await enqueue(db, 'spot', 'a-s1', 'upsert');
    await markFailed(db, 1, 'offline');

    await expect(adopt(db, B)).resolves.toBe('needs_confirm');

    expect(await getSyncState(db, 'user_id')).toBe(A);
    expect(await count('spots')).toBe(2);
    expect(await countPending(db)).toBe(1);
    expect(fakeFs.__fileExists(photoUri('a-s1', 'a-m1'))).toBe(true);
  });

  it('with confirmSwitch, removes them anyway (Remove and continue)', async () => {
    await setSyncState(db, 'user_id', A);
    await seedOwnedBy(A, 'a');
    await enqueue(db, 'spot', 'a-s1', 'upsert');

    await expect(adopt(db, B, { confirmSwitch: true })).resolves.toBe('done');

    expect(await count('spots')).toBe(0);
    expect(await countPending(db)).toBe(0);
    expect(await getSyncState(db, 'user_id')).toBe(B);
  });

  it("clears the last account's 'Backed up' time (its rows are gone from this phone)", async () => {
    await setSyncState(db, 'user_id', A);
    await setSyncState(db, `last_sync_at:${A}`, '2026-10-22T10:00:00.000Z');

    await adopt(db, B);

    expect(await getSyncState(db, `last_sync_at:${A}`)).toBeUndefined();
  });

  it('the same account signing back in after Keep removes nothing', async () => {
    await setSyncState(db, 'user_id', A);
    await seedOwnedBy(A, 'a');
    await setCursor(db, 'spots', 40);

    await adopt(db, A);

    expect(await count('spots')).toBe(2);
    expect(await getCursor(db, 'spots')).toBe(40);
    expect(fakeFs.__fileExists(photoUri('a-s1', 'a-m1'))).toBe(true);
  });
});

describe('removeLocalAccountData: Remove from this phone', () => {
  it("deletes the account's rows and photo files, clears the outbox and sync state, keeps phone-only spots", async () => {
    await setSyncState(db, 'user_id', A);
    await seedOwnedBy(A, 'a');
    await setCursor(db, 'media', 9);
    await setSyncState(db, `last_sync_at:${A}`, '2026-10-22T10:00:00.000Z');
    await insertSpot(db, createTestSpot({ id: 'phone' }));

    await expect(removeLocalAccountData(db, A)).resolves.toBe(true);

    expect((await getSpots(db)).map((s) => s.id)).toEqual(['phone']);
    expect(await count('media')).toBe(0);
    expect(await count('hit_lists')).toBe(0);
    expect(await count('hit_list_spots')).toBe(0);
    expect(await count('sync_outbox')).toBe(0);
    expect(await count('sync_state')).toBe(0);
    expect(fakeFs.__fileExists(photoUri('a-s1', 'a-m1'))).toBe(false);
    expect(useSpotsStore.getState().spots.map((s) => s.id)).toEqual(['phone']);
  });

  it('removes nothing while a change still waits to be backed up', async () => {
    await setSyncState(db, 'user_id', A);
    await seedOwnedBy(A, 'a');
    await enqueue(db, 'spot', 'a-s1', 'upsert');

    await expect(removeLocalAccountData(db, A)).resolves.toBe(false);

    expect(await count('spots')).toBe(2);
    expect(await getSyncState(db, 'user_id')).toBe(A);
    expect(fakeFs.__fileExists(photoUri('a-s1', 'a-m1'))).toBe(true);
  });

  it('new spots get no owner from the moment the rows go (before the sign-out finishes)', async () => {
    useSyncStore.setState({ adoptedUserId: A });
    await setSyncState(db, 'user_id', A);

    await removeLocalAccountData(db, A);

    expect(useSyncStore.getState().adoptedUserId).toBeNull();
    useSyncStore.setState(INITIAL_SYNC);
  });

  it('with discardPending (the account is already deleted) removes them anyway', async () => {
    await setSyncState(db, 'user_id', A);
    await seedOwnedBy(A, 'a');
    await enqueue(db, 'spot', 'a-s1', 'upsert');

    await expect(removeLocalAccountData(db, A, { discardPending: true })).resolves.toBe(true);

    expect(await count('spots')).toBe(0);
    expect(await count('sync_outbox')).toBe(0);
  });
});

describe('releaseAccountData: Keep after Delete account (D67)', () => {
  it('makes the account\'s rows phone-only again, drops photos never downloaded, clears outbox, cursors and user_id', async () => {
    await setSyncState(db, 'user_id', A);
    await seedOwnedBy(A, 'a');
    // A second photo that reached this phone only as a row (its file is on another phone).
    await insertMedia(db, createTestMedia({ id: 'a-m2', spot_id: 'a-s2', file_path: photoPath('a-s2', 'a-m2') }));
    await db.runAsync("UPDATE spots SET primary_photo_id = 'a-m2' WHERE id = 'a-s2'");
    await enqueue(db, 'spot', 'a-s1', 'upsert');
    await setCursor(db, 'spots', 12);

    await releaseAccountData(db, A);

    expect(await ownersOf('spots')).toEqual([null, null]);
    expect((await getAllMedia(db)).map((m) => [m.id, m.owner_id])).toEqual([['a-m1', undefined]]);
    expect(await ownersOf('hit_lists')).toEqual([null]);
    expect(await db.getAllAsync('SELECT rev FROM spots WHERE rev IS NOT NULL')).toEqual([]);
    expect((await getSpots(db)).find((s) => s.id === 'a-s2')?.primary_photo_id).toBeUndefined();
    expect(await getListMemberships(db)).toEqual({ 'a-s1': ['a-l1'] });
    expect(await count('sync_outbox')).toBe(0);
    expect(await getCursor(db, 'spots')).toBe(0);
    expect(await getSyncState(db, 'user_id')).toBeUndefined();
    expect(fakeFs.__fileExists(photoUri('a-s1', 'a-m1'))).toBe(true);
  });

  it('returns the released spots and lists; removeReleasedRows then removes just those, with their photo files', async () => {
    useSyncStore.setState({ adoptedUserId: A });
    await setSyncState(db, 'user_id', A);
    await seedOwnedBy(A, 'a');
    await insertSpot(db, createTestSpot({ id: 'phone' }));

    const released = await releaseAccountData(db, A);
    expect(useSyncStore.getState().adoptedUserId).toBeNull();
    expect(released).toEqual({ spotIds: ['a-s1', 'a-s2'], listIds: ['a-l1'] });

    await removeReleasedRows(db, released);

    expect((await getSpots(db)).map((s) => s.id)).toEqual(['phone']);
    expect(await count('media')).toBe(0);
    expect(await count('hit_lists')).toBe(0);
    expect(await count('hit_list_spots')).toBe(0);
    expect(await count('sync_outbox')).toBe(0);
    expect(fakeFs.__fileExists(photoUri('a-s1', 'a-m1'))).toBe(false);
    expect(useSpotsStore.getState().spots.map((s) => s.id)).toEqual(['phone']);
    useSyncStore.setState(INITIAL_SYNC);
  });

  it("removes another account's rows that came with this one (a share, S8), keeping none of them", async () => {
    await setSyncState(db, 'user_id', A);
    await seedOwnedBy(A, 'a');
    await insertSpot(db, createTestSpot({ id: 'theirs', owner_id: 'rider-c' }));

    await releaseAccountData(db, A);

    expect((await getSpots(db)).map((s) => s.id).sort()).toEqual(['a-s1', 'a-s2']);
  });

  it('a later sign-in adopts the released rows like any phone-only spot', async () => {
    await setSyncState(db, 'user_id', A);
    await seedOwnedBy(A, 'a');
    await releaseAccountData(db, A);

    await adopt(db, B);

    expect(await ownersOf('spots')).toEqual([B, B]);
    expect((await outboxOps(db)).filter(([entity]) => entity === 'hit_list_spot')).toEqual([
      ['hit_list_spot', 'a-l1/a-s1', 'upsert'],
    ]);
  });
});

describe('deleteAccountAndRelease: Delete account on the sync queue (S5-09 review)', () => {
  it('waits for a running sync, and nothing queued after it runs between the server delete and the release', async () => {
    await setSyncState(db, 'user_id', A);
    await seedOwnedBy(A, 'a');
    let finishSync!: () => void;
    const running = engine.runExclusive(() => new Promise<void>((resolve) => (finishSync = resolve)));
    const order: string[] = [];
    const deleteServer = jest.fn(async () => {
      order.push('server delete');
      return true;
    });

    const deleting = deleteAccountAndRelease(db, A, deleteServer);
    // A sync the timer queues while the delete waits: it must not pull between the delete and the release.
    const queuedSync = engine.runExclusive(async () => {
      order.push(`next task sees user_id ${String(await getSyncState(db, 'user_id'))}`);
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(deleteServer).not.toHaveBeenCalled();

    finishSync();
    await running;
    const result = await deleting;
    await queuedSync;

    expect(result).toEqual({ deleted: true, released: { spotIds: ['a-s1', 'a-s2'], listIds: ['a-l1'] } });
    expect(order).toEqual(['server delete', 'next task sees user_id undefined']);
    expect(await ownersOf('spots')).toEqual([null, null]);
    expect(await getListMemberships(db)).toEqual({ 'a-s1': ['a-l1'] });
  });

  it('a server delete that fails releases nothing', async () => {
    await setSyncState(db, 'user_id', A);
    await seedOwnedBy(A, 'a');

    expect(await deleteAccountAndRelease(db, A, async () => false)).toEqual({ deleted: false });

    expect(await ownersOf('spots')).toEqual([A, A]);
    expect(await getSyncState(db, 'user_id')).toBe(A);
  });

  it('a release that fails after the delete warns and still reports the account deleted', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await setSyncState(db, 'user_id', A);
    await seedOwnedBy(A, 'a');
    await db.runAsync(
      "CREATE TEMP TRIGGER fail_release BEFORE UPDATE OF owner_id ON hit_lists BEGIN SELECT RAISE(ABORT, 'disk full'); END",
    );

    expect(await deleteAccountAndRelease(db, A, async () => true)).toEqual({ deleted: true, released: null });

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
