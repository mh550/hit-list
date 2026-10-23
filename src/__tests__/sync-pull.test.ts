import type { SQLiteDatabase } from 'expo-sqlite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMigratedTestDb } from './helpers/node-sqlite-db';
import { createFakeSupabase, fakeSession, type FakeSelect, type FakeSupabase } from './helpers/fake-supabase';
import { ME, adoptPhoneFor, outboxOps } from './helpers/outbox';
import { createTestHitList, createTestMedia, createTestSpot } from './factories';
import {
  addSpotsToList,
  getHitLists,
  getListMemberships,
  getMediaForSpot,
  getSpot,
  getSpots,
  insertHitList,
  insertMedia,
  insertSpot,
  removeSpotFromList,
  updateSpot,
} from '@/src/db';
import { clearOutbox, getCursor, parkRow, peekOutbox, setCursor, setSyncState } from '@/src/db/sync';
import { pull, PULL_PAGE, REV_OVERLAP } from '@/src/sync/pull';
import { downloadMissingPhotos, type PhotoIO } from '@/src/sync/photos';
import { FeatureType } from '@/src/types';

const OTHER = 'rider-other';
const T0 = '2026-10-20T10:00:00.000Z';
const T1 = '2026-10-21T11:00:00.000Z';
const T2 = '2026-10-22T12:00:00.000Z';
/** The server's spelling of T1 (µs, +00:00). */
const T1_SERVER = '2026-10-21T11:00:00.000000+00:00';

type Row = Record<string, unknown>;
const asClient = (fake: FakeSupabase) => fake as unknown as SupabaseClient;

/** Rows as PostgREST returns them (`select('*')`, generated columns included). */
const serverSpot = (overrides: Row = {}): Row => ({
  id: 'spot-1',
  owner_id: ME,
  name: 'Courthouse rail',
  generated_name: 'Capitol Hill',
  lat: 47.61,
  lng: -122.33,
  geog: '0101000020E6100000',
  feature_types: ['rail', 'ledge'],
  stopped: true,
  natural_speed: 2,
  notes: 'kinked',
  primary_photo_id: 'media-1',
  copied_from_send: null,
  created_at: '2026-10-20T10:00:00+00:00',
  updated_at: T1_SERVER,
  deleted_at: null,
  rev: 1,
  ...overrides,
});
const serverMedia = (overrides: Row = {}): Row => ({
  id: 'media-1',
  spot_id: 'spot-1',
  owner_id: ME,
  storage_path: `${ME}/spot-1/media-1.jpg`,
  captured_at: '2026-10-19T09:30:00+00:00',
  lat: 47.6101,
  lng: -122.3301,
  uploaded_by: ME,
  created_at: T1_SERVER,
  updated_at: T1_SERVER,
  deleted_at: null,
  rev: 2,
  ...overrides,
});
const serverList = (overrides: Row = {}): Row => ({
  id: 'list-1',
  owner_id: ME,
  name: 'Downtown',
  kind: 'manual',
  area_center_lat: null,
  area_center_lng: null,
  area_center: null,
  area_radius_m: null,
  area_filters: null,
  area_place: null,
  shared: false,
  created_at: T1_SERVER,
  updated_at: T1_SERVER,
  deleted_at: null,
  rev: 3,
  ...overrides,
});
const serverMembership = (overrides: Row = {}): Row => ({
  list_id: 'list-1',
  spot_id: 'spot-1',
  added_by: ME,
  added_at: T1_SERVER,
  rev: 4,
  ...overrides,
});

const spotSelects = (fake: FakeSupabase, columns = '*') =>
  fake.selects.filter((s) => s.table === 'spots' && s.columns === columns);
const revQuery = (table: string, after: number): FakeSelect => ({
  table,
  columns: '*',
  filters: [['gt', 'rev', after]],
  order: ['rev'],
  limit: PULL_PAGE,
});
const rawSpot = (db: SQLiteDatabase, id: string) =>
  db.getFirstAsync<Row>('SELECT * FROM spots WHERE id = ?', id);
const countOutbox = async (db: SQLiteDatabase) =>
  (await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sync_outbox'))!.n;

describe('pull: bring the server rows down (real SQLite, fake client)', () => {
  let db: SQLiteDatabase;
  let fake: FakeSupabase;
  let warn: jest.SpyInstance;

  beforeEach(async () => {
    db = await createMigratedTestDb();
    await adoptPhoneFor(db, ME);
    fake = createFakeSupabase({ session: fakeSession({ userId: ME }) });
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  function serve(rows: { spots?: Row[]; media?: Row[]; hit_lists?: Row[]; hit_list_spots?: Row[] }) {
    fake.tables.spots = rows.spots ?? [];
    fake.tables.media = rows.media ?? [];
    fake.tables.hit_lists = rows.hit_lists ?? [];
    fake.tables.hit_list_spots = rows.hit_list_spots ?? [];
  }

  describe('the per-table pulls', () => {
    it('asks each table for rev > 0 in rev order, 500 at a time, spots → media → hit_lists → hit_list_spots', async () => {
      serve({});
      await pull(db, asClient(fake), ME);
      expect(fake.selects).toEqual([
        revQuery('spots', 0),
        revQuery('media', 0),
        revQuery('hit_lists', 0),
        revQuery('hit_list_spots', 0),
      ]);
    });

    it('inserts every pulled row locally with its owner, mapped to the local columns', async () => {
      serve({
        spots: [serverSpot()],
        media: [serverMedia()],
        hit_lists: [serverList()],
        hit_list_spots: [serverMembership()],
      });

      const result = await pull(db, asClient(fake), ME);

      expect(result).toEqual({ changed: true });
      expect(await getSpots(db)).toEqual([
        {
          id: 'spot-1',
          owner_id: ME,
          name: 'Courthouse rail',
          generated_name: 'Capitol Hill',
          location: { latitude: 47.61, longitude: -122.33 },
          feature_types: [FeatureType.Rail, FeatureType.Ledge],
          stopped: true,
          natural_speed: 2,
          notes: 'kinked',
          primary_photo_id: 'media-1',
          created_at: T0,
          updated_at: T1,
          deleted_at: undefined,
        },
      ]);
      expect(await rawSpot(db, 'spot-1')).toEqual(
        expect.objectContaining({ feature_types_json: '["rail","ledge"]', rev: 1, legacy_json: null }),
      );
      expect(await getMediaForSpot(db, 'spot-1')).toEqual([
        {
          id: 'media-1',
          spot_id: 'spot-1',
          owner_id: ME,
          file_path: 'photos/spot-1/media-1.jpg',
          captured_at: '2026-10-19T09:30:00.000Z',
          location: { latitude: 47.6101, longitude: -122.3301 },
          uploaded_by: ME,
          created_at: T1,
        },
      ]);
      expect(await getHitLists(db)).toEqual([
        expect.objectContaining({ id: 'list-1', owner_id: ME, name: 'Downtown', kind: 'manual', shared: false }),
      ]);
      expect(await getListMemberships(db)).toEqual({ 'spot-1': ['list-1'] });
      expect(await getCursor(db, 'spots')).toBe(1);
      expect(await getCursor(db, 'media')).toBe(2);
      expect(await getCursor(db, 'hit_lists')).toBe(3);
      expect(await getCursor(db, 'hit_list_spots')).toBe(4);
    });

    it('maps natural_speed null to unset and keeps 0 (None) as a rating', async () => {
      serve({
        spots: [
          serverSpot({ id: 'unrated', natural_speed: null, primary_photo_id: null, rev: 1 }),
          serverSpot({ id: 'none', natural_speed: 0, primary_photo_id: null, rev: 2 }),
        ],
      });
      await pull(db, asClient(fake), ME);
      expect((await getSpot(db, 'unrated'))?.natural_speed).toBeUndefined();
      expect((await getSpot(db, 'none'))?.natural_speed).toBe(0);
    });

    it('maps an area list: center, radius, filters object → JSON text, shared → 1', async () => {
      const filters = { types: ['rail'], stopped: false };
      serve({
        hit_lists: [
          serverList({
            kind: 'area',
            area_center_lat: 47.6,
            area_center_lng: -122.3,
            area_radius_m: 3219,
            area_filters: filters,
            area_place: 'Capitol Hill',
            shared: true,
          }),
        ],
      });
      await pull(db, asClient(fake), ME);
      expect(await getHitLists(db)).toEqual([
        expect.objectContaining({
          kind: 'area',
          area_center: { latitude: 47.6, longitude: -122.3 },
          area_radius_m: 3219,
          area_filters: filters,
          area_place: 'Capitol Hill',
          shared: true,
        }),
      ]);
    });

    it('a second pull starts from the stored cursor (less the overlap window) and changes nothing it already has', async () => {
      serve({ spots: [serverSpot({ rev: 1001 }), serverSpot({ id: 'spot-2', primary_photo_id: null, rev: 1002 })] });
      await pull(db, asClient(fake), ME);
      expect(await getCursor(db, 'spots')).toBe(1002);

      fake.selects.length = 0;
      const again = await pull(db, asClient(fake), ME);

      expect(spotSelects(fake)[0]).toEqual(revQuery('spots', 1002 - REV_OVERLAP));
      // both rows sit inside the overlap window: re-read, applied again harmlessly
      expect(again).toEqual({ changed: false });
      expect(await getCursor(db, 'spots')).toBe(1002);
      expect(await countOutbox(db)).toBe(0);
    });

    it('a row that committed late inside the overlap window is still pulled', async () => {
      await setCursor(db, 'spots', 1002);
      serve({ spots: [serverSpot({ rev: 1001 }), serverSpot({ id: 'spot-2', primary_photo_id: null, rev: 1002 })] });
      await pull(db, asClient(fake), ME);
      expect((await getSpots(db)).map((s) => s.id).sort()).toEqual(['spot-1', 'spot-2']);
      expect(await getCursor(db, 'spots')).toBe(1002);
    });

    it('a page of exactly 500 rows asks for the next page after its last rev', async () => {
      const spots = Array.from({ length: PULL_PAGE + 2 }, (_, i) =>
        serverSpot({ id: `spot-${String(i).padStart(4, '0')}`, primary_photo_id: null, rev: i + 1 }),
      );
      serve({ spots });

      await pull(db, asClient(fake), ME);

      expect(spotSelects(fake)).toEqual([revQuery('spots', 0), revQuery('spots', PULL_PAGE)]);
      expect(await getSpots(db)).toHaveLength(PULL_PAGE + 2);
      expect(await getCursor(db, 'spots')).toBe(PULL_PAGE + 2);
    });

    it('a server row older than the local one leaves the local row alone; a newer one overwrites it', async () => {
      await insertSpot(db, createTestSpot({ id: 'local-newer', owner_id: ME, name: 'Mine', updated_at: T2 }));
      await insertSpot(db, createTestSpot({ id: 'local-older', owner_id: ME, name: 'Mine', updated_at: T1 }));
      serve({
        spots: [
          serverSpot({ id: 'local-newer', name: 'Theirs', updated_at: '2026-10-21T11:00:00+00:00', rev: 1 }),
          serverSpot({ id: 'local-older', name: 'Theirs', updated_at: '2026-10-22T12:00:00+00:00', rev: 2 }),
        ],
      });

      await pull(db, asClient(fake), ME);

      expect((await getSpot(db, 'local-newer'))?.name).toBe('Mine');
      expect((await getSpot(db, 'local-newer'))?.updated_at).toBe(T2);
      expect((await getSpot(db, 'local-older'))?.name).toBe('Theirs');
      expect((await getSpot(db, 'local-older'))?.updated_at).toBe(T2);
      // the unpushed edit still waits in the outbox; the pulled one queued nothing
      expect(await outboxOps(db)).toEqual([
        ['spot', 'local-newer', 'upsert'],
        ['spot', 'local-older', 'upsert'],
      ]);
    });

    it('an edit saved while the pull is running is never overwritten (the updated_at guard is in the UPDATE)', async () => {
      await insertSpot(db, createTestSpot({ id: 'spot-1', owner_id: ME, name: 'Mine', updated_at: T0 }));
      await clearOutbox(db);
      serve({ spots: [serverSpot({ name: 'Theirs', rev: 6 })] });
      // the rider saves between the pull's read of the row (T0 < T1: apply) and its UPDATE
      const run = db.runAsync.bind(db);
      jest.spyOn(db, 'runAsync').mockImplementation((async (sql: string, ...params: never[]) => {
        if (sql.startsWith('UPDATE spots SET owner_id')) {
          await run('UPDATE spots SET name = ?, updated_at = ? WHERE id = ?', 'Edited', T2, 'spot-1');
        }
        return run(sql, ...params);
      }) as typeof db.runAsync);

      expect(await pull(db, asClient(fake), ME)).toEqual({ changed: false });

      expect((await getSpot(db, 'spot-1'))?.name).toBe('Edited');
      expect((await getSpot(db, 'spot-1'))?.updated_at).toBe(T2);
      expect(await outboxOps(db)).toEqual([['spot', 'spot-1', 'upsert']]);
    });

    it('the echo of the rider’s own push (same updated_at, newer rev) stores the rev and reports no change', async () => {
      await insertSpot(
        db,
        createTestSpot({
          id: 'spot-1',
          owner_id: ME,
          name: 'Courthouse rail',
          generated_name: 'Capitol Hill',
          location: { latitude: 47.61, longitude: -122.33 },
          feature_types: [FeatureType.Rail, FeatureType.Ledge],
          stopped: true,
          natural_speed: 2,
          notes: 'kinked',
          primary_photo_id: 'media-1',
          created_at: T0,
          updated_at: T1,
        }),
      );
      await clearOutbox(db);
      serve({ spots: [serverSpot({ rev: 7 })] });

      expect(await pull(db, asClient(fake), ME)).toEqual({ changed: false });
      expect(await rawSpot(db, 'spot-1')).toEqual(expect.objectContaining({ rev: 7 }));
      expect(await countOutbox(db)).toBe(0);
    });

    it('a server delete soft-deletes the spot locally and keeps its list memberships', async () => {
      await insertSpot(db, createTestSpot({ id: 'spot-1', owner_id: ME, updated_at: T1 }));
      await insertHitList(db, createTestHitList({ id: 'list-1', owner_id: ME }));
      await addSpotsToList(db, 'list-1', ['spot-1'], T1);
      await clearOutbox(db);
      serve({
        spots: [serverSpot({ updated_at: '2026-10-22T12:00:00+00:00', deleted_at: '2026-10-22T12:00:00+00:00' })],
        // the membership was pushed: the server has it too
        hit_list_spots: [serverMembership()],
      });

      expect(await pull(db, asClient(fake), ME)).toEqual({ changed: true });

      expect(await getSpots(db)).toEqual([]);
      expect(await rawSpot(db, 'spot-1')).toEqual(expect.objectContaining({ deleted_at: T2 }));
      expect(await getListMemberships(db)).toEqual({ 'spot-1': ['list-1'] });
      expect(await countOutbox(db)).toBe(0);
    });

    it('appends no outbox row for 3 pulled rows; a later local edit of one does', async () => {
      serve({ spots: [serverSpot({ primary_photo_id: null })], media: [serverMedia()], hit_lists: [serverList()] });
      await pull(db, asClient(fake), ME);
      expect(await countOutbox(db)).toBe(0);

      await updateSpot(db, 'spot-1', { name: 'Renamed' });
      expect(await outboxOps(db)).toEqual([['spot', 'spot-1', 'upsert']]);
    });

    it('a media row whose spot is not here stops the media table at the row before it', async () => {
      serve({
        spots: [serverSpot({ primary_photo_id: null })],
        media: [
          serverMedia({ id: 'media-1', rev: 5 }),
          serverMedia({ id: 'orphan', spot_id: 'not-here', rev: 6 }),
          serverMedia({ id: 'media-3', rev: 7 }),
        ],
      });

      await pull(db, asClient(fake), ME);

      expect((await getMediaForSpot(db, 'spot-1')).map((m) => m.id)).toEqual(['media-1']);
      expect(await getCursor(db, 'media')).toBe(5);
      expect(warn).toHaveBeenCalled();
      // the other tables still pull
      expect(fake.selects.map((s) => s.table)).toEqual(['spots', 'media', 'hit_lists', 'hit_list_spots']);
    });

    it('a membership whose list is not here stops that table; its cursor stays', async () => {
      serve({
        spots: [serverSpot({ primary_photo_id: null })],
        hit_list_spots: [serverMembership({ list_id: 'not-here', rev: 4 })],
      });
      await pull(db, asClient(fake), ME);
      expect(await getListMemberships(db)).toEqual({});
      expect(await getCursor(db, 'hit_list_spots')).toBe(0);
    });

    it('does not bring back a membership the rider removed and has not pushed yet', async () => {
      await insertSpot(db, createTestSpot({ id: 'spot-1', owner_id: ME }));
      await insertHitList(db, createTestHitList({ id: 'list-1', owner_id: ME }));
      await addSpotsToList(db, 'list-1', ['spot-1'], T1);
      await clearOutbox(db);
      await removeSpotFromList(db, 'list-1', 'spot-1');
      serve({ hit_list_spots: [serverMembership()] });

      await pull(db, asClient(fake), ME);

      expect(await getListMemberships(db)).toEqual({});
      expect(await outboxOps(db)).toEqual([['hit_list_spot', 'list-1/spot-1', 'delete']]);
    });

    it('a select error leaves that table and its cursor as they were, warns, and goes on', async () => {
      serve({ spots: [serverSpot({ primary_photo_id: null })], hit_lists: [serverList()] });
      fake.failNext('select', { message: 'offline' }, 'spots');
      const result = await pull(db, asClient(fake), ME);
      expect(await getSpots(db)).toEqual([]);
      expect(await getCursor(db, 'spots')).toBe(0);
      expect(await getHitLists(db)).toHaveLength(1);
      // the engine reads `failed` as "not backed up": offline, every select fails like this
      expect(result).toEqual({ changed: true, failed: true });
      expect(warn).toHaveBeenCalled();
    });

    it('a row that waits for its spot is not a failed pull', async () => {
      serve({ media: [serverMedia({ spot_id: 'spot-not-here' })] });
      const result = await pull(db, asClient(fake), ME);
      expect(result.failed).toBeUndefined();
    });
  });

  describe('guards', () => {
    it('does nothing without a session', async () => {
      fake.setSession(null);
      serve({ spots: [serverSpot()] });
      expect(await pull(db, asClient(fake), ME)).toEqual({ changed: false });
      expect(fake.selects).toEqual([]);
    });

    it('does nothing when the phone holds another account’s rows (sync_state.user_id ≠ uid)', async () => {
      await setSyncState(db, 'user_id', OTHER);
      serve({ spots: [serverSpot()] });
      expect(await pull(db, asClient(fake), ME)).toEqual({ changed: false });
      expect(fake.selects).toEqual([]);
    });
  });

  describe('membership reconciliation (the server deletes memberships for real)', () => {
    async function seedMemberships() {
      for (const id of ['s1', 's2', 's3', 's4']) await insertSpot(db, createTestSpot({ id, owner_id: ME }));
      await insertHitList(db, createTestHitList({ id: 'list-1', owner_id: ME }));
      await addSpotsToList(db, 'list-1', ['s1', 's2'], T1);
      // phone-only rows: never on the server, never reconciled
      await insertSpot(db, createTestSpot({ id: 's5' }));
      await insertHitList(db, createTestHitList({ id: 'phone-list' }));
      await addSpotsToList(db, 'phone-list', ['s5'], T1);
      await clearOutbox(db);
      // s3 waits to be pushed; s4's push was refused for good (parked)
      await addSpotsToList(db, 'list-1', ['s3', 's4'], T2);
      const parked = (await peekOutbox(db, 10)).find((r) => r.entity_id === 'list-1/s4')!;
      await parkRow(db, parked.id, 'new row violates row-level security policy');
      serve({ hit_list_spots: [serverMembership({ spot_id: 's1' })] });
    }

    it('removes a membership of the rider’s list the server no longer has, without queuing a delete', async () => {
      await seedMemberships();

      expect(await pull(db, asClient(fake), ME)).toEqual({ changed: true });

      const memberships = await getListMemberships(db);
      expect(memberships).toEqual({ s1: ['list-1'], s3: ['list-1'], s4: ['list-1'], s5: ['phone-list'] });
      expect(await outboxOps(db)).toEqual([
        ['hit_list_spot', 'list-1/s3', 'upsert'],
        ['hit_list_spot', 'list-1/s4', 'upsert'],
      ]);
      expect(fake.selects).toContainEqual({
        table: 'hit_list_spots',
        columns: 'spot_id',
        filters: [
          ['eq', 'list_id', 'list-1'],
          ['in', 'spot_id', ['s1', 's2']],
        ],
        order: [],
        limit: undefined,
      });
    });

    it('a reconciliation error deletes nothing', async () => {
      await seedMemberships();
      fake.failSelect((s) => s.table === 'hit_list_spots' && s.columns === 'spot_id', { message: 'offline' });
      await pull(db, asClient(fake), ME);
      expect(Object.keys(await getListMemberships(db)).sort()).toEqual(['s1', 's2', 's3', 's4', 's5']);
    });

    it('the session ending mid-pull deletes nothing (an anonymous read sees no memberships)', async () => {
      await seedMemberships();
      fake.auth.getSession.mockImplementation(async () => ({ data: { session: null }, error: null }));
      fake.auth.getSession.mockImplementationOnce(async () => ({
        data: { session: fakeSession({ userId: ME }) },
        error: null,
      }));
      fake.tables.hit_list_spots = [];
      await pull(db, asClient(fake), ME);
      expect(Object.keys(await getListMemberships(db)).sort()).toEqual(['s1', 's2', 's3', 's4', 's5']);
    });
  });

  describe('readable-id reconciliation (others’ spots the rider can no longer read)', () => {
    async function seedForeign() {
      await insertSpot(db, createTestSpot({ id: 'foreign-1', owner_id: OTHER }));
      await insertSpot(db, createTestSpot({ id: 'foreign-2', owner_id: OTHER }));
      await insertMedia(db, createTestMedia({ id: 'foreign-2-photo', spot_id: 'foreign-2' }));
      await insertSpot(db, createTestSpot({ id: 'mine', owner_id: ME }));
      await insertSpot(db, createTestSpot({ id: 'phone-only' }));
      await insertHitList(db, createTestHitList({ id: 'list-1', owner_id: ME }));
      await addSpotsToList(db, 'list-1', ['foreign-2', 'mine'], T1);
      await clearOutbox(db);
      // the server still lets the rider read foreign-1 only (not even listing 'mine': it must stay anyway); the row
      // has no rev, so only the id check sees it
      // both memberships are still on the server, so only the readable-id check can remove foreign-2's
      serve({
        spots: [{ id: 'foreign-1', rev: null }],
        hit_list_spots: [
          serverMembership({ spot_id: 'mine', rev: null }),
          serverMembership({ spot_id: 'foreign-2', rev: null }),
        ],
      });
    }

    it('asks which of the local foreign spots are still readable and removes the rest, with their photos and memberships', async () => {
      await seedForeign();

      expect(await pull(db, asClient(fake), ME)).toEqual({ changed: true });

      expect(spotSelects(fake, 'id')).toEqual([
        {
          table: 'spots',
          columns: 'id',
          filters: [['in', 'id', ['foreign-1', 'foreign-2']]],
          order: [],
          limit: undefined,
        },
      ]);
      expect((await getSpots(db)).map((s) => s.id).sort()).toEqual(['foreign-1', 'mine', 'phone-only']);
      expect(await rawSpot(db, 'foreign-2')).toBeNull();
      expect(await db.getAllAsync('SELECT id FROM media WHERE spot_id = ?', 'foreign-2')).toEqual([]);
      expect(await db.getAllAsync('SELECT list_id FROM hit_list_spots WHERE spot_id = ?', 'foreign-2')).toEqual([]);
      expect(await getListMemberships(db)).toEqual({ mine: ['list-1'] });
      expect(await countOutbox(db)).toBe(0);
    });

    it('a readable-id error removes nothing', async () => {
      await seedForeign();
      fake.failSelect((s) => s.table === 'spots' && s.columns === 'id', { message: 'offline' });
      await pull(db, asClient(fake), ME);
      expect((await getSpots(db)).map((s) => s.id).sort()).toEqual(['foreign-1', 'foreign-2', 'mine', 'phone-only']);
    });

    it('without foreign spots on the phone it asks nothing', async () => {
      await insertSpot(db, createTestSpot({ id: 'mine', owner_id: ME }));
      serve({});
      await pull(db, asClient(fake), ME);
      expect(spotSelects(fake, 'id')).toEqual([]);
      expect(await getSpot(db, 'mine')).not.toBeNull();
    });
  });
});

describe('downloadMissingPhotos: own photos pulled from another phone', () => {
  let db: SQLiteDatabase;
  let fake: FakeSupabase;
  let warn: jest.SpyInstance;
  const BYTES = new Uint8Array([0xff, 0xd8, 9, 8, 7]);

  /** A PhotoIO over an in-memory set of files. */
  function memoryIO(files: Record<string, Uint8Array>) {
    const io: PhotoIO = {
      exists: jest.fn((path: string) => path in files),
      prepare: jest.fn(),
      write: jest.fn((path: string, bytes: Uint8Array) => {
        files[path] = bytes;
      }),
    };
    return io;
  }

  beforeEach(async () => {
    db = await createMigratedTestDb();
    await adoptPhoneFor(db, ME);
    fake = createFakeSupabase({ session: fakeSession({ userId: ME }) });
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    fake.tables.spots = [serverSpot({ primary_photo_id: null })];
    fake.tables.media = [
      serverMedia({ id: 'media-1', rev: 2 }),
      serverMedia({ id: 'media-2', rev: 3 }),
      serverMedia({ id: 'media-3', rev: 4, deleted_at: T1_SERVER }),
    ];
    fake.objects.set(`photos/${ME}/spot-1/media-1.jpg`, BYTES);
    fake.objects.set(`photos/${ME}/spot-1/media-2.jpg`, BYTES);
    fake.objects.set(`photos/${ME}/spot-1/media-3.jpg`, BYTES);
    await pull(db, asClient(fake), ME);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('downloads each missing live photo into its file_path and skips the ones already here', async () => {
    const files: Record<string, Uint8Array> = { 'photos/spot-1/media-2.jpg': new Uint8Array([1]) };
    const io = memoryIO(files);

    expect(await downloadMissingPhotos(db, asClient(fake), ME, io)).toBe(1);

    expect(files['photos/spot-1/media-1.jpg']).toEqual(BYTES);
    expect(files['photos/spot-1/media-2.jpg']).toEqual(new Uint8Array([1]));
    expect(files['photos/spot-1/media-3.jpg']).toBeUndefined();
    expect(io.write).toHaveBeenCalledTimes(1);
  });

  it('a failed download warns and leaves the photo for the next sync', async () => {
    const io = memoryIO({});
    fake.failNext('download', { message: 'offline' });
    expect(await downloadMissingPhotos(db, asClient(fake), ME, io)).toBe(1);
    expect(warn).toHaveBeenCalled();
    expect(await downloadMissingPhotos(db, asClient(fake), ME, io)).toBe(1);
  });

  it('reads a React Native Blob (no arrayBuffer) through FileReader', async () => {
    const realFileReader = globalThis.FileReader;
    // RN's FileReader: readAsArrayBuffer decodes the native blob, then onload
    class NativeFileReader {
      result: ArrayBuffer | null = null;
      error: Error | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsArrayBuffer(blob: { bytes: Uint8Array }) {
        void Promise.resolve().then(() => {
          this.result = blob.bytes.slice().buffer;
          this.onload?.();
        });
      }
    }
    globalThis.FileReader = NativeFileReader as unknown as typeof FileReader;
    const rnBlob = { bytes: BYTES, size: BYTES.length, type: 'image/jpeg' };
    const realFrom = fake.storage.from.getMockImplementation()!;
    fake.storage.from.mockImplementation((bucket: string) => ({
      ...realFrom(bucket),
      download: jest.fn(async (_path: string) => ({ data: rnBlob as unknown as Blob, error: null })),
    }));
    try {
      const files: Record<string, Uint8Array> = { 'photos/spot-1/media-2.jpg': BYTES };
      expect(await downloadMissingPhotos(db, asClient(fake), ME, memoryIO(files))).toBe(1);
      expect(files['photos/spot-1/media-1.jpg']).toEqual(BYTES);
    } finally {
      globalThis.FileReader = realFileReader;
    }
  });

  it('skips the photos of a deleted spot', async () => {
    await db.runAsync('UPDATE spots SET deleted_at = ?, rev = 99 WHERE id = ?', T2, 'spot-1');
    const io = memoryIO({});
    expect(await downloadMissingPhotos(db, asClient(fake), ME, io)).toBe(0);
    expect(io.exists).not.toHaveBeenCalled();
  });

  it('stops after `limit` downloads', async () => {
    const io = memoryIO({});
    expect(await downloadMissingPhotos(db, asClient(fake), ME, io, 1)).toBe(1);
    expect(io.write).toHaveBeenCalledTimes(1);
  });

  it('never downloads another rider’s photos or a photo taken on this phone that never reached the server', async () => {
    await insertSpot(db, createTestSpot({ id: 'theirs', owner_id: OTHER }));
    await insertMedia(db, createTestMedia({ id: 'their-photo', spot_id: 'theirs', file_path: 'photos/theirs/their-photo.jpg' }));
    await insertSpot(db, createTestSpot({ id: 'local', owner_id: ME }));
    await insertMedia(db, createTestMedia({ id: 'unsent', spot_id: 'local', file_path: 'photos/local/unsent.jpg' }));
    const files: Record<string, Uint8Array> = {
      'photos/spot-1/media-1.jpg': BYTES,
      'photos/spot-1/media-2.jpg': BYTES,
    };
    const io = memoryIO(files);
    expect(await downloadMissingPhotos(db, asClient(fake), ME, io)).toBe(0);
    expect(fake.storage.from).not.toHaveBeenCalledWith('photos');
  });
});
