import type { SQLiteDatabase } from 'expo-sqlite';
import { createTestDb } from './helpers/node-sqlite-db';
import { insertSpot, getSpots } from '@/src/db';
import {
  migrateDb,
  MIGRATIONS,
  LATEST_SCHEMA_VERSION,
  getSchemaVersion,
  type Migration,
} from '@/src/db/schema';
import { createTestSpot } from './factories';

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
