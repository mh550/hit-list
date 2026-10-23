import type { SQLiteDatabase } from 'expo-sqlite';
import { createMigratedTestDb } from './helpers/node-sqlite-db';
import { addSpotsToList, insertHitList, insertSpot, softDeleteHitList } from '@/src/db';
import {
  adoptableMemberships,
  clearOutbox,
  countFailed,
  countPending,
  enqueue,
  confirmedListKey,
  enqueueMemberships,
  forgetAccount,
  getCursor,
  getSyncState,
  lastOutboxId,
  markDone,
  markFailed,
  parkRow,
  peekOutbox,
  resetCursors,
  resetFailed,
  setCursor,
  setSyncState,
} from '@/src/db/sync';
import { createTestHitList, createTestSpot } from './factories';

/** Sets a row's attempts directly (markFailed n times, without the loop). */
const setAttempts = (db: SQLiteDatabase, id: number, attempts: number) =>
  db.runAsync('UPDATE sync_outbox SET attempts = ? WHERE id = ?', attempts, id);

describe('src/db/sync.ts: the outbox and sync state (real SQLite)', () => {
  let db: SQLiteDatabase;

  beforeEach(async () => {
    db = await createMigratedTestDb();
  });

  describe('outbox', () => {
    it('enqueue then peekOutbox returns the rows in id order with attempts 0', async () => {
      await enqueue(db, 'spot', 's1', 'upsert', '2026-10-23T01:00:00.000Z');
      await enqueue(db, 'media', 'm1', 'upsert', '2026-10-23T01:00:01.000Z');
      await enqueue(db, 'spot', 's1', 'delete', '2026-10-23T01:00:02.000Z');

      const rows = await peekOutbox(db, 50);

      expect(rows.map((r) => [r.entity, r.entity_id, r.op])).toEqual([
        ['spot', 's1', 'upsert'],
        ['media', 'm1', 'upsert'],
        ['spot', 's1', 'delete'],
      ]);
      expect(rows[0]).toEqual({
        id: expect.any(Number),
        entity: 'spot',
        entity_id: 's1',
        op: 'upsert',
        created_at: '2026-10-23T01:00:00.000Z',
        attempts: 0,
        last_error: undefined,
      });
      expect(rows[0].id).toBeLessThan(rows[1].id);
      expect(rows[1].id).toBeLessThan(rows[2].id);
    });

    it('enqueue stamps created_at with an ISO time when none is given', async () => {
      await enqueue(db, 'hit_list', 'L', 'upsert');

      const [row] = await peekOutbox(db, 50);

      expect(row.created_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    });

    it('peekOutbox honours the limit', async () => {
      for (const id of ['a', 'b', 'c']) await enqueue(db, 'spot', id, 'upsert');

      expect((await peekOutbox(db, 2)).map((r) => r.entity_id)).toEqual(['a', 'b']);
    });

    it('markDone deletes the row', async () => {
      await enqueue(db, 'spot', 'a', 'upsert');
      await enqueue(db, 'spot', 'b', 'upsert');
      const [first] = await peekOutbox(db, 50);

      await markDone(db, first.id);

      expect((await peekOutbox(db, 50)).map((r) => r.entity_id)).toEqual(['b']);
    });

    it('markFailed increments attempts and stores last_error', async () => {
      await enqueue(db, 'spot', 'a', 'upsert');
      const [row] = await peekOutbox(db, 50);

      await markFailed(db, row.id, 'network down');
      await markFailed(db, row.id, 'timeout');

      expect((await peekOutbox(db, 50))[0]).toMatchObject({ attempts: 2, last_error: 'timeout' });
    });

    it('peekOutbox skips rows with attempts ≥ 3 when skipFailed is true, and returns them otherwise', async () => {
      for (const id of ['a', 'b', 'c']) await enqueue(db, 'spot', id, 'upsert');
      const [a, b] = await peekOutbox(db, 50);
      await setAttempts(db, a.id, 3);
      await setAttempts(db, b.id, 2);

      expect((await peekOutbox(db, 50, { skipFailed: true })).map((r) => r.entity_id)).toEqual(['b', 'c']);
      expect((await peekOutbox(db, 50)).map((r) => r.entity_id)).toEqual(['a', 'b', 'c']);
    });

    it('peekOutbox minAttempts/maxAttempts selects the window min ≤ attempts < max (the backoff pass)', async () => {
      for (const id of ['a', 'b', 'c', 'd']) await enqueue(db, 'spot', id, 'upsert');
      const [a, b, c] = await peekOutbox(db, 50);
      await setAttempts(db, a.id, 2);
      await setAttempts(db, b.id, 3);
      await setAttempts(db, c.id, 10);

      expect((await peekOutbox(db, 50, { minAttempts: 3, maxAttempts: 10 })).map((r) => r.entity_id)).toEqual([
        'b',
      ]);
    });

    it('peekOutbox afterId pages past the rows already seen (a failed backoff row stays in the window)', async () => {
      for (const id of ['a', 'b', 'c']) await enqueue(db, 'spot', id, 'upsert');
      const [a] = await peekOutbox(db, 50);

      expect((await peekOutbox(db, 50, { afterId: a.id })).map((r) => r.entity_id)).toEqual(['b', 'c']);
      expect((await peekOutbox(db, 1, { afterId: a.id })).map((r) => r.entity_id)).toEqual(['b']);
    });

    it('countFailed counts rows with attempts ≥ 10; countPending counts every row', async () => {
      for (const id of ['a', 'b', 'c']) await enqueue(db, 'spot', id, 'upsert');
      const [a, b] = await peekOutbox(db, 50);
      await setAttempts(db, a.id, 10);
      await setAttempts(db, b.id, 9);

      expect(await countFailed(db)).toBe(1);
      expect(await countPending(db)).toBe(3);
    });

    it('lastOutboxId is the newest row id (0 when empty); countPending(upToId) counts only rows up to it', async () => {
      expect(await lastOutboxId(db)).toBe(0);
      for (const id of ['a', 'b']) await enqueue(db, 'spot', id, 'upsert');
      const upTo = await lastOutboxId(db);
      await enqueue(db, 'spot', 'c', 'upsert');

      expect(upTo).toBe((await peekOutbox(db, 50))[1].id);
      expect(await countPending(db, upTo)).toBe(2);
      expect(await countPending(db)).toBe(3);
      await clearOutbox(db);
      // AUTOINCREMENT: ids are never reused, so a row queued later is always above upTo
      await enqueue(db, 'spot', 'd', 'upsert');
      expect(await countPending(db, upTo)).toBe(0);
    });

    it('parkRow keeps the row with its error but out of peekOutbox, countPending and countFailed', async () => {
      await enqueue(db, 'media', 'm1', 'upsert');
      await enqueue(db, 'spot', 's1', 'upsert');
      const [m] = await peekOutbox(db, 50);
      await setAttempts(db, m.id, 10);

      await parkRow(db, m.id, 'photo missing');

      expect((await peekOutbox(db, 50)).map((r) => r.entity_id)).toEqual(['s1']);
      expect(await countPending(db)).toBe(1);
      expect(await countFailed(db)).toBe(0);
      expect(
        await db.getFirstAsync('SELECT parked, last_error FROM sync_outbox WHERE id = ?', m.id),
      ).toEqual({ parked: 1, last_error: 'photo missing' });
    });

    it('resetFailed puts rows with attempts ≥ 10 back to 0 without an error, and leaves the others alone', async () => {
      for (const id of ['a', 'b']) await enqueue(db, 'spot', id, 'upsert');
      const [a, b] = await peekOutbox(db, 50);
      await markFailed(db, a.id, 'x');
      await setAttempts(db, a.id, 12);
      await markFailed(db, b.id, 'y');

      await resetFailed(db);

      expect((await peekOutbox(db, 50)).map((r) => [r.entity_id, r.attempts, r.last_error])).toEqual([
        ['a', 0, undefined],
        ['b', 1, 'y'],
      ]);
      expect(await countFailed(db)).toBe(0);
    });

    it('clearOutbox deletes every row, parked ones too', async () => {
      await enqueue(db, 'spot', 'a', 'upsert');
      await enqueue(db, 'spot', 'b', 'upsert');
      await parkRow(db, (await peekOutbox(db, 1))[0].id, 'x');

      await clearOutbox(db);

      expect(await db.getFirstAsync('SELECT COUNT(*) AS n FROM sync_outbox')).toEqual({ n: 0 });
    });

    it("rejects an op that is not 'upsert' or 'delete' (CHECK constraint)", async () => {
      await expect(
        db.runAsync(
          "INSERT INTO sync_outbox (entity, entity_id, op, created_at) VALUES ('spot', 'a', 'create', 'x')",
        ),
      ).rejects.toThrow();
    });
  });

  describe('memberships for adoption', () => {
    it("adoptableMemberships lists 'list/spot' of live lists where the list or the spot has no owner yet", async () => {
      const own = createTestSpot({ owner_id: 'u1' });
      const loose = createTestSpot();
      for (const s of [own, loose]) await insertSpot(db, s);
      const ownList = createTestHitList({ owner_id: 'u1' });
      const looseList = createTestHitList();
      const goneList = createTestHitList();
      for (const l of [ownList, looseList, goneList]) await insertHitList(db, l);
      await addSpotsToList(db, ownList.id, [own.id, loose.id]);
      await addSpotsToList(db, looseList.id, [own.id]);
      await addSpotsToList(db, goneList.id, [loose.id]);
      await softDeleteHitList(db, goneList.id);

      expect((await adoptableMemberships(db)).sort()).toEqual(
        [`${ownList.id}/${loose.id}`, `${looseList.id}/${own.id}`].sort(),
      );
    });

    it('enqueueMemberships appends one hit_list_spot upsert each and never a second one while the first waits', async () => {
      await enqueueMemberships(db, ['L/a', 'L/b']);
      await enqueueMemberships(db, ['L/a']);

      expect((await peekOutbox(db, 50)).map((r) => [r.entity, r.entity_id, r.op])).toEqual([
        ['hit_list_spot', 'L/a', 'upsert'],
        ['hit_list_spot', 'L/b', 'upsert'],
      ]);
    });

    it('enqueueMemberships of nothing appends nothing', async () => {
      await enqueueMemberships(db, []);

      expect(await countPending(db)).toBe(0);
    });
  });

  describe('cursors and sync state', () => {
    it("getCursor is 0 by default and setCursor persists per table", async () => {
      expect(await getCursor(db, 'spots')).toBe(0);

      await setCursor(db, 'spots', 42);
      await setCursor(db, 'media', 7);

      expect(await getCursor(db, 'spots')).toBe(42);
      expect(await getCursor(db, 'media')).toBe(7);
      expect(await getCursor(db, 'hit_lists')).toBe(0);
      expect(await getSyncState(db, 'cursor:spots')).toBe('42');
    });

    it('resetCursors puts every cursor back to 0 and leaves user_id', async () => {
      await setSyncState(db, 'user_id', 'u1');
      await setCursor(db, 'spots', 42);
      await setCursor(db, 'hit_list_spots', 3);

      await resetCursors(db);

      expect(await getCursor(db, 'spots')).toBe(0);
      expect(await getCursor(db, 'hit_list_spots')).toBe(0);
      expect(await getSyncState(db, 'user_id')).toBe('u1');
    });

    it("forgetAccount clears every 'confirmed_list:<id>' (D90: another account asks again) and the account's keys", async () => {
      expect(confirmedListKey('L1')).toBe('confirmed_list:L1');
      await setSyncState(db, 'user_id', 'u1');
      await setSyncState(db, confirmedListKey('L1'), '1');
      await setSyncState(db, confirmedListKey('L2'), '1');
      await setSyncState(db, 'cursor:spots', '7');

      await forgetAccount(db, 'u1');

      expect(await getSyncState(db, 'user_id')).toBeUndefined();
      expect(await getSyncState(db, confirmedListKey('L1'))).toBeUndefined();
      expect(await getSyncState(db, confirmedListKey('L2'))).toBeUndefined();
      expect(await getSyncState(db, 'cursor:spots')).toBe('7');
    });

    it("forgetAccount with no account still clears 'confirmed_list:%'", async () => {
      await setSyncState(db, confirmedListKey('L1'), '1');

      await forgetAccount(db, undefined);

      expect(await getSyncState(db, confirmedListKey('L1'))).toBeUndefined();
    });

    it("getSyncState/setSyncState round-trip 'user_id'; null deletes the key", async () => {
      expect(await getSyncState(db, 'user_id')).toBeUndefined();

      await setSyncState(db, 'user_id', 'u1');
      expect(await getSyncState(db, 'user_id')).toBe('u1');

      await setSyncState(db, 'user_id', 'u2');
      expect(await getSyncState(db, 'user_id')).toBe('u2');

      await setSyncState(db, 'user_id', null);
      expect(await getSyncState(db, 'user_id')).toBeUndefined();
      expect(await db.getFirstAsync('SELECT COUNT(*) AS n FROM sync_state')).toEqual({ n: 0 });
    });
  });
});
