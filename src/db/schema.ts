import type { SQLiteDatabase } from 'expo-sqlite';

export const DB_NAME = 'spot_finder.db';
export const SCHEMA_VERSION = 1;

export async function migrateDb(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`PRAGMA journal_mode = WAL;`);

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
