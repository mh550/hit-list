import type { SQLiteDatabase } from 'expo-sqlite';
import { createTestDb } from './helpers/node-sqlite-db';
import { insertSpot, getSpot, getSpots, getSpotLegacy, insertMedia, getMediaForSpot } from '@/src/db';
import {
  migrateDb,
  MIGRATIONS,
  LATEST_SCHEMA_VERSION,
  getSchemaVersion,
  migrateSpotRowV3,
  SPOT_V2_COLUMNS as V2,
  type Migration,
  type SpotRowV2,
} from '@/src/db/schema';
import { FeatureType, type Spot } from '@/src/types';
import { createTestMedia, createTestSpot } from './factories';
// v2 rows in the old nested model, kept as data so the removed field names stay out of TS code (M1-04 step 1).
import V2_SPOTS from './fixtures/v2-spots.json';

/** A v2 spot's status and four JSON columns, keyed by SPOT_V2_COLUMNS' names. */
type OldColumns = Partial<Record<keyof typeof V2, string>>;

/** The four JSON columns of a v2 row, empty as the builds before migration 3 defaulted them. */
const oldJsonColumns = (old: OldColumns): SpotRowV2 => ({
  [V2.feature]: old.feature ?? '{}',
  [V2.inRun]: old.inRun ?? '{"setup_options":[]}',
  [V2.landing]: old.landing ?? '{}',
  [V2.metadata]: old.metadata ?? '{}',
});

/** Inserts `spot` as builds before migration 3 stored it (status and four JSON columns); insertSpot writes v3's columns. */
async function insertOldSpot(db: SQLiteDatabase, spot: Spot, old: OldColumns = {}): Promise<void> {
  const json = oldJsonColumns(old);
  await db.runAsync(
    `INSERT INTO spots (id, name, generated_name, latitude, longitude, created_at, updated_at, deleted_at, ${V2.status}, ${V2.feature}, ${V2.inRun}, ${V2.landing}, ${V2.metadata}, primary_photo_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    spot.id,
    spot.name ?? null,
    spot.generated_name ?? null,
    spot.location.latitude,
    spot.location.longitude,
    spot.created_at,
    spot.updated_at,
    spot.deleted_at ?? null,
    old.status ?? 'draft',
    json[V2.feature],
    json[V2.inRun],
    json[V2.landing],
    json[V2.metadata],
    spot.primary_photo_id ?? null,
  );
}

/** Inserts `spot` with the columns of versions 3 and 4; insertSpot writes version 5's owner_id too. */
async function insertV3Spot(db: SQLiteDatabase, spot: Spot): Promise<void> {
  await db.runAsync(
    `INSERT INTO spots (id, name, generated_name, latitude, longitude, created_at, updated_at, deleted_at, feature_types_json, stopped, natural_speed, notes, primary_photo_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    spot.id,
    spot.name ?? null,
    spot.generated_name ?? null,
    spot.location.latitude,
    spot.location.longitude,
    spot.created_at,
    spot.updated_at,
    spot.deleted_at ?? null,
    JSON.stringify(spot.feature_types),
    spot.stopped ? 1 : 0,
    spot.natural_speed ?? null,
    spot.notes ?? null,
    spot.primary_photo_id ?? null,
  );
}

const tables = async (db: SQLiteDatabase) =>
  (
    await db.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
    )
  ).map((r) => r.name);

describe('migrateDb (PRAGMA user_version)', () => {
  it('brings a fresh DB to the latest version with all tables', async () => {
    const db = createTestDb();

    await migrateDb(db);

    expect(await getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(await tables(db)).toEqual([
      'hit_list_spots',
      'hit_lists',
      'media',
      'profiles',
      'spots',
      'sqlite_sequence',
      'sync_outbox',
      'sync_state',
      'user_settings',
    ]);
    // A fresh install has nothing to migrate: an empty v3 spots table.
    expect(await getSpots(db)).toEqual([]);
    const columns = (await db.getAllAsync<{ name: string }>('PRAGMA table_info(spots)')).map((c) => c.name);
    expect(columns).toEqual(expect.arrayContaining(['feature_types_json', 'stopped', 'natural_speed', 'notes', 'legacy_json']));
    expect(columns).not.toContain(V2.feature);
  });

  it('is a no-op the second time', async () => {
    const db = createTestDb();
    const m1 = jest.fn(async () => {});

    await migrateDb(db, [m1]);
    await migrateDb(db, [m1]);

    expect(m1).toHaveBeenCalledTimes(1);
  });

  it('upgrades a v0 DB that already has the tables and keeps its rows', async () => {
    const db = createTestDb();
    await MIGRATIONS[0](db); // an earlier build: tables exist, user_version still 0
    const spot = createTestSpot({ name: 'kept' });
    await insertOldSpot(db, spot);
    expect(await getSchemaVersion(db)).toBe(0);

    await migrateDb(db);

    expect(await getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(await getSpots(db)).toEqual([spot]);
  });

  describe('migration 2 (media.uploaded_by, ISO timestamps)', () => {
    /** A DB as the first versioned build left it: at version 1. */
    const v1Db = async () => {
      const db = createTestDb();
      await migrateDb(db, [MIGRATIONS[0]]);
      expect(await getSchemaVersion(db)).toBe(1);
      return db;
    };

    it('adds media.uploaded_by and keeps every spot and photo', async () => {
      const db = await v1Db();
      const spot = createTestSpot({ name: 'kept' });
      await insertOldSpot(db, spot);
      await db.runAsync(
        `INSERT INTO media (id, spot_id, file_path, created_at) VALUES ('m1', ?, 'photos/a/m1.jpg', '2026-10-13T11:00:00.000Z')`,
        spot.id,
      );

      await migrateDb(db);

      expect(await getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
      expect(await getSpots(db)).toEqual([spot]);
      const columns = (await db.getAllAsync<{ name: string }>('PRAGMA table_info(media)')).map((c) => c.name);
      expect(columns).toContain('uploaded_by');
      const [m] = await getMediaForSpot(db, spot.id);
      expect(m.id).toBe('m1');
      expect(m.uploaded_by).toBeUndefined(); // no accounts yet: nothing to attribute an old photo to
    });

    it("rewrites updated_at and deleted_at written in SQLite's 'YYYY-MM-DD HH:MM:SS' format to ISO", async () => {
      // Before the ISO change, updateSpot/softDeleteSpot let SQLite stamp datetime('now'); nothing reads
      // those columns yet, but one format is what every later reader expects.
      const db = await v1Db();
      const live = createTestSpot({ created_at: '2026-10-13T12:00:00.000Z' });
      const gone = createTestSpot({ created_at: '2026-10-13T12:00:00.000Z' });
      await insertOldSpot(db, live);
      await insertOldSpot(db, gone);
      await db.runAsync(`UPDATE spots SET updated_at = '2026-10-13 12:34:56' WHERE id = ?`, live.id);
      await db.runAsync(
        `UPDATE spots SET updated_at = '2026-10-14 01:02:03', deleted_at = '2026-10-14 01:02:03' WHERE id = ?`,
        gone.id,
      );

      await migrateDb(db);

      const rows = await db.getAllAsync<{ id: string; updated_at: string; deleted_at: string | null }>(
        'SELECT id, updated_at, deleted_at FROM spots ORDER BY updated_at',
      );
      expect(rows).toEqual([
        { id: live.id, updated_at: '2026-10-13T12:34:56.000Z', deleted_at: null },
        { id: gone.id, updated_at: '2026-10-14T01:02:03.000Z', deleted_at: '2026-10-14T01:02:03.000Z' },
      ]);
    });

    it('leaves a value it cannot parse alone rather than nulling it', async () => {
      // strftime of garbage is NULL: that would un-delete a spot (deleted_at) or abort the migration (updated_at NOT NULL).
      const db = await v1Db();
      const spot = createTestSpot();
      await insertOldSpot(db, spot);
      await db.runAsync(`UPDATE spots SET updated_at = 'garbage', deleted_at = 'more garbage' WHERE id = ?`, spot.id);

      await migrateDb(db);

      expect(await getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
      expect(
        await db.getFirstAsync('SELECT updated_at, deleted_at FROM spots WHERE id = ?', spot.id),
      ).toEqual({ updated_at: 'garbage', deleted_at: 'more garbage' });
    });

    it('leaves ISO timestamps as they are', async () => {
      const db = await v1Db();
      const spot = createTestSpot({ updated_at: '2026-10-13T12:34:56.789Z' });
      await insertOldSpot(db, spot);

      await migrateDb(db);

      expect(await getSpots(db)).toEqual([spot]);
    });

    it('a fresh DB accepts a media row with uploaded_by', async () => {
      const db = createTestDb();
      await migrateDb(db);
      const spot = createTestSpot();
      await insertSpot(db, spot);
      const m = createTestMedia({ spot_id: spot.id, uploaded_by: 'user-1' });

      await insertMedia(db, m);

      expect(await getMediaForSpot(db, spot.id)).toEqual([m]);
    });
  });

  describe('migration 3 (trimmed spot: feature_types, stopped, natural_speed, notes; the rest archived)', () => {
    /** A DB as the builds before the simplification left it: at version 2. */
    const v2Db = async () => {
      const db = createTestDb();
      await migrateDb(db, MIGRATIONS.slice(0, 2));
      expect(await getSchemaVersion(db)).toBe(2);
      return db;
    };

    type V3Row = {
      feature_types_json: string;
      stopped: number;
      natural_speed: number | null;
      notes: string | null;
      legacy_json: string | null;
    };
    const v3Row = async (db: SQLiteDatabase, id: string) =>
      db.getFirstAsync<V3Row>(
        'SELECT feature_types_json, stopped, natural_speed, notes, legacy_json FROM spots WHERE id = ?',
        id,
      );
    const addTwoPhotos = async (db: SQLiteDatabase, spotId: string) => {
      for (const photo of [createTestMedia({ spot_id: spotId }), createTestMedia({ spot_id: spotId })]) {
        await db.runAsync(
          'INSERT INTO media (id, spot_id, file_path, created_at) VALUES (?, ?, ?, ?)',
          photo.id,
          photo.spot_id,
          photo.file_path,
          photo.created_at,
        );
      }
    };

    /** A v2 spot as stored: status plus the four JSON columns as objects. */
    type OldSpot = { status: string; feature: object; inRun: object; landing: object; metadata: object };
    const oldColumns = ({ status, feature, inRun, landing, metadata }: OldSpot): OldColumns => ({
      status,
      feature: JSON.stringify(feature),
      inRun: JSON.stringify(inRun),
      landing: JSON.stringify(landing),
      metadata: JSON.stringify(metadata),
    });
    /** Every old field set: type other + custom type, stops, two setup options, a draft. */
    const FULL = oldColumns(V2_SPOTS.full);
    const FULL_LEGACY = V2_SPOTS.fullLegacy;
    /** Every old field present but empty, as the edit screen wrote them. */
    const EMPTY = oldColumns(V2_SPOTS.empty);

    it('maps the full-fat v2 spot and archives every removed field (but not status, is_stopped or notes)', async () => {
      const db = await v2Db();
      const full = createTestSpot({ name: 'full' });
      await insertOldSpot(db, full, FULL);

      await migrateDb(db);

      expect(await getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
      const row = await v3Row(db, full.id);
      expect(row).toMatchObject({ feature_types_json: '[]', stopped: 1, natural_speed: 3, notes: 'hello' });
      expect(JSON.parse(row?.legacy_json ?? 'null')).toEqual(FULL_LEGACY);
      expect(await getSpot(db, full.id)).toMatchObject({
        name: 'full',
        feature_types: [],
        stopped: true,
        natural_speed: 3,
        notes: 'hello',
      });
      expect(await getSpotLegacy(db, full.id)).toEqual(FULL_LEGACY);
    });

    it("a v2 rail spot with nothing else gets feature_types ['rail'] and no legacy", async () => {
      const db = await v2Db();
      const rail = createTestSpot();
      await insertOldSpot(db, rail, { feature: '{"type":"rail"}' });

      await migrateDb(db);

      expect(await v3Row(db, rail.id)).toEqual({
        feature_types_json: '["rail"]',
        stopped: 0,
        natural_speed: null,
        notes: null,
        legacy_json: null,
      });
      expect((await getSpot(db, rail.id))?.feature_types).toEqual([FeatureType.Rail]);
    });

    it('a v2 spot with every field empty gets defaults and legacy_json NULL', async () => {
      const db = await v2Db();
      const empty = createTestSpot();
      await insertOldSpot(db, empty, EMPTY);

      await migrateDb(db);

      expect(await v3Row(db, empty.id)).toEqual({
        feature_types_json: '[]',
        stopped: 0,
        natural_speed: null,
        notes: null,
        legacy_json: null,
      });
      expect(await getSpots(db)).toEqual([empty]);
      expect(await getSpotLegacy(db, empty.id)).toBeNull();
    });

    it('old natural speed 1 becomes 0, which survives getSpot as a real value', async () => {
      const db = await v2Db();
      const slow = createTestSpot();
      await insertOldSpot(db, slow, { inRun: '{"natural_speed":1,"setup_options":[]}' });

      await migrateDb(db);

      expect((await v3Row(db, slow.id))?.natural_speed).toBe(0);
      expect((await getSpot(db, slow.id))?.natural_speed).toBe(0);
    });

    it('keeps a column that is not JSON verbatim in legacy and still maps the others', async () => {
      // A throw here would leave the phone at v2 with a v3 mapper: no spot would load.
      const db = await v2Db();
      const odd = createTestSpot();
      await insertOldSpot(db, odd, {
        feature: 'not json',
        inRun: '{"natural_speed":5,"setup_options":[]}',
        metadata: '{"notes":"still here"}',
      });

      await migrateDb(db);

      expect(await getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
      const row = await v3Row(db, odd.id);
      expect(row).toMatchObject({ feature_types_json: '[]', stopped: 0, natural_speed: 4, notes: 'still here' });
      expect(JSON.parse(row?.legacy_json ?? 'null')).toEqual({ raw_feature: 'not json' });
    });

    it('a throw late in migration 3 (at the rebuild) leaves version 2 and the v2 spots table intact', async () => {
      const db = await v2Db();
      const spot = createTestSpot();
      await insertOldSpot(db, spot, { feature: '{"type":"rail"}' });
      await addTwoPhotos(db, spot.id);
      await db.execAsync('CREATE TABLE spots_new (x)'); // the ALTERs and backfill run, then CREATE TABLE spots_new fails

      await expect(migrateDb(db)).rejects.toThrow(/spots_new/);

      expect(await getSchemaVersion(db)).toBe(2);
      const columns = (await db.getAllAsync<{ name: string }>('PRAGMA table_info(spots)')).map((c) => c.name);
      expect(columns).toContain(V2.feature);
      expect(columns).not.toContain('feature_types_json');
      expect(await db.getAllAsync(`SELECT id, ${V2.feature} AS feature FROM spots`)).toEqual([
        { id: spot.id, feature: '{"type":"rail"}' },
      ]);
      expect(await db.getFirstAsync('SELECT COUNT(*) AS n FROM media')).toEqual({ n: 2 });
    });

    it('migrates soft-deleted spots too', async () => {
      const db = await v2Db();
      const gone = createTestSpot({ deleted_at: '2026-10-14T01:02:03.000Z' });
      await insertOldSpot(db, gone, { feature: '{"type":"ledge","shape":"long"}' });

      await migrateDb(db);

      expect(await v3Row(db, gone.id)).toMatchObject({
        feature_types_json: '["ledge"]',
        legacy_json: '{"shape":"long"}',
      });
      expect(
        (await db.getFirstAsync<{ deleted_at: string }>('SELECT deleted_at FROM spots WHERE id = ?', gone.id))
          ?.deleted_at,
      ).toBe('2026-10-14T01:02:03.000Z');
    });

    it('a v1 DB migrates 1 → 2 → 3', async () => {
      const db = createTestDb();
      await migrateDb(db, [MIGRATIONS[0]]);
      const spot = createTestSpot({ name: 'from v1' });
      await insertOldSpot(db, spot, FULL);
      await db.runAsync(`UPDATE spots SET updated_at = '2026-10-13 12:34:56' WHERE id = ?`, spot.id);

      await migrateDb(db);

      expect(await getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
      const columns = (await db.getAllAsync<{ name: string }>('PRAGMA table_info(media)')).map((c) => c.name);
      expect(columns).toContain('uploaded_by'); // migration 2 ran
      expect(await getSpot(db, spot.id)).toMatchObject({
        updated_at: '2026-10-13T12:34:56.000Z', // migration 2 ran
        stopped: true,
        natural_speed: 3,
        notes: 'hello',
      });
      expect(await getSpotLegacy(db, spot.id)).toEqual(FULL_LEGACY);
    });

    it('migrating a v3 DB again changes nothing', async () => {
      const db = await v2Db();
      const spots = [createTestSpot(), createTestSpot(), createTestSpot()];
      await insertOldSpot(db, spots[0], FULL);
      await insertOldSpot(db, spots[1], EMPTY);
      await insertOldSpot(db, spots[2], { feature: '{"type":"rail"}' });
      await migrateDb(db);
      const before = await db.getAllAsync('SELECT * FROM spots ORDER BY id');

      await migrateDb(db);

      expect(await getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
      expect(await db.getAllAsync('SELECT * FROM spots ORDER BY id')).toEqual(before);
    });

    it('keeps the two photos of every spot and leaves no foreign key violation', async () => {
      const db = await v2Db();
      const full = createTestSpot();
      const empty = createTestSpot();
      await insertOldSpot(db, full, FULL);
      await insertOldSpot(db, empty, EMPTY);
      await addTwoPhotos(db, full.id);
      await addTwoPhotos(db, empty.id);

      await migrateDb(db);

      expect(await getMediaForSpot(db, full.id)).toHaveLength(2);
      expect(await getMediaForSpot(db, empty.id)).toHaveLength(2);
      expect(await db.getAllAsync('PRAGMA foreign_key_check')).toEqual([]);
    });

    describe('migrateSpotRowV3 (one row, pure)', () => {
      const row = oldJsonColumns;

      it('drops a type that is not one of the eight kept ones', () => {
        expect(migrateSpotRowV3(row({ feature: '{"type":"tree"}' })).feature_types_json).toBe('[]');
        expect(migrateSpotRowV3(row({ feature: '{"type":"stair_set"}' })).feature_types_json).toBe(
          '["stair_set"]',
        );
      });

      it('maps only an integer natural speed 1–5', () => {
        const speed = (v: unknown) =>
          migrateSpotRowV3(row({ inRun: JSON.stringify({ natural_speed: v, setup_options: [] }) }))
            .natural_speed;
        expect([1, 2, 3, 4, 5].map(speed)).toEqual([0, 1, 2, 3, 4]);
        expect([0, 6, 2.5, '3', null].map(speed)).toEqual([null, null, null, null, null]);
      });

      it('treats whitespace-only text as empty and keeps real notes as typed', () => {
        const r = migrateSpotRowV3(
          row({ metadata: JSON.stringify(V2_SPOTS.blankTextMetadata) }),
        );
        expect(r).toMatchObject({ notes: null, legacy_json: null });
        expect(migrateSpotRowV3(row({ metadata: '{"notes":" gap "}' })).notes).toBe(' gap ');
      });

      it('keeps JSON that is not an object verbatim', () => {
        const r = migrateSpotRowV3(row({ landing: '[1]', metadata: 'null' }));
        expect(JSON.parse(r.legacy_json ?? 'null')).toEqual({ raw_landing: '[1]', raw_metadata: 'null' });
      });

      it('drops setup options with nothing picked (edit appended { requires: [] })', () => {
        const opts = (v: unknown) =>
          migrateSpotRowV3(row({ inRun: JSON.stringify({ setup_options: v }) })).legacy_json;
        expect(opts([{ requires: [] }, { requires: [] }])).toBeNull();
        expect(JSON.parse(opts([{ requires: [] }, { requires: [{ item: 'winch', category: 'gear' }] }]) ?? 'null')).toEqual({
          setup_options: [{ requires: [{ item: 'winch', category: 'gear' }] }],
        });
      });

      it('a blank column is empty, not archived as raw', () => {
        expect(migrateSpotRowV3(row({ feature: '', landing: '  ' })).legacy_json).toBeNull();
      });

      it('never archives is_stopped or removable: false (edit wrote it by default)', () => {
        const r = migrateSpotRowV3(
          row({ feature: JSON.stringify(V2_SPOTS.notStoppedCapsFeature) }),
        );
        expect(r.stopped).toBe(0);
        expect(JSON.parse(r.legacy_json ?? 'null')).toEqual({ stop_type: 'caps' });
      });
    });

    it('drops the old columns and idx_spots_status, keeps idx_spots_deleted_at', async () => {
      const db = await v2Db();

      await migrateDb(db, MIGRATIONS.slice(0, 3));

      const columns = (await db.getAllAsync<{ name: string }>('PRAGMA table_info(spots)')).map((c) => c.name);
      expect(columns).toEqual([
        'id',
        'name',
        'generated_name',
        'latitude',
        'longitude',
        'created_at',
        'updated_at',
        'deleted_at',
        'feature_types_json',
        'stopped',
        'natural_speed',
        'notes',
        'legacy_json',
        'primary_photo_id',
      ]);
      const indexes = (
        await db.getAllAsync<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'spots'`)
      ).map((r) => r.name);
      expect(indexes).toContain('idx_spots_deleted_at');
      expect(indexes).not.toContain('idx_spots_status');
    });
  });

  describe('migration 4 (hit_lists, hit_list_spots)', () => {
    /** A DB as the builds before hit lists left it: at version 3. */
    const v3Db = async () => {
      const db = createTestDb();
      await migrateDb(db, MIGRATIONS.slice(0, 3));
      expect(await getSchemaVersion(db)).toBe(3);
      return db;
    };
    const columnNames = async (db: SQLiteDatabase, table: string) =>
      (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`)).map((c) => c.name);
    const counts = async (db: SQLiteDatabase) =>
      Object.fromEntries(
        await Promise.all(
          ['spots', 'media', 'hit_lists', 'hit_list_spots'].map(async (t) => [
            t,
            (await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`))?.n,
          ]),
        ),
      );

    it('a v3 DB gains hit_lists and hit_list_spots with exactly these columns, and keeps its spots', async () => {
      const db = await v3Db();
      const spot = createTestSpot({ name: 'kept' });
      await insertV3Spot(db, spot);

      await migrateDb(db, MIGRATIONS.slice(0, 4));

      expect(await getSchemaVersion(db)).toBe(4);
      expect(await columnNames(db, 'hit_lists')).toEqual([
        'id',
        'owner_id',
        'name',
        'kind',
        'area_center_lat',
        'area_center_lng',
        'area_radius_m',
        'area_filters_json',
        'area_place',
        'shared',
        'created_at',
        'updated_at',
        'deleted_at',
      ]);
      expect(await columnNames(db, 'hit_list_spots')).toEqual(['list_id', 'spot_id', 'added_by', 'added_at']);
      await migrateDb(db); // getSpots reads version 5's columns
      expect(await getSpots(db)).toEqual([spot]);
    });

    it('creates the deleted_at and spot_id indexes', async () => {
      const db = await v3Db();

      await migrateDb(db);

      const indexes = (
        await db.getAllAsync<{ name: string }>(
          `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name IN ('hit_lists', 'hit_list_spots')`,
        )
      ).map((r) => r.name);
      expect(indexes).toEqual(expect.arrayContaining(['idx_hit_lists_deleted_at', 'idx_hit_list_spots_spot_id']));
    });

    it('defaults kind to manual and shared to 0, and both foreign keys cascade', async () => {
      const db = await v3Db();
      await migrateDb(db);

      await db.runAsync(
        `INSERT INTO hit_lists (id, name, created_at, updated_at) VALUES ('L', 'Downtown', 'x', 'x')`,
      );
      expect(await db.getFirstAsync('SELECT kind, shared, owner_id FROM hit_lists')).toEqual({
        kind: 'manual',
        shared: 0,
        owner_id: null,
      });
      const fks = await db.getAllAsync<{ table: string; on_delete: string }>(
        'PRAGMA foreign_key_list(hit_list_spots)',
      );
      expect(fks.map((f) => [f.table, f.on_delete]).sort()).toEqual([
        ['hit_lists', 'CASCADE'],
        ['spots', 'CASCADE'],
      ]);
    });

    it('the v2 fixture rows migrate 2 → 3 → 4 with their spots and media intact', async () => {
      const db = createTestDb();
      await migrateDb(db, MIGRATIONS.slice(0, 2));
      const asColumns = (old: { status: string; feature: object; inRun: object; landing: object; metadata: object }): OldColumns => ({
        status: old.status,
        feature: JSON.stringify(old.feature),
        inRun: JSON.stringify(old.inRun),
        landing: JSON.stringify(old.landing),
        metadata: JSON.stringify(old.metadata),
      });
      const full = createTestSpot({ name: 'full' });
      const empty = createTestSpot({ name: 'empty' });
      await insertOldSpot(db, full, asColumns(V2_SPOTS.full));
      await insertOldSpot(db, empty, asColumns(V2_SPOTS.empty));
      const photo = createTestMedia({ spot_id: full.id });
      await db.runAsync(
        'INSERT INTO media (id, spot_id, file_path, created_at) VALUES (?, ?, ?, ?)',
        photo.id,
        photo.spot_id,
        photo.file_path,
        photo.created_at,
      );

      await migrateDb(db);

      expect(await getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
      expect((await getSpots(db)).map((s) => s.name).sort()).toEqual(['empty', 'full']);
      expect(await getSpot(db, full.id)).toMatchObject({ stopped: true, natural_speed: 3, notes: 'hello' });
      expect(await getSpotLegacy(db, full.id)).toEqual(V2_SPOTS.fullLegacy);
      expect(await getMediaForSpot(db, full.id)).toEqual([photo]);
      expect(await db.getAllAsync('PRAGMA foreign_key_check')).toEqual([]);
    });

    it('migrating a v4 DB again changes nothing', async () => {
      const db = await v3Db();
      const spot = createTestSpot();
      await insertV3Spot(db, spot);
      await migrateDb(db, MIGRATIONS.slice(0, 4));
      await db.runAsync(
        `INSERT INTO hit_lists (id, name, created_at, updated_at) VALUES ('L', 'Downtown', 'x', 'x')`,
      );
      await db.runAsync(`INSERT INTO hit_list_spots (list_id, spot_id, added_at) VALUES ('L', ?, 'x')`, spot.id);
      const before = {
        lists: await db.getAllAsync('SELECT * FROM hit_lists'),
        members: await db.getAllAsync('SELECT * FROM hit_list_spots'),
        counts: await counts(db),
      };

      await migrateDb(db, MIGRATIONS.slice(0, 4));

      expect(await getSchemaVersion(db)).toBe(4);
      expect({
        lists: await db.getAllAsync('SELECT * FROM hit_lists'),
        members: await db.getAllAsync('SELECT * FROM hit_list_spots'),
        counts: await counts(db),
      }).toEqual(before);
    });

    it('a v3 DB that already holds an empty hit_lists table (IF NOT EXISTS) still upgrades', async () => {
      // A crashed or downgraded build may have left the table behind; the upgrade must not wedge on it.
      const db = await v3Db();
      await MIGRATIONS[3](db);

      await expect(migrateDb(db)).resolves.toBeUndefined();

      expect(await getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    });
  });

  describe('migration 5 (sync: owner_id, rev, sync_outbox, sync_state, outbox triggers)', () => {
    /** A DB as the builds before sync left it: at version 4. */
    const v4Db = async () => {
      const db = createTestDb();
      await migrateDb(db, MIGRATIONS.slice(0, 4));
      expect(await getSchemaVersion(db)).toBe(4);
      return db;
    };
    const columnNames = async (db: SQLiteDatabase, table: string) =>
      (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`)).map((c) => c.name);
    const schemaNames = async (db: SQLiteDatabase, type: 'index' | 'trigger') =>
      (
        await db.getAllAsync<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = ? ORDER BY name`, type)
      ).map((r) => r.name);

    it('adds owner_id to spots and media (hit_lists has it since 4), rev to all four tables, media updated_at/deleted_at', async () => {
      const db = await v4Db();
      expect(await columnNames(db, 'spots')).not.toContain('owner_id');

      await migrateDb(db, MIGRATIONS.slice(0, 5));

      expect(await getSchemaVersion(db)).toBe(5);
      for (const table of ['spots', 'media', 'hit_lists']) {
        expect(await columnNames(db, table)).toEqual(expect.arrayContaining(['owner_id', 'rev']));
      }
      expect(await columnNames(db, 'hit_list_spots')).toEqual(['list_id', 'spot_id', 'added_by', 'added_at', 'rev']);
      expect(await columnNames(db, 'media')).toEqual(expect.arrayContaining(['updated_at', 'deleted_at']));
    });

    it('creates sync_outbox and sync_state with exactly these columns', async () => {
      const db = await v4Db();

      await migrateDb(db);

      expect(await columnNames(db, 'sync_outbox')).toEqual([
        'id',
        'entity',
        'entity_id',
        'op',
        'created_at',
        'attempts',
        'last_error',
        'parked',
      ]);
      expect(await columnNames(db, 'sync_state')).toEqual(['key', 'value']);
    });

    it('drops sync_queue and its index (D65: nothing ever read it)', async () => {
      const db = await v4Db();
      expect(await tables(db)).toContain('sync_queue');

      await migrateDb(db);

      expect(await tables(db)).not.toContain('sync_queue');
      expect(await schemaNames(db, 'index')).not.toContain('idx_sync_queue_created_at');
      expect(
        await db.getFirstAsync(`SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE '%sync_queue%'`),
      ).toEqual({ n: 0 });
    });

    it('creates the owner_id indexes and the outbox triggers', async () => {
      const db = await v4Db();

      await migrateDb(db);

      expect(await schemaNames(db, 'index')).toEqual(
        expect.arrayContaining(['idx_spots_owner_id', 'idx_media_owner_id']),
      );
      expect(await schemaNames(db, 'trigger')).toEqual([
        'hit_list_spots_outbox_del',
        'hit_list_spots_outbox_ins',
        'hit_lists_outbox_ins',
        'hit_lists_outbox_upd',
        'media_outbox_ins',
        'media_outbox_upd',
        'spots_outbox_ins',
        'spots_outbox_upd',
      ]);
    });

    it('existing rows get no owner, no rev and no outbox row; media updated_at is backfilled from created_at', async () => {
      const db = await v4Db();
      const spot = createTestSpot({ name: 'kept' });
      await insertV3Spot(db, spot);
      await db.runAsync(
        `INSERT INTO media (id, spot_id, file_path, created_at) VALUES ('m1', ?, 'photos/a/m1.jpg', '2026-10-13T11:00:00.000Z')`,
        spot.id,
      );
      await db.runAsync(
        `INSERT INTO hit_lists (id, name, created_at, updated_at) VALUES ('L', 'Downtown', 'x', 'x')`,
      );

      await migrateDb(db);

      expect(await db.getFirstAsync('SELECT owner_id, rev FROM spots')).toEqual({ owner_id: null, rev: null });
      expect(await db.getFirstAsync('SELECT owner_id, rev, updated_at, deleted_at FROM media')).toEqual({
        owner_id: null,
        rev: null,
        updated_at: '2026-10-13T11:00:00.000Z',
        deleted_at: null,
      });
      expect(await db.getFirstAsync('SELECT owner_id, rev FROM hit_lists')).toEqual({ owner_id: null, rev: null });
      expect(await db.getFirstAsync('SELECT COUNT(*) AS n FROM sync_outbox')).toEqual({ n: 0 });
      expect(await db.getFirstAsync('SELECT COUNT(*) AS n FROM sync_state')).toEqual({ n: 0 });
      expect(await getSpots(db)).toEqual([spot]);
    });

    it("rewrites spots and media created_at stamped by SQLite ('YYYY-MM-DD HH:MM:SS') to ISO, leaving unreadable values alone", async () => {
      const db = await v4Db();
      await db.runAsync(
        `INSERT INTO spots (id, latitude, longitude, created_at, updated_at) VALUES ('old', 1, 2, '2026-10-13 12:34:56', '2026-10-13T12:34:56.000Z')`,
      );
      await db.runAsync(
        `INSERT INTO spots (id, latitude, longitude, created_at, updated_at) VALUES ('odd', 1, 2, 'yesterday', '2026-10-13T12:34:56.000Z')`,
      );
      await db.runAsync(
        `INSERT INTO media (id, spot_id, file_path, created_at) VALUES ('m1', 'old', 'photos/old/m1.jpg', '2026-10-14 01:02:03')`,
      );

      await migrateDb(db);

      expect(await db.getAllAsync('SELECT id, created_at FROM spots ORDER BY id')).toEqual([
        { id: 'odd', created_at: 'yesterday' },
        { id: 'old', created_at: '2026-10-13T12:34:56.000Z' },
      ]);
      expect(await db.getFirstAsync('SELECT created_at, updated_at FROM media')).toEqual({
        created_at: '2026-10-14T01:02:03.000Z',
        updated_at: '2026-10-14T01:02:03.000Z',
      });
    });

    it('the v2 fixture rows migrate 2 → 5 with their spots and media intact', async () => {
      const db = createTestDb();
      await migrateDb(db, MIGRATIONS.slice(0, 2));
      const asColumns = (old: { status: string; feature: object; inRun: object; landing: object; metadata: object }): OldColumns => ({
        status: old.status,
        feature: JSON.stringify(old.feature),
        inRun: JSON.stringify(old.inRun),
        landing: JSON.stringify(old.landing),
        metadata: JSON.stringify(old.metadata),
      });
      const full = createTestSpot({ name: 'full' });
      const empty = createTestSpot({ name: 'empty' });
      await insertOldSpot(db, full, asColumns(V2_SPOTS.full));
      await insertOldSpot(db, empty, asColumns(V2_SPOTS.empty));
      const photo = createTestMedia({ spot_id: full.id });
      await db.runAsync(
        'INSERT INTO media (id, spot_id, file_path, created_at) VALUES (?, ?, ?, ?)',
        photo.id,
        photo.spot_id,
        photo.file_path,
        photo.created_at,
      );

      await migrateDb(db, MIGRATIONS.slice(0, 5));

      expect(await getSchemaVersion(db)).toBe(5);
      expect(await db.getAllAsync('PRAGMA foreign_key_check')).toEqual([]);
      expect(await db.getFirstAsync('SELECT COUNT(*) AS n FROM sync_outbox')).toEqual({ n: 0 });
      // today's readers select the later migrations' columns too
      await migrateDb(db);
      expect((await getSpots(db)).map((s) => s.name).sort()).toEqual(['empty', 'full']);
      expect(await getSpot(db, full.id)).toMatchObject({ stopped: true, natural_speed: 3, notes: 'hello' });
      expect(await getSpotLegacy(db, full.id)).toEqual(V2_SPOTS.fullLegacy);
      expect(await getMediaForSpot(db, full.id)).toEqual([photo]);
    });

    it('migrating a v5 DB again changes nothing (rows, outbox and sync state stay)', async () => {
      const db = await v4Db();
      await migrateDb(db, MIGRATIONS.slice(0, 5));
      await db.runAsync("INSERT INTO sync_state (key, value) VALUES ('user_id', 'u1')");
      const spot = createTestSpot();
      await db.runAsync(
        `INSERT INTO spots (id, latitude, longitude, created_at, updated_at, feature_types_json, stopped, owner_id)
         VALUES (?, ?, ?, ?, ?, '[]', 0, 'u1')`,
        spot.id,
        spot.location.latitude,
        spot.location.longitude,
        spot.created_at,
        spot.updated_at,
      );
      const snapshot = async () => ({
        spots: await db.getAllAsync('SELECT * FROM spots'),
        outbox: await db.getAllAsync('SELECT * FROM sync_outbox'),
        state: await db.getAllAsync('SELECT * FROM sync_state'),
      });
      const before = await snapshot();
      expect(before.outbox).toHaveLength(1);

      await migrateDb(db, MIGRATIONS.slice(0, 5));

      expect(await getSchemaVersion(db)).toBe(5);
      expect(await snapshot()).toEqual(before);
    });
  });

  describe('migration 6 (profiles: the local mirror of friend names, D72)', () => {
    /** A DB as S5's builds left it: at version 5. */
    const v5Db = async () => {
      const db = createTestDb();
      await migrateDb(db, MIGRATIONS.slice(0, 5));
      expect(await getSchemaVersion(db)).toBe(5);
      return db;
    };
    const columns = async (db: SQLiteDatabase, table: string) =>
      (await db.getAllAsync<{ name: string; type: string; pk: number }>(`PRAGMA table_info(${table})`)).map(
        ({ name, type, pk }) => ({ name, type, pk }),
      );

    it('adds profiles (id TEXT primary key, username, display_name) to a v5 DB', async () => {
      const db = await v5Db();
      expect(await tables(db)).not.toContain('profiles');

      await migrateDb(db, MIGRATIONS.slice(0, 6));

      expect(await getSchemaVersion(db)).toBe(6);
      expect(await columns(db, 'profiles')).toEqual([
        { name: 'id', type: 'TEXT', pk: 1 },
        { name: 'username', type: 'TEXT', pk: 0 },
        { name: 'display_name', type: 'TEXT', pk: 0 },
      ]);
    });

    it('adds no trigger: a profile row never reaches the outbox', async () => {
      const db = await v5Db();
      const triggersBefore = await db.getAllAsync(`SELECT name FROM sqlite_master WHERE type = 'trigger'`);

      await migrateDb(db, MIGRATIONS.slice(0, 6));
      await db.runAsync("INSERT INTO sync_state (key, value) VALUES ('user_id', 'u1')");
      await db.runAsync("INSERT INTO profiles (id, username) VALUES ('p1', 'ana')");

      expect(await db.getAllAsync(`SELECT name FROM sqlite_master WHERE type = 'trigger'`)).toEqual(triggersBefore);
      expect(await db.getFirstAsync('SELECT COUNT(*) AS n FROM sync_outbox')).toEqual({ n: 0 });
    });

    it('migrating a v6 DB again changes nothing', async () => {
      const db = await v5Db();
      await migrateDb(db, MIGRATIONS.slice(0, 6));
      await db.runAsync("INSERT INTO profiles (id, username, display_name) VALUES ('p1', 'ana', 'Ana B')");

      await migrateDb(db, MIGRATIONS.slice(0, 6));

      expect(await getSchemaVersion(db)).toBe(6);
      expect(await db.getAllAsync('SELECT * FROM profiles')).toEqual([
        { id: 'p1', username: 'ana', display_name: 'Ana B' },
      ]);
    });
  });

  describe('migration 7 (a received send: spots.copied_from_send, spots.from_username, S7)', () => {
    /** A DB as S6's builds left it: at version 6. */
    const v6Db = async () => {
      const db = createTestDb();
      await migrateDb(db, MIGRATIONS.slice(0, 6));
      expect(await getSchemaVersion(db)).toBe(6);
      return db;
    };
    const columnNames = async (db: SQLiteDatabase, table: string) =>
      (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`)).map((c) => c.name);
    const schemaSql = async (db: SQLiteDatabase) =>
      db.getAllAsync(`SELECT type, name, sql FROM sqlite_master WHERE name <> 'spots' ORDER BY name`);

    it('is the last migration', () => {
      expect(MIGRATIONS).toHaveLength(7);
      expect(LATEST_SCHEMA_VERSION).toBe(7);
    });

    it('adds copied_from_send and from_username (TEXT, nullable) to spots and changes no other table', async () => {
      const db = await v6Db();
      const spotColumnsBefore = await columnNames(db, 'spots');
      const mediaColumnsBefore = await columnNames(db, 'media');
      const restBefore = await schemaSql(db);

      await migrateDb(db);

      expect(await getSchemaVersion(db)).toBe(7);
      expect(await columnNames(db, 'spots')).toEqual([...spotColumnsBefore, 'copied_from_send', 'from_username']);
      const info = await db.getAllAsync<{ name: string; type: string; notnull: number; dflt_value: unknown }>(
        'PRAGMA table_info(spots)',
      );
      expect(info.filter((c) => c.name === 'copied_from_send' || c.name === 'from_username')).toEqual([
        expect.objectContaining({ name: 'copied_from_send', type: 'TEXT', notnull: 0, dflt_value: null }),
        expect.objectContaining({ name: 'from_username', type: 'TEXT', notnull: 0, dflt_value: null }),
      ]);
      expect(await columnNames(db, 'media')).toEqual(mediaColumnsBefore);
      expect(await schemaSql(db)).toEqual(restBefore);
    });

    it('keeps a v6 spot as it was, with neither new field set', async () => {
      const db = await v6Db();
      const spot = createTestSpot({ name: 'Pier 57', natural_speed: 0 });
      await db.runAsync(
        `INSERT INTO spots (id, name, latitude, longitude, created_at, updated_at, feature_types_json, stopped, natural_speed)
         VALUES (?, ?, ?, ?, ?, ?, '[]', 0, 0)`,
        spot.id,
        spot.name!,
        spot.location.latitude,
        spot.location.longitude,
        spot.created_at,
        spot.updated_at,
      );

      await migrateDb(db);

      const read = await getSpot(db, spot.id);
      expect(read).toMatchObject({ name: 'Pier 57', natural_speed: 0 });
      expect(read?.copied_from_send).toBeUndefined();
      expect(read?.from_username).toBeUndefined();
    });

    it('the v2 fixture rows migrate 2 → 7 with their spots and media intact', async () => {
      const db = createTestDb();
      await migrateDb(db, MIGRATIONS.slice(0, 2));
      const full = createTestSpot({ name: 'full' });
      await insertOldSpot(db, full, {
        status: V2_SPOTS.full.status,
        feature: JSON.stringify(V2_SPOTS.full.feature),
        inRun: JSON.stringify(V2_SPOTS.full.inRun),
        landing: JSON.stringify(V2_SPOTS.full.landing),
        metadata: JSON.stringify(V2_SPOTS.full.metadata),
      });
      const photo = createTestMedia({ spot_id: full.id });
      await db.runAsync(
        'INSERT INTO media (id, spot_id, file_path, created_at) VALUES (?, ?, ?, ?)',
        photo.id,
        full.id,
        photo.file_path,
        photo.created_at,
      );

      await migrateDb(db);

      expect(await getSchemaVersion(db)).toBe(7);
      expect(await getSpot(db, full.id)).toMatchObject({ stopped: true, natural_speed: 3, notes: 'hello' });
      expect(await getSpotLegacy(db, full.id)).toEqual(V2_SPOTS.fullLegacy);
      expect((await getMediaForSpot(db, full.id)).map((m) => m.id)).toEqual([photo.id]);
    });

    it('migrating a v7 DB again changes nothing', async () => {
      const db = await v6Db();
      await migrateDb(db);
      const spot = createTestSpot({ copied_from_send: 'send-1', from_username: 'ana' });
      await insertSpot(db, spot);

      await migrateDb(db);

      expect(await getSchemaVersion(db)).toBe(7);
      expect(await getSpot(db, spot.id)).toMatchObject({ copied_from_send: 'send-1', from_username: 'ana' });
    });
  });

  it('rolls back a failing migration and stays at the previous version', async () => {
    const db = createTestDb();
    const boom: Migration = async (d) => {
      await d.execAsync('CREATE TABLE half_done (x)');
      throw new Error('boom');
    };

    await expect(migrateDb(db, [MIGRATIONS[0], boom])).rejects.toThrow('boom');

    expect(await getSchemaVersion(db)).toBe(1);
    expect(await tables(db)).not.toContain('half_done');
  });

  it('leaves a DB from a newer build alone', async () => {
    const db = createTestDb();
    await db.execAsync('PRAGMA user_version = 99');
    const m1 = jest.fn(async () => {});

    await expect(migrateDb(db, [m1])).resolves.toBeUndefined();

    expect(m1).not.toHaveBeenCalled();
    expect(await getSchemaVersion(db)).toBe(99);
  });
});
