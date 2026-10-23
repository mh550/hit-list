import type { SQLiteDatabase } from 'expo-sqlite';
import { isObject } from '@/src/utils/is-object';

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

/**
 * Version 2: who uploaded a photo (`media.uploaded_by`, unset until accounts exist), and the
 * `updated_at` / `deleted_at` rows that SQLite stamped as `YYYY-MM-DD HH:MM:SS` before the app
 * wrote ISO 8601 itself become ISO, so every timestamp has one format. A value strftime cannot
 * parse is left alone: NULL would un-delete a spot or abort the migration.
 */
async function migration2(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`ALTER TABLE media ADD COLUMN uploaded_by TEXT;`);
  await db.execAsync(`
    UPDATE spots SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
      WHERE updated_at NOT LIKE '%T%' AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) IS NOT NULL;
    UPDATE spots SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', deleted_at)
      WHERE deleted_at NOT LIKE '%T%' AND strftime('%Y-%m-%dT%H:%M:%fZ', deleted_at) IS NOT NULL;
  `);
}

/** The four JSON columns migration 3 reads from a version 2 spot row. */
export interface SpotRowV2 {
  feature_json: string;
  in_run_json: string;
  landing_json: string;
  metadata_json: string;
}

/**
 * The version 2 spot columns migration 3 archives and drops, named once here so tests that build a v2 DB
 * (src/__tests__/db-migrate.test.ts) don't spell the old model outside the migration.
 */
export const SPOT_V2_COLUMNS = {
  status: 'status',
  feature: 'feature_json',
  inRun: 'in_run_json',
  landing: 'landing_json',
  metadata: 'metadata_json',
} as const satisfies Record<string, 'status' | keyof SpotRowV2>;

/** The values migration 3 writes into a spot row's new columns. */
export interface SpotColumnsV3 {
  feature_types_json: string;
  stopped: 0 | 1;
  natural_speed: number | null;
  notes: string | null;
  legacy_json: string | null;
}

/**
 * What migration 3 archived from the removed fields (spec §4): the `legacy_json` of a version 3 spot, read only through
 * getSpotLegacy. Lengths in metres. A type, not an interface, so it passes as a `Record<string, unknown>`
 * (formatLegacyDetails).
 */
export type SpotLegacy = {
  custom_type?: string;
  shape?: string;
  length_m?: number;
  height_m?: number;
  width_m?: number;
  material?: string;
  stop_type?: string;
  stop_description?: string;
  removable?: boolean;
  difficulty?: number;
  setup_options?: unknown[];
  landing_difficulty?: number;
  landing_surface?: string;
  intensity?: number;
  bustability?: number;
  bustability_notes?: string;
  // A column that was not valid JSON, kept verbatim.
  raw_feature?: string;
  raw_in_run?: string;
  raw_landing?: string;
  raw_metadata?: string;
};

// The feature types that survive migration 3 ('other' is gone, D19). Literal on purpose: a migration must not
// change meaning when the app's enums do.
const KEPT_FEATURE_TYPES = ['rail', 'ledge', 'bank', 'hip', 'stair_set', 'gap', 'wall_ride', 'quarter_pipe'];

type Json = Record<string, unknown>;

/** Empty never reaches the archive: missing, null, blank text, an empty array, a non-finite number, `false`. */
function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null || v === false) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (typeof v === 'number') return !Number.isFinite(v);
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/**
 * Maps one version 2 spot row to the version 3 columns (spec §4). Never throws on row data: a column that is not
 * a JSON object is kept verbatim as `legacy.raw_<name>` (raw_feature, raw_in_run, …), since a throw would leave the DB at version 2 under a
 * version 3 mapper and no spot would load. `status` and `is_stopped` are never archived (every row had them, and
 * is_stopped became `stopped`); neither is `removable: false`, which the edit screen wrote by default.
 */
export function migrateSpotRowV3(row: SpotRowV2): SpotColumnsV3 {
  const legacy: Json = {};
  const parse = (column: keyof SpotRowV2): Json => {
    try {
      const value: unknown = JSON.parse(row[column]);
      if (isObject(value)) return value;
    } catch {
      // not JSON: archived verbatim below unless blank
    }
    const text: unknown = row[column];
    if (!(typeof text === 'string' && text.trim() === '')) legacy[`raw_${column.replace(/_json$/, '')}`] = text;
    return {};
  };
  const feature = parse('feature_json');
  const inRun = parse('in_run_json');
  const landing = parse('landing_json');
  const metadata = parse('metadata_json');
  const dimensions = isObject(feature.dimensions) ? feature.dimensions : {};
  const stops = isObject(feature.skate_stops) ? feature.skate_stops : {};
  // The old edit screen appended { requires: [] } on "Add Setup Option"; one left unpicked is not data.
  const setupOptions = Array.isArray(inRun.setup_options)
    ? inRun.setup_options.filter((o) => !(isObject(o) && Array.isArray(o.requires) && o.requires.length === 0))
    : inRun.setup_options;

  const archived: [string, unknown][] = [
    ['custom_type', feature.custom_type],
    ['shape', feature.shape],
    ['length_m', dimensions.length],
    ['height_m', dimensions.height],
    ['width_m', dimensions.width],
    ['material', feature.material],
    ['stop_type', stops.stop_type],
    ['stop_description', stops.stop_description],
    ['removable', stops.removable],
    ['difficulty', feature.difficulty],
    ['setup_options', setupOptions],
    ['landing_difficulty', landing.difficulty],
    ['landing_surface', landing.surface],
    ['intensity', metadata.intensity],
    ['bustability', metadata.bustability],
    ['bustability_notes', metadata.bustability_notes],
  ];
  for (const [key, value] of archived) {
    if (!isEmptyValue(value)) legacy[key] = value;
  }

  const type = feature.type;
  const speed = inRun.natural_speed;
  const notes = metadata.notes;
  return {
    feature_types_json: JSON.stringify(
      typeof type === 'string' && KEPT_FEATURE_TYPES.includes(type) ? [type] : [],
    ),
    stopped: stops.is_stopped === true ? 1 : 0,
    natural_speed: typeof speed === 'number' && Number.isInteger(speed) && speed >= 1 && speed <= 5 ? speed - 1 : null,
    notes: typeof notes === 'string' && notes.trim() !== '' ? notes : null,
    legacy_json: Object.keys(legacy).length > 0 ? JSON.stringify(legacy) : null,
  };
}

/**
 * Version 3: the trimmed spot (spec §2.1, §4). New columns `feature_types_json`, `stopped`, `natural_speed` (0–4),
 * `notes`; every other non-empty old field is archived in `legacy_json`; the table is rebuilt without `status` and
 * the four JSON columns (foreign keys are off here, so dropping spots does not cascade to media).
 */
async function migration3(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    ALTER TABLE spots ADD COLUMN feature_types_json TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE spots ADD COLUMN stopped INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE spots ADD COLUMN natural_speed INTEGER;
    ALTER TABLE spots ADD COLUMN notes TEXT;
    ALTER TABLE spots ADD COLUMN legacy_json TEXT;
  `);

  const rows = await db.getAllAsync<SpotRowV2 & { id: string }>(
    'SELECT id, feature_json, in_run_json, landing_json, metadata_json FROM spots',
  );
  for (const row of rows) {
    const v3 = migrateSpotRowV3(row);
    await db.runAsync(
      'UPDATE spots SET feature_types_json = ?, stopped = ?, natural_speed = ?, notes = ?, legacy_json = ? WHERE id = ?',
      v3.feature_types_json,
      v3.stopped,
      v3.natural_speed,
      v3.notes,
      v3.legacy_json,
      row.id,
    );
  }

  await db.execAsync(`
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
      primary_photo_id TEXT
    );
    INSERT INTO spots_new (id, name, generated_name, latitude, longitude, created_at, updated_at, deleted_at,
                           feature_types_json, stopped, natural_speed, notes, legacy_json, primary_photo_id)
      SELECT id, name, generated_name, latitude, longitude, created_at, updated_at, deleted_at,
             feature_types_json, stopped, natural_speed, notes, legacy_json, primary_photo_id FROM spots;
    DROP TABLE spots;
    ALTER TABLE spots_new RENAME TO spots;
    CREATE INDEX IF NOT EXISTS idx_spots_deleted_at ON spots(deleted_at);
  `);
}

/**
 * Version 4: hit lists (S1). A list holds many spots and a spot sits in many lists (hit_list_spots). The area
 * columns are reserved for area lists (S2) and owner_id / added_by for accounts, so neither adds a migration.
 * IF NOT EXISTS like migration 1. (A crashed launch leaves nothing behind: the DDL runs in the migration's
 * transaction. A v3 DB with an older, incompatible hit_lists table would fail on the index and keep the upgrade
 * screen up; no build ever made one.)
 */
async function migration4(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS hit_lists (
      id TEXT PRIMARY KEY NOT NULL,
      owner_id TEXT,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'manual',
      area_center_lat REAL,
      area_center_lng REAL,
      area_radius_m INTEGER,
      area_filters_json TEXT,
      area_place TEXT,
      shared INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS hit_list_spots (
      list_id TEXT NOT NULL REFERENCES hit_lists(id) ON DELETE CASCADE,
      spot_id TEXT NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
      added_by TEXT,
      added_at TEXT NOT NULL,
      PRIMARY KEY (list_id, spot_id)
    );
    CREATE INDEX IF NOT EXISTS idx_hit_lists_deleted_at ON hit_lists(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_hit_list_spots_spot_id ON hit_list_spots(spot_id);
  `);
}

/**
 * The outbox rule as SQL (migration 5): a row is queued when it belongs to the phone's account (`sync_state.user_id`)
 * and the write kept its `rev`. Only a pull writes `rev` (always the server's, always newer), so pulled rows never
 * echo back; NULL-owned (phone-only) rows and other riders' rows (S8) never queue. Literal on purpose, like
 * KEPT_FEATURE_TYPES.
 */
const ME = `(SELECT value FROM sync_state WHERE key = 'user_id')`;
const NOW_ISO = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;
const OUTBOX_OP = `CASE WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN 'delete' ELSE 'upsert' END`;

/** The insert and update triggers of a table whose rows carry owner_id, deleted_at and rev. */
const ownedTableTriggers = (table: string, entity: string) => `
  CREATE TRIGGER ${table}_outbox_ins AFTER INSERT ON ${table}
    WHEN NEW.owner_id = ${ME} AND NEW.rev IS NULL
    BEGIN
      INSERT INTO sync_outbox (entity, entity_id, op, created_at) VALUES ('${entity}', NEW.id, 'upsert', ${NOW_ISO});
    END;
  CREATE TRIGGER ${table}_outbox_upd AFTER UPDATE ON ${table}
    WHEN NEW.owner_id = ${ME} AND NEW.rev IS OLD.rev
    BEGIN
      INSERT INTO sync_outbox (entity, entity_id, op, created_at) VALUES ('${entity}', NEW.id, ${OUTBOX_OP}, ${NOW_ISO});
    END;
`;

/** A membership is the account's when its list and its spot both are (a NULL-owned spot is queued by adoption). */
const membershipIsMine = (row: 'NEW' | 'OLD') =>
  `(SELECT owner_id FROM hit_lists WHERE id = ${row}.list_id) = ${ME} AND (SELECT owner_id FROM spots WHERE id = ${row}.spot_id) = ${ME}`;

/**
 * Version 5: sync (S5, docs/plans/2026-10-22-s5-sync.md). `owner_id` on spots and media (hit_lists has it since 4;
 * NULL = phone-only, not adopted), the server `rev` last pulled on all four tables, media `updated_at`/`deleted_at`
 * (removing a photo becomes a soft delete), the outbox and sync state, and the triggers that append an outbox row
 * inside the writing statement, so a write and its outbox row commit or fail together without a BEGIN on the shared
 * connection. sync_queue never had a reader and is dropped (D65). created_at values SQLite stamped as
 * `YYYY-MM-DD HH:MM:SS` become ISO, as migration 2 did for updated_at.
 */
async function migration5(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    ALTER TABLE spots ADD COLUMN owner_id TEXT;
    ALTER TABLE spots ADD COLUMN rev INTEGER;
    ALTER TABLE media ADD COLUMN owner_id TEXT;
    ALTER TABLE media ADD COLUMN rev INTEGER;
    ALTER TABLE media ADD COLUMN updated_at TEXT;
    ALTER TABLE media ADD COLUMN deleted_at TEXT;
    ALTER TABLE hit_lists ADD COLUMN rev INTEGER;
    ALTER TABLE hit_list_spots ADD COLUMN rev INTEGER;

    UPDATE spots SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at)
      WHERE created_at NOT LIKE '%T%' AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at) IS NOT NULL;
    UPDATE media SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at)
      WHERE created_at NOT LIKE '%T%' AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at) IS NOT NULL;
    UPDATE media SET updated_at = created_at;

    CREATE TABLE sync_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      op TEXT NOT NULL CHECK (op IN ('upsert', 'delete')),
      created_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      parked INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE sync_state (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT
    );

    DROP INDEX IF EXISTS idx_sync_queue_created_at;
    DROP TABLE IF EXISTS sync_queue;

    CREATE INDEX idx_spots_owner_id ON spots(owner_id);
    CREATE INDEX idx_media_owner_id ON media(owner_id);

    ${ownedTableTriggers('spots', 'spot')}
    ${ownedTableTriggers('media', 'media')}
    ${ownedTableTriggers('hit_lists', 'hit_list')}

    CREATE TRIGGER hit_list_spots_outbox_ins AFTER INSERT ON hit_list_spots
      WHEN NEW.rev IS NULL AND ${membershipIsMine('NEW')}
      BEGIN
        INSERT INTO sync_outbox (entity, entity_id, op, created_at)
          VALUES ('hit_list_spot', NEW.list_id || '/' || NEW.spot_id, 'upsert', ${NOW_ISO});
      END;
    -- A delete that is not the rider's (pull reconciliation, Remove, an account switch) marks the rows rev = -1 first.
    CREATE TRIGGER hit_list_spots_outbox_del AFTER DELETE ON hit_list_spots
      WHEN OLD.rev IS NOT -1 AND ${membershipIsMine('OLD')}
      BEGIN
        INSERT INTO sync_outbox (entity, entity_id, op, created_at)
          VALUES ('hit_list_spot', OLD.list_id || '/' || OLD.spot_id, 'delete', ${NOW_ISO});
      END;
  `);
}

/** MIGRATIONS[i] takes the DB from version i to i + 1. */
export const MIGRATIONS: readonly Migration[] = [migration1, migration2, migration3, migration4, migration5];
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
  // Foreign keys are per connection and can't be toggled inside a transaction, so they are set here, never in a
  // migration. They stay OFF while migrations run (SQLite's procedure for schema changes): a table rebuild's
  // DROP TABLE spots would otherwise cascade-delete every media row, and copying media would fail on old orphan
  // rows. They are ON afterwards for the app, even if a migration throws: media's ON DELETE CASCADE is real and
  // a media row for a missing spot is rejected.
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    const current = await getSchemaVersion(db);
    for (let v = current; v < migrations.length; v++) {
      await db.withTransactionAsync(async () => {
        await migrations[v](db);
        await db.execAsync(`PRAGMA user_version = ${v + 1}`);
      });
    }
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
}
