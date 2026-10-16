import type { SQLiteDatabase } from 'expo-sqlite';
import { createTestDb } from './helpers/node-sqlite-db';
import { insertSpot, getSpots, insertMedia, getMediaForSpot } from '@/src/db';
import {
  migrateDb,
  MIGRATIONS,
  LATEST_SCHEMA_VERSION,
  getSchemaVersion,
  type Migration,
} from '@/src/db/schema';
import { createTestMedia, createTestSpot } from './factories';

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
    expect(await tables(db)).toEqual(['media', 'spots', 'sync_queue', 'user_settings']);
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
    await insertSpot(db, spot);
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
      await insertSpot(db, spot);
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
      await insertSpot(db, live);
      await insertSpot(db, gone);
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

    it('leaves ISO timestamps as they are', async () => {
      const db = await v1Db();
      const spot = createTestSpot({ updated_at: '2026-10-13T12:34:56.789Z' });
      await insertSpot(db, spot);

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
