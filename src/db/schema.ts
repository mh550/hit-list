import type { SQLiteDatabase } from 'expo-sqlite';

export const DB_NAME = 'hit_list.db';

/** One schema step. Append new steps; never edit a shipped one. */
export type Migration = (db: SQLiteDatabase) => Promise<void>;

/** Version 1: the schema as it shipped before versioning (idempotent, so pre-versioning DBs adopt it). */
async function migration1(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS spots (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT,
      generated_name TEXT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      feature_json TEXT NOT NULL DEFAULT '{}',
      in_run_json TEXT NOT NULL DEFAULT '{"setup_options":[]}',
      landing_json TEXT NOT NULL DEFAULT '{}',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      primary_photo_id TEXT
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY NOT NULL,
      spot_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      captured_at TEXT,
      latitude REAL,
      longitude REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (spot_id) REFERENCES spots(id) ON DELETE CASCADE
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS user_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      retry_count INTEGER NOT NULL DEFAULT 0
    );
  `);

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_spots_status ON spots(status);
    CREATE INDEX IF NOT EXISTS idx_spots_deleted_at ON spots(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_media_spot_id ON media(spot_id);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_created_at ON sync_queue(created_at);
  `);
}

/** MIGRATIONS[i] takes the DB from version i to i + 1. */
export const MIGRATIONS: readonly Migration[] = [migration1];
export const LATEST_SCHEMA_VERSION = MIGRATIONS.length;

export async function getSchemaVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/**
 * Applies every pending migration, each in its own transaction together with its
 * `user_version` bump, so a failure leaves the DB at the last good version. A DB from a
 * newer build (version above what this build knows) is left untouched.
 */
export async function migrateDb(
  db: SQLiteDatabase,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;'); // not allowed inside a transaction
  // Per connection and a no-op inside a transaction, so every launch sets it here, never in a migration.
  // Makes media's ON DELETE CASCADE real and rejects media rows for a spot that doesn't exist.
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const current = await getSchemaVersion(db);
  for (let v = current; v < migrations.length; v++) {
    await db.withTransactionAsync(async () => {
      await migrations[v](db);
      await db.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}
