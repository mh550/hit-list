import type { SQLiteDatabase } from 'expo-sqlite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMigratedTestDb } from './helpers/node-sqlite-db';
import { createFakeSupabase, fakeSession, type FakeSupabase } from './helpers/fake-supabase';
import { ME, adoptPhoneFor, outboxOps } from './helpers/outbox';
import { createTestHitList, createTestMedia, createTestSpot } from './factories';
import {
  addSpotsToList,
  deleteMedia,
  insertHitList,
  insertMedia,
  insertSpot,
  removeSpotFromList,
  softDeleteSpot,
} from '@/src/db';
import { clearOutbox, countPending, enqueue, type OutboxEntity, type OutboxOp } from '@/src/db/sync';
import { push } from '@/src/sync/push';
import type { PhotoIO } from '@/src/sync/photos';

const T0 = '2026-10-20T10:00:00.000Z';
const T1 = '2026-10-21T11:00:00.000Z';
const T2 = '2026-10-22T12:00:00.000Z';

const asClient = (fake: FakeSupabase) => fake as unknown as SupabaseClient;

/** A PhotoIO over an in-memory set of files; records each prepared copy it cleaned up. */
function memoryIO(files: Record<string, Uint8Array>) {
  const cleaned: string[] = [];
  const io: PhotoIO = {
    exists: jest.fn((path: string) => path in files),
    prepare: jest.fn(async (path: string) => ({
      uri: `file:///data/Caches/${path}`,
      bytes: files[path],
      cleanup: () => {
        cleaned.push(path);
      },
    })),
  };
  return { io, cleaned };
}

interface OutboxDbRow {
  entity: string;
  entity_id: string;
  op: string;
  attempts: number;
  last_error: string | null;
  parked: number;
}
const outboxRows = (db: SQLiteDatabase) =>
  db.getAllAsync<OutboxDbRow>('SELECT entity, entity_id, op, attempts, last_error, parked FROM sync_outbox ORDER BY id');

/** Replaces whatever the triggers queued with exactly these rows, in this order. */
async function setOutbox(db: SQLiteDatabase, rows: [OutboxEntity, string, OutboxOp][]) {
  await clearOutbox(db);
  for (const [entity, id, op] of rows) await enqueue(db, entity, id, op);
}

const setAttempts = (db: SQLiteDatabase, entityId: string, attempts: number) =>
  db.runAsync('UPDATE sync_outbox SET attempts = ? WHERE entity_id = ?', attempts, entityId);

describe('push: drain the outbox into Supabase (real SQLite, fake client)', () => {
  let db: SQLiteDatabase;
  let fake: FakeSupabase;
  let warn: jest.SpyInstance;
  const PHOTO = new Uint8Array([0xff, 0xd8, 1, 2, 3]);

  beforeEach(async () => {
    db = await createMigratedTestDb();
    await adoptPhoneFor(db, ME);
    fake = createFakeSupabase({ session: fakeSession({ userId: ME }) });
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  /** A spot with a photo, a list holding it, and a second spot that gets deleted. */
  async function seed() {
    const spot = createTestSpot({
      id: 'spot-1',
      owner_id: ME,
      name: 'Courthouse rail',
      generated_name: 'Capitol Hill',
      location: { latitude: 47.61, longitude: -122.33 },
      feature_types: ['rail', 'ledge'],
      stopped: true,
      natural_speed: 2,
      notes: 'kinked',
      primary_photo_id: 'media-1',
      created_at: T0,
      updated_at: T1,
    });
    const gone = createTestSpot({ id: 'spot-2', owner_id: ME, created_at: T0, updated_at: T0 });
    await insertSpot(db, spot);
    await insertSpot(db, gone);
    await insertMedia(
      db,
      createTestMedia({
        id: 'media-1',
        spot_id: 'spot-1',
        file_path: 'photos/spot-1/media-1.jpg',
        captured_at: '2026-10-19T09:30:00.000Z',
        location: { latitude: 47.6101, longitude: -122.3301 },
        created_at: T1,
      }),
    );
    await insertHitList(db, createTestHitList({ id: 'list-1', owner_id: ME, name: 'Downtown' }));
    await addSpotsToList(db, 'list-1', ['spot-1'], T1);
    await softDeleteSpot(db, 'spot-2', T2);
    return memoryIO({ 'photos/spot-1/media-1.jpg': PHOTO });
  }

  it('pushes spot, photo + media, list, membership and a spot delete in outbox order, then empties the outbox', async () => {
    const { io, cleaned } = await seed();
    await setOutbox(db, [
      ['spot', 'spot-1', 'upsert'],
      ['media', 'media-1', 'upsert'],
      ['hit_list', 'list-1', 'upsert'],
      ['hit_list_spot', 'list-1/spot-1', 'upsert'],
      ['spot', 'spot-2', 'delete'],
    ]);

    const result = await push(db, asClient(fake), ME, io);

    expect(fake.calls).toEqual([
      {
        kind: 'upsert',
        table: 'spots',
        options: undefined,
        values: {
          id: 'spot-1',
          owner_id: ME,
          name: 'Courthouse rail',
          generated_name: 'Capitol Hill',
          lat: 47.61,
          lng: -122.33,
          feature_types: ['rail', 'ledge'],
          stopped: true,
          natural_speed: 2,
          notes: 'kinked',
          primary_photo_id: 'media-1',
          created_at: T0,
          updated_at: T1,
          deleted_at: null,
        },
      },
      {
        kind: 'upload',
        bucket: 'photos',
        path: `${ME}/spot-1/media-1.jpg`,
        body: PHOTO,
        options: { contentType: 'image/jpeg', upsert: true },
      },
      {
        kind: 'upsert',
        table: 'media',
        options: undefined,
        values: {
          id: 'media-1',
          spot_id: 'spot-1',
          owner_id: ME,
          storage_path: `${ME}/spot-1/media-1.jpg`,
          captured_at: '2026-10-19T09:30:00.000Z',
          lat: 47.6101,
          lng: -122.3301,
          uploaded_by: ME,
          created_at: T1,
          updated_at: T1,
          deleted_at: null,
        },
      },
      {
        kind: 'upsert',
        table: 'hit_lists',
        options: undefined,
        values: {
          id: 'list-1',
          owner_id: ME,
          name: 'Downtown',
          kind: 'manual',
          area_center_lat: null,
          area_center_lng: null,
          area_radius_m: null,
          area_filters: null,
          area_place: null,
          shared: false,
          created_at: '2026-10-01T12:00:00.000Z',
          updated_at: '2026-10-01T12:00:00.000Z',
          deleted_at: null,
        },
      },
      {
        kind: 'upsert',
        table: 'hit_list_spots',
        options: { onConflict: 'list_id,spot_id', ignoreDuplicates: true },
        values: { list_id: 'list-1', spot_id: 'spot-1', added_by: ME, added_at: T1 },
      },
      {
        kind: 'upsert',
        table: 'spots',
        options: undefined,
        values: expect.objectContaining({ id: 'spot-2', owner_id: ME, updated_at: T2, deleted_at: T2 }),
      },
    ]);
    expect(result).toEqual({ pushed: 5, failed: 0 });
    expect(await outboxOps(db)).toEqual([]);
    expect(cleaned).toEqual(['photos/spot-1/media-1.jpg']);
  });

  it('drains what the triggers queued for ordinary writes', async () => {
    const { io } = await seed();

    await push(db, asClient(fake), ME, io);

    expect(await outboxOps(db)).toEqual([]);
    expect(fake.calls.map((c) => (c.kind === 'upload' ? 'upload' : `${c.kind} ${c.table}`))).toEqual([
      'upsert spots',
      'upsert spots',
      'upload',
      'upsert media',
      'upsert hit_lists',
      'upsert hit_list_spots',
      'upsert spots',
    ]);
  });

  it('pushes natural_speed 0 (None) as 0 and an unrated spot as null', async () => {
    await insertSpot(db, createTestSpot({ id: 'none', owner_id: ME, natural_speed: 0 }));
    await insertSpot(db, createTestSpot({ id: 'unrated', owner_id: ME }));

    await push(db, asClient(fake), ME, memoryIO({}).io);

    const speeds = fake.calls.map((c) => (c.kind === 'upsert' ? [c.values.id, c.values.natural_speed] : null));
    expect(speeds).toEqual([
      ['none', 0],
      ['unrated', null],
    ]);
  });

  it('a failing upsert keeps its row (attempts 1, last_error), holds the later rows back, and the next push retries', async () => {
    const { io } = await seed();
    await setOutbox(db, [
      ['spot', 'spot-1', 'upsert'],
      ['media', 'media-1', 'upsert'],
      ['hit_list', 'list-1', 'upsert'],
    ]);
    fake.failNext('upsert', { message: 'connection reset', code: '08006' });

    const first = await push(db, asClient(fake), ME, io);

    expect(first).toEqual({ pushed: 0, failed: 1 });
    expect(fake.calls).toHaveLength(1);
    expect(await outboxRows(db)).toEqual([
      { entity: 'spot', entity_id: 'spot-1', op: 'upsert', attempts: 1, last_error: 'connection reset', parked: 0 },
      { entity: 'media', entity_id: 'media-1', op: 'upsert', attempts: 0, last_error: null, parked: 0 },
      { entity: 'hit_list', entity_id: 'list-1', op: 'upsert', attempts: 0, last_error: null, parked: 0 },
    ]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[sync] push'), expect.anything());

    const second = await push(db, asClient(fake), ME, io);

    expect(second).toEqual({ pushed: 3, failed: 0 });
    expect(await outboxRows(db)).toEqual([]);
    const tables = fake.calls.map((c) => (c.kind === 'upload' ? 'upload' : c.table));
    expect(tables).toEqual(['spots', 'spots', 'upload', 'media', 'hit_lists']);
  });

  it('a failed photo upload keeps the media row and sends no media upsert', async () => {
    const { io } = await seed();
    await setOutbox(db, [
      ['spot', 'spot-1', 'upsert'],
      ['media', 'media-1', 'upsert'],
      ['hit_list', 'list-1', 'upsert'],
    ]);
    fake.failNext('upload', { message: 'Network request failed' });

    const result = await push(db, asClient(fake), ME, io);

    expect(result).toEqual({ pushed: 1, failed: 1 });
    expect(fake.calls.map((c) => c.kind)).toEqual(['upsert', 'upload']);
    expect(await outboxOps(db)).toEqual([
      ['media', 'media-1', 'upsert'],
      ['hit_list', 'list-1', 'upsert'],
    ]);
    expect((await outboxRows(db))[0]).toMatchObject({ attempts: 1, last_error: 'Network request failed' });
  });

  it('a client that throws counts as a failure, not a crash', async () => {
    const { io } = await seed();
    await setOutbox(db, [['spot', 'spot-1', 'upsert']]);
    fake.from.mockImplementationOnce(() => {
      throw new Error('fetch failed');
    });

    await expect(push(db, asClient(fake), ME, io)).resolves.toEqual({ pushed: 0, failed: 1 });
    expect((await outboxRows(db))[0]).toMatchObject({ attempts: 1, last_error: 'fetch failed' });
  });

  it('a media row whose photo file is gone is set aside with “photo missing” and the rest still push', async () => {
    const { io } = await seed();
    (io.exists as jest.Mock).mockReturnValue(false);
    await setOutbox(db, [
      ['media', 'media-1', 'upsert'],
      ['hit_list', 'list-1', 'upsert'],
    ]);

    const result = await push(db, asClient(fake), ME, io);

    expect(result).toEqual({ pushed: 1, failed: 1 });
    expect(fake.calls.map((c) => (c.kind === 'upload' ? 'upload' : c.table))).toEqual(['hit_lists']);
    expect(await outboxRows(db)).toEqual([
      { entity: 'media', entity_id: 'media-1', op: 'upsert', attempts: 0, last_error: 'photo missing', parked: 1 },
    ]);
    expect(await countPending(db)).toBe(0);

    // set aside for good: the next push leaves it alone
    await push(db, asClient(fake), ME, io);
    expect(io.prepare).not.toHaveBeenCalled();
    expect(await outboxRows(db)).toHaveLength(1);
  });

  it('a removed photo pushes its deleted_at without uploading (its file may be gone)', async () => {
    const { io } = await seed();
    (io.exists as jest.Mock).mockReturnValue(false);
    await deleteMedia(db, 'media-1', T2);
    await setOutbox(db, [['media', 'media-1', 'delete']]);

    await push(db, asClient(fake), ME, io);

    expect(fake.calls).toEqual([
      expect.objectContaining({
        kind: 'upsert',
        table: 'media',
        values: expect.objectContaining({ id: 'media-1', updated_at: T2, deleted_at: T2 }),
      }),
    ]);
    expect(await outboxOps(db)).toEqual([]);
  });

  it('a removed membership deletes the server row by list and spot', async () => {
    const { io } = await seed();
    await clearOutbox(db);
    await removeSpotFromList(db, 'list-1', 'spot-1');

    await push(db, asClient(fake), ME, io);

    expect(fake.calls).toEqual([
      {
        kind: 'delete',
        table: 'hit_list_spots',
        filters: [
          ['list_id', 'list-1'],
          ['spot_id', 'spot-1'],
        ],
      },
    ]);
    expect(await outboxOps(db)).toEqual([]);
  });

  it('an area list sends its circle, its filters as JSON and shared as a boolean', async () => {
    await insertHitList(
      db,
      createTestHitList({
        id: 'area-1',
        owner_id: ME,
        kind: 'area',
        area_center: { latitude: 47.6, longitude: -122.3 },
        area_radius_m: 3219,
        area_filters: { types: ['rail'], stopped: false },
        area_place: 'Capitol Hill',
        shared: true,
      }),
    );

    await push(db, asClient(fake), ME, memoryIO({}).io);

    expect(fake.calls[0]).toMatchObject({
      table: 'hit_lists',
      values: {
        kind: 'area',
        area_center_lat: 47.6,
        area_center_lng: -122.3,
        area_radius_m: 3219,
        area_filters: { types: ['rail'], stopped: false },
        area_place: 'Capitol Hill',
        shared: true,
      },
    });
  });

  it('sends timestamps as ISO: SQLite datetime() becomes …Z, an unreadable captured_at becomes null', async () => {
    await insertSpot(db, createTestSpot({ id: 'spot-1', owner_id: ME }));
    await db.runAsync("UPDATE spots SET created_at = '2026-10-01 08:09:10', rev = 7 WHERE id = 'spot-1'");
    await insertMedia(
      db,
      createTestMedia({ id: 'media-1', spot_id: 'spot-1', file_path: 'p.jpg', captured_at: '2026:10:13 14:22:00' }),
    );
    await setOutbox(db, [
      ['spot', 'spot-1', 'upsert'],
      ['media', 'media-1', 'upsert'],
    ]);

    await push(db, asClient(fake), ME, memoryIO({ 'p.jpg': PHOTO }).io);

    const upserts = fake.calls.filter((c) => c.kind === 'upsert');
    expect(upserts[0].values.created_at).toBe('2026-10-01T08:09:10.000Z');
    expect(upserts[1].values.captured_at).toBeNull();
  });

  it('a permanent refusal (RLS 42501, check 23514) is set aside and the push goes on', async () => {
    const { io } = await seed();
    await setOutbox(db, [
      ['hit_list_spot', 'list-1/spot-1', 'upsert'],
      ['hit_list', 'list-1', 'upsert'],
    ]);
    fake.failNext('upsert', { message: 'new row violates row-level security policy', code: '42501' });

    const result = await push(db, asClient(fake), ME, io);

    expect(result).toEqual({ pushed: 1, failed: 1 });
    expect(await outboxRows(db)).toEqual([
      {
        entity: 'hit_list_spot',
        entity_id: 'list-1/spot-1',
        op: 'upsert',
        attempts: 0,
        last_error: 'new row violates row-level security policy',
        parked: 1,
      },
    ]);
  });

  it('a missing parent (FK 23503) is an ordinary failure that retries', async () => {
    const { io } = await seed();
    await setOutbox(db, [['media', 'media-1', 'upsert']]);
    fake.failNext('upsert', { message: 'violates foreign key constraint', code: '23503' });

    await push(db, asClient(fake), ME, io);

    expect(await outboxRows(db)).toEqual([
      expect.objectContaining({ attempts: 1, parked: 0, last_error: 'violates foreign key constraint' }),
    ]);
  });

  it('a row that is no longer on the phone is done without a call', async () => {
    await setOutbox(db, [
      ['spot', 'not-here', 'upsert'],
      ['media', 'not-here', 'upsert'],
      ['hit_list', 'not-here', 'upsert'],
      ['hit_list_spot', 'not/here', 'upsert'],
    ]);

    await expect(push(db, asClient(fake), ME, memoryIO({}).io)).resolves.toEqual({ pushed: 4, failed: 0 });
    expect(fake.calls).toEqual([]);
    expect(await outboxOps(db)).toEqual([]);
  });

  it('pushes more than one page of 50 rows in one push', async () => {
    for (let i = 0; i < 60; i++) await insertSpot(db, createTestSpot({ id: `s-${i}`, owner_id: ME }));

    await expect(push(db, asClient(fake), ME, memoryIO({}).io)).resolves.toEqual({ pushed: 60, failed: 0 });
    expect(fake.calls).toHaveLength(60);
  });

  describe('backoff', () => {
    beforeEach(async () => {
      for (const id of ['fresh', 'backoff-a', 'backoff-b', 'waits-for-retry']) {
        await insertSpot(db, createTestSpot({ id, owner_id: ME }));
      }
      await setOutbox(db, [
        ['spot', 'backoff-a', 'upsert'],
        ['spot', 'waits-for-retry', 'upsert'],
        ['spot', 'backoff-b', 'upsert'],
        ['spot', 'fresh', 'upsert'],
      ]);
      await setAttempts(db, 'backoff-a', 3);
      await setAttempts(db, 'backoff-b', 9);
      await setAttempts(db, 'waits-for-retry', 10);
    });

    it('fresh rows go first, then each row with 3–9 attempts once; 10 attempts waits for Retry', async () => {
      const result = await push(db, asClient(fake), ME, memoryIO({}).io);

      expect(fake.calls.map((c) => (c.kind === 'upsert' ? c.values.id : c.kind))).toEqual([
        'fresh',
        'backoff-a',
        'backoff-b',
      ]);
      expect(result).toEqual({ pushed: 3, failed: 0 });
      expect(await outboxOps(db)).toEqual([['spot', 'waits-for-retry', 'upsert']]);
    });

    it('a failure in the backoff pass does not stop it', async () => {
      // the fresh row succeeds; the first backoff row fails
      const realFrom = fake.from.getMockImplementation()!;
      let n = 0;
      fake.from.mockImplementation((table: string) => {
        n += 1;
        if (n === 2) fake.failNext('upsert', { message: 'timeout' });
        return realFrom(table);
      });

      const result = await push(db, asClient(fake), ME, memoryIO({}).io);

      expect(result).toEqual({ pushed: 2, failed: 1 });
      expect(await outboxRows(db)).toEqual([
        expect.objectContaining({ entity_id: 'backoff-a', attempts: 4, last_error: 'timeout' }),
        expect.objectContaining({ entity_id: 'waits-for-retry', attempts: 10 }),
      ]);
    });

    it('skips the backoff pass when the fresh pass failed (the server is not answering)', async () => {
      fake.failNext('upsert', { message: 'Network request failed' });

      const result = await push(db, asClient(fake), ME, memoryIO({}).io);

      expect(result).toEqual({ pushed: 0, failed: 1 });
      expect(fake.calls.map((c) => (c.kind === 'upsert' ? c.values.id : c.kind))).toEqual(['fresh']);
      expect(await outboxRows(db)).toEqual([
        expect.objectContaining({ entity_id: 'backoff-a', attempts: 3 }),
        expect.objectContaining({ entity_id: 'waits-for-retry', attempts: 10 }),
        expect.objectContaining({ entity_id: 'backoff-b', attempts: 9 }),
        expect.objectContaining({ entity_id: 'fresh', attempts: 1 }),
      ]);
    });
  });

  describe('only for the phone’s account, signed in', () => {
    beforeEach(async () => {
      await insertSpot(db, createTestSpot({ id: 'spot-1', owner_id: ME }));
    });

    it('with no session it does nothing and resolves', async () => {
      fake.setSession(null);

      await expect(push(db, asClient(fake), ME, memoryIO({}).io)).resolves.toEqual({ pushed: 0, failed: 0 });
      expect(fake.from).not.toHaveBeenCalled();
      expect(await outboxOps(db)).toEqual([['spot', 'spot-1', 'upsert']]);
    });

    it('with another rider’s session it does nothing', async () => {
      fake.setSession(fakeSession({ userId: 'rider-other' }));

      await push(db, asClient(fake), ME, memoryIO({}).io);

      expect(fake.from).not.toHaveBeenCalled();
    });

    it('before the phone is adopted for this rider (sync_state.user_id differs) it does nothing', async () => {
      await adoptPhoneFor(db, 'rider-before');

      await push(db, asClient(fake), ME, memoryIO({}).io);

      expect(fake.from).not.toHaveBeenCalled();
      expect(await outboxOps(db)).toEqual([['spot', 'spot-1', 'upsert']]);
    });

    it('a queued row owned by someone else is set aside, never sent under this account', async () => {
      await insertSpot(db, createTestSpot({ id: 'theirs', owner_id: 'rider-other' }));
      await setOutbox(db, [['spot', 'theirs', 'upsert']]);

      await push(db, asClient(fake), ME, memoryIO({}).io);

      expect(fake.calls).toEqual([]);
      expect(await outboxRows(db)).toEqual([expect.objectContaining({ entity_id: 'theirs', parked: 1 })]);
    });
  });
});
