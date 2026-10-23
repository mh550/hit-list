import type { SQLiteDatabase } from 'expo-sqlite';
import type { HitList, HitListKind, HitListUpdate, SpotFilters } from '@/src/types';
import { isObject } from '@/src/utils/is-object';

interface HitListRow {
  id: string;
  owner_id: string | null;
  name: string;
  kind: string;
  area_center_lat: number | null;
  area_center_lng: number | null;
  area_radius_m: number | null;
  area_filters_json: string | null;
  area_place: string | null;
  shared: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

const HIT_LIST_COLUMNS =
  'id, owner_id, name, kind, area_center_lat, area_center_lng, area_radius_m, area_filters_json, area_place, shared, created_at, updated_at, deleted_at';

/** Only the app writes this column, but one unreadable row must not take every list down with it. */
function parseAreaFilters(row: HitListRow): SpotFilters | undefined {
  if (row.area_filters_json === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(row.area_filters_json);
    if (isObject(parsed) && Array.isArray(parsed.types)) return parsed as unknown as SpotFilters;
  } catch {
    // fall through to the warning
  }
  console.warn(`[hit-lists] unreadable area_filters_json on list ${row.id}; reading it as no filters`);
  return undefined;
}

function rowToHitList(row: HitListRow): HitList {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as HitListKind,
    owner_id: row.owner_id ?? undefined,
    shared: row.shared === 1,
    area_center:
      row.area_center_lat !== null && row.area_center_lng !== null
        ? { latitude: row.area_center_lat, longitude: row.area_center_lng }
        : undefined,
    area_radius_m: row.area_radius_m ?? undefined,
    area_filters: parseAreaFilters(row),
    area_place: row.area_place ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at ?? undefined,
  };
}

export async function insertHitList(db: SQLiteDatabase, list: HitList): Promise<void> {
  await db.runAsync(
    `INSERT INTO hit_lists (${HIT_LIST_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    list.id,
    list.owner_id ?? null,
    list.name,
    list.kind,
    list.area_center?.latitude ?? null,
    list.area_center?.longitude ?? null,
    list.area_radius_m ?? null,
    list.area_filters ? JSON.stringify(list.area_filters) : null,
    list.area_place ?? null,
    list.shared ? 1 : 0,
    list.created_at,
    list.updated_at,
    list.deleted_at ?? null,
  );
}

/** Live lists, oldest first. */
export async function getHitLists(db: SQLiteDatabase): Promise<HitList[]> {
  const rows = await db.getAllAsync<HitListRow>(
    `SELECT ${HIT_LIST_COLUMNS} FROM hit_lists WHERE deleted_at IS NULL ORDER BY created_at`,
  );
  return rows.map(rowToHitList);
}

/** Writes only the keys given (`area_place: null` clears the place); a deleted list is left alone. */
export async function updateHitList(db: SQLiteDatabase, id: string, updates: HitListUpdate): Promise<void> {
  const setClauses: string[] = [];
  const values: (string | number | null)[] = [];

  if (updates.name !== undefined) {
    setClauses.push('name = ?');
    values.push(updates.name);
  }
  if (updates.shared !== undefined) {
    setClauses.push('shared = ?');
    values.push(updates.shared ? 1 : 0);
  }
  if (updates.area_center !== undefined) {
    setClauses.push('area_center_lat = ?', 'area_center_lng = ?');
    values.push(updates.area_center.latitude, updates.area_center.longitude);
  }
  if (updates.area_radius_m !== undefined) {
    setClauses.push('area_radius_m = ?');
    values.push(updates.area_radius_m);
  }
  if (updates.area_filters !== undefined) {
    setClauses.push('area_filters_json = ?');
    values.push(JSON.stringify(updates.area_filters));
  }
  if (updates.area_place !== undefined) {
    setClauses.push('area_place = ?');
    values.push(updates.area_place); // null clears it
  }

  // The caller's stamp wins so the store and DB agree.
  setClauses.push('updated_at = ?');
  values.push(updates.updated_at ?? new Date().toISOString());
  values.push(id);

  await db.runAsync(
    `UPDATE hit_lists SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    ...values,
  );
}

/**
 * Marks a list deleted at `at` (ISO 8601 UTC), which also becomes its updated_at; a deleted list keeps its first stamp.
 * Its spots are untouched.
 */
export async function softDeleteHitList(
  db: SQLiteDatabase,
  id: string,
  at: string = new Date().toISOString(),
): Promise<void> {
  await db.runAsync(
    'UPDATE hit_lists SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
    at,
    at,
    id,
  );
}

/**
 * Adds the spots in one statement, so it is all or nothing without a BEGIN: expo-sqlite's withTransactionAsync is a
 * plain BEGIN/COMMIT on the one shared connection, so a second write arriving mid-transaction would fail to BEGIN or
 * be committed/rolled back with it. A spot already in the list keeps its first added_at.
 */
export async function addSpotsToList(
  db: SQLiteDatabase,
  listId: string,
  spotIds: string[],
  addedAt: string = new Date().toISOString(),
): Promise<void> {
  if (spotIds.length === 0) return;
  await db.runAsync(
    `INSERT OR IGNORE INTO hit_list_spots (list_id, spot_id, added_at)
     SELECT ?, value, ? FROM json_each(?)`,
    listId,
    addedAt,
    JSON.stringify(spotIds),
  );
}

export async function removeSpotFromList(db: SQLiteDatabase, listId: string, spotId: string): Promise<void> {
  await db.runAsync('DELETE FROM hit_list_spots WHERE list_id = ? AND spot_id = ?', listId, spotId);
}

/**
 * `{ [spotId]: listId[] }` for every live list, in the order the spot was added to them. A soft-deleted spot keeps
 * its rows; the store's selectors hide it.
 */
export async function getListMemberships(db: SQLiteDatabase): Promise<Record<string, string[]>> {
  const rows = await db.getAllAsync<{ spot_id: string; list_id: string }>(
    `SELECT s.spot_id, s.list_id FROM hit_list_spots s
     JOIN hit_lists l ON l.id = s.list_id
     WHERE l.deleted_at IS NULL
     ORDER BY s.added_at`,
  );
  const memberships: Record<string, string[]> = {};
  for (const { spot_id, list_id } of rows) (memberships[spot_id] ??= []).push(list_id);
  return memberships;
}
