import type { SQLiteDatabase } from 'expo-sqlite';
import { createTestDb, createMigratedTestDb } from './helpers/node-sqlite-db';
import { insertSpot, insertMedia, getMediaForSpot, softDeleteSpot } from '@/src/db';
import {
  migrateDb,
  MIGRATIONS,
  LATEST_SCHEMA_VERSION,
  getSchemaVersion,
  type Migration,
} from '@/src/db/schema';
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

  it('migrateDb leaves foreign keys on when a migration throws', async () => {
    // Guards the `finally`: the app keeps using this connection after a failed migration, and needs enforcement.
    const db = createTestDb();
    const boom: Migration = () => Promise.reject(new Error('boom'));

    await expect(migrateDb(db, [...MIGRATIONS, boom])).rejects.toThrow('boom');

    expect(await foreignKeys(db)).toBe(1);
  });

  describe('table-rebuild migrations (foreign keys must be off while schema changes run)', () => {
    // SQLite's documented rebuild: create X_new, copy, DROP X, rename. Same DDL as the tables at the latest version.
    const rebuildSpots: Migration = async (d) => {
      // Triggers on other tables that name spots must go first (and be recreated by a real rebuild), or the RENAME
      // fails: SQLite re-checks every trigger against the schema while spots does not exist.
      await d.execAsync(`
        DROP TRIGGER hit_list_spots_outbox_ins;
        DROP TRIGGER hit_list_spots_outbox_del;
        CREATE TABLE spots_new (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT,
          generated_name TEXT,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          deleted_at TEXT,
          feature_types_json TEXT NOT NULL DEFAULT '[]',
          stopped INTEGER NOT NULL DEFAULT 0,
          natural_speed INTEGER,
          notes TEXT,
          legacy_json TEXT,
          primary_photo_id TEXT,
          owner_id TEXT,
          rev INTEGER
        );
        INSERT INTO spots_new SELECT * FROM spots;
        DROP TABLE spots;
        ALTER TABLE spots_new RENAME TO spots;
      `);
    };
    const rebuildMedia: Migration = async (d) => {
      await d.execAsync(`
        CREATE TABLE media_new (
          id TEXT PRIMARY KEY NOT NULL,
          spot_id TEXT NOT NULL,
          file_path TEXT NOT NULL,
          captured_at TEXT,
          latitude REAL,
          longitude REAL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          uploaded_by TEXT,
          owner_id TEXT,
          rev INTEGER,
          updated_at TEXT,
          deleted_at TEXT,
          FOREIGN KEY (spot_id) REFERENCES spots(id) ON DELETE CASCADE
        );
        INSERT INTO media_new SELECT * FROM media;
        DROP TABLE media;
        ALTER TABLE media_new RENAME TO media;
      `);
    };
    const byId = (rows: { id: string }[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));

    it('rebuilding spots keeps the spot media', async () => {
      // DROP TABLE spots does an implicit DELETE; with foreign keys on, ON DELETE CASCADE wipes every photo.
      const db = await createMigratedTestDb();
      const spot = createTestSpot();
      await insertSpot(db, spot);
      const photos = [createTestMedia({ spot_id: spot.id }), createTestMedia({ spot_id: spot.id })];
      for (const photo of photos) await insertMedia(db, photo);

      await migrateDb(db, [...MIGRATIONS, rebuildSpots]);

      expect(byId(await getMediaForSpot(db, spot.id))).toEqual(byId(photos));
    });

    it('rebuilding media succeeds and keeps an old orphan row', async () => {
      // Phones may hold orphans from before enforcement; copying them into the new table must not hit a FK error.
      const db = createTestDb(); // foreign keys off, like the phone before this change
      await MIGRATIONS[0](db);
      await db.execAsync('PRAGMA user_version = 1');
      const orphan = createTestMedia({ spot_id: 'no-such-spot' });
      await db.runAsync(
        // the version 1 row shape: insertMedia writes today's columns
        'INSERT INTO media (id, spot_id, file_path, created_at) VALUES (?, ?, ?, ?)',
        orphan.id,
        orphan.spot_id,
        orphan.file_path,
        orphan.created_at,
      );

      await expect(migrateDb(db, [...MIGRATIONS, rebuildMedia])).resolves.toBeUndefined();

      expect(await getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION + 1);
      expect(await getMediaForSpot(db, 'no-such-spot')).toEqual([orphan]);
    });
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
