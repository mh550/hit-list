import type { SQLiteDatabase } from 'expo-sqlite';
import type { FeatureType, NaturalSpeed, Spot, SpotUpdate } from '@/src/types';
import type { SpotLegacy } from './schema';
import { isObject } from '@/src/utils/is-object';

/** A spots row as the app reads it: every column but `legacy_json`, which only getSpotLegacy reads. */
interface SpotRow {
  id: string;
  name: string | null;
  generated_name: string | null;
  latitude: number;
  longitude: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  feature_types_json: string;
  stopped: number;
  natural_speed: number | null;
  notes: string | null;
  primary_photo_id: string | null;
  owner_id: string | null;
  copied_from_send: string | null;
  from_username: string | null;
  owner_username: string | null;
}

const SPOT_COLUMNS =
  'id, name, generated_name, latitude, longitude, created_at, updated_at, deleted_at, feature_types_json, stopped, natural_speed, notes, primary_photo_id, owner_id, copied_from_send, from_username';

/** What getSpot/getSpots read: the columns plus the owner's @username from the profiles mirror (S8; never stored). */
const SPOT_READ = `${SPOT_COLUMNS
  .split(', ')
  .map((c) => `spots.${c}`)
  .join(', ')}, (SELECT username FROM profiles WHERE profiles.id = spots.owner_id) AS owner_username`;

/** Only the app writes this column, but one unreadable row must not take the whole list down with it. */
function parseFeatureTypes(row: SpotRow): FeatureType[] {
  try {
    const parsed: unknown = JSON.parse(row.feature_types_json);
    if (Array.isArray(parsed)) return parsed as FeatureType[];
  } catch {
    // fall through to the warning
  }
  console.warn(`[spots] unreadable feature_types_json on spot ${row.id}; reading it as untagged`);
  return [];
}

function rowToSpot(row: SpotRow): Spot {
  return {
    id: row.id,
    name: row.name ?? undefined,
    generated_name: row.generated_name ?? undefined,
    location: { latitude: row.latitude, longitude: row.longitude },
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at ?? undefined,
    feature_types: parseFeatureTypes(row),
    stopped: row.stopped === 1,
    // 0 (None) is a rating; only NULL is unset
    natural_speed: row.natural_speed === null ? undefined : (row.natural_speed as NaturalSpeed),
    notes: row.notes ?? undefined,
    primary_photo_id: row.primary_photo_id ?? undefined,
    owner_id: row.owner_id ?? undefined,
    copied_from_send: row.copied_from_send ?? undefined,
    from_username: row.from_username ?? undefined,
    ...(row.owner_username ? { owner_username: row.owner_username } : {}),
  };
}

/**
 * An owned spot (owner_id = the phone's account) gets its outbox row from migration 5's trigger. The send fields (S7)
 * are written here only; updateSpot never changes them.
 */
export async function insertSpot(db: SQLiteDatabase, spot: Spot): Promise<void> {
  await db.runAsync(
    `INSERT INTO spots (${SPOT_COLUMNS})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    spot.owner_id ?? null,
    spot.copied_from_send ?? null,
    spot.from_username ?? null,
  );
}

export async function getSpot(db: SQLiteDatabase, id: string): Promise<Spot | null> {
  const row = await db.getFirstAsync<SpotRow>(
    `SELECT ${SPOT_READ} FROM spots WHERE id = ? AND deleted_at IS NULL`,
    id,
  );
  return row ? rowToSpot(row) : null;
}

export async function getSpots(db: SQLiteDatabase): Promise<Spot[]> {
  const rows = await db.getAllAsync<SpotRow>(
    `SELECT ${SPOT_READ} FROM spots WHERE deleted_at IS NULL ORDER BY created_at DESC`,
  );
  return rows.map(rowToSpot);
}

/** What migration 3 archived for this spot (the detail screen's "Older details"), or null when nothing was. */
export async function getSpotLegacy(db: SQLiteDatabase, id: string): Promise<SpotLegacy | null> {
  const row = await db.getFirstAsync<{ legacy_json: string | null }>(
    'SELECT legacy_json FROM spots WHERE id = ?',
    id,
  );
  if (!row?.legacy_json) return null;
  const legacy: unknown = JSON.parse(row.legacy_json);
  // Migration 3 only writes objects; anything else would read as rows labelled '0', '1'… in Older details.
  return isObject(legacy) ? (legacy as SpotLegacy) : null;
}

export async function updateSpot(
  db: SQLiteDatabase,
  id: string,
  updates: Omit<SpotUpdate, 'id' | 'created_at'>,
): Promise<void> {
  const setClauses: string[] = [];
  const values: (string | number | null)[] = [];

  if (updates.name !== undefined) {
    setClauses.push('name = ?');
    values.push(updates.name ?? null);
  }
  if (updates.generated_name !== undefined) {
    setClauses.push('generated_name = ?');
    values.push(updates.generated_name ?? null);
  }
  if (updates.location) {
    setClauses.push('latitude = ?, longitude = ?');
    values.push(updates.location.latitude, updates.location.longitude);
  }
  if (updates.feature_types) {
    setClauses.push('feature_types_json = ?');
    values.push(JSON.stringify(updates.feature_types));
  }
  if (updates.stopped !== undefined) {
    setClauses.push('stopped = ?');
    values.push(updates.stopped ? 1 : 0);
  }
  if (updates.natural_speed !== undefined) {
    setClauses.push('natural_speed = ?');
    values.push(updates.natural_speed);
  }
  if (updates.notes !== undefined) {
    setClauses.push('notes = ?');
    values.push(updates.notes);
  }
  if (updates.primary_photo_id !== undefined) {
    setClauses.push('primary_photo_id = ?');
    values.push(updates.primary_photo_id ?? null);
  }

  // ISO 8601 UTC like every other timestamp; the caller's stamp wins so the store and DB agree.
  setClauses.push('updated_at = ?');
  values.push(updates.updated_at ?? new Date().toISOString());
  values.push(id);

  await db.runAsync(
    `UPDATE spots SET ${setClauses.join(', ')} WHERE id = ?`,
    ...values,
  );
}

/** Marks a spot deleted at `at` (ISO 8601 UTC), which also becomes its updated_at; a deleted spot keeps its first stamp. */
export async function softDeleteSpot(
  db: SQLiteDatabase,
  id: string,
  at: string = new Date().toISOString(),
): Promise<void> {
  await db.runAsync('UPDATE spots SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', at, at, id);
}
