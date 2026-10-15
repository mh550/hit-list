import type { SQLiteDatabase } from 'expo-sqlite';
import { createTestDb, createMigratedTestDb } from './helpers/node-sqlite-db';
import { insertSpot, insertMedia, getMediaForSpot, softDeleteSpot } from '@/src/db';
import { migrateDb, LATEST_SCHEMA_VERSION } from '@/src/db/schema';
import { createTestMedia, createTestSpot } from './factories';

const foreignKeys = async (db: SQLiteDatabase) =>
  (await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys'))?.foreign_keys;

describe('foreign keys', () => {
  it('createTestDb starts with foreign keys off, like a fresh expo-sqlite connection', async () => {
    // Harness guard: otherwise node:sqlite's default (ON) would hide a missing PRAGMA in migrateDb.
    expect(await foreignKeys(createTestDb())).toBe(0);
  });

  it('migrateDb turns foreign keys on', async () => {
    // SQLite keeps this per connection and defaults to off, so the app must enable it itself.
    const db = createTestDb();

    await migrateDb(db);

    expect(await foreignKeys(db)).toBe(1);
  });

  it('migrateDb turns foreign keys on even when there is nothing to migrate', async () => {
    // Every launch is a new connection, but a launch after the first has no migration to run.
    // A fresh test connection already at the latest version stands in for that launch.
    const db = createTestDb();
    await db.execAsync(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION}`);
    expect(await foreignKeys(db)).toBe(0);

    await migrateDb(db);

    expect(await foreignKeys(db)).toBe(1);
  });

  describe('once migrated', () => {
    let db: SQLiteDatabase;

    beforeEach(async () => {
      db = await createMigratedTestDb();
    });

    it('hard-deleting a spot cascades to its media and leaves other spots media alone', async () => {
      // media.spot_id is declared ON DELETE CASCADE; that only works with foreign keys enforced.
      const doomed = createTestSpot();
      const other = createTestSpot();
      await insertSpot(db, doomed);
      await insertSpot(db, other);
      await insertMedia(db, createTestMedia({ spot_id: doomed.id }));
      const kept = createTestMedia({ spot_id: other.id });
      await insertMedia(db, kept);

      await db.runAsync('DELETE FROM spots WHERE id = ?', doomed.id);

      expect(await getMediaForSpot(db, doomed.id)).toEqual([]);
      expect(await getMediaForSpot(db, other.id)).toEqual([kept]);
    });

    it('rejects a media row whose spot does not exist', async () => {
      // Without enforcement a photo can point at a spot that was never saved.
      const orphan = createTestMedia({ spot_id: 'no-such-spot' });

      await expect(insertMedia(db, orphan)).rejects.toThrow();
      expect(await getMediaForSpot(db, 'no-such-spot')).toEqual([]);
    });

    it('soft-deleting a spot keeps its media', async () => {
      // Guard (D3): a soft delete is an UPDATE, so the cascade must not fire and photos stay.
      const spot = createTestSpot();
      await insertSpot(db, spot);
      const photo = createTestMedia({ spot_id: spot.id });
      await insertMedia(db, photo);

      await softDeleteSpot(db, spot.id);

      expect(await getMediaForSpot(db, spot.id)).toEqual([photo]);
    });
  });
});
